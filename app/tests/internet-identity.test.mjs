import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import {Store} from '../src/store.mjs';
import {canonical,hash} from '../src/crypto.mjs';
import {createInternetMail,validateInternetMailState} from '../src/internet-mail.mjs';
import {GlyphokuService} from '../src/glyphoku-service.mjs';
import {run} from './glyphoku-helper.mjs';

const work=path.resolve(import.meta.dirname,'../../work');
const draft={to:'recipient@example.net',subject:'Per-account sender',body:'Synthetic identity delivery',request_id:'identity-request-0001'};
const accepted={status:'ACCEPTED',mx:'mx.example.net',code:250,detail:'Synthetic SMTP acceptance.'};
const errorCode=(fn,code)=>assert.throws(fn,error=>error.code===code);
const rejected=(promise,code)=>assert.rejects(promise,error=>error.code===code);
function gate(){let release;const promise=new Promise(resolve=>{release=resolve;});return {promise,release};}
function fixture(t,transport={deliver:async()=>accepted}){
 fs.mkdirSync(work,{recursive:true});const root=fs.mkdtempSync(path.join(work,'internet-identity-test-')),key=randomBytes(32);
 const store=new Store(root,{vaultKey:key}),credentials=store.credentials(),service=createInternetMail(store,transport);
 t.after(async()=>{await service.close();try{store.close();}catch{}key.fill(0);fs.rmSync(root,{recursive:true,force:true});});
 return {root,key,store,service,a:credentials['postmaster@local.test'],u:credentials['user@local.test']};
}

test('INTERNET-IDENTITY-01 first login durably assigns a private sender and repeated login preserves it',t=>{
 const f=fixture(t),balance=f.store.me(f.u).balance,global=f.store.state().internetMail.config;
 const first=f.service.login(f.u),head=f.store.head().hash;
 assert.equal(first.identity_address,'user@local.test');assert.equal(first.role,'user');assert.equal(first.from,'mail@127.0.0.2');
 assert.equal(first.assigned_address,first.from);assert.equal(first.helo,'[127.0.0.2]');assert(first.enabled&&first.configured);assert.equal(first.assignment.replayed,false);
 assert.equal(first.assignment.owner,'user@local.test');assert.equal(first.assignment.address,first.from);
 assert.equal(f.store.state().aliases[first.from][0],first.identity_address);assert.equal(f.store.me(f.u).balance,balance);
 const second=f.service.login(f.u);assert.equal(second.from,first.from);assert.equal(second.assignment.replayed,true);assert.equal(f.store.head().hash,head);
 assert.deepEqual(f.store.state().internetMail.config,global);assert.deepEqual(f.store.state().internetMail.senders[first.identity_address],{enabled:true,from:first.from,helo:first.helo});
 assert(!JSON.stringify(first).includes(f.u));assert(f.store.verify().ok);
});

test('INTERNET-IDENTITY-02 ordinary users send from their assigned identity without an operator role',async t=>{
 let captured;const f=fixture(t,{deliver:async envelope=>{captured=envelope;return accepted;}});
 const result=await f.service.send(f.u,draft),status=f.service.status(f.u);
 assert.equal(result.message.status,'ACCEPTED');assert.equal(captured.from,status.assigned_address);assert.equal(captured.helo,'['+captured.from.split('@')[1]+']');
 assert.match(captured.message_id,/@127\.0\.0\.2>$/);assert.equal(f.store.state().internetMail.envelopes[0].owner,'user@local.test');
 assert.equal(f.service.list(f.a).messages.length,0);assert.equal(f.service.list(f.u).messages.length,1);assert(f.store.verify().ok);
});

test('INTERNET-IDENTITY-03 an existing numeric mailbox keeps its own address on login and delivery',async t=>{
 let captured;const f=fixture(t,{deliver:async envelope=>{captured=envelope;return accepted;}});
 const account=f.store.createAccount(f.a,{address:'private@127.0.0.77'}),claims=f.store.state().local127.claims.length;
 const configured=f.service.configure(account.token,{enabled:true,from:account.address,helo:'[127.0.0.77]'});
 assert.equal(configured.assigned_address,account.address);assert.equal(f.store.state().local127.claims.length,claims);
 assert.equal((await f.service.send(account.token,draft)).message.status,'ACCEPTED');assert.equal(captured.from,account.address);assert.equal(captured.helo,'[127.0.0.77]');assert(f.store.verify().ok);
});

test('INTERNET-IDENTITY-04 sender settings, request IDs and outbox history belong to individual accounts',async t=>{
 const captures=[],f=fixture(t,{deliver:async envelope=>{captures.push(envelope);return accepted;}}),other=f.store.createAccount(f.a,{address:'other@local.test'});
 const one=f.service.login(f.u),two=f.service.login(other.token),operator=f.service.login(f.a);
 assert.equal(new Set([one.assigned_address,two.assigned_address,operator.assigned_address]).size,3);
 const first=await f.service.send(f.u,draft),second=await f.service.send(other.token,{...draft,body:'Other account body'});
 assert.notEqual(first.message.id,second.message.id);assert.equal(captures[0].from,one.assigned_address);assert.equal(captures[1].from,two.assigned_address);
 assert.deepEqual(f.service.list(f.u).messages.map(message=>message.id),[first.message.id]);assert.deepEqual(f.service.list(other.token).messages.map(message=>message.id),[second.message.id]);
 assert.deepEqual(f.service.list(f.a).messages,[]);assert.equal(f.service.status(f.u).counts.ACCEPTED,1);assert.equal(f.service.status(f.a).counts.ACCEPTED,0);assert(f.store.verify().ok);
});

test('INTERNET-IDENTITY-05 a user cannot configure or confirm another account sender or a public sender',async t=>{
 let calls=0;const f=fixture(t,{deliver:async()=>{calls++;return accepted;}}),own=f.service.login(f.u),other=f.service.login(f.a),head=f.store.head().hash;
 for(const from of [other.assigned_address,'postmaster@local.test','sender@example.org']){
  errorCode(()=>f.service.configure(f.u,{enabled:true,from,helo:own.helo}),'INTERNET_SENDER');
  await rejected(f.service.send(f.u,{...draft,confirmed_from:from,confirmed_helo:own.helo}),'INTERNET_SENDER');
 }
 assert.equal(calls,0);assert.equal(f.store.head().hash,head);assert.equal(f.service.status(f.u).from,own.assigned_address);
 errorCode(()=>f.service.login('invalid-token-value'),'AUTH');assert.equal(f.store.head().hash,head);
});

test('INTERNET-IDENTITY-06 explicit personal settings and assignments survive login and restart',async t=>{
 const f=fixture(t),operator=f.service.configure(f.a,{enabled:true,from:'sender@example.org',helo:'mail.example.org'}),user=f.service.login(f.u);
 f.service.configure(f.u,{enabled:false,from:user.assigned_address,helo:user.helo});const head=f.store.head().hash;
 assert.equal(f.service.login(f.a).from,'sender@example.org');assert.equal(f.service.login(f.u).enabled,false);assert.equal(f.store.head().hash,head);
 await f.service.close();f.store.close();const reopened=new Store(f.root,{vaultKey:f.key}),service=createInternetMail(reopened,{deliver:async()=>accepted});
 try{
  assert.equal(service.login(f.a).assigned_address,operator.assigned_address);assert.equal(service.status(f.a).from,'sender@example.org');
  assert.equal(service.login(f.u).assigned_address,user.assigned_address);assert.equal(service.status(f.u).enabled,false);assert.equal(reopened.head().hash,head);assert(reopened.verify().ok);
 }finally{await service.close();reopened.close();}
});

test('INTERNET-IDENTITY-07 token rotations during a user delivery retain the original envelope owner',async t=>{
 const deferred=gate(),started=gate(),f=fixture(t,{deliver:async()=>{started.release();return deferred.promise;},close(){deferred.release(accepted);}});
 const sending=f.service.send(f.u,draft);await started.promise;
 const rotatedUser=f.store.rotateToken(f.u).token,rotatedOperator=f.store.rotateToken(f.a).token;deferred.release(accepted);
 assert.equal((await sending).message.status,'ACCEPTED');assert.equal(f.service.list(rotatedUser).messages[0].status,'ACCEPTED');assert.deepEqual(f.service.list(rotatedOperator).messages,[]);
 assert.equal(f.store.state().internetMail.envelopes[0].owner,'user@local.test');errorCode(()=>f.service.list(f.u),'AUTH');assert(f.store.verify().ok);
});

test('INTERNET-IDENTITY-08 a game mailbox uses its existing signed numeric identity for Internet mail',async t=>{
 let captured;const f=fixture(t,{deliver:async envelope=>{captured=envelope;return accepted;}}),game=new GlyphokuService(f.store,{seedFactory:g=>g===1?54:107});
 try{
  await run(game,f.a,'domain',{label:'internet-game'},'internet-game-domain-01');const account=game.credential(f.a),claims=f.store.state().local127.claims.length,balance=f.store.me(account.token).balance;
  const status=f.service.login(account.token);assert.equal(status.assigned_address,account.address);assert.equal(status.identity_address,account.address);assert.equal(status.role,'user');
  assert.equal(f.store.state().local127.claims.length,claims);assert.equal((await f.service.send(account.token,draft)).message.status,'ACCEPTED');assert.equal(captured.from,account.address);
  assert.equal(f.store.me(account.token).balance,balance);assert.equal(game.view(f.a).instance.permits.length,0);assert(f.store.verify().ok);
 }finally{game.close();}
});

test('INTERNET-IDENTITY-09 legacy global configuration and envelopes retain confirmed replay bindings',async t=>{
 let calls=0;const f=fixture(t,{deliver:async()=>{calls++;return accepted;}}),legacyConfig={enabled:true,from:'legacy@example.org',helo:'mail.example.org'},messageId='b'.repeat(32);
 const envelope={id:messageId,message_id:'<'+messageId+'@example.org>',owner:'postmaster@local.test',...draft,from:legacyConfig.from,helo:legacyConfig.helo,status:'ACCEPTED',created_at:1,updated_at:1,attempts:1,mx:accepted.mx,code:250,detail:'Legacy accepted envelope.'};
 envelope.digest=hash('VEXA127-INTERNET-SEND/1\n'+canonical({from:envelope.from,helo:envelope.helo,to:envelope.to,subject:envelope.subject,body:envelope.body}));
 f.store.mutate(f.a,(s,actor,now,events)=>{s.internetMail={version:1,config:legacyConfig,envelopes:[envelope]};events.push({type:'LEGACY_INTERNET_FIXTURE'});return {};},{admin:true});
 const status=f.service.login(f.a);assert.match(status.assigned_address,/^mail@127\./);assert.deepEqual(f.store.state().internetMail.config,legacyConfig);
 const replay=await f.service.send(f.a,{...draft,confirmed_from:legacyConfig.from,confirmed_helo:legacyConfig.helo});
 assert.equal(replay.replayed,true);assert.equal(replay.message.id,messageId);assert.equal(calls,0);assert.equal(f.service.list(f.u).messages.length,0);assert(f.store.verify().ok);
});

test('INTERNET-IDENTITY-10 personal sender state rejects missing accounts and cross-account sender bindings',t=>{
 const f=fixture(t),user=f.service.login(f.u),operator=f.service.login(f.a);
 const unknown=f.store.state();unknown.internetMail.senders['missing@local.test']={enabled:true,from:user.assigned_address,helo:user.helo};errorCode(()=>validateInternetMailState(unknown),'INTERNET_STATE');
 const cross=f.store.state();cross.internetMail.senders['user@local.test'].from=operator.assigned_address;assert.throws(()=>validateInternetMailState(cross));assert(f.store.verify().ok);
});

test('INTERNET-IDENTITY-11 a confirmed retry still returns its original envelope after sender settings are cleared',async t=>{
 let calls=0;const f=fixture(t,{deliver:async()=>{calls++;return accepted;}}),status=f.service.login(f.u),confirmed={...draft,confirmed_from:status.from,confirmed_helo:status.helo};
 const sent=await f.service.send(f.u,confirmed);f.service.configure(f.u,{enabled:false,from:'',helo:''});
 const replay=await f.service.send(f.u,confirmed);assert.equal(replay.message.id,sent.message.id);assert.equal(replay.replayed,true);assert.equal(calls,1);
 await rejected(f.service.send(f.u,{...confirmed,request_id:'new-after-disabled-config'}),'INTERNET_NOT_CONFIGURED');assert.equal(calls,1);assert(f.store.verify().ok);
});

test('INTERNET-IDENTITY-12 restart recovery handles every account outbox without automatic delivery',async t=>{
 let calls=0;const f=fixture(t,{deliver:async()=>{calls++;return accepted;}}),user=f.service.login(f.u),operator=f.service.login(f.a);
 await f.service.send(f.u,draft);await f.service.send(f.a,draft);
 f.store.mutate(f.a,(s,actor,now,events)=>{for(const message of s.internetMail.envelopes){message.status='SENDING';message.updated_at=now;}events.push({type:'RECOVERY_IDENTITY_FIXTURE'});return {};},{admin:true});
 await f.service.close();f.store.close();const reopened=new Store(f.root,{vaultKey:f.key}),service=createInternetMail(reopened,{deliver:async()=>{calls++;return accepted;}});
 try{
  assert.equal(service.list(f.u).messages[0].status,'UNKNOWN');assert.equal(service.list(f.a).messages[0].status,'UNKNOWN');
  for(const [token,status] of [[f.u,user],[f.a,operator]])assert.equal((await service.send(token,{...draft,confirmed_from:status.from,confirmed_helo:status.helo})).message.status,'UNKNOWN');
  assert.equal(calls,2);assert(reopened.verify().ok);
 }finally{await service.close();reopened.close();}
});

test('INTERNET-IDENTITY-13 status derives an already-assigned identity before Internet settings are initialized',t=>{
 const f=fixture(t),localLogin=f.store.login(f.u),head=f.store.head().hash;
 assert.equal(f.store.state().internetMail.senders,undefined);
 const status=f.service.status(f.u);assert.equal(status.from,localLogin.assigned_address);assert.equal(status.assigned_address,status.from);
 assert.equal(status.helo,'['+status.from.split('@')[1]+']');assert.equal(status.enabled,true);assert.equal(f.store.head().hash,head);
 assert.equal(f.service.login(f.u).from,status.from);assert(f.store.verify().ok);
});
