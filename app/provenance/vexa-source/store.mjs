import fs from 'node:fs';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {randomBytes} from 'node:crypto';
import {canonical,hash,id,token,keys,signature,verifySignature,seal,unseal,merkle,equal} from './crypto.mjs';
import {PROFILE,DEFAULTS,BRANCHES,MailError,demand,address,boundedInt,requestId,payload,expand,held} from './policy.mjs';
import {frameObject,readObject} from './framing.mjs';
import {parseMail} from './mime.mjs';
export const VERSION='2.1.0-local.1';
const BLOCK_DOMAIN='VEXA127-BLOCK/1', STAMP_DOMAIN='VEXA127-STAMP/1';
const ZERO='0'.repeat(64);
function readJSON(f){return JSON.parse(fs.readFileSync(f,'utf8'))}
function secretFile(f,obj){fs.writeFileSync(f,JSON.stringify(obj,null,2)+'\n',{mode:0o600,flag:'wx'})}
export class Store {
 constructor(root,{readOnly=false,clock=()=>Date.now(),fault=()=>{},nonceFactory=()=>randomBytes(12)}={}){
  this.root=path.resolve(root);this.clock=clock;this.fault=fault;this.nonceFactory=nonceFactory;this.readOnly=readOnly;
  if(!readOnly)fs.mkdirSync(this.root,{recursive:true,mode:0o700});
  demand(fs.existsSync(this.root),'NO_STATE','State directory does not exist',404);
  for(const name of ['mail.sqlite','node.secret.json','credentials.secret.json']){const f=path.join(this.root,name);if(fs.existsSync(f))demand(!fs.lstatSync(f).isSymbolicLink(),'SYMLINK','State files cannot be symlinks')}
  const keypath=path.join(this.root,'node.secret.json'),dbpath=path.join(this.root,'mail.sqlite');
  const fresh=!fs.existsSync(keypath)&&!fs.existsSync(dbpath);
  demand(fs.existsSync(keypath)===fs.existsSync(dbpath),'INCOMPLETE_STATE','Database and authority key must exist together; incomplete state is never silently reinitialized',503);
  if(!fs.existsSync(keypath)){demand(!readOnly,'NO_STATE','Uninitialized state',404);secretFile(keypath,keys())}
  this.key=readJSON(keypath);
  this.db=new DatabaseSync(dbpath,{readOnly,enableForeignKeyConstraints:true});
  try{
   this.db.exec('PRAGMA busy_timeout=3000;');
   if(!readOnly){this.db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; CREATE TABLE IF NOT EXISTS state (singleton INTEGER PRIMARY KEY CHECK(singleton=1),json TEXT NOT NULL); CREATE TABLE IF NOT EXISTS blocks (height INTEGER PRIMARY KEY, hash TEXT NOT NULL UNIQUE, json TEXT NOT NULL); CREATE TABLE IF NOT EXISTS objects (id TEXT PRIMARY KEY, nonce TEXT NOT NULL UNIQUE, json TEXT NOT NULL);');try{fs.chmodSync(dbpath,0o600)}catch{}}
   if(!this.db.prepare('SELECT json FROM state WHERE singleton=1').get()){demand(fresh&&!readOnly,'NO_STATE','Existing database has no state; initialization refused',503);this.initialize()}
   const report=this.verify();demand(report.ok,'INTEGRITY','Startup integrity verification failed: '+report.errors.join('; '),503);
  }catch(e){this.db.close();throw e}
 }
 initialize(){
  const creds=fs.existsSync(path.join(this.root,'credentials.secret.json'))?readJSON(path.join(this.root,'credentials.secret.json')):{'postmaster@local.test':token(),'user@local.test':token()};
  if(!fs.existsSync(path.join(this.root,'credentials.secret.json')))secretFile(path.join(this.root,'credentials.secret.json'),creds);
  const accounts={};for(const a of Object.keys(creds)){accounts[a]={role:a==='postmaster@local.test'?'operator':'user',tokenHash:hash(creds[a]),balance:100,quota:DEFAULTS.mailbox_quota_bytes,daily:DEFAULTS.daily_allowance,accept:true,blocked:[]}}
  const s={schema:1,profile:PROFILE,chain_id:id(),authority:this.key.publicKey,accounts,aliases:{'all@local.test':['postmaster@local.test','user@local.test']},messages:[],stamps:{},replays:{},allowance:{},sponsorUsage:{},sponsor:{balance:1000,daily:0},issued:Object.keys(accounts).length*100+1000,burned:0,lastTime:0};
  this.db.exec('BEGIN IMMEDIATE');try{this.commitState(s,[{type:'GENESIS',profile:PROFILE,authority:hash(this.key.publicKey),issued:s.issued}],true);this.db.exec('COMMIT')}catch(e){this.db.exec('ROLLBACK');throw e}
 }
 state(){return JSON.parse(this.db.prepare('SELECT json FROM state WHERE singleton=1').get().json)}
 head(){const r=this.db.prepare('SELECT json FROM blocks ORDER BY height DESC LIMIT 1').get();return r?JSON.parse(r.json):null}
 time(s){const n=Math.trunc(this.clock());demand(Number.isSafeInteger(n)&&n>=0,'CLOCK','Invalid authority clock',503);demand(n+5000>=s.lastTime,'CLOCK_ROLLBACK','Authority clock moved backward; dependent mutation stopped',503);return Math.max(n,s.lastTime)}
 authenticate(tok,s=this.state()){
  demand(typeof tok==='string'&&tok.length>=16&&tok.length<=256,'AUTH','Authentication required',401);const h=hash(tok);
  const a=Object.keys(s.accounts).find(a=>equal(s.accounts[a].tokenHash,h));demand(a,'AUTH','Authentication required',401);return a;
 }
 operator(tok,s){const a=this.authenticate(tok,s);demand(s.accounts[a].role==='operator','ROLE','Operator role required',403);return a}
 integrityHead(s){const h=this.head();demand(h&&h.header.state_root===hash(canonical(s))&&s.authority===this.key.publicKey&&verifySignature(BLOCK_DOMAIN,h.header,h.signature,this.key.publicKey),'INTEGRITY','State or authority changed outside the chain',503);return h}
 invariants(s){
  demand(s.schema===1&&s.profile===PROFILE,'SCHEMA','Unsupported state');let value=s.sponsor.balance;
  for(const a of Object.values(s.accounts)){demand(Number.isSafeInteger(a.balance)&&a.balance>=0,'BALANCE','Invalid account balance');value+=a.balance}
  for(const st of Object.values(s.stamps))if(st.status==='RESERVED')value+=st.envelope.cost;
  demand(value+s.burned===s.issued&&Number.isSafeInteger(s.issued)&&s.sponsor.balance>=0&&s.burned>=0,'CONSERVATION','Credit supply does not reconcile');
  demand(new Set(s.messages.map(m=>m.id)).size===s.messages.length,'DUPLICATE','Duplicate delivery identifier');
  for(const a of Object.keys(s.accounts)){const used=s.messages.filter(m=>m.mailbox===a).reduce((n,m)=>n+m.bytes,0);demand(used<=s.accounts[a].quota,'QUOTA','Mailbox quota exceeded',409)}
 }
 commitState(s,events,genesis=false){
  this.invariants(s);const prev=genesis?null:this.head();const now=this.time(s);s.lastTime=now;
  const header={version:1,chain_id:s.chain_id,height:prev?prev.header.height+1:0,previous:prev?prev.hash:ZERO,timestamp:now,events_root:merkle(events),state_root:hash(canonical(s)),authority:hash(this.key.publicKey)};
  demand(header.height<DEFAULTS.max_blocks,'CHAIN_CAPACITY','Laboratory chain capacity reached',507);
  const sig=signature(BLOCK_DOMAIN,header,this.key.privateKey);const block={header,events,signature:sig,hash:hash(BLOCK_DOMAIN+'\n'+canonical(header)+'\n'+sig)};
  this.db.prepare('INSERT INTO blocks VALUES (?,?,?)').run(header.height,block.hash,canonical(block));
  this.db.prepare('INSERT INTO state VALUES(1,?) ON CONFLICT(singleton) DO UPDATE SET json=excluded.json').run(canonical(s));return block;
 }
 mutate(tok,op,{admin=false}={}){
  demand(!this.readOnly,'READ_ONLY','Read-only instance',403);this.db.exec('BEGIN IMMEDIATE');let committed=false;
  try{const s=this.state();this.integrityHead(s);const actor=admin?this.operator(tok,s):this.authenticate(tok,s);const now=this.time(s);const events=[];const result=op(s,actor,now,events);
   if(!events.length){this.db.exec('ROLLBACK');return result}
   this.fault('before-commit');const block=this.commitState(s,events);this.db.exec('COMMIT');committed=true;this.fault('after-commit');return {...result,block_height:block.header.height,block_hash:block.hash};
  }catch(e){if(!committed){try{this.db.exec('ROLLBACK')}catch{}}throw e}
 }
 lookupReplay(s,a,key,digest){const r=s.replays[a+'|'+key];if(r){demand(r.digest===digest,'REPLAY_CONFLICT','Same request ID, different operation',409);const b=this.db.prepare('SELECT hash FROM blocks WHERE height=?').get(r.result.block_height);return {...r.result,block_hash:b?.hash,replayed:true}}demand(Object.keys(s.replays).length<DEFAULTS.max_replays,'REPLAY_CAPACITY','Replay journal full; live history will not be evicted',507);return null}
 remember(s,a,key,digest,result){result.block_height=this.head().header.height+1;s.replays[a+'|'+key]={digest,result};return result}
 checkConsent(s,p){for(const a of p.to){demand(s.accounts[a].accept&&!s.accounts[a].blocked.includes(p.from),'CONSENT','Recipient policy refuses admission',403)}}
 estimate(s,a,p,now){this.checkConsent(s,p);const cost=p.to.length*DEFAULTS.price,day=String(Math.floor(now/86400000)),key=a+'|'+day;const payer=s.sponsor.daily>0&&(s.sponsorUsage[key]??0)+p.to.length<=s.sponsor.daily&&s.sponsor.balance>=cost?'SPONSOR':a;return {mechanism:PROFILE,digest:hash(canonical(p)),from:a,to:p.to,cost,payer,day,key}}
 quote(tok,input){const s=this.state();this.integrityHead(s);const a=this.authenticate(tok,s);return this.estimate(s,a,payload(input,a,s),this.time(s))}
 reserve(s,a,p,now,events,maxCost){const q=this.estimate(s,a,p,now);boundedInt(maxCost,0,1000,'max_cost');demand(q.cost<=maxCost,'PRICE_CHANGED','Postage exceeds caller-authorized maximum',409);
  demand(Object.values(s.stamps).filter(st=>st.status==='RESERVED').length<DEFAULTS.max_pending_stamps,'STAMP_CAPACITY','Pending-stamp capacity reached',429);
  demand((s.allowance[q.key]??0)+q.cost<=s.accounts[a].daily,'ALLOWANCE','Daily authorized postage allowance exhausted',429);
  if(q.payer==='SPONSOR'){s.sponsor.balance-=q.cost;s.sponsorUsage[q.key]=(s.sponsorUsage[q.key]??0)+p.to.length}else{demand(s.accounts[a].balance>=q.cost,'FUNDS','Insufficient local credits',402);s.accounts[a].balance-=q.cost}
  s.allowance[q.key]=(s.allowance[q.key]??0)+q.cost;
  const envelope={version:1,mechanism:PROFILE,chain_id:s.chain_id,id:id(),from:a,to:p.to,digest:q.digest,cost:q.cost,payer:q.payer,issued_at:now,expires_at:now+DEFAULTS.stamp_ttl_ms,nonce:id()};
  const signed={envelope,signature:signature(STAMP_DOMAIN,envelope,this.key.privateKey)};s.stamps[envelope.id]={...signed,status:'RESERVED'};events.push({type:'STAMP_RESERVED',stamp_id:envelope.id,actor:hash(a),digest:q.digest,cost:q.cost,payer:hash(q.payer)});return signed;
 }
 issue(tok,input){requestId(input.request_id);return this.mutate(tok,(s,a,now,events)=>{const p=payload(input,a,s),digest=hash('ISSUE\n'+canonical(p)+'\n'+input.max_cost);const old=this.lookupReplay(s,a,input.request_id,digest);if(old)return old;const stamp=this.reserve(s,a,p,now,events,input.max_cost);return this.remember(s,a,input.request_id,digest,{stamp})})}
 send(tok,input){requestId(input.request_id);return this.mutate(tok,(s,a,now,events)=>{
  const p=payload(input,a,s);
  if(p.raw!==null){const raw=parseMail(p.raw);const from=/^(?:[^<>]*<)?([^<>\s]+@local\.test)>?$/i.exec(raw.claimedFrom??'');demand(from&&address(from[1])===a,'RAW_BINDING','Raw From must match the authenticated account');demand(raw.subject===p.subject&&raw.body===p.body&&canonical(raw.attachments.map(x=>({name:x.name,data:x.data})))===canonical(p.attachments.map(x=>({name:x.name,data:x.data}))),'RAW_BINDING','Raw MIME content does not match the committed message');}
  const digest=hash('SEND\n'+canonical(p));const old=this.lookupReplay(s,a,input.request_id,digest);if(old)return old;this.checkConsent(s,p);
  const logical=Buffer.byteLength(canonical(p));demand(s.messages.length+p.to.length+1<=DEFAULTS.max_messages,'MESSAGE_CAPACITY','Message capacity reached',507);
  const copies=[...p.to,a];for(const rcpt of new Set(copies)){const used=s.messages.filter(m=>m.mailbox===rcpt).reduce((n,m)=>n+m.bytes,0),count=copies.filter(x=>x===rcpt).length;demand(used+logical*count<=s.accounts[rcpt].quota,'QUOTA','Recipient or Sent quota exceeded',409)}
  let signed=input.stamp;if(signed){demand(signed.envelope&&signed.signature,'STAMP','Malformed stamp');const e=signed.envelope;demand(e.mechanism===PROFILE,'UNSUPPORTED_BRANCH','Unknown or disabled postage mechanism',422);demand(verifySignature(STAMP_DOMAIN,e,signed.signature,this.key.publicKey),'STAMP_SIGNATURE','Invalid stamp signature',403);const st=s.stamps[e.id];demand(st&&st.status==='RESERVED','STAMP_USED','Stamp unavailable or already consumed',409);demand(canonical(st.envelope)===canonical(e)&&st.signature===signed.signature,'STAMP','Stamp record mismatch');demand(e.chain_id===s.chain_id&&e.from===a&&e.digest===hash(canonical(p))&&canonical(e.to)===canonical(p.to),'STAMP_BINDING','Stamp does not authorize this envelope',403);demand(now<e.expires_at,'STAMP_EXPIRED','Stamp expired; use explicit cancellation/refund',409)}else{signed=this.reserve(s,a,p,now,events,input.max_cost)}
  const stamp=signed.envelope;const message_id=id(),framed=frameObject({v:2,from:p.from,to:p.to,subject:p.subject,body:p.body});
  const encrypted=seal({version:1,frame:framed.text,attachments:p.attachments,raw:p.raw},this.key.sealKey,s.chain_id+'|'+message_id,this.nonceFactory());const encoded=canonical(encrypted);const blob_id=hash(encoded);
  this.db.prepare('INSERT INTO objects VALUES(?,?,?)').run(blob_id,encrypted.nonce,encoded);this.fault('after-object');
  const deliveries=[];for(let n=0;n<copies.length;n++){const folder=n===copies.length-1?'Sent':held(p)?'Quarantine':'INBOX';const m={id:id(),message_id,mailbox:copies[n],folder,from:a,to:p.to,blob_id,bytes:logical,created:now,stamp_id:stamp.id};s.messages.push(m);deliveries.push({id:m.id,mailbox:m.mailbox,folder})}
  s.stamps[stamp.id].status='CONSUMED';s.burned+=stamp.cost;
  events.push({type:'STAMP_CONSUMED',stamp_id:stamp.id,cost:stamp.cost},{type:'MESSAGE_COMMITTED',message_id,blob_id,from:hash(a),to:p.to.map(hash),deliveries:deliveries.map(d=>({id:d.id,mailbox:hash(d.mailbox),folder:d.folder}))});
  return this.remember(s,a,input.request_id,digest,{message_id,stamp_id:stamp.id,cost:stamp.cost,payer:stamp.payer,deliveries,status:'COMMITTED'});
 })}
 cancel(tok,stampId){return this.mutate(tok,(s,a,now,events)=>{const st=s.stamps[stampId];demand(st&&st.envelope.from===a,'NOT_FOUND','Unknown stamp',404);if(st.status==='CANCELLED'||st.status==='EXPIRED')return {status:st.status,replayed:true};demand(st.status==='RESERVED','STAMP_USED','Consumed stamps cannot be refunded',409);st.status=now>=st.envelope.expires_at?'EXPIRED':'CANCELLED';if(st.envelope.payer==='SPONSOR')s.sponsor.balance+=st.envelope.cost;else s.accounts[a].balance+=st.envelope.cost;events.push({type:'STAMP_REFUNDED',stamp_id:stampId,cost:st.envelope.cost,status:st.status});return {status:st.status}})}
 preferences(tok,input){return this.mutate(tok,(s,a,now,events)=>{const account=s.accounts[a];if(input.daily!==undefined)account.daily=boundedInt(input.daily,0,1000,'daily');if(input.accept!==undefined){demand(typeof input.accept==='boolean','POLICY','accept must be boolean');account.accept=input.accept}if(input.blocked!==undefined){demand(Array.isArray(input.blocked)&&input.blocked.length<=64,'POLICY','Invalid block list');account.blocked=[...new Set(input.blocked.map(address))]}events.push({type:'PREFERENCES',actor:hash(a),daily:account.daily,accept:account.accept,blocked:account.blocked.map(hash)});return {ok:true}})}
 createAccount(tok,input){return this.mutate(tok,(s,a,now,events)=>{const name=address(input.address);demand(!s.accounts[name]&&!s.aliases[name],'EXISTS','Address exists',409);demand(Object.keys(s.accounts).length<DEFAULTS.max_mailboxes,'CAPACITY','Mailbox capacity reached',409);const t=token(),balance=boundedInt(input.credits??100,0,100000,'credits');s.accounts[name]={role:'user',tokenHash:hash(t),balance,quota:DEFAULTS.mailbox_quota_bytes,daily:DEFAULTS.daily_allowance,accept:true,blocked:[]};s.issued+=balance;events.push({type:'MAILBOX_CREATED',address:hash(name),credits:balance});return {address:name,token:t}},{admin:true})}
 credit(tok,input){requestId(input.request_id);return this.mutate(tok,(s,a,now,events)=>{const target=input.address==='SPONSOR'?'SPONSOR':address(input.address);const amount=boundedInt(input.amount,1,100000,'amount'),digest=hash(canonical({type:'CREDIT',target,amount}));const old=this.lookupReplay(s,a,input.request_id,digest);if(old)return old;demand(target==='SPONSOR'||s.accounts[target],'NO_MAILBOX','Unknown mailbox',404);demand(s.issued+amount<=1e9,'SUPPLY','Local-credit supply cap reached');if(target==='SPONSOR')s.sponsor.balance+=amount;else s.accounts[target].balance+=amount;s.issued+=amount;events.push({type:'CREDITS_ISSUED',actor:hash(a),target:hash(target),amount});return this.remember(s,a,input.request_id,digest,{ok:true,target,amount})},{admin:true})}
 sponsor(tok,input){return this.mutate(tok,(s,a,now,events)=>{s.sponsor.daily=boundedInt(input.daily,0,100,'daily');events.push({type:'LOCAL_SPONSOR_POLICY',daily:s.sponsor.daily});return {ok:true}},{admin:true})}
 alias(tok,input){return this.mutate(tok,(s,a,now,events)=>{const name=address(input.alias);demand(!s.accounts[name],'EXISTS','Cannot shadow mailbox');demand(Array.isArray(input.targets)&&input.targets.length>=1&&input.targets.length<=8,'ALIAS','Expected 1–8 targets');s.aliases[name]=input.targets.map(address);expand([name],s);events.push({type:'ALIAS_SET',alias:hash(name),targets:s.aliases[name].map(hash)});return {ok:true}},{admin:true})}
 rotateToken(tok){return this.mutate(tok,(s,a,now,events)=>{const t=token();s.accounts[a].tokenHash=hash(t);events.push({type:'TOKEN_ROTATED',actor:hash(a)});return {token:t}})}
 getObject(s,row){const blob=this.db.prepare('SELECT json FROM objects WHERE id=?').get(row.blob_id);demand(blob&&hash(blob.json)===row.blob_id,'OBJECT_INTEGRITY','Encrypted object missing or changed',503);try{const data=unseal(JSON.parse(blob.json),this.key.sealKey,s.chain_id+'|'+row.message_id),f=readObject(data.frame);demand(f.ok,'FRAME','Object frame invalid',503);demand(f.record.from===row.from&&canonical(f.record.to)===canonical(row.to),'OBJECT_BINDING','Object metadata mismatch',503);return {from:f.record.from,to:f.record.to,subject:f.record.subject,body:f.record.body,attachments:data.attachments,raw:data.raw}}catch(e){if(e instanceof MailError)throw e;throw new MailError('OBJECT_AUTHENTICATION','Encrypted object authentication failed',503)}}
 me(tok){const s=this.state();this.integrityHead(s);const a=this.authenticate(tok,s),box=s.accounts[a],now=this.time(s),day=String(Math.floor(now/86400000));return {address:a,role:box.role,balance:box.balance,quota:box.quota,daily:box.daily,used_today:s.allowance[a+'|'+day]??0,accept:box.accept,blocked:box.blocked,used_bytes:s.messages.filter(m=>m.mailbox===a).reduce((n,m)=>n+m.bytes,0),profile:PROFILE,version:VERSION,stamps:Object.values(s.stamps).filter(st=>st.envelope.from===a&&st.status==='RESERVED').map(st=>({id:st.envelope.id,cost:st.envelope.cost,expires_at:st.envelope.expires_at}))}}
 list(tok,folder='INBOX'){const s=this.state();this.integrityHead(s);const a=this.authenticate(tok,s);demand(['INBOX','Sent','Quarantine','Trash'].includes(folder),'FOLDER','Unknown folder');return s.messages.filter(m=>m.mailbox===a&&m.folder===folder).slice(-100).reverse().map(m=>({...m,subject:this.getObject(s,m).subject}))}
 // Authenticated, bounded traversal. A cursor belongs to one signed snapshot,
 // one owner and one folder. No persistent state or token is created by paging.
 page(tok,{folder='INBOX',limit=25,before=null,head=null}={}){
  const s=this.state(), signed=this.integrityHead(s), actor=this.authenticate(tok,s);
  demand(['INBOX','Sent','Quarantine','Trash'].includes(folder),'FOLDER','Unknown mailbox folder');
  boundedInt(limit,1,100,'limit');
  demand((before===null&&head===null)||(typeof before==='string'&&/^[a-f0-9]{32}$/.test(before)&&typeof head==='string'&&/^[a-f0-9]{64}$/.test(head)),'PAGE_CURSOR','Supply both a delivery cursor and its signed head');
  if(head!==null)demand(head===signed.hash,'PAGE_CHANGED','Mailbox snapshot changed; reload the first page',409);
  const rows=s.messages.filter(m=>m.mailbox===actor&&m.folder===folder).reverse();
  const anchor=before===null?-1:rows.findIndex(m=>m.id===before);
  demand(before===null||anchor>=0,'PAGE_CURSOR','Cursor is not in this mailbox and folder',400);
  const start=anchor+1, selected=rows.slice(start,start+limit);
  const messages=selected.map(m=>({id:m.id,message_id:m.message_id,from:m.from,to:m.to,subject:this.getObject(s,m).subject,created:m.created,folder:m.folder,bytes:m.bytes}));
  return {format:'VEXA127-MAILBOX-PAGE/1',folder,total:rows.length,start,limit,head:signed.hash,messages,next_before:start+selected.length<rows.length?selected.at(-1).id:null};
 }
 message(tok,msgid){const s=this.state();this.integrityHead(s);const a=this.authenticate(tok,s),m=s.messages.find(m=>m.id===msgid&&m.mailbox===a);demand(m,'NOT_FOUND','Message not found',404);return {...m,...this.getObject(s,m)}}
 move(tok,msgid,folder){return this.mutate(tok,(s,a,now,events)=>{demand(['INBOX','Trash'].includes(folder),'FOLDER','Only INBOX and Trash transitions supported');const m=s.messages.find(m=>m.id===msgid&&m.mailbox===a);demand(m,'NOT_FOUND','Message not found',404);if(m.folder==='Quarantine')demand(s.accounts[a].role==='operator','ROLE','Operator required to release quarantine',403);events.push({type:'FOLDER_CHANGED',id:m.id,from:m.folder,to:folder});m.folder=folder;return {ok:true}})}
 release(tok,msgid){return this.mutate(tok,(s,a,now,events)=>{const m=s.messages.find(m=>m.id===msgid&&m.folder==='Quarantine');demand(m,'NOT_FOUND','Quarantined message not found',404);m.folder='INBOX';events.push({type:'QUARANTINE_RELEASED',id:msgid,actor:hash(a)});return {ok:true}},{admin:true})}
 quarantine(tok){const s=this.state();this.integrityHead(s);this.operator(tok,s);return s.messages.filter(m=>m.folder==='Quarantine').slice(-100).map(m=>({id:m.id,mailbox:m.mailbox,from:m.from,created:m.created}))}
 directory(tok){const s=this.state();this.integrityHead(s);this.authenticate(tok,s);return {mailboxes:Object.keys(s.accounts).map(a=>({address:a,role:s.accounts[a].role})),aliases:s.aliases}}
 ledger(tok){const s=this.state();this.integrityHead(s);this.authenticate(tok,s);const blocks=this.db.prepare('SELECT json FROM blocks ORDER BY height DESC LIMIT 100').all().map(r=>JSON.parse(r.json));return {chain_id:s.chain_id,authority:s.authority,head:this.head(),issued:s.issued,burned:s.burned,reserved:Object.values(s.stamps).filter(st=>st.status==='RESERVED').reduce((n,st)=>n+st.envelope.cost,0),sponsor:s.sponsor,blocks,branches:BRANCHES}}
 exportMailbox(tok){const s=this.state();this.integrityHead(s);const a=this.authenticate(tok,s);return {format:'VEXA127-EXPORT/1',chain_id:s.chain_id,address:a,exported_at:Math.trunc(this.clock()),messages:s.messages.filter(m=>m.mailbox===a).map(m=>({...m,...this.getObject(s,m)}))}}
 checkpoint(){const s=this.state();const h=this.integrityHead(s);return {format:'VEXA127-CHECKPOINT/1',chain_id:h.header.chain_id,height:h.header.height,hash:h.hash,authority:this.key.publicKey}}
 verify(checkpoint=null){const errors=[];let prev=null,count=0;try{const s=this.state();this.invariants(s);demand(s.authority===this.key.publicKey,'AUTHORITY','Authority mismatch');const rows=this.db.prepare('SELECT height,hash,json FROM blocks ORDER BY height').all();for(const row of rows){const b=JSON.parse(row.json),h=b.header;demand(row.height===count&&h.height===count&&row.hash===b.hash,'BLOCK_ORDER','Block numbering or index mismatch');demand(h.chain_id===s.chain_id&&h.previous===(prev?prev.hash:ZERO),'CHAIN','Broken previous-block link');demand(h.authority===hash(this.key.publicKey)&&verifySignature(BLOCK_DOMAIN,h,b.signature,this.key.publicKey),'SIGNATURE','Block signature invalid');demand(h.events_root===merkle(b.events),'EVENTS','Event Merkle root mismatch');demand(b.hash===hash(BLOCK_DOMAIN+'\n'+canonical(h)+'\n'+b.signature),'HASH','Block digest mismatch');demand(Number.isSafeInteger(h.timestamp)&&(!prev||h.timestamp>=prev.header.timestamp),'TIME','Block clock ordering invalid');prev=b;count++}demand(prev&&prev.header.state_root===hash(canonical(s)),'STATE','State root mismatch');
   if(checkpoint){demand(checkpoint.format==='VEXA127-CHECKPOINT/1'&&checkpoint.chain_id===s.chain_id&&checkpoint.authority===this.key.publicKey,'CHECKPOINT','Checkpoint authority/chain mismatch');const b=this.db.prepare('SELECT hash FROM blocks WHERE height=?').get(checkpoint.height);demand(b&&b.hash===checkpoint.hash,'ROLLBACK','Pinned checkpoint not present in this chain')}
   const referenced=new Set();for(const row of s.messages){this.getObject(s,row);referenced.add(row.blob_id);const st=s.stamps[row.stamp_id];demand(st&&st.status==='CONSUMED','STAMP_REFERENCE','Delivery without consumed stamp')}
   for(const st of Object.values(s.stamps)){demand(verifySignature(STAMP_DOMAIN,st.envelope,st.signature,this.key.publicKey),'STAMP_SIGNATURE','Stored stamp invalid');demand(st.envelope.chain_id===s.chain_id,'STAMP_CHAIN','Stamp chain mismatch')}
   demand(this.db.prepare('SELECT count(*) n FROM objects').get().n===referenced.size,'ORPHAN_OBJECT','Unreferenced or missing encrypted object');
  }catch(e){errors.push(e.message)}return {ok:errors.length===0,blocks_checked:count,errors,scope:'Local authority signatures, links, event roots, current state root, supply, object hashes/authentication, and optional external checkpoint; not distributed consensus or legal proof.'}}
 backup(tok){this.operator(tok,this.state());const report=this.verify();demand(report.ok,'INTEGRITY','Refuse corrupt backup');const dest=path.join(this.root,'backups',id());fs.mkdirSync(dest,{recursive:true,mode:0o700});const target=path.join(dest,'mail.sqlite');this.db.prepare('VACUUM INTO ?').run(target);fs.copyFileSync(path.join(this.root,'node.secret.json'),path.join(dest,'node.secret.json'));if(fs.existsSync(path.join(this.root,'credentials.secret.json')))fs.copyFileSync(path.join(this.root,'credentials.secret.json'),path.join(dest,'credentials.secret.json'));
  const files={};for(const f of fs.readdirSync(dest)){fs.chmodSync(path.join(dest,f),0o600);files[f]=hash(fs.readFileSync(path.join(dest,f)))}const manifest={format:'VEXA127-BACKUP/1',checkpoint:this.checkpoint(),files};secretFile(path.join(dest,'manifest.json'),manifest);return {backup:dest,checkpoint:manifest.checkpoint,warning:'Backup contains node secrets; keep the directory private. Restore only to a new directory.'}}
 close(){this.db.close()}
}
export function restoreNew(source,destination){const src=path.resolve(source),dest=path.resolve(destination);demand(!fs.existsSync(dest),'RESTORE_EXISTS','Restore requires a new destination directory',409);const m=readJSON(path.join(src,'manifest.json'));demand(m.format==='VEXA127-BACKUP/1','BACKUP','Unsupported backup');const allowed=['mail.sqlite','node.secret.json','credentials.secret.json'];for(const [f,d]of Object.entries(m.files)){demand(allowed.includes(f),'BACKUP','Unsafe backup entry');demand(!fs.lstatSync(path.join(src,f)).isSymbolicLink()&&hash(fs.readFileSync(path.join(src,f)))===d,'BACKUP_HASH','Backup file changed')}
 demand(m.files['mail.sqlite']&&m.files['node.secret.json'],'BACKUP','Incomplete backup');fs.mkdirSync(dest,{recursive:false,mode:0o700});try{for(const f of Object.keys(m.files)){fs.copyFileSync(path.join(src,f),path.join(dest,f));fs.chmodSync(path.join(dest,f),0o600)}const st=new Store(dest);try{const r=st.verify(m.checkpoint);demand(r.ok,'RESTORE_INTEGRITY','Backup checkpoint verification failed');return r}finally{st.close()}}catch(e){throw new MailError('RESTORE_FAILED','Restore failed; candidate directory retained for inspection: '+e.message,503)}}
