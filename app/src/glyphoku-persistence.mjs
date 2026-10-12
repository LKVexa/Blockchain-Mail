/** One encrypted Glyphoku registry in the SAME Vexa127 SQLite transaction and signed state. */
import {canonical,hash,seal,unseal,signature,verifySignature} from './crypto.mjs';
import {demand,MailError} from './policy.mjs';
import {canonical127Host} from './local127-address.mjs';
import {emptyRegistry,validateRegistry,PROFILE,canonicalDraft,projectRecipients} from '../desk/modules/lib/glyphoku/registry.js';
export const GAME_MECHANISM='GLYPHOKU_GAME_V1';
const AAD=(s,revision)=>`${s.chain_id}|GLYPHOKU-REGISTRY/2|${revision}`;
// Ciphertext IDs commit immutable authenticated bytes. Replay each new blob once;
// ordinary observer polls still validate its schema and all resource bindings.
const verifiedRegistry=new WeakMap();
export function readGlyphoku(store,s){
 if(!s.glyphoku)return {registry:emptyRegistry(s.chain_id),mailboxToken:null};
 const m=s.glyphoku;demand(m.profile===PROFILE&&m.instance_id===s.chain_id&&Number.isSafeInteger(m.revision)&&m.revision>=1&&m.revision<=3,'GLYPHOKU_STATE','Invalid Glyphoku metadata',503);
 demand(typeof m.blob_id==='string'&&/^[a-f0-9]{64}$/.test(m.blob_id)&&Array.isArray(m.nonces)&&m.nonces.length===m.revision&&m.nonces.every(n=>typeof n==='string'&&/^[A-Za-z0-9+/]{16}$/.test(n))&&new Set(m.nonces).size===m.nonces.length,'GLYPHOKU_STATE','Invalid registry pointer or nonce history',503);
 const row=store.db.prepare('SELECT nonce,json FROM objects WHERE id=?').get(m.blob_id);demand(row,'GLYPHOKU_OBJECT','Registry ciphertext missing or changed',503);const logical=store.decodeStoredJSON('objects',m.blob_id,row.json);demand(hash(logical)===m.blob_id,'GLYPHOKU_OBJECT','Registry ciphertext missing or changed',503);
 let data,encrypted;try{encrypted=JSON.parse(logical);data=unseal(encrypted,store.key.sealKey,AAD(s,m.revision));}catch{throw new MailError('GLYPHOKU_AUTHENTICATION','Registry ciphertext authentication failed',503);}
 demand(row.nonce===encrypted.nonce&&m.nonces.at(-1)===Buffer.from(encrypted.nonce,'hex').toString('base64'),'GLYPHOKU_STATE','Registry nonce index or history differs from its ciphertext',503);
 try{validateRegistry(data.registry,{verifyTraces:verifiedRegistry.get(store)!==m.blob_id});}catch(e){throw new MailError('STORE_CORRUPT','Glyphoku registry rejected: '+e.message,503);}
 demand(data.registry.instanceId===s.chain_id&&data.registry.revision===m.revision&&data.registry.instance.g===m.g&&typeof data.mailboxToken==='string'&&data.mailboxToken.length>=16,'GLYPHOKU_STATE','Registry pointer, revision or credentials disagree',503);
 verifiedRegistry.set(store,m.blob_id);return data;
}
export function writeGlyphoku(store,s,data){
 validateRegistry(data.registry);const revision=data.registry.revision,previous=s.glyphoku,nonce=store.nonceFactory(),nonceText=Buffer.from(nonce).toString('base64');
 demand(!previous?.nonces.includes(nonceText),'NONCE_REUSE','Previously used Glyphoku registry nonce refused',503);
 store.assertNonceUnused(nonce);
 const encrypted=seal(data,store.key.sealKey,AAD(s,revision),nonce),encoded=canonical(encrypted),blob_id=hash(encoded);
 demand(Buffer.byteLength(encoded)<=12*1024*1024,'STORE_CAPACITY','Encrypted registry exceeds explicit storage bound',507);
 store.db.prepare('INSERT INTO objects VALUES(?,?,?)').run(blob_id,encrypted.nonce,store.encodeStoredJSON('objects',blob_id,encoded));
 store.fault('after-glyphoku-object');
 if(previous)store.db.prepare('DELETE FROM objects WHERE id=?').run(previous.blob_id);
 s.glyphoku={profile:PROFILE,instance_id:s.chain_id,revision,g:data.registry.instance.g,blob_id,nonces:[...(previous?.nonces??[]),nonceText]};
}
export function domainResolution(domain, authorityHash){
 return {format:'VEXA127-RESOLUTION/1',label:domain.label,name:domain.address,mailbox:'owner@'+domain.address,bind:'127.0.0.1',v6:'::1',forwardable:false,globally_routable:false,wildcard_interface:false,dns:'refused',mx:'refused',ens:'refused',public_uniqueness:'not-claimed',ntp_driver:'127.127.1.0 is a local clock driver, not this perimeter',encryption:'server-held storage seal, not a recipient key',clock:'authority',authority:authorityHash};
}
export function legacyLoopbackRecord(chainId, port, domain){
 const oct=n=>Number.parseInt(chainId.slice(n,n+2),16),host='127.'+oct(0)+'.'+oct(2)+'.'+oct(4);
 return {format:'VEXA127-LOOPBACK/1',host,port,name:host+':'+port,mailbox:'owner@'+host+':'+port,bind:'127.0.0.1',reachable:false,glyphoku:domain.address,registry:'owner@'+domain.address};
}
export function legacyLoopbackRecordV2(chainId, port, domain){
 const oct=n=>Number.parseInt(chainId.slice(n,n+2),16),host='127.'+oct(0)+'.'+oct(2);
 return {format:'VEXA127-LOOPBACK/2',host,port,name:host+':'+port,mailbox:'owner@'+host+':'+port,bind:'127.0.0.1',reachable:false,glyphoku:domain.address,registry:'owner@'+domain.address};
}
export function loopbackRecord(chainId, port, domain){
 const host=canonical127Host(domain.address)?domain.address:legacyLoopbackRecord(chainId,port,domain).host;
 return {format:'VEXA127-LOOPBACK/3',host,port,name:host+':'+port,mailbox:'owner@'+host,bind:'127.0.0.1',reachable:false,glyphoku:domain.address,registry:'owner@'+domain.address};
}
export function checkGlyphoku(store,s){
 const gameAccounts=Object.entries(s.accounts).filter(([,a])=>a?.glyphoku!==undefined),gameStamps=Object.values(s.stamps).filter(st=>st?.envelope?.mechanism===GAME_MECHANISM);
 if(!s.glyphoku){demand(!gameAccounts.length&&!gameStamps.length,'GLYPHOKU_STATE','Game resources require their registry',503);return null;}const {registry,mailboxToken}=readGlyphoku(store,s),i=registry.instance;
 demand(gameAccounts.length===i.mailboxes.length,'GLYPHOKU_ACCOUNT','Unregistered game account present',503);
 if(i.domains.some(d=>canonical127Host(d.address)))demand(s.local127&&i.mailboxes.every(box=>s.local127.claims?.some(c=>c.kind==='mailbox'&&c.address===box.address)),'LOCAL127_REGISTRY','Literal local127 game mailboxes require their signed reservations',503);
 for(const box of i.mailboxes)demand(s.accounts[box.address]?.glyphoku===true&&s.accounts[box.address].role==='user'&&s.accounts[box.address].tokenHash===hash(mailboxToken),'GLYPHOKU_ACCOUNT','Game mailbox/account mismatch',503);
 const envelope=registry.completedOperations.find(x=>x.kind==='envelope');
 demand(gameStamps.length===(envelope?1:0),'GLYPHOKU_STAMP','Unregistered game stamp present',503);
 if(envelope){const stamp=s.stamps[envelope.result.stamp_id],p=i.permits[0],e=stamp?.envelope;demand(e&&e.version===1&&e.mechanism===GAME_MECHANISM&&e.chain_id===s.chain_id&&e.id===envelope.runId&&e.nonce===envelope.runId&&e.permit_id===p.id&&e.payer==='GAME'&&e.expires_at===null&&Number.isSafeInteger(e.issued_at)&&e.issued_at>=0&&e.from===p.sender&&e.digest===p.draftDigest&&canonical(e.to)===canonical(projectRecipients(p.draft))&&e.cost===0&&verifySignature('VEXA127-STAMP/1',e,stamp.signature,store.key.publicKey),'GLYPHOKU_STAMP','Permit/stamp binding mismatch',503);demand(stamp.status===(p.state==='READY'?'RESERVED':'CONSUMED'),'GLYPHOKU_STAMP','Permit and stamp status disagree',503);}
 const sent=registry.completedOperations.find(x=>x.kind==='send');
 if(sent){const p=i.permits[0],matching=s.messages.filter(m=>m.message_id===sent.result.message_id);demand(matching.length===projectRecipients(p.draft).length+1,'GLYPHOKU_DELIVERY','Mail rows and registry receipt disagree',503);for(const m of matching){const actual=store.getObject(s,m);demand(actual.from===p.draft.from&&canonical(actual.to)===canonical(p.draft.to)&&actual.subject===p.draft.subject&&actual.body===p.draft.body&&m.stamp_id===envelope.result.stamp_id,'GLYPHOKU_DELIVERY','Mail content or stamp differs from frozen permit',503);}const original=sent.result.deliveries;
  demand(Array.isArray(original)&&original.length===matching.length&&new Set(original.map(x=>x.id)).size===original.length,'GLYPHOKU_DELIVERY','Original delivery roles missing or duplicated',503);
  for(const row of original)demand(matching.some(m=>m.id===row.id&&m.mailbox===row.mailbox),'GLYPHOKU_DELIVERY','Delivery receipt no longer identifies the same mailbox row',503);
  // Folder is mutable; the immutable issuance receipt preserves Inbox versus Sent roles.
  for(const rcpt of projectRecipients(p.draft))demand(original.filter(m=>m.mailbox===rcpt&&m.folder==='INBOX').length===1,'GLYPHOKU_DELIVERY','Recipient projection missing or duplicated',503);
  demand(original.filter(m=>m.mailbox===p.sender&&m.folder==='Sent').length===1,'GLYPHOKU_DELIVERY','Original Sent projection missing or duplicated',503);}
 return s.glyphoku.blob_id;
}
export function makeGameStamp(store,s,permit,now,runId){
 const envelope={version:1,mechanism:GAME_MECHANISM,chain_id:s.chain_id,id:runId,from:permit.sender,to:projectRecipients(permit.draft),digest:permit.draftDigest,cost:0,payer:'GAME',issued_at:now,expires_at:null,nonce:runId,permit_id:permit.id};
 const signed={envelope,signature:signature('VEXA127-STAMP/1',envelope,store.key.privateKey)};s.stamps[envelope.id]={...signed,status:'RESERVED'};return signed;
}
