import fs from 'node:fs';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {randomBytes,createHash} from 'node:crypto';
import {canonical,hash,id,token,keys,signature,verifySignature,seal,unseal,merkle,eventsDigest,inclusionProof,equal} from './crypto.mjs';
import {PROFILE,DEFAULTS,BRANCHES,MailError,demand,address,boundedInt,requestId,payload,mailboxPayload,mailContent,expand,held} from './policy.mjs';
import {frameObject,readObject} from './framing.mjs';
import {parseMail,fromAddress} from './mime.mjs';
import {checkGlyphoku,readGlyphoku,domainResolution,loopbackRecord,legacyLoopbackRecord,legacyLoopbackRecordV2} from './glyphoku-persistence.mjs';
import {claimLocal127,validateLocal127,local127View,replayLocal127,validateLocal127Journal,validateLocal127Transition} from './local127-registry.mjs';
import {Vault,createVaultMetadata,validateVaultKey,validateVaultMetadata,isProtectedText} from './vault.mjs';
import {validateInternetMailState} from './internet-mail.mjs';
import {validateTorusMailState,validateTorusEnvelope,torusAddressMatchesCard} from './torus-mail.mjs';
import {createTorusAttachments,validateTorusAttachmentState,validateDeliveryAttachmentReferences} from './torus-attachments.mjs';
import {ensureLocal127Assignment,getLocal127Assignment,validateLocal127Assignments,replayLocal127Assignments,validateLocal127AssignmentJournal,validateLocal127AssignmentTransition} from './local127-assignment.mjs';
export const VERSION='3.9.1-local.1';
const BLOCK_DOMAIN='VEXA127-BLOCK/1', STAMP_DOMAIN='VEXA127-STAMP/1', MAILBOX_ADMISSION='MAILBOX_ADMISSION_V1';
const ZERO='0'.repeat(64);
function hashFile(file){const fd=fs.openSync(file,'r'),buffer=Buffer.alloc(256*1024),digest=createHash('sha256');try{let count;while((count=fs.readSync(fd,buffer,0,buffer.length,null)))digest.update(buffer.subarray(0,count));return digest.digest('hex')}finally{fs.closeSync(fd);buffer.fill(0)}}
function bindEvents(block){
 const h=block.header,events=block.events;
 demand(h&&Array.isArray(events),'EVENTS','Block events are not a list');
 if(h.version===1){
  demand(h.events_root===merkle(events),'EVENTS','Event Merkle root mismatch');
  if(events.length>=2&&canonical(events.at(-1))===canonical(events.at(-2))&&merkle(events.slice(0,-1))===h.events_root)throw new MailError('EVENTS','Ambiguous duplicated trailing event',503);
  return;
 }
 demand(h.version===2&&h.events_count===events.length&&h.events_hash===eventsDigest(events)&&h.events_root===merkle(events),'EVENTS','Event commitment mismatch');
}
function secretFile(f,obj){fs.writeFileSync(f,JSON.stringify(obj,null,2)+'\n',{mode:0o600,flag:'wx'})}
function boundedText(f,max=256*1024){demand(fs.statSync(f).size<=max,'VAULT_SIZE','Vault file exceeds its storage bound',503);return fs.readFileSync(f,'utf8')}
function loadVault(root,vaultKey,{fresh=false}={}){
 const metaPath=path.join(root,'vault.meta.json');
 if(fs.existsSync(metaPath)){demand(!fs.lstatSync(metaPath).isSymbolicLink(),'SYMLINK','Vault metadata cannot be a symlink');validateVaultKey(vaultKey);return new Vault(vaultKey,JSON.parse(boundedText(metaPath,16*1024)))}
 if(vaultKey!==undefined&&vaultKey!==null){validateVaultKey(vaultKey);demand(fresh,'VAULT_MIGRATION_REQUIRED','Existing plaintext state requires an explicit new-directory protected migration',503);const metadata=createVaultMetadata();secretFile(metaPath,metadata);return new Vault(vaultKey,metadata)}
 return null;
}
function readSecret(root,name,vault){const text=boundedText(path.join(root,name));demand(vault||!isProtectedText(text),'VAULT_REQUIRED','Protected secrets require vault metadata and an external key',503);return JSON.parse(vault?vault.open(text,name==='node.secret.json'?'file:authority':'file:credentials',name):text)}
function writeSecret(root,name,obj,vault){const text=canonical(obj);fs.writeFileSync(path.join(root,name),vault?vault.seal(text,name==='node.secret.json'?'file:authority':'file:credentials',name):JSON.stringify(obj,null,2)+'\n',{mode:0o600,flag:'wx'})}
export class Store {
 constructor(root,{readOnly=false,clock=()=>Date.now(),fault=()=>{},nonceFactory=()=>randomBytes(12),vaultKey=null}={}){
  if(vaultKey!==null)validateVaultKey(vaultKey);
  this.root=path.resolve(root);this.clock=clock;this.fault=fault;this.nonceFactory=nonceFactory;this.readOnly=readOnly;this.innerNonces=new Set();
  if(!readOnly)fs.mkdirSync(this.root,{recursive:true,mode:0o700});
  demand(fs.existsSync(this.root),'NO_STATE','State directory does not exist',404);
  for(const name of ['mail.sqlite','node.secret.json','credentials.secret.json','vault.meta.json']){const f=path.join(this.root,name);if(fs.existsSync(f))demand(!fs.lstatSync(f).isSymbolicLink(),'SYMLINK','State files cannot be symlinks')}
  const keypath=path.join(this.root,'node.secret.json'),dbpath=path.join(this.root,'mail.sqlite');
  const fresh=!fs.existsSync(keypath)&&!fs.existsSync(dbpath);
  demand(!fresh||!fs.existsSync(path.join(this.root,'vault.meta.json')),'INCOMPLETE_STATE','Vault metadata without its database and authority is incomplete state; initialization refused',503);
  demand(!fresh||!vaultKey||!fs.existsSync(path.join(this.root,'credentials.secret.json')),'VAULT_MIGRATION_REQUIRED','Existing plaintext credentials require an explicit new-directory protected migration',503);
  demand(fs.existsSync(keypath)===fs.existsSync(dbpath),'INCOMPLETE_STATE','Database and authority key must exist together; incomplete state is never silently reinitialized',503);
  demand(!fresh||!readOnly,'NO_STATE','Uninitialized state',404);
  this.vault=loadVault(this.root,vaultKey,{fresh});this.vaultProtected=!!this.vault;
  try{
  demand(!this.vault||fresh||fs.existsSync(path.join(this.root,'credentials.secret.json')),'INCOMPLETE_STATE','Protected state requires its encrypted credentials file',503);
  if(fs.existsSync(path.join(this.root,'credentials.secret.json')))readSecret(this.root,'credentials.secret.json',this.vault);
  if(!fs.existsSync(keypath))writeSecret(this.root,'node.secret.json',keys(),this.vault);
  this.key=readSecret(this.root,'node.secret.json',this.vault);
  demand(this.key?.version===1&&typeof this.key.sealKey==='string'&&/^[0-9a-f]{64}$/.test(this.key.sealKey)&&typeof this.key.publicKey==='string'&&typeof this.key.privateKey==='string','KEY','Invalid authority key record',503);
  try{demand(verifySignature('VEXA127-KEY-CHECK/1',{},signature('VEXA127-KEY-CHECK/1',{},this.key.privateKey),this.key.publicKey),'KEY','Authority key pair does not match',503)}catch(e){if(e instanceof MailError)throw e;throw new MailError('KEY','Invalid authority key pair',503)}
  this.db=new DatabaseSync(dbpath,{readOnly,enableForeignKeyConstraints:true});
   this.db.exec('PRAGMA busy_timeout=3000;');
   if(!readOnly){this.db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; CREATE TABLE IF NOT EXISTS state (singleton INTEGER PRIMARY KEY CHECK(singleton=1),json TEXT NOT NULL); CREATE TABLE IF NOT EXISTS blocks (height INTEGER PRIMARY KEY, hash TEXT NOT NULL UNIQUE, json TEXT NOT NULL); CREATE TABLE IF NOT EXISTS objects (id TEXT PRIMARY KEY, nonce TEXT NOT NULL UNIQUE, json TEXT NOT NULL);');try{fs.chmodSync(dbpath,0o600)}catch{}}
   if(!this.db.prepare('SELECT json FROM state WHERE singleton=1').get()){demand(fresh&&!readOnly,'NO_STATE','Existing database has no state; initialization refused',503);this.initialize()}
   this.attachments=createTorusAttachments(this);const report=this.verify();demand(report.ok,'INTEGRITY','Startup integrity verification failed: '+report.errors.join('; '),503);
  }catch(e){try{this.db?.close()}catch{}this.vault?.destroy();throw e}
 }
 credentials(){const initial=readSecret(this.root,'credentials.secret.json',this.vault);if(!this.vault||!this.db||!this.db.prepare('SELECT singleton FROM state WHERE singleton=1').get())return initial;const s=this.state();this.integrityHead(s);return {...initial,...s.recoveryCredentials}}
 storageContext(table,rowId){demand(['state','blocks','objects'].includes(table),'VAULT_CONTEXT','Unsupported storage table',503);const value=String(rowId);demand(table==='state'?value==='1':table==='blocks'?/^(0|[1-9][0-9]*)$/.test(value):/^[a-f0-9]{64}$/.test(value),'VAULT_CONTEXT','Invalid storage row identifier',503);return value}
 rememberObjectNonce(table,text){if(this.vault&&table==='objects'){const record=JSON.parse(text);if(typeof record.nonce==='string'&&/^[a-f0-9]{24}$/.test(record.nonce))this.innerNonces.add(record.nonce)}}
 encodeStoredJSON(table,rowId,text){const context=this.storageContext(table,rowId);this.rememberObjectNonce(table,text);return this.vault?this.vault.seal(text,'table:'+table,context):text}
 decodeStoredJSON(table,rowId,text){const context=this.storageContext(table,rowId);demand(this.vault||!isProtectedText(text),'VAULT_REQUIRED','Protected rows require an external vault key',503);const logical=this.vault?this.vault.open(text,'table:'+table,context):text;this.rememberObjectNonce(table,logical);return logical}
 initialize(){
  const creds=fs.existsSync(path.join(this.root,'credentials.secret.json'))?this.credentials():{'postmaster@local.test':token(),'user@local.test':token()};
  if(!fs.existsSync(path.join(this.root,'credentials.secret.json')))writeSecret(this.root,'credentials.secret.json',creds,this.vault);
  const accounts={};for(const a of Object.keys(creds)){accounts[a]={role:a==='postmaster@local.test'?'operator':'user',tokenHash:hash(creds[a]),balance:100,quota:DEFAULTS.mailbox_quota_bytes,daily:DEFAULTS.daily_allowance,accept:true,blocked:[]}}
  const s={schema:1,profile:PROFILE,chain_id:id(),authority:this.key.publicKey,accounts,aliases:{'all@local.test':['postmaster@local.test','user@local.test']},messages:[],stamps:{},replays:{},allowance:{},sponsorUsage:{},sponsor:{balance:1000,daily:0},issued:Object.keys(accounts).length*100+1000,burned:0,lastTime:0};
  if(this.vault)s.recoveryCredentials={};
  this.db.exec('BEGIN IMMEDIATE');try{this.commitState(s,[{type:'GENESIS',profile:PROFILE,authority:hash(this.key.publicKey),issued:s.issued}],true);this.db.exec('COMMIT')}catch(e){this.db.exec('ROLLBACK');throw e}
 }
 state(){return JSON.parse(this.decodeStoredJSON('state',1,this.db.prepare('SELECT json FROM state WHERE singleton=1').get().json))}
 head(){const r=this.db.prepare('SELECT height,json FROM blocks ORDER BY height DESC LIMIT 1').get();return r?JSON.parse(this.decodeStoredJSON('blocks',r.height,r.json)):null}
 time(s){const n=Math.trunc(this.clock());demand(Number.isSafeInteger(n)&&n>=0,'CLOCK','Invalid authority clock',503);demand(n+5000>=s.lastTime,'CLOCK_ROLLBACK','Authority clock moved backward; dependent mutation stopped',503);return Math.max(n,s.lastTime)}
 authenticate(tok,s=this.state()){
  demand(typeof tok==='string'&&tok.length>=16&&tok.length<=256,'AUTH','Authentication required',401);const h=hash(tok);
  const a=Object.keys(s.accounts).find(a=>equal(s.accounts[a].tokenHash,h));demand(a,'AUTH','Authentication required',401);return a;
 }
 operator(tok,s){const a=this.authenticate(tok,s);demand(s.accounts[a].role==='operator','ROLE','Operator role required',403);return a}
 integrityHead(s){const h=this.head();demand(h&&h.header.state_root===hash(canonical(s))&&s.authority===this.key.publicKey&&verifySignature(BLOCK_DOMAIN,h.header,h.signature,this.key.publicKey),'INTEGRITY','State or authority changed outside the chain',503);bindEvents(h);return h}
 invariants(s){
  validateLocal127Assignments(s);
  demand(s.internetMail===undefined||!!this.vault,'INTERNET_PROTECTED_REQUIRED','Internet mail state requires protected storage',503);
  validateInternetMailState(s);
  demand(s.torusMail===undefined||!!this.vault,'TORUS_PROTECTED_REQUIRED','Private peer mail requires protected storage',503);validateTorusMailState(s);
  validateTorusAttachmentState(this,s);
  demand(s.schema===1&&s.profile===PROFILE,'SCHEMA','Unsupported state');checkGlyphoku(this,s);validateLocal127(s);let value=s.sponsor.balance;
  if(s.recoveryCredentials!==undefined){demand(this.vault&&s.recoveryCredentials&&Object.getPrototypeOf(s.recoveryCredentials)===Object.prototype,'RECOVERY_CREDENTIALS','Invalid protected recovery credentials',503);for(const [name,t]of Object.entries(s.recoveryCredentials))demand(s.accounts[name]&&!s.accounts[name].glyphoku&&typeof t==='string'&&t.length>=16&&t.length<=256&&hash(t)===s.accounts[name].tokenHash,'RECOVERY_CREDENTIALS','Protected recovery credential does not match its account',503)}
  for(const a of Object.values(s.accounts)){demand(Number.isSafeInteger(a.balance)&&a.balance>=0,'BALANCE','Invalid account balance');value+=a.balance}
  for(const st of Object.values(s.stamps))if(st.status==='RESERVED')value+=st.envelope.cost;
  demand(value+s.burned===s.issued&&Number.isSafeInteger(s.issued)&&s.sponsor.balance>=0&&s.burned>=0,'CONSERVATION','Credit supply does not reconcile');
  demand(new Set(s.messages.map(m=>m.id)).size===s.messages.length,'DUPLICATE','Duplicate delivery identifier');
  if(s.resolution){const domain=s.glyphoku?readGlyphoku(this,s).registry.instance.domains[0]:null;demand(domain&&canonical(s.resolution)===canonical(domainResolution(domain,hash(this.key.publicKey))),'RESOLUTION','Signed resolution does not match this local domain');}
  if(s.loopback){const domain=s.glyphoku?readGlyphoku(this,s).registry.instance.domains[0]:null;const port=s.loopback.port;demand(domain&&Number.isInteger(port)&&port>=1&&port<=65535&&[loopbackRecord,legacyLoopbackRecord,legacyLoopbackRecordV2].some(make=>canonical(s.loopback)===canonical(make(s.chain_id,port,domain))),'LOOPBACK','Signed loopback name does not match this chain');}
 }
 commitState(s,events,genesis=false){
  this.invariants(s);const prev=genesis?null:this.head(),previousState=genesis?null:this.state(),height=prev?prev.header.height+1:0;validateLocal127Transition(previousState,s,events,height);validateLocal127AssignmentTransition(previousState,s,events,height);const now=this.time(s);s.lastTime=now;
  const header={version:2,chain_id:s.chain_id,height:prev?prev.header.height+1:0,previous:prev?prev.hash:ZERO,timestamp:now,events_root:merkle(events),events_count:events.length,events_hash:eventsDigest(events),state_root:hash(canonical(s)),authority:hash(this.key.publicKey)};
  demand(header.height<DEFAULTS.max_blocks,'CHAIN_CAPACITY','Laboratory chain capacity reached',507);
  const sig=signature(BLOCK_DOMAIN,header,this.key.privateKey);const block={header,events,signature:sig,hash:hash(BLOCK_DOMAIN+'\n'+canonical(header)+'\n'+sig)};
  this.db.prepare('INSERT INTO blocks VALUES (?,?,?)').run(header.height,block.hash,this.encodeStoredJSON('blocks',header.height,canonical(block)));
  this.db.prepare('INSERT INTO state VALUES(1,?) ON CONFLICT(singleton) DO UPDATE SET json=excluded.json').run(this.encodeStoredJSON('state',1,canonical(s)));return block;
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
 checkConsent(s,p){const assignment=s.torusMail?.assignments?.find(item=>item.owner===p.from||item.address===p.from)??s.mailAssignments?.items.find(item=>item.owner===p.from||item.address===p.from),identities=assignment?[assignment.owner,assignment.address]:[p.from];for(const a of p.to){demand(s.accounts[a].accept&&!identities.some(sender=>s.accounts[a].blocked.includes(sender)),'CONSENT','Recipient policy refuses admission',403)}}
 estimate(s,a,p,now){this.checkConsent(s,p);const cost=p.to.length*DEFAULTS.price,day=String(Math.floor(now/86400000)),key=a+'|'+day;const payer=s.sponsor.daily>0&&(s.sponsorUsage[key]??0)+p.to.length<=s.sponsor.daily&&s.sponsor.balance>=cost?'SPONSOR':a;return {mechanism:PROFILE,digest:hash(canonical(p)),from:a,to:p.to,cost,payer,day,key}}
 quote(tok,input){const s=this.state();this.integrityHead(s);const a=this.authenticate(tok,s);return this.estimate(s,a,payload(input,a,s),this.time(s))}
 quoteMailbox(tok,input){const s=this.state();this.integrityHead(s);const a=this.authenticate(tok,s),p=mailboxPayload(input,a,s);this.time(s);this.checkConsent(s,p);return {mechanism:MAILBOX_ADMISSION,digest:hash(canonical(p)),from:p.from,to:p.to,cost:0,payer:p.from}}
 reserve(s,a,p,now,events,maxCost){const q=this.estimate(s,a,p,now);boundedInt(maxCost,0,1000,'max_cost');demand(q.cost<=maxCost,'PRICE_CHANGED','Postage exceeds caller-authorized maximum',409);
  demand(Object.values(s.stamps).filter(st=>st.status==='RESERVED').length<DEFAULTS.max_pending_stamps,'STAMP_CAPACITY','Pending-stamp capacity reached',429);
  demand((s.allowance[q.key]??0)+q.cost<=s.accounts[a].daily,'ALLOWANCE','Daily authorized postage allowance exhausted',429);
  if(q.payer==='SPONSOR'){s.sponsor.balance-=q.cost;s.sponsorUsage[q.key]=(s.sponsorUsage[q.key]??0)+p.to.length}else{demand(s.accounts[a].balance>=q.cost,'FUNDS','Insufficient local credits',402);s.accounts[a].balance-=q.cost}
  s.allowance[q.key]=(s.allowance[q.key]??0)+q.cost;
  const envelope={version:1,mechanism:PROFILE,chain_id:s.chain_id,id:id(),from:a,to:p.to,digest:q.digest,cost:q.cost,payer:q.payer,issued_at:now,expires_at:now+DEFAULTS.stamp_ttl_ms,nonce:id()};
  const signed={envelope,signature:signature(STAMP_DOMAIN,envelope,this.key.privateKey)};s.stamps[envelope.id]={...signed,status:'RESERVED'};events.push({type:'STAMP_RESERVED',stamp_id:envelope.id,actor:hash(a),digest:q.digest,cost:q.cost,payer:hash(q.payer)});return signed;
 }
 issue(tok,input){requestId(input.request_id);return this.mutate(tok,(s,a,now,events)=>{const p=payload(input,a,s),digest=hash('ISSUE\n'+canonical(p)+'\n'+input.max_cost);const old=this.lookupReplay(s,a,input.request_id,digest);if(old)return old;const stamp=this.reserve(s,a,p,now,events,input.max_cost);return this.remember(s,a,input.request_id,digest,{stamp})})}
 sendMailbox(tok,input){return this.send(tok,input,{assignedMailbox:true})}
 send(tok,input,{assignedMailbox=false}={}){requestId(input.request_id);return this.mutate(tok,(s,a,now,events)=>{
  const p=(assignedMailbox?mailboxPayload:payload)(input,a,s);
  validateDeliveryAttachmentReferences(this,s,a,p);
  if(p.raw!==null){const raw=parseMail(p.raw);demand(fromAddress(raw.claimedFrom)===p.from,'RAW_BINDING','Raw From must match the authenticated sender address');demand(raw.subject===p.subject&&raw.body===p.body&&canonical(raw.attachments.map(x=>({name:x.name,data:x.data})))===canonical(p.attachments.map(x=>({name:x.name,data:x.data}))),'RAW_BINDING','Raw MIME content does not match the committed message');}
  const digest=hash('SEND\n'+canonical(p));const old=this.lookupReplay(s,a,input.request_id,digest);if(old)return old;this.checkConsent(s,p);
  demand(s.messages.length+p.to.length+1<=DEFAULTS.max_messages,'MESSAGE_CAPACITY','Message capacity reached',507);
  let signed;
  if(assignedMailbox){demand(input.stamp===undefined,'MAILBOX_STAMP','Mailbox sending does not use purchased stamps');signed=this.mailboxStamp(s,p,now,events)}
  else{signed=input.stamp;if(signed){demand(signed.envelope&&signed.signature,'STAMP','Malformed stamp');const e=signed.envelope;demand(e.mechanism===PROFILE,'UNSUPPORTED_BRANCH','Unknown or disabled postage mechanism',422);demand(verifySignature(STAMP_DOMAIN,e,signed.signature,this.key.publicKey),'STAMP_SIGNATURE','Invalid stamp signature',403);const st=s.stamps[e.id];demand(st&&st.status==='RESERVED','STAMP_USED','Stamp unavailable or already consumed',409);demand(canonical(st.envelope)===canonical(e)&&st.signature===signed.signature,'STAMP','Stamp record mismatch');demand(e.chain_id===s.chain_id&&e.from===a&&e.digest===hash(canonical(p))&&canonical(e.to)===canonical(p.to),'STAMP_BINDING','Stamp does not authorize this envelope',403);demand(now<e.expires_at,'STAMP_EXPIRED','Stamp expired; use explicit cancellation/refund',409)}else{signed=this.reserve(s,a,p,now,events,input.max_cost)}}
  const delivered=this.deliverMessage(s,a,p,now,events,signed);
  return this.remember(s,a,input.request_id,digest,delivered);
 })}
 deliverMessage(s,a,p,now,events,signed,{recipients=p.to,forceInbox=false,includeSent=true}={}){
  if(includeSent)validateDeliveryAttachmentReferences(this,s,a,p);
  const copies=[...recipients,...(includeSent?[a]:[])];const logical=Buffer.byteLength(canonical(p));
  const stamp=signed.envelope;const message_id=id(),framed=frameObject({v:2,from:p.from,to:p.to,subject:p.subject,body:p.body});
  const objectNonce=this.nonceFactory();this.assertNonceUnused(objectNonce);demand(!s.glyphoku?.nonces.includes(Buffer.from(objectNonce).toString('base64')),'NONCE_REUSE','Mail nonce matches retained game-registry nonce history',503);
  const encrypted=seal({version:1,frame:framed.text,attachments:p.attachments,raw:p.raw},this.key.sealKey,s.chain_id+'|'+message_id,objectNonce);const encoded=canonical(encrypted);const blob_id=hash(encoded);
  this.db.prepare('INSERT INTO objects VALUES(?,?,?)').run(blob_id,encrypted.nonce,this.encodeStoredJSON('objects',blob_id,encoded));this.fault('after-object');
  const deliveries=[];for(let n=0;n<copies.length;n++){const folder=includeSent&&n===copies.length-1?'Sent':(!forceInbox&&held(p))?'Quarantine':'INBOX';const m={id:id(),message_id,mailbox:copies[n],folder,from:p.from,to:p.to,blob_id,bytes:logical,created:now,stamp_id:stamp.id};s.messages.push(m);deliveries.push({id:m.id,mailbox:m.mailbox,folder})}
  s.stamps[stamp.id].status='CONSUMED';s.burned+=stamp.cost;
  events.push({type:'STAMP_CONSUMED',stamp_id:stamp.id,cost:stamp.cost},{type:'MESSAGE_COMMITTED',message_id,blob_id,from:hash(p.from),to:p.to.map(hash),deliveries:deliveries.map(d=>({id:d.id,mailbox:hash(d.mailbox),folder:d.folder}))});
  return {message_id,stamp_id:stamp.id,cost:stamp.cost,payer:stamp.payer,deliveries,status:'COMMITTED'};
 }

 mailboxStamp(s,p,now,events){return this.peerStamp(s,p,now,events,MAILBOX_ADMISSION,'MAILBOX_ADMITTED')}
 peerStamp(s,p,now,events,mechanism,eventType='PEER_ADMITTED'){
  const envelope={version:1,mechanism,chain_id:s.chain_id,id:id(),from:p.from,to:p.to,digest:hash(canonical(p)),cost:0,payer:p.from,issued_at:now,expires_at:now+DEFAULTS.stamp_ttl_ms,nonce:id()};
  const signed={envelope,signature:signature(STAMP_DOMAIN,envelope,this.key.privateKey)};s.stamps[envelope.id]={...signed,status:'RESERVED'};events.push({type:eventType,stamp_id:envelope.id,mechanism,digest:envelope.digest});return signed;
 }
 peerQuota(s,p,copies){
  demand(s.messages.length+copies.length<=DEFAULTS.max_messages,'MESSAGE_CAPACITY','Message capacity reached',507);
  for(const owner of new Set(copies))demand(s.accounts[owner],'NO_MAILBOX','Recipient mailbox is unavailable',404);
 }
 recordTorusSent(tok,envelope){
  return this.mutate(tok,(s,actor,now,events)=>{
   demand(this.vault&&s.torusMail?.network?.status==='ACTIVE','TORUS_UNAVAILABLE','Private mail network is not active',409);
   demand(typeof envelope?.id==='string'&&/^[a-f0-9]{32}$/.test(envelope.id)&&typeof envelope.digest==='string'&&/^[a-f0-9]{64}$/.test(envelope.digest),'TORUS_ENVELOPE','Invalid private mail identity');
   validateTorusEnvelope(envelope,s.torusMail.network.directory);
   const prior=s.torusMail.outbox.find(item=>item.envelope.id===envelope.id);demand(prior?.owner===actor&&prior.envelope.digest===envelope.digest,'TORUS_ENVELOPE','Private outbox ownership mismatch',403);
   if(prior.sent_delivery_id)return {id:prior.sent_delivery_id,replayed:true};
   const assigned=s.torusMail.assignments.find(item=>item.owner===actor)?.address??getLocal127Assignment(s,actor)?.address;
   demand(envelope.from===assigned,'SENDER','Private sender must be your assigned address',403);
   const p={version:1,from:address(envelope.from),to:[address(envelope.to)],...mailContent(envelope),raw:null};this.peerQuota(s,p,[actor]);
   validateDeliveryAttachmentReferences(this,s,actor,envelope);
   const delivered=this.deliverMessage(s,actor,p,now,events,this.peerStamp(s,p,now,events,'TORUS_PEER_OUTBOUND_V1'),{recipients:[],includeSent:true});
   prior.sent_delivery_id=delivered.deliveries[0].id;events.push({type:'TORUS_SENT_COPY',network_id:s.torusMail.network.network_id,id:envelope.id,digest:envelope.digest,delivery_id:prior.sent_delivery_id,owner:hash(actor)});
   return {id:prior.sent_delivery_id,replayed:false};
  });
 }
 receiveTorusMail(envelope){
  demand(!this.readOnly,'READ_ONLY','Read-only instance',403);this.db.exec('BEGIN IMMEDIATE');let committed=false;
  try{
   const s=this.state();this.integrityHead(s);const network=s.torusMail?.network;
   demand(this.vault&&network?.status==='ACTIVE'&&envelope?.network_id===network.network_id,'TORUS_UNAVAILABLE','Private mail network does not match',403);
   validateTorusEnvelope(envelope.envelope,network.directory);demand(['network_id','id','digest','from','to','subject','body','attachments','sender_node'].every(field=>canonical(envelope[field])===canonical(envelope.envelope[field])),'TORUS_ENVELOPE','Private ingress differs from its signed envelope',403);
   const sender=network.directory.nodes.find(node=>node.node_id===envelope.sender_node);demand(sender&&sender.sign_public===envelope.sender_public&&envelope.envelope.recipient_node===network.node_id,'TORUS_SIGNATURE','Private ingress sender is not pinned in this network',403);
   demand(typeof envelope.id==='string'&&/^[a-f0-9]{32}$/.test(envelope.id)&&typeof envelope.digest==='string'&&/^[a-f0-9]{64}$/.test(envelope.digest),'TORUS_ENVELOPE','Invalid private mail identity');
   const from=address(envelope.from),to=address(envelope.to),prior=s.torusMail.receipts.find(item=>item.network_id===network.network_id&&item.id===envelope.id&&item.sender_node===envelope.sender_node);
   if(prior){demand(prior.digest===envelope.digest&&prior.from===from&&prior.to===to&&prior.sender_node===envelope.sender_node,'TORUS_REPLAY_CONFLICT','Private mail identity was reused with changed content',409);this.db.exec('ROLLBACK');return {id:prior.id,delivery_id:prior.delivery_id,replayed:true}}
   demand(s.torusMail.receipts.length<5000,'REPLAY_CAPACITY','Private receipt journal is full',507);
   demand(torusAddressMatchesCard(network.card,to),'TORUS_RECIPIENT','Recipient belongs to a different computer',403);
   const recipients=expand([to],s);demand(recipients.length===1,'TORUS_RECIPIENT','Private mail must target one account',403);const owner=recipients[0];
   const p={version:1,from,to:[to],...mailContent(envelope),raw:null};demand(s.accounts[owner].accept&&!s.accounts[owner].blocked.includes(from),'CONSENT','Recipient policy refuses admission',403);this.peerQuota(s,p,[owner]);
   validateDeliveryAttachmentReferences(this,s,owner,envelope.envelope);
   const now=this.time(s),events=[];const delivered=this.deliverMessage(s,owner,p,now,events,this.peerStamp(s,p,now,events,'TORUS_PEER_INBOUND_V1'),{recipients:[owner],includeSent:false});
   const receipt={network_id:network.network_id,id:envelope.id,digest:envelope.digest,delivery_id:delivered.deliveries[0].id,from,to,sender_node:envelope.sender_node,owner,created_ms:now};s.torusMail.receipts.push(receipt);
   events.push({type:'TORUS_INBOUND',network_id:network.network_id,id:envelope.id,digest:envelope.digest,sender_node:envelope.sender_node,sender_public:hash(envelope.sender_public),delivery_id:receipt.delivery_id,owner:hash(owner)});
   this.fault('before-commit');this.commitState(s,events);this.db.exec('COMMIT');committed=true;this.fault('after-commit');return {id:receipt.id,delivery_id:receipt.delivery_id,replayed:false};
  }catch(error){if(!committed)try{this.db.exec('ROLLBACK')}catch{}throw error}
 }

 cancel(tok,stampId){return this.mutate(tok,(s,a,now,events)=>{const st=s.stamps[stampId];demand(st&&st.envelope.from===a,'NOT_FOUND','Unknown stamp',404);demand(st.envelope.mechanism===PROFILE,'GLYPHOKU_PERMIT_REQUIRED','Game permits cannot be cancelled through credit APIs',403);if(st.status==='CANCELLED'||st.status==='EXPIRED')return {status:st.status,replayed:true};demand(st.status==='RESERVED','STAMP_USED','Consumed stamps cannot be refunded',409);st.status=now>=st.envelope.expires_at?'EXPIRED':'CANCELLED';if(st.envelope.payer==='SPONSOR')s.sponsor.balance+=st.envelope.cost;else s.accounts[a].balance+=st.envelope.cost;events.push({type:'STAMP_REFUNDED',stamp_id:stampId,cost:st.envelope.cost,status:st.status});return {status:st.status}})}
 preferences(tok,input){return this.mutate(tok,(s,a,now,events)=>{const account=s.accounts[a];if(input.daily!==undefined)account.daily=boundedInt(input.daily,0,1000,'daily');if(input.accept!==undefined){demand(typeof input.accept==='boolean','POLICY','accept must be boolean');account.accept=input.accept}if(input.blocked!==undefined){demand(Array.isArray(input.blocked)&&input.blocked.length<=64,'POLICY','Invalid block list');account.blocked=[...new Set(input.blocked.map(address))]}events.push({type:'PREFERENCES',actor:hash(a),daily:account.daily,accept:account.accept,blocked:account.blocked.map(hash)});return {ok:true}})}
 createAccount(tok,input){return this.mutate(tok,(s,a,now,events)=>{const name=address(input.address);demand(!s.accounts[name]&&!s.aliases[name],'EXISTS','Address exists',409);demand(Object.keys(s.accounts).length<DEFAULTS.max_mailboxes,'CAPACITY','Mailbox capacity reached',409);const t=token(),balance=boundedInt(input.credits??0,0,100000,'credits');demand(s.issued+balance<=1e9,'SUPPLY','Local-credit supply cap reached');claimLocal127(s,name,'mailbox',this.head().header.height+1,events);s.accounts[name]={role:'user',tokenHash:hash(t),balance,quota:DEFAULTS.mailbox_quota_bytes,daily:DEFAULTS.daily_allowance,accept:true,blocked:[]};if(this.vault)(s.recoveryCredentials??={})[name]=t;s.issued+=balance;events.push({type:'MAILBOX_CREATED',address:hash(name),credits:balance});return {address:name,token:t}},{admin:true})}
 credit(tok,input){requestId(input.request_id);return this.mutate(tok,(s,a,now,events)=>{const target=input.address==='SPONSOR'?'SPONSOR':address(input.address);const amount=boundedInt(input.amount,1,100000,'amount'),digest=hash(canonical({type:'CREDIT',target,amount}));const old=this.lookupReplay(s,a,input.request_id,digest);if(old)return old;demand(target==='SPONSOR'||s.accounts[target],'NO_MAILBOX','Unknown mailbox',404);demand(s.issued+amount<=1e9,'SUPPLY','Local-credit supply cap reached');if(target==='SPONSOR')s.sponsor.balance+=amount;else s.accounts[target].balance+=amount;s.issued+=amount;events.push({type:'CREDITS_ISSUED',actor:hash(a),target:hash(target),amount});return this.remember(s,a,input.request_id,digest,{ok:true,target,amount})},{admin:true})}
 sponsor(tok,input){return this.mutate(tok,(s,a,now,events)=>{s.sponsor.daily=boundedInt(input.daily,0,100,'daily');events.push({type:'LOCAL_SPONSOR_POLICY',daily:s.sponsor.daily});return {ok:true}},{admin:true})}
 alias(tok,input){return this.mutate(tok,(s,a,now,events)=>{const name=address(input.alias);demand(!s.accounts[name],'EXISTS','Cannot shadow mailbox');demand(Array.isArray(input.targets)&&input.targets.length>=1&&input.targets.length<=8,'ALIAS','Expected 1–8 targets');claimLocal127(s,name,'alias',this.head().header.height+1,events);s.aliases[name]=input.targets.map(address);expand([name],s);events.push({type:'ALIAS_SET',alias:hash(name),targets:s.aliases[name].map(hash)});return {ok:true}},{admin:true})}
 rotateToken(tok){return this.mutate(tok,(s,a,now,events)=>{demand(!s.accounts[a].glyphoku,'GLYPHOKU_ACCOUNT','Game mailbox credential rotation requires a reviewed registry migration',403);const t=token();s.accounts[a].tokenHash=hash(t);if(this.vault)(s.recoveryCredentials??={})[a]=t;events.push({type:'TOKEN_ROTATED',actor:hash(a)});return {token:t}})}
 assertNonceUnused(nonce){demand(ArrayBuffer.isView(nonce)&&nonce.BYTES_PER_ELEMENT===1&&nonce.byteLength===12,'NONCE','Encryption requires a 12-byte nonce',503);const text=Buffer.from(nonce).toString('hex');const used=this.vault?this.innerNonces.has(text)||this.db.prepare('SELECT id FROM objects WHERE nonce=? LIMIT 1').get(text):this.db.prepare("SELECT id FROM objects WHERE nonce=? OR json_extract(json,'$.nonce')=? LIMIT 1").get(text,text);demand(!used,'NONCE_REUSE','Previously used encrypted-object nonce refused',503)}
 getObject(s,row){const blob=this.db.prepare('SELECT nonce,json FROM objects WHERE id=?').get(row.blob_id);demand(blob,'OBJECT_INTEGRITY','Encrypted object missing or changed',503);const logical=this.decodeStoredJSON('objects',row.blob_id,blob.json);demand(hash(logical)===row.blob_id,'OBJECT_INTEGRITY','Encrypted object missing or changed',503);try{const encrypted=JSON.parse(logical);demand(blob.nonce===encrypted.nonce,'OBJECT_NONCE','Encrypted object nonce index changed',503);const data=unseal(encrypted,this.key.sealKey,s.chain_id+'|'+row.message_id),f=readObject(data.frame);demand(f.ok,'FRAME','Object frame invalid',503);demand(f.record.from===row.from&&canonical(f.record.to)===canonical(row.to),'OBJECT_BINDING','Object metadata mismatch',503);return {from:f.record.from,to:f.record.to,subject:f.record.subject,body:f.record.body,attachments:data.attachments,raw:data.raw}}catch(e){if(e instanceof MailError)throw e;throw new MailError('OBJECT_AUTHENTICATION','Encrypted object authentication failed',503)}}
 me(tok){const s=this.state();this.integrityHead(s);const a=this.authenticate(tok,s),box=s.accounts[a],now=this.time(s),day=String(Math.floor(now/86400000)),active=s.torusMail?.network?.status==='ACTIVE';return {address:a,assigned_address:(active?s.torusMail.assignments.find(item=>item.owner===a)?.address:null)??getLocal127Assignment(s,a)?.address??null,active,mode:active?'private-torus':'local',role:box.role,balance:box.balance,quota:null,storage_limit:'available-disk',daily:box.daily,used_today:s.allowance[a+'|'+day]??0,accept:box.accept,blocked:box.blocked,used_bytes:s.messages.filter(m=>m.mailbox===a).reduce((n,m)=>n+m.bytes,0),profile:PROFILE,version:VERSION,stamps:Object.values(s.stamps).filter(st=>st.envelope.from===a&&st.status==='RESERVED').map(st=>({id:st.envelope.id,cost:st.envelope.cost,expires_at:st.envelope.expires_at}))}}
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
 directory(tok){const s=this.state();this.integrityHead(s);this.authenticate(tok,s);const assigned=a=>(s.torusMail?.network?.status==='ACTIVE'?s.torusMail.assignments.find(item=>item.owner===a)?.address:null)??getLocal127Assignment(s,a)?.address??null;return {mailboxes:Object.keys(s.accounts).map(a=>({address:assigned(a)??a,identity_address:a,assigned_address:assigned(a),role:s.accounts[a].role})),aliases:s.aliases}}
 local127Registry(tok){const s=this.state();this.integrityHead(s);this.authenticate(tok,s);return local127View(s)}
 login(tok){const result=ensureLocal127Assignment(this,tok);return {...this.me(tok),assignment:result.assignment,replayed:result.replayed,...(result.block_height===undefined?{}:{block_height:result.block_height,block_hash:result.block_hash})}}
 ledger(tok){const s=this.state();this.integrityHead(s);this.authenticate(tok,s);const blocks=this.db.prepare('SELECT height,json FROM blocks ORDER BY height DESC LIMIT 100').all().map(r=>JSON.parse(this.decodeStoredJSON('blocks',r.height,r.json)));return {chain_id:s.chain_id,authority:s.authority,head:this.head(),issued:s.issued,burned:s.burned,reserved:Object.values(s.stamps).filter(st=>st.status==='RESERVED').reduce((n,st)=>n+st.envelope.cost,0),sponsor:s.sponsor,blocks,branches:BRANCHES}}
 exportMailbox(tok){const s=this.state();this.integrityHead(s);const a=this.authenticate(tok,s);return {format:'VEXA127-EXPORT/1',chain_id:s.chain_id,address:a,exported_at:Math.trunc(this.clock()),messages:s.messages.filter(m=>m.mailbox===a).map(m=>({...m,...this.getObject(s,m)}))}}
 checkpoint(){const s=this.state();const h=this.integrityHead(s);return {format:'VEXA127-CHECKPOINT/1',chain_id:h.header.chain_id,height:h.header.height,hash:h.hash,authority:this.key.publicKey}}
 acceptPin(tok,prior=null){this.authenticate(tok);if(prior!=null){demand(prior&&typeof prior==='object'&&!Array.isArray(prior),'CHECKPOINT','Checkpoint must be an object',400);const report=this.verify(prior);demand(report.ok,'ROLLBACK','Pinned checkpoint is not in this chain',409)}return {ok:true,checkpoint:this.checkpoint()}}
 resolution(tok){const s=this.state();this.integrityHead(s);this.authenticate(tok,s);const domain=s.glyphoku?readGlyphoku(this,s).registry.instance.domains[0]:null;if(!domain)return {recorded:false,resolution:null,reason:'No local domain has been created.'};const expected=domainResolution(domain,hash(this.key.publicKey));return {recorded:!!s.resolution,matches:!s.resolution||canonical(s.resolution)===canonical(expected),resolution:s.resolution??expected}}
 recordResolution(tok){return this.mutate(tok,(s,actor,now,events)=>{const domain=s.glyphoku?readGlyphoku(this,s).registry.instance.domains[0]:null;demand(domain,'NO_DOMAIN','Create the local domain before recording its resolution',404);const record=domainResolution(domain,hash(this.key.publicKey));if(s.resolution){demand(canonical(s.resolution)===canonical(record),'RESOLUTION_CONFLICT','A different resolution is already signed',409);return {resolution:s.resolution,replayed:true}}s.resolution=record;events.push({type:'DOMAIN_RESOLUTION',format:record.format,name_hash:hash(record.name),mailbox_hash:hash(record.mailbox),bind:record.bind,dns:record.dns,mx:record.mx,ens:record.ens,public_uniqueness:record.public_uniqueness});return {resolution:record,replayed:false}},{admin:true})}
 loopback(tok,port){const s=this.state();this.integrityHead(s);this.authenticate(tok,s);const domain=s.glyphoku?readGlyphoku(this,s).registry.instance.domains[0]:null;if(!domain)return {recorded:false,available:false,loopback:null,reason:'No local domain has been created.'};if(s.loopback)return {recorded:true,available:true,loopback:s.loopback};demand(Number.isInteger(port)&&port>=1&&port<=65535,'PORT','Loopback port must be 1–65535',400);return {recorded:false,available:true,loopback:loopbackRecord(s.chain_id,port,domain)}}
 recordLoopback(tok,port){demand(Number.isInteger(port)&&port>=1&&port<=65535,'PORT','Loopback port must be 1–65535',400);return this.mutate(tok,(s,actor,now,events)=>{const domain=s.glyphoku?readGlyphoku(this,s).registry.instance.domains[0]:null;demand(domain,'NO_DOMAIN','Create the local domain before recording its loopback name',404);if(s.loopback){demand(s.loopback.port===port,'LOOPBACK_CONFLICT','A different loopback name is already signed',409);return {loopback:s.loopback,replayed:true}}const record=loopbackRecord(s.chain_id,port,domain);s.loopback=record;events.push({type:'LOOPBACK_NAME',format:record.format,name_hash:hash(record.name),mailbox_hash:hash(record.mailbox),port,reachable:false});return {loopback:record,replayed:false}},{admin:true})}
 proof(tok,deliveryId){demand(typeof deliveryId==='string'&&/^[a-f0-9]{32}$/.test(deliveryId),'NOT_FOUND','Message not found',404);const s=this.state();this.integrityHead(s);const actor=this.authenticate(tok,s);const privileged=s.accounts[actor].role==='operator';const row=s.messages.find(m=>m.id===deliveryId&&(m.mailbox===actor||privileged));demand(row,'NOT_FOUND','Message not found',404);for(const rec of this.db.prepare('SELECT height,json FROM blocks ORDER BY height').all()){const block=JSON.parse(this.decodeStoredJSON('blocks',rec.height,rec.json));const index=block.events.findIndex(e=>e.type==='MESSAGE_COMMITTED'&&e.message_id===row.message_id&&Array.isArray(e.deliveries)&&e.deliveries.some(d=>d.id===row.id));if(index<0)continue;const path=inclusionProof(block.events,index);demand(path.root===block.header.events_root&&verifySignature(BLOCK_DOMAIN,block.header,block.signature,this.key.publicKey),'PROOF','Signed inclusion path does not match this block',503);return {format:'VEXA127-INCLUSION/2',chain_id:s.chain_id,delivery_id:row.id,message_id:row.message_id,height:block.header.height,block_hash:block.hash,header:block.header,signature:block.signature,authority:this.key.publicKey,event:block.events[index],event_index:index,steps:path.steps,verified:true}}throw new MailError('NO_PROOF','No signed delivery event contains this message',404)}
 verify(checkpoint=null){const errors=[];let prev=null,count=0,local127Journal=null,assignmentJournal=null;try{const s=this.state();this.invariants(s);demand(s.authority===this.key.publicKey,'AUTHORITY','Authority mismatch');const rows=this.db.prepare('SELECT height,hash,json FROM blocks ORDER BY height').all();for(const row of rows){const b=JSON.parse(this.decodeStoredJSON('blocks',row.height,row.json)),h=b.header;demand(row.height===count&&h.height===count&&row.hash===b.hash,'BLOCK_ORDER','Block numbering or index mismatch');demand(h.chain_id===s.chain_id&&h.previous===(prev?prev.hash:ZERO),'CHAIN','Broken previous-block link');demand(h.authority===hash(this.key.publicKey)&&verifySignature(BLOCK_DOMAIN,h,b.signature,this.key.publicKey),'SIGNATURE','Block signature invalid');bindEvents(b);demand(b.hash===hash(BLOCK_DOMAIN+'\n'+canonical(h)+'\n'+b.signature),'HASH','Block digest mismatch');demand(Number.isSafeInteger(h.timestamp)&&(!prev||h.timestamp>=prev.header.timestamp),'TIME','Block clock ordering invalid');local127Journal=replayLocal127(local127Journal,b.events,h.height);assignmentJournal=replayLocal127Assignments(assignmentJournal,b.events,h.height);prev=b;count++}validateLocal127Journal(s,local127Journal);validateLocal127AssignmentJournal(s,assignmentJournal);demand(prev&&prev.header.state_root===hash(canonical(s)),'STATE','State root mismatch');
   if(checkpoint){demand(checkpoint.format==='VEXA127-CHECKPOINT/1'&&checkpoint.chain_id===s.chain_id&&checkpoint.authority===this.key.publicKey,'CHECKPOINT','Checkpoint authority/chain mismatch');const b=this.db.prepare('SELECT hash FROM blocks WHERE height=?').get(checkpoint.height);demand(b&&b.hash===checkpoint.hash,'ROLLBACK','Pinned checkpoint not present in this chain')}
   const referenced=new Set();if(s.glyphoku)referenced.add(checkGlyphoku(this,s));for(const row of s.messages){this.getObject(s,row);referenced.add(row.blob_id);const st=s.stamps[row.stamp_id];demand(st&&st.status==='CONSUMED','STAMP_REFERENCE','Delivery without consumed stamp')}
   for(const st of Object.values(s.stamps)){demand(verifySignature(STAMP_DOMAIN,st.envelope,st.signature,this.key.publicKey),'STAMP_SIGNATURE','Stored stamp invalid');demand(st.envelope.chain_id===s.chain_id,'STAMP_CHAIN','Stamp chain mismatch')}
   const objects=this.db.prepare('SELECT id,nonce,json FROM objects').all();demand(objects.length===referenced.size&&objects.every(row=>referenced.has(row.id)),'ORPHAN_OBJECT','Unreferenced or missing encrypted object');for(const row of objects){const logical=this.decodeStoredJSON('objects',row.id,row.json);demand(hash(logical)===row.id,'OBJECT_INTEGRITY','Encrypted object digest changed');const encrypted=JSON.parse(logical);demand(row.nonce===encrypted.nonce,'OBJECT_NONCE','Encrypted object nonce index changed');}
  }catch(e){errors.push(e.message)}return {ok:errors.length===0,blocks_checked:count,errors,scope:'Local authority signatures, links, exact v2 event lists, v1 Merkle roots with trailing-duplicate refusal, current state root, supply, object hashes/authentication, and optional external checkpoint; not distributed consensus or legal proof.'}}
 backup(tok){
  this.operator(tok,this.state());const report=this.verify();demand(report.ok,'INTEGRITY','Refuse corrupt backup');
  if(this.vault){const metadataPath=path.join(this.root,'vault.meta.json');demand(fs.existsSync(metadataPath)&&!fs.lstatSync(metadataPath).isSymbolicLink()&&fs.statSync(metadataPath).isFile(),'VAULT_METADATA','Protected backup requires its original vault metadata',503);let metadata;try{metadata=validateVaultMetadata(JSON.parse(boundedText(metadataPath,16*1024)))}catch{throw new MailError('VAULT_METADATA','Protected backup metadata is invalid',503)}demand(canonical(metadata)===canonical(this.vault.metadata),'VAULT_METADATA','Vault metadata changed outside the active state',503);for(const f of ['node.secret.json','credentials.secret.json']){demand(fs.existsSync(path.join(this.root,f)),'INCOMPLETE_STATE','Protected backup requires both encrypted secret files',503);readSecret(this.root,f,this.vault)}demand(canonical(readSecret(this.root,'node.secret.json',this.vault))===canonical(this.key),'KEY','Authority file changed outside the active vault',503)}
  const dest=path.join(this.root,'backups',id());fs.mkdirSync(dest,{recursive:true,mode:0o700});const target=path.join(dest,'mail.sqlite');this.db.prepare('VACUUM INTO ?').run(target);
  for(const f of ['node.secret.json','credentials.secret.json'])if(fs.existsSync(path.join(this.root,f)))fs.copyFileSync(path.join(this.root,f),path.join(dest,f));
  if(this.vault)secretFile(path.join(dest,'vault.meta.json'),this.vault.metadata);
  const files={};for(const f of fs.readdirSync(dest)){fs.chmodSync(path.join(dest,f),0o600);files[f]=hashFile(path.join(dest,f))}
  for(const row of this.state().torusAttachments?.files??[]){const relative='attachments/'+row.storage_id+'.chunks',source=path.join(this.root,relative);if(!fs.existsSync(source)){demand(row.status!=='COMMITTED','ATTACHMENT_MISSING','Committed attachment is missing',503);continue;}demand(!fs.lstatSync(path.dirname(source)).isSymbolicLink()&&!fs.lstatSync(source).isSymbolicLink(),'SYMLINK','Attachment backup cannot contain links');fs.mkdirSync(path.join(dest,'attachments'),{recursive:true,mode:0o700});fs.copyFileSync(source,path.join(dest,relative));fs.chmodSync(path.join(dest,relative),0o600);files[relative]=hashFile(path.join(dest,relative));}
  const manifest={format:'VEXA127-BACKUP/1',checkpoint:this.checkpoint(),files};
  fs.writeFileSync(path.join(dest,'manifest.json'),this.vault?this.vault.seal(canonical(manifest),'backup:manifest','manifest.json'):JSON.stringify(manifest,null,2)+'\n',{mode:0o600,flag:'wx'});
  return {backup:dest,checkpoint:manifest.checkpoint,protected:!!this.vault,warning:this.vault?'Encrypted backup requires its separate external key. Restore only to a new directory.':'Backup contains node secrets; keep the directory private. Restore only to a new directory.'};
 }
 close(){try{this.db.close()}finally{this.vault?.destroy();this.innerNonces.clear()}}
}
export function restoreNew(source,destination,{vaultKey=null}={}){
 const src=path.resolve(source),dest=path.resolve(destination);demand(!fs.existsSync(dest),'RESTORE_EXISTS','Restore requires a new destination directory',409);
 for(const f of ['manifest.json','vault.meta.json'])if(fs.existsSync(path.join(src,f)))demand(!fs.lstatSync(path.join(src,f)).isSymbolicLink(),'SYMLINK','Backup metadata cannot be symlinks');
 const vault=loadVault(src,vaultKey);let m;
 try{const text=boundedText(path.join(src,'manifest.json'),1024*1024);demand(vault||!isProtectedText(text),'VAULT_REQUIRED','Encrypted backup requires metadata and an external key',503);m=JSON.parse(vault?vault.open(text,'backup:manifest','manifest.json'):text)}finally{vault?.destroy()}
 demand(m&&m.format==='VEXA127-BACKUP/1'&&m.files&&Object.getPrototypeOf(m.files)===Object.prototype,'BACKUP','Unsupported backup');
 const allowed=['mail.sqlite','node.secret.json','credentials.secret.json','vault.meta.json'];
 demand(Object.keys(m.files).length<=1004,'BACKUP','Too many backup files');
 for(const [f,d]of Object.entries(m.files)){const attachment=/^attachments\/[a-f0-9]{32}\.chunks$/.test(f);demand((allowed.includes(f)||attachment)&&typeof d==='string'&&/^[a-f0-9]{64}$/.test(d),'BACKUP','Unsafe backup entry');if(attachment)demand(!fs.lstatSync(path.join(src,'attachments')).isSymbolicLink(),'SYMLINK','Attachment backup directory cannot be a link');demand(!fs.lstatSync(path.join(src,f)).isSymbolicLink()&&fs.statSync(path.join(src,f)).isFile()&&hashFile(path.join(src,f))===d,'BACKUP_HASH','Backup file changed')}
 demand(m.files['mail.sqlite']&&m.files['node.secret.json']&&(!fs.existsSync(path.join(src,'vault.meta.json'))||(m.files['vault.meta.json']&&m.files['credentials.secret.json'])),'BACKUP','Incomplete backup');
 fs.mkdirSync(dest,{recursive:false,mode:0o700});
 try{for(const f of Object.keys(m.files)){if(f.startsWith('attachments/'))fs.mkdirSync(path.join(dest,'attachments'),{recursive:true,mode:0o700});fs.copyFileSync(path.join(src,f),path.join(dest,f));fs.chmodSync(path.join(dest,f),0o600)}const st=new Store(dest,{vaultKey});try{const r=st.verify(m.checkpoint);demand(r.ok,'RESTORE_INTEGRITY','Backup checkpoint verification failed');return r}finally{st.close()}}catch(e){throw new MailError('RESTORE_FAILED','Restore failed; candidate directory retained for inspection: '+e.message,503)}
}
