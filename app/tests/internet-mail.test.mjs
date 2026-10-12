import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import {Store} from '../src/store.mjs';
import {canonical,hash} from '../src/crypto.mjs';
import {createInternetMail,validateInternetMailState,publicMailAddress,publicMailDomain,internetMailHelo,INTERNET_MAIL_LIMITS} from '../src/internet-mail.mjs';

const work=path.resolve(import.meta.dirname,'../../work');
const settings={enabled:true,from:'sender@example.org',helo:'mail.example.org'};
const draft={to:'recipient@example.net',subject:'Private Internet subject',body:'Private Internet body π雪🚀',request_id:'internet-request-0001'};
const accepted={status:'ACCEPTED',mx:'mx.example.net',code:250,detail:'Recipient mail exchange accepted the message.'};
const errorCode=(fn,code)=>assert.throws(fn,error=>error.code===code);
const rejected=(promise,code)=>assert.rejects(promise,error=>error.code===code);
function gate(){let release;const promise=new Promise(resolve=>{release=resolve});return {promise,release};}
function fixture(t,{protectedMode=true,transport={deliver:async()=>accepted},fault=()=>{},clock=()=>Date.now()}={}){
 fs.mkdirSync(work,{recursive:true});const root=fs.mkdtempSync(path.join(work,'internet-mail-test-')),key=protectedMode?randomBytes(32):null;
 const store=new Store(root,{vaultKey:key,fault,clock}),credentials=store.credentials(),service=createInternetMail(store,transport);
 t.after(async()=>{await service.close();try{store.close();}catch{}key?.fill(0);fs.rmSync(root,{recursive:true,force:true});});
 return {root,key,store,service,a:credentials['postmaster@local.test'],u:credentials['user@local.test'],transport};
}

test('INTERNET-01 Internet mail requires authentication and protected storage; public configuration requires operator authority',async t=>{
 const f=fixture(t),head=f.store.head().hash;assert.equal(f.service.status(f.a).configured,true);
 assert.equal(f.service.status(f.u).identity_address,'user@local.test');assert.equal(f.service.status(f.u).configured,false);assert.equal(f.service.status(f.u).from,'');assert.deepEqual(f.service.list(f.u).messages,[]);
 errorCode(()=>f.service.configure(f.u,settings),'INTERNET_SENDER');await rejected(f.service.send('missing-authority-token',draft),'AUTH');
 const plain=fixture(t,{protectedMode:false});assert.equal(plain.service.status(plain.a).supported,false);
 errorCode(()=>plain.service.configure(plain.a,settings),'INTERNET_PROTECTED_REQUIRED');await rejected(plain.service.send(plain.a,draft),'INTERNET_PROTECTED_REQUIRED');
 assert.equal(f.store.head().hash,head);assert.equal(plain.store.head().header.height,0);
});

test('INTERNET-02 public addresses and domains reject local namespaces and SMTP injection',()=>{
 assert.equal(publicMailAddress('Recipient@EXAMPLE.NET'),'Recipient@example.net');
 assert.equal(publicMailDomain('MX.EXAMPLE.NET'),'mx.example.net');
 assert.equal(internetMailHelo('[127.0.0.1]'),'[127.0.0.1]');assert.equal(internetMailHelo('[IPv6:::1]'),'[IPv6:::1]');
 for(const value of ['user@local.test','user@localhost','user@board.glyphoku.localhost','user@127.0.0.1','user@[::1]','user@example.invalid','user@example.local','user@example.onion','user@example.com:25','Name <user@example.net>','a..b@example.net','a.@example.net','user@example.net\r\nBcc: other@example.net','snow雪@example.net'])assert.throws(()=>publicMailAddress(value),value);
 for(const value of ['127.0.0.1','localhost','mx.localhost','smtp.invalid','smtp.local','smtp.internal','192.0.2.1','bad..example.net','-bad.example.net','mx.example.net.','mx.example.net:25'])assert.throws(()=>publicMailDomain(value),value);
});

test('INTERNET-03 disabled and incomplete configuration cannot initiate SMTP',async t=>{
 let calls=0;const f=fixture(t,{transport:{deliver:async()=>{calls++;return accepted;}}});
 f.service.configure(f.a,{enabled:false,from:'',helo:''});
 await rejected(f.service.send(f.a,draft),'INTERNET_NOT_CONFIGURED');
 f.service.configure(f.a,{...settings,enabled:false});assert.equal(f.service.status(f.a).enabled,false);
 await rejected(f.service.send(f.a,draft),'INTERNET_DISABLED');assert.equal(calls,0);
 errorCode(()=>f.service.configure(f.a,{...settings,enabled:'true'}),'INTERNET_CONFIG');
 errorCode(()=>f.service.configure(f.a,{...settings,from:'unknown@127.0.0.77'}),'INTERNET_SENDER');
});

test('INTERNET-04 queue and SENDING are durable before SMTP; bodies stay encrypted and off ledger',async t=>{
 let captured,calls=0;const f=fixture(t,{transport:{deliver:async envelope=>{
  calls++;captured=envelope;const row=f.store.state().internetMail.envelopes[0];assert.equal(row.status,'SENDING');assert.equal(row.attempts,1);
  assert.equal(f.store.verify().ok,true);return accepted;
 }}});
 f.service.configure(f.a,settings);const result=await f.service.send(f.a,draft);
 assert.equal(result.message.status,'ACCEPTED');assert.equal(result.replayed,false);assert.equal(calls,1);
 assert.equal(captured.from,settings.from);assert.equal(captured.to,draft.to);assert.equal(captured.body,draft.body);
 assert.match(captured.message_id,/^<[a-f0-9]{32}@example\.org>$/);assert.equal(captured.message_id,result.message.message_id);
 const stored=f.store.db.prepare('SELECT json FROM state').get().json;assert(!stored.includes(draft.body));assert(!stored.includes(draft.subject));assert(!stored.includes(draft.to));
 const ledger=f.store.db.prepare('SELECT height,json FROM blocks ORDER BY height').all().map(row=>JSON.parse(f.store.decodeStoredJSON('blocks',row.height,row.json)));
 const events=ledger.flatMap(block=>block.events);assert.deepEqual(events.filter(event=>event.type.startsWith('INTERNET_MAIL_')&&event.type!=='INTERNET_MAIL_CONFIGURED').map(event=>event.status),['QUEUED','SENDING','ACCEPTED']);
 for(const event of events){const text=JSON.stringify(event);assert(!text.includes(draft.body));assert(!text.includes(draft.subject));assert(!text.includes(draft.to));assert(!text.includes(settings.from));}
 assert.equal(f.store.list(f.a,'Sent').length,0);assert.equal(f.store.me(f.a).balance,100);assert.equal(f.store.verify().ok,true);
});

test('INTERNET-05 exact retries during and after SMTP produce one remote attempt',async t=>{
 const deferred=gate(),started=gate();let calls=0;const f=fixture(t,{transport:{deliver:async()=>{calls++;started.release();return deferred.promise;},close(){deferred.release(accepted);}}});
 f.service.configure(f.a,settings);const sending=f.service.send(f.a,draft);await started.promise;
 const repeated=await Promise.all(Array.from({length:8},()=>f.service.send(f.a,draft)));
 assert.equal(calls,1);assert(repeated.every(result=>result.replayed&&result.message.status==='SENDING'));
 assert.equal(new Set(repeated.map(result=>result.message.id)).size,1);
 deferred.release(accepted);const done=await sending,replay=await f.service.send(f.a,draft);
 assert.equal(replay.replayed,true);assert.equal(replay.message.id,done.message.id);assert.equal(replay.message.status,'ACCEPTED');assert.equal(calls,1);
 await rejected(f.service.send(f.a,{...draft,body:'Changed message'}),'REPLAY_CONFLICT');assert.equal(calls,1);
});

test('INTERNET-06 replay survives reopening; sender and HELO changes conflict with an old request',async t=>{
 let calls=0;const f=fixture(t,{transport:{deliver:async()=>{calls++;return accepted;}}});f.service.configure(f.a,settings);
 const sent=await f.service.send(f.a,draft);await f.service.close();f.store.close();
 const reopened=new Store(f.root,{vaultKey:f.key}),service=createInternetMail(reopened,{deliver:async()=>{calls++;return accepted;}});
 try{
  const retry=await service.send(f.a,draft);assert(retry.replayed);assert.equal(retry.message.id,sent.message.id);assert.equal(calls,1);
  service.configure(f.a,{...settings,enabled:false});assert.equal((await service.send(f.a,draft)).message.status,'ACCEPTED');
  service.configure(f.a,{...settings,helo:'outbound.example.org'});await rejected(service.send(f.a,draft),'REPLAY_CONFLICT');assert.equal(calls,1);
  assert(reopened.verify().ok);
 }finally{await service.close();reopened.close();}
});

test('INTERNET-07 interrupted QUEUED and SENDING states recover without automatic delivery',async t=>{
 for(const boundary of ['QUEUED','SENDING']){
  let armed=false,calls=0;const f=fixture(t,{fault:phase=>{if(armed&&phase==='after-commit'&&f.store.state().internetMail?.envelopes[0]?.status===boundary)throw new Error('Injected process interruption');},transport:{deliver:async()=>{calls++;return accepted;}}});
  f.service.configure(f.a,settings);armed=true;await assert.rejects(f.service.send(f.a,draft),/Injected process interruption/);armed=false;
  assert.equal(f.store.state().internetMail.envelopes[0].status,boundary);assert.equal(calls,0);
  await f.service.close();f.store.close();const reopened=new Store(f.root,{vaultKey:f.key}),service=createInternetMail(reopened,{deliver:async()=>{calls++;return accepted;}});
  try{
   const recovered=service.list(f.a).messages[0];assert.equal(recovered.status,boundary==='QUEUED'?'FAILED':'UNKNOWN');
   assert.equal((await service.send(f.a,draft)).message.status,recovered.status);assert.equal(calls,0);assert(reopened.verify().ok);
  }finally{await service.close();reopened.close();}
 }
});

test('INTERNET-08 a rejected SMTP command, ambiguous result, or transport error stays distinct',async t=>{
 const outcomes=[{status:'FAILED',mx:'mx.example.net',code:550,detail:'Recipient refused.'},{status:'UNKNOWN',mx:'mx.example.net',code:null,detail:'Final SMTP reply was lost.'},new Error('Network interruption'),{status:'ACCEPTED',mx:'mx.example.net',code:null,detail:'Unproven acceptance'}];
 for(let index=0;index<outcomes.length;index++){
  const outcome=outcomes[index],f=fixture(t,{transport:{deliver:async()=>{if(outcome instanceof Error)throw outcome;return outcome;}}});f.service.configure(f.a,settings);
  const result=await f.service.send(f.a,{...draft,request_id:'internet-result-'+index});assert.equal(result.message.status,index===0?'FAILED':'UNKNOWN');
  assert(f.store.verify().ok);assert.equal(f.service.status(f.a).counts[result.message.status],1);
 }
});

test('INTERNET-09 oversized, malformed and multiline envelope fields never reach SMTP',async t=>{
 let calls=0;const f=fixture(t,{transport:{deliver:async()=>{calls++;return accepted;}}});f.service.configure(f.a,settings);const head=f.store.head().hash;
 for(const [extra,code] of [[{subject:'Injected\r\nBcc: attacker@example.net'},'SUBJECT'],[{subject:'bad\tcontrol'},'SUBJECT'],[{subject:'\ud800'},'SUBJECT'],[{body:'x'.repeat(INTERNET_MAIL_LIMITS.body_bytes+1)},'BODY'],[{body:'bad\0body'},'BODY'],[{to:['recipient@example.net']},'INTERNET_ADDRESS'],[{to:'local@local.test'},'INTERNET_DOMAIN'],[{to:'a@box.home.arpa'},'INTERNET_DOMAIN'],[{request_id:'short'},'REQUEST_ID'],[{attachments:[]},'INTERNET_PAYLOAD']])await rejected(f.service.send(f.a,{...draft,...extra}),code);
 assert.equal(calls,0);assert.equal(f.store.head().hash,head);
});

test('INTERNET-10 bound outbox refuses new mail before a network attempt',async t=>{
 let calls=0;const f=fixture(t,{transport:{deliver:async()=>{calls++;return accepted;}}});f.service.configure(f.a,settings);await f.service.send(f.a,draft);
 f.store.mutate(f.a,(s,actor,now,events)=>{
  const first=s.internetMail.envelopes[0];
  s.internetMail.envelopes=Array.from({length:INTERNET_MAIL_LIMITS.messages},(_,index)=>{const messageId=(index+1).toString(16).padStart(32,'0');return {...first,id:messageId,message_id:'<'+messageId+'@example.org>',request_id:'capacity-request-'+index};});
  validateInternetMailState(s);events.push({type:'TEST_INTERNET_CAPACITY'});return {};
 },{admin:true});
 const head=f.store.head().hash;await rejected(f.service.send(f.a,{...draft,request_id:'one-over-capacity'}),'INTERNET_CAPACITY');assert.equal(calls,1);assert.equal(f.store.head().hash,head);
 const oversize=f.store.state();oversize.internetMail.envelopes.push({...oversize.internetMail.envelopes[0],id:'f'.repeat(32),message_id:'<'+('f'.repeat(32))+'@example.org>',request_id:'over-limit-entry'});errorCode(()=>validateInternetMailState(oversize),'INTERNET_STATE');
});

test('INTERNET-11 state validator detects payload binding, owner and acceptance tampering',async t=>{
 const f=fixture(t);f.service.configure(f.a,settings);await f.service.send(f.a,draft);
 for(const change of [message=>{message.body='Changed sealed state';},message=>{message.owner='user@local.test';},message=>{message.message_id='<other@example.org>';},message=>{message.code=550;},message=>{message.attempts=0;},message=>{message.status='DELIVERED';}]){
  const state=f.store.state();change(state.internetMail.envelopes[0]);errorCode(()=>validateInternetMailState(state),'INTERNET_STATE');
 }
 const state=f.store.state(),envelope=state.internetMail.envelopes[0];envelope.body='x'.repeat(INTERNET_MAIL_LIMITS.body_bytes);envelope.digest=hash('VEXA127-INTERNET-SEND/1\n'+canonical({from:envelope.from,helo:envelope.helo,to:envelope.to,subject:envelope.subject,body:envelope.body}));
 state.internetMail.envelopes=Array.from({length:17},(_,index)=>{const messageId=(index+1).toString(16).padStart(32,'0');return {...envelope,id:messageId,message_id:'<'+messageId+'@example.org>',request_id:'bytes-request-'+index};});
 errorCode(()=>validateInternetMailState(state),'INTERNET_STATE');
});

test('INTERNET-12 shutdown cancels the transport and persists uncertainty before storage closes',async t=>{
 const deferred=gate(),started=gate();let closeCalled=false;const f=fixture(t,{transport:{deliver:async()=>{started.release();return deferred.promise;},close(){closeCalled=true;deferred.release({status:'UNKNOWN',mx:'mx.example.net',code:null,detail:'Interrupted during SMTP.'});}}});f.service.configure(f.a,settings);
 const sending=f.service.send(f.a,draft);await started.promise;await f.service.close();assert(closeCalled);assert.equal((await sending).message.status,'UNKNOWN');assert(f.store.verify().ok);
 await rejected(f.service.send(f.a,{...draft,request_id:'after-shutdown'}),'INTERNET_CLOSED');
});

test('INTERNET-13 token rotation in flight does not lose a confirmed SMTP result',async t=>{
 const deferred=gate(),started=gate();const f=fixture(t,{transport:{deliver:async()=>{started.release();return deferred.promise;},close(){deferred.release(accepted);}}});f.service.configure(f.a,settings);
 const sending=f.service.send(f.a,draft);await started.promise;const rotated=f.store.rotateToken(f.a).token;deferred.release(accepted);
 assert.equal((await sending).message.status,'ACCEPTED');assert.equal(f.service.list(rotated).messages[0].status,'ACCEPTED');errorCode(()=>f.service.list(f.a),'AUTH');assert(f.store.verify().ok);
});

test('INTERNET-14 the enabled default local sender can attempt public MX delivery',async t=>{
 let captured,calls=0;const f=fixture(t,{transport:{deliver:async envelope=>{calls++;captured=envelope;return accepted;}}});
 const status=f.service.login(f.a);assert.equal(status.enabled,true);assert.equal(status.from,'mail@127.0.0.2');assert.equal(status.helo,'[127.0.0.2]');assert.match(status.sender_warning,/may reject/);assert.equal(calls,0);
 const result=await f.service.send(f.a,draft);assert.equal(result.message.status,'ACCEPTED');assert.equal(captured.from,status.assigned_address);assert.equal(captured.helo,status.helo);assert.match(captured.message_id,/@127\.0\.0\.2>$/);assert.equal(calls,1);
 assert.equal(f.store.list(f.a,'Sent').length,0);assert(f.store.verify().ok);
});

test('INTERNET-15 confirmation binds the original sender and protects initial send from a changed config',async t=>{
 let calls=0;const f=fixture(t,{transport:{deliver:async()=>{calls++;return accepted;}}});
 const original=f.service.status(f.a),confirmed={...draft,confirmed_from:original.from,confirmed_helo:original.helo};
 f.service.configure(f.a,settings);const head=f.store.head().hash;
 await rejected(f.service.send(f.a,confirmed),'INTERNET_CONFIG_CHANGED');assert.equal(calls,0);assert.equal(f.store.head().hash,head);
 const publicConfirmed={...draft,confirmed_from:settings.from,confirmed_helo:settings.helo};const sent=await f.service.send(f.a,publicConfirmed);
 f.service.configure(f.a,{...settings,from:'different@example.org'});
 const replay=await f.service.send(f.a,publicConfirmed);assert(replay.replayed);assert.equal(replay.message.id,sent.message.id);assert.equal(calls,1);
 await rejected(f.service.send(f.a,{...publicConfirmed,confirmed_from:'different@example.org'}),'REPLAY_CONFLICT');
});
