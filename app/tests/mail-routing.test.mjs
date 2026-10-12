import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import {Store} from '../src/store.mjs';
import {createInternetMail} from '../src/internet-mail.mjs';
import {createMailRouter} from '../src/mail-routing.mjs';
import {fromAddress,toEml} from '../src/mime.mjs';
import {GlyphokuService} from '../src/glyphoku-service.mjs';
import {run} from './glyphoku-helper.mjs';

function fixture(t){
 const work=path.resolve(import.meta.dirname,'../../work');fs.mkdirSync(work,{recursive:true});const root=fs.mkdtempSync(path.join(work,'unified-mail-')),key=randomBytes(32),calls=[];
 const store=new Store(root,{vaultKey:key}),credentials=store.credentials(),internet=createInternetMail(store,{async deliver(message){calls.push(message);return {status:'ACCEPTED',mx:'mx.example.org',code:250,detail:'Synthetic acceptance only.'}},close(){}}),router=createMailRouter(store,internet);
 const a=credentials['postmaster@local.test'],u=credentials['user@local.test'],operator=store.login(a),user=store.login(u);
 t.after(async()=>{await internet.close();store.close();key.fill(0);fs.rmSync(root,{recursive:true,force:true})});return {root,store,internet,router,a,u,operator,user,calls};
}
const draft=(to,request_id='unified-message-01')=>({to:[to],subject:'Synthetic unified mail',body:'No real email is sent.',attachments:[],request_id});

test('MAIL-ROUTE-01 one submission path selects local or public delivery from the recipient',async t=>{
 const f=fixture(t),local=draft(f.user.assigned_address),q=f.router.quote(f.a,local);assert.equal(q.route,'local');assert.equal(q.from,f.operator.assigned_address);
 const result=await f.router.send(f.a,{...local,expected_route:q.route,max_cost:q.cost});assert.equal(result.route,'local');assert.equal(f.calls.length,0);
 const inbox=f.store.list(f.u);assert.equal(inbox.length,1);assert.equal(inbox[0].from,f.operator.assigned_address);assert.equal(f.store.message(f.u,inbox[0].id).body,local.body);
 const external=draft('davidpaulrussell@linearfinance.org','unified-public-01'),preview=f.router.quote(f.u,external);assert.equal(preview.route,'internet');assert.equal(preview.from,f.user.assigned_address);
 const send=await f.router.send(f.u,{...external,expected_route:preview.route,confirmed_from:preview.from,confirmed_helo:preview.helo});assert.equal(send.message.status,'ACCEPTED');assert.equal(f.calls.length,1);assert.equal(f.calls[0].from,f.user.assigned_address);assert.equal(f.calls[0].to,external.to[0]);
 assert(f.store.verify().ok);
});
test('MAIL-ROUTE-02 Internet retry is immutable and never submits a second SMTP message',async t=>{
 const f=fixture(t),message=draft('recipient@example.org'),q=f.router.quote(f.u,message),payload={...message,expected_route:q.route,confirmed_from:q.from,confirmed_helo:q.helo};
 const first=await f.router.send(f.u,payload),again=await f.router.send(f.u,payload);assert.equal(again.replayed,true);assert.equal(again.message.id,first.message.id);assert.equal(f.calls.length,1);
 await assert.rejects(f.router.send(f.u,{...payload,body:'Changed draft'}),error=>error.code==='REPLAY_CONFLICT');assert.equal(f.calls.length,1);
});
test('MAIL-ROUTE-03 mixed, malformed and unsupported attachment recipients fail before delivery',async t=>{
 const f=fixture(t);
 for(const [input,code] of [[{...draft('davidpaulrussell@linearfinance,org')},'RECIPIENT_ADDRESS'],[{...draft('recipient@example.org'),to:[f.user.assigned_address,'recipient@example.org']},'MIXED_RECIPIENTS'],[{...draft('recipient@example.org'),to:['recipient@example.org','second@example.net']},'INTERNET_RECIPIENTS'],[{...draft('recipient@example.org'),attachments:[{name:'file.txt',data:'WA=='}]},'INTERNET_ATTACHMENTS']])assert.throws(()=>f.router.quote(f.u,input),error=>error.code===code);
 await assert.rejects(f.router.send(f.u,{...draft('recipient@example.org'),expected_route:'local'}),error=>error.code==='MAIL_ROUTE_CHANGED');assert.equal(f.calls.length,0);assert.equal(f.store.list(f.u).length,0);
});
test('MAIL-ROUTE-04 assigned local sender cannot bypass a block on its original account',t=>{
 const f=fixture(t);f.store.preferences(f.u,{accept:true,blocked:['postmaster@local.test'],daily:20});
 assert.throws(()=>f.router.quote(f.a,draft(f.user.assigned_address)),error=>error.code==='CONSENT');assert(f.store.verify().ok);
});
test('MAIL-ROUTE-05 assigned From headers stay authenticated in raw local MIME and reject impersonation',t=>{
 const f=fixture(t),message={message_id:'a'.repeat(32),from:f.operator.assigned_address,to:[f.user.assigned_address],subject:'Raw assigned sender',body:'Synthetic raw body',attachments:[],raw:null},raw=toEml(message);
 assert.equal(fromAddress(message.from),message.from);assert.equal(fromAddress('Mailbox <'+message.from+'>'),message.from);
 f.store.send(f.a,{to:message.to,sender_address:message.from,subject:message.subject,body:message.body,raw,request_id:'raw-assigned-01',max_cost:1});
 const delivered=f.store.list(f.u)[0];assert.equal(delivered.from,f.operator.assigned_address);assert.equal(f.store.message(f.u,delivered.id).raw,raw);assert(f.store.verify().ok);
 assert.throws(()=>f.store.send(f.u,{...draft(f.operator.assigned_address),sender_address:f.operator.assigned_address,max_cost:1}),error=>error.code==='SENDER');
});
test('MAIL-ROUTE-06 an assigned game owner can send free mailbox mail without consuming a puzzle permit',async t=>{
 const f=fixture(t),game=new GlyphokuService(f.store,{seedFactory:g=>g===1?54:107});
 try{
  await run(game,f.a,'domain',{label:'shared-mail'},'shared-game-domain-01');
  const account=game.credential(f.a);f.store.login(account.token);
  const local=draft(f.user.assigned_address,'shared-game-mail-01');
  assert.throws(()=>f.store.send(account.token,{...local,max_cost:1}),error=>error.code==='GAME_GATE_REQUIRED');
  f.store.preferences(account.token,{daily:0});
  const before=f.store.me(account.token).balance,q=f.router.quote(account.token,local),sent=await f.router.send(account.token,{...local,expected_route:'local',max_cost:q.cost});
  assert.equal(sent.status,'COMMITTED');assert.equal(sent.cost,0);assert.equal(f.store.me(account.token).balance,before);
  assert.equal(f.store.state().stamps[sent.stamp_id].envelope.mechanism,'MAILBOX_ADMISSION_V1');
  assert.equal(game.view(f.a).instance.permits.length,0);assert.equal(f.store.list(f.u)[0].from,account.address);
  assert.equal(f.store.list(account.token,'Sent').length,1);assert(f.store.verify().ok);
  assert.equal((await f.router.send(account.token,{...local,expected_route:'local',max_cost:q.cost})).replayed,true);
 }finally{game.close();}
});
