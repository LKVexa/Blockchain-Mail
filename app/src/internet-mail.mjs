import {canonical, hash, id} from './crypto.mjs';
import {isIP} from 'node:net';
import {DEFAULTS, address, demand, requestId} from './policy.mjs';
import {ensureLocal127Assignment, getLocal127Assignment} from './local127-assignment.mjs';

export const INTERNET_MAIL_LIMITS=Object.freeze({messages:100,total_bytes:2*1024*1024,body_bytes:DEFAULTS.max_body_bytes});
const STATUSES=['QUEUED','SENDING','ACCEPTED','FAILED','UNKNOWN'];
const NOTICE='ACCEPTED means the recipient mail server accepted the message; it does not prove Inbox delivery.';
const CONFIG_KEYS=['enabled','from','helo'];
const ENVELOPE_KEYS=['id','message_id','owner','request_id','digest','from','helo','to','subject','body','status','created_at','updated_at','attempts','mx','code','detail'];

function plain(value){return !!value&&typeof value==='object'&&Object.getPrototypeOf(value)===Object.prototype;}
function exactKeys(value,keys){return plain(value)&&Object.keys(value).sort().join(',')===[...keys].sort().join(',');}

export function publicMailDomain(value){
 demand(typeof value==='string'&&value.length<=253&&/^[\x21-\x7e]+$/.test(value),'INTERNET_DOMAIN','Use a public ASCII domain name');
 const domain=value.toLowerCase(),labels=domain.split('.');
 demand(labels.length>=2&&labels.every(label=>/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))&&/[a-z]/.test(labels.at(-1)),'INTERNET_DOMAIN','Use a public DNS domain, without a port or IP address');
 demand(!['test','localhost','invalid','example','local','localdomain','internal','intranet','home','lan','onion'].includes(labels.at(-1))&&!domain.endsWith('.home.arpa'),'INTERNET_DOMAIN','Local and reserved domains cannot receive Internet email');
 return domain;
}

export function publicMailAddress(value){
 demand(typeof value==='string'&&value.length<=254&&/^[\x21-\x7e]+$/.test(value),'INTERNET_ADDRESS','Use one public ASCII email address');
 const match=/^([a-zA-Z0-9][a-zA-Z0-9._+-]{0,63})@([^@]+)$/.exec(value);
 demand(match&&!match[1].endsWith('.')&&!match[1].includes('..'),'INTERNET_ADDRESS','Use one public ASCII email address without display names');
 return match[1]+'@'+publicMailDomain(match[2]);
}

export function internetMailSender(value,s,actor){
 let publicSender,publicError;
 try{publicSender=publicMailAddress(value);}catch(error){publicError=error;}
 if(publicSender){
  demand(actor===undefined||s.accounts?.[actor]?.role==='operator','INTERNET_SENDER','Use your assigned rmail address',403);
  return publicSender;
 }
 let local;
 try{local=address(value);}catch{throw publicError;}
 const assignment=actor===undefined?null:getLocal127Assignment(s,actor);
 if(actor!==undefined&&s.accounts?.[actor]?.role!=='operator'){
  demand(local===assignment?.address||(local===actor&&local.split('@')[1].startsWith('127.')),'INTERNET_SENDER','Use your assigned rmail address',403);
 }else{
  const registered=!!s.accounts?.[local]||Object.keys(s.accounts??{}).some(owner=>getLocal127Assignment(s,owner)?.address===local);
  demand(registered,'INTERNET_SENDER','A local sender must be a registered mailbox or assigned rmail address',403);
 }
 return local;
}

export function internetMailHelo(value){
 if(typeof value==='string'&&/^\[(?:\d{1,3}\.){3}\d{1,3}\]$/.test(value)){
  const ip=value.slice(1,-1);
  demand(isIP(ip)===4&&ip.split('.').every(octet=>String(Number(octet))===octet),'INTERNET_DOMAIN','Invalid HELO address literal');
  return value;
 }
 if(typeof value==='string'&&/^\[IPv6:[0-9a-fA-F:]+\]$/i.test(value)){
  const ip=value.slice(6,-1);demand(isIP(ip)===6,'INTERNET_DOMAIN','Invalid HELO address literal');return '[IPv6:'+ip.toLowerCase()+']';
 }
 return publicMailDomain(value);
}

function config(input,s,actor){
 demand(exactKeys(input,CONFIG_KEYS)&&typeof input.enabled==='boolean','INTERNET_CONFIG','Provide enabled, from and helo');
 if(!input.enabled&&input.from===''&&input.helo==='')return {enabled:false,from:'',helo:''};
 return {enabled:input.enabled,from:internetMailSender(input.from,s,actor),helo:internetMailHelo(input.helo)};
}

function draft(input){
 demand(plain(input)&&['to','subject','body','request_id'].every(key=>Object.hasOwn(input,key))&&Object.keys(input).every(key=>['to','subject','body','request_id','confirmed_from','confirmed_helo'].includes(key)),'INTERNET_PAYLOAD','Provide one recipient, subject, body and request ID');
 requestId(input.request_id);
 const to=publicMailAddress(input.to),subject=input.subject,body=input.body;
 demand(typeof subject==='string'&&subject.isWellFormed()&&!/[\x00-\x1f\x7f]/.test(subject)&&Buffer.byteLength(subject)<=512,'SUBJECT','Invalid subject');
 demand(typeof body==='string'&&body.isWellFormed()&&!body.includes('\0')&&Buffer.byteLength(body)<=INTERNET_MAIL_LIMITS.body_bytes,'BODY','Invalid or oversized body');
 for(const key of ['confirmed_from','confirmed_helo'])if(Object.hasOwn(input,key))demand(typeof input[key]==='string','INTERNET_PAYLOAD','Invalid confirmed sender configuration');
 return {to,subject,body,request_id:input.request_id,...(Object.hasOwn(input,'confirmed_from')?{confirmed_from:input.confirmed_from}:{}),...(Object.hasOwn(input,'confirmed_helo')?{confirmed_helo:input.confirmed_helo}:{})};
}

function digest(envelope){return hash('VEXA127-INTERNET-SEND/1\n'+canonical({from:envelope.from,helo:envelope.helo,to:envelope.to,subject:envelope.subject,body:envelope.body}));}
function bytes(envelope){return Buffer.byteLength(canonical({from:envelope.from,helo:envelope.helo,to:envelope.to,subject:envelope.subject,body:envelope.body}));}
function counts(envelopes=[]){return Object.fromEntries(STATUSES.map(status=>[status,envelopes.filter(message=>message.status===status).length]));}
function summary(message){
 const {id,message_id,request_id,from,to,subject,status,created_at,updated_at,mx,code,detail}=message;
 return {id,message_id,request_id,from,to,subject,status,created_at,updated_at,mx,code,detail};
}
function journalEvent(message,type='INTERNET_MAIL_STATUS'){
 return {type,id:message.id,digest:message.digest,status:message.status,owner_hash:hash(message.owner)};
}

// Internet mail is additive: local stamps, puzzle permits and local deliveries
// remain under their existing contracts. This state lives in protected storage.
export function validateInternetMailState(s){
 if(s.internetMail===undefined)return;
 const state=s.internetMail;
 demand((exactKeys(state,['version','config','envelopes'])||exactKeys(state,['version','config','envelopes','senders']))&&state.version===1&&Array.isArray(state.envelopes),'INTERNET_STATE','Invalid Internet mail state',503);
 demand(canonical(config(state.config,s))===canonical(state.config),'INTERNET_STATE','Noncanonical Internet mail configuration',503);
 if(state.senders!==undefined){
  demand(plain(state.senders),'INTERNET_STATE','Invalid personal sender configuration',503);
  for(const [owner,sender] of Object.entries(state.senders)){
   demand(!!s.accounts?.[owner],'INTERNET_STATE','Personal sender owner is not a registered account',503);
   demand(canonical(config(sender,s,owner))===canonical(sender),'INTERNET_STATE','Noncanonical personal sender configuration',503);
  }
 }
 demand(state.envelopes.length<=INTERNET_MAIL_LIMITS.messages,'INTERNET_STATE','Internet outbox capacity exceeded',503);
 const ids=new Set(),requests=new Set();let total=0;
 for(const message of state.envelopes){
  demand(exactKeys(message,ENVELOPE_KEYS)&&/^[a-f0-9]{32}$/.test(message.id)&&!ids.has(message.id),'INTERNET_STATE','Invalid or duplicate Internet envelope',503);ids.add(message.id);
  demand(!!s.accounts?.[message.owner],'INTERNET_STATE','Internet envelope owner is not a registered account',503);
  let from;
  try{from=internetMailSender(message.from,s,message.owner);}catch{demand(false,'INTERNET_STATE','Internet envelope sender does not belong to its owner',503);}
  const clean=draft({to:message.to,subject:message.subject,body:message.body,request_id:message.request_id}),helo=internetMailHelo(message.helo);
  demand(clean.to===message.to&&from===message.from&&helo===message.helo,'INTERNET_STATE','Noncanonical Internet envelope address',503);
  const request=message.owner+'|'+message.request_id;
  demand(!requests.has(request),'INTERNET_STATE','Duplicate Internet request ID',503);requests.add(request);
  demand(message.message_id==='<'+message.id+'@'+from.split('@')[1]+'>'&&message.digest===digest(message),'INTERNET_STATE','Internet envelope binding changed',503);
  demand(STATUSES.includes(message.status)&&Number.isSafeInteger(message.created_at)&&message.created_at>=0&&Number.isSafeInteger(message.updated_at)&&message.updated_at>=message.created_at,'INTERNET_STATE','Invalid Internet delivery state or clock',503);
  demand((message.attempts===0&&['QUEUED','FAILED'].includes(message.status))||(message.attempts===1&&message.status!=='QUEUED'),'INTERNET_STATE','Invalid Internet delivery attempt count',503);
  demand(message.mx===null||(typeof message.mx==='string'&&message.mx===publicMailDomain(message.mx)),'INTERNET_STATE','Invalid Internet mail exchange',503);
  demand(message.code===null||(Number.isInteger(message.code)&&message.code>=100&&message.code<=599),'INTERNET_STATE','Invalid Internet SMTP status code',503);
  demand(typeof message.detail==='string'&&message.detail.isWellFormed()&&Buffer.byteLength(message.detail)<=512&&!/[\x00-\x1f\x7f]/.test(message.detail),'INTERNET_STATE','Invalid Internet delivery detail',503);
  demand(message.status!=='ACCEPTED'||(message.attempts===1&&message.code!==null&&message.code>=200&&message.code<300),'INTERNET_STATE','Acceptance requires a positive SMTP result',503);
  total+=bytes(message);
 }
 demand(total<=INTERNET_MAIL_LIMITS.total_bytes,'INTERNET_STATE','Internet outbox byte capacity exceeded',503);
}

function safeResult(value){
 if(!plain(value)||!['ACCEPTED','FAILED','UNKNOWN'].includes(value.status))return {status:'UNKNOWN',mx:null,code:null,detail:'The transport returned no verifiable SMTP result. Check delivery before sending again.'};
 let mx=null;
 try{if(value.mx!==undefined&&value.mx!==null)mx=publicMailDomain(value.mx);}catch{}
 const code=Number.isInteger(value.code)&&value.code>=100&&value.code<=599?value.code:null;
 const detail=typeof value.detail==='string'&&value.detail.isWellFormed()?Array.from(value.detail.replace(/[\x00-\x1f\x7f]/g,' ')).slice(0,128).join(''):'';
 if(value.status==='ACCEPTED'&&!(code!==null&&code>=200&&code<300))return {status:'UNKNOWN',mx,code,detail:'No positive SMTP acceptance was confirmed. Check delivery before sending again.'};
 return {status:value.status,mx,code,detail};
}

export function createInternetMail(store,transport){
 demand(transport&&typeof transport.deliver==='function','INTERNET_TRANSPORT','Internet mail transport is required',503);
 let closed=false;const pending=new Set();
 function read(tok){const s=store.state();store.integrityHead(s);store.authenticate(tok,s);validateInternetMailState(s);return s;}
 function protectedStorage(){demand(!!store.vault,'INTERNET_PROTECTED_REQUIRED','Internet mail requires protected storage',403);}
 function open(){demand(!closed,'INTERNET_CLOSED','Internet mail service is stopping',503);}
 function view(s,actor,assignmentResult){
  const state=s.internetMail,assignment=getLocal127Assignment(s,actor),assignedDefault=assignment?{enabled:true,from:assignment.address,helo:'['+assignment.address.split('@')[1]+']'}:null;
  const legacyDefault=s.accounts[actor].role==='operator'?state?.config:null;
  const c=state?.senders?.[actor]??assignedDefault??legacyDefault??{enabled:false,from:'',helo:''};let sender_warning='';
  try{if(c.from)publicMailAddress(c.from);}catch{sender_warning='This local sender can attempt Internet delivery. Recipient servers may reject its nonpublic identity, and Internet replies cannot route back to this local mailbox.';}
  return {supported:!!store.vault,configured:!!c.from&&!!c.helo,...c,mode:'direct-mx',counts:counts(state?.envelopes?.filter(message=>message.owner===actor)),limits:INTERNET_MAIL_LIMITS,notice:NOTICE,sender_warning,assigned_address:assignment?.address??null,identity_address:actor,role:s.accounts[actor].role,assignment:assignment?{...assignment,...(assignmentResult?{replayed:assignmentResult.replayed,...(assignmentResult.block_height!==undefined?{block_height:assignmentResult.block_height,block_hash:assignmentResult.block_hash}:{})}:{})}:null};
 }
 function identity(tok){
  open();protectedStorage();read(tok);
  const assigned=ensureLocal127Assignment(store,tok);
  store.mutate(tok,(s,actor,now,events)=>{
   s.internetMail??={version:1,config:{enabled:false,from:'',helo:''},envelopes:[]};
   const senders=s.internetMail.senders??={};
   if(Object.hasOwn(senders,actor))return {unchanged:true};
   const sender=config({enabled:true,from:assigned.assignment.address,helo:'['+assigned.assignment.address.split('@')[1]+']'},s,actor);
   senders[actor]=sender;
   events.push({type:'INTERNET_MAIL_CONFIGURED',enabled:true,config_hash:hash(canonical(sender)),actor_hash:hash(actor)});
   return {configured:true};
  });
  return assigned;
 }
 function update(messageId,owner,result){
  // Completion belongs to the already-authorized operation. A token rotation
  // while SMTP is in flight must not discard the transport result.
  const operatorToken=store.credentials()['postmaster@local.test'];
  return store.mutate(operatorToken,(s,actor,now,events)=>{
   const message=s.internetMail?.envelopes.find(item=>item.id===messageId&&item.owner===owner);
   demand(message,'INTERNET_NOT_FOUND','Internet envelope not found',404);
   demand(message.status==='SENDING','INTERNET_STATE','Internet envelope is not awaiting a transport result',409);
   Object.assign(message,result,{updated_at:now});events.push(journalEvent(message));return {message:summary(message),replayed:false};
  },{admin:true});
 }

 // A previous process may have stopped at either durable boundary. Never
 // automatically resend: even an SMTP timeout can hide remote acceptance.
 let initial=store.state();store.integrityHead(initial);validateInternetMailState(initial);
 if(store.vault&&initial.internetMail===undefined){
  const operatorToken=store.credentials()['postmaster@local.test'];
  store.mutate(operatorToken,(s,actor,now,events)=>{
   const defaults=config({enabled:true,from:actor,helo:'[127.0.0.1]'},s);
   s.internetMail={version:1,config:defaults,envelopes:[]};
   events.push({type:'INTERNET_MAIL_CONFIGURED',enabled:true,config_hash:hash(canonical(defaults)),actor_hash:hash(actor)});return {configured:true};
  },{admin:true});
  initial=store.state();
 }
 if(initial.internetMail?.envelopes.some(message=>['QUEUED','SENDING'].includes(message.status))){
  protectedStorage();
  const operatorToken=store.credentials()['postmaster@local.test'];
  store.mutate(operatorToken,(s,actor,now,events)=>{
   for(const message of s.internetMail.envelopes){
    if(message.status==='QUEUED'){message.status='FAILED';message.detail='The previous process stopped before the SMTP attempt began.';}
    else if(message.status==='SENDING'){message.status='UNKNOWN';message.detail='The previous SMTP attempt was interrupted. Check delivery before sending again.';}
    else continue;
    message.updated_at=now;events.push(journalEvent(message,'INTERNET_MAIL_RECOVERED'));
   }
   return {recovered:true};
  },{admin:true});
 }

 return {
  validateState:validateInternetMailState,
  login(tok){const assignment=identity(tok),s=read(tok);return view(s,store.authenticate(tok,s),assignment);},
  status(tok){const s=read(tok);return view(s,store.authenticate(tok,s));},
  list(tok){const s=read(tok),actor=store.authenticate(tok,s),messages=(s.internetMail?.envelopes??[]).filter(message=>message.owner===actor);return {messages:messages.map(summary).reverse(),counts:counts(messages)};},
  configure(tok,input){
   open();protectedStorage();const authorized=read(tok),actor=store.authenticate(tok,authorized);config(input,authorized,actor);
   identity(tok);const clean=config(input,read(tok),actor);
   store.mutate(tok,(s,actor,now,events)=>{
    s.internetMail??={version:1,config:{enabled:false,from:'',helo:''},envelopes:[]};
    const senders=s.internetMail.senders??={};
    if(canonical(senders[actor])===canonical(clean))return {unchanged:true};
    senders[actor]=clean;
    events.push({type:'INTERNET_MAIL_CONFIGURED',enabled:clean.enabled,config_hash:hash(canonical(clean)),actor_hash:hash(actor)});
    return {configured:true};
   });
   return view(read(tok),actor);
  },
  async send(tok,input){
   open();protectedStorage();const clean=draft(input);
   identity(tok);
   const queued=store.mutate(tok,(s,actor,now,events)=>{
    const state=s.internetMail,c=state?.senders?.[actor];
    demand(c,'INTERNET_NOT_CONFIGURED','Configure a sender and SMTP greeting first',409);
    const requestedFrom=clean.confirmed_from===undefined?c.from:internetMailSender(clean.confirmed_from,s,actor),requestedHelo=clean.confirmed_helo===undefined?c.helo:internetMailHelo(clean.confirmed_helo);
    demand(requestedFrom&&requestedHelo,'INTERNET_NOT_CONFIGURED','Configure a sender and SMTP greeting first',409);
    const frozen={to:clean.to,subject:clean.subject,body:clean.body,request_id:clean.request_id,from:requestedFrom,helo:requestedHelo},binding=digest(frozen);
    const previous=state.envelopes.find(message=>message.owner===actor&&message.request_id===clean.request_id);
    if(previous){demand(previous.digest===binding,'REPLAY_CONFLICT','Same request ID, different Internet envelope or sender configuration',409);return {message:summary(previous),replayed:true};}
    demand(c.from&&c.helo,'INTERNET_NOT_CONFIGURED','Configure a sender and SMTP greeting first',409);
    demand(requestedFrom===c.from&&requestedHelo===c.helo,'INTERNET_CONFIG_CHANGED','The sender configuration changed after confirmation; review it before sending',409);
    demand(c.enabled,'INTERNET_DISABLED','Internet mail is disabled',409);
    demand(state.envelopes.length<INTERNET_MAIL_LIMITS.messages,'INTERNET_CAPACITY','Internet outbox message capacity reached',507);
    demand(state.envelopes.reduce((total,message)=>total+bytes(message),0)+bytes(frozen)<=INTERNET_MAIL_LIMITS.total_bytes,'INTERNET_CAPACITY','Internet outbox byte capacity reached',507);
    const messageId=id(),message={id:messageId,message_id:'<'+messageId+'@'+c.from.split('@')[1]+'>',owner:actor,...frozen,digest:binding,status:'QUEUED',created_at:now,updated_at:now,attempts:0,mx:null,code:null,detail:'Queued for one direct MX delivery attempt.'};
    state.envelopes.push(message);events.push(journalEvent(message,'INTERNET_MAIL_QUEUED'));
    return {message:summary(message),replayed:false,owner:actor};
   });
   if(queued.replayed)return queued;
   const started=store.mutate(tok,(s,actor,now,events)=>{
    const message=s.internetMail.envelopes.find(item=>item.id===queued.message.id&&item.owner===actor);
    demand(message?.status==='QUEUED','INTERNET_STATE','Internet envelope already attempted',409);
    message.status='SENDING';message.attempts=1;message.updated_at=now;message.detail='Attempting delivery to the recipient mail exchange.';events.push(journalEvent(message));
    return {envelope:{from:message.from,to:message.to,subject:message.subject,body:message.body,message_id:message.message_id,created_at:message.created_at,helo:message.helo}};
   });
   const delivery=Promise.resolve().then(async()=>{
    let result;
    try{result=closed?{status:'FAILED',code:null,mx:null,detail:'Stopped before the network attempt began.'}:safeResult(await transport.deliver(started.envelope));}
    catch{result={status:'UNKNOWN',code:null,mx:null,detail:'The SMTP attempt ended without a confirmed result. Check delivery before sending again.'};}
    return update(queued.message.id,queued.owner,result);
   });
   pending.add(delivery);
   try{return await delivery;}finally{pending.delete(delivery);}
  },
  async close(){
   if(closed){await Promise.allSettled([...pending]);return;}
   closed=true;
   try{await transport.close?.();}finally{await Promise.allSettled([...pending]);}
  }
 };
}
