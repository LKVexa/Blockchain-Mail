import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import {serve} from '../src/main.mjs';
import {deriveTransport,encodeFrame,decodeFrame,unbase64} from '../web/protected-wire.mjs';

test('INTERNET-HTTP protected first login assigns a ledger address and user sends exactly once from that identity',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'vexa-internet-http-')),key=randomBytes(32),deliveries=[];
 const transport={async deliver(message){deliveries.push(message);return {status:'ACCEPTED',mx:'mx.recipient.org',code:250,detail:'Recipient server accepted the message.'}},async close(){}};
 const running=await serve({root,vaultKey:key,httpPort:0,internetTransport:transport});
 t.after(async()=>{await running.stop();key.fill(0);fs.rmSync(root,{recursive:true,force:true})});
 const base='http://127.0.0.1:'+running.http.port,wire=await deriveTransport(key,running.run_id),credentials=running.store.credentials();
 async function api(route,body,token=credentials['postmaster@local.test']){
  const frame=await encodeFrame(wire,'request',{method:body===undefined?'GET':'POST',path:route,headers:{authorization:'Bearer '+token,...(body===undefined?{}:{'content-type':'application/json','x-bve-request':'1'})},body:body===undefined?null:JSON.stringify(body)});
  const response=await fetch(base+'/api/protected',{method:'POST',headers:{'Content-Type':'application/json','X-BVE-Request':'1'},body:JSON.stringify(frame)});
  assert.equal(response.status,200);
  const decoded=await decodeFrame(wire,'response',await response.json(),frame);
  return {status:decoded.status,data:JSON.parse(Buffer.concat(decoded.chunks.map(c=>Buffer.from(unbase64(c)))).toString('utf8'))};
 }
 let canonicalHtml;for(const route of ['/','/mail/','/internet/','/desk/index.html']){const page=await fetch(base+route);assert.equal(page.status,200);const html=await page.text();assert.match(html,/protected-bootstrap\.js/);assert.match(html,/src="\/app\.js"/);assert(!html.includes('/internet.mjs'));if(canonicalHtml===undefined)canonicalHtml=html;else assert.equal(html,canonicalHtml);}
 assert.equal((await fetch(base+'/api/internet/status')).status,403);
 const user=credentials['user@local.test'];
 assert.equal((await api('/api/internet/status',undefined,user)).status,200);
 const localLogin=await api('/api/login',{},user);assert.equal(localLogin.status,200);assert.equal(localLogin.data.assigned_address,'mail@127.0.0.2');
 const login=await api('/api/internet/login',{},user);assert.equal(login.status,200);assert.equal(login.data.from,'mail@127.0.0.2');assert.equal(login.data.assigned_address,login.data.from);assert.equal(login.data.helo,'[127.0.0.2]');
 const reservedHead=running.store.head().hash;
 const repeatedLogin=await api('/api/internet/login',{},user);assert.equal(repeatedLogin.data.from,login.data.from);assert.equal(running.store.head().hash,reservedHead);
 assert.equal((await api('/api/internet/config',{enabled:true,from:'sender@sender.org',helo:'mail.sender.org'})).status,200);
 const draft={to:'recipient@recipient.org',subject:'Synthetic protected HTTP mail',body:'Synthetic test only: no Internet email.',request_id:'internet-http-synthetic-01'};
 const first=await api('/api/internet/send',draft);assert.equal(first.status,200);assert.equal(first.data.message.status,'ACCEPTED');assert.equal(deliveries.length,1);
 const replay=await api('/api/internet/send',draft);assert.equal(replay.status,200);assert.equal(replay.data.message.status,'ACCEPTED');assert.equal(deliveries.length,1);
 assert.equal((await api('/api/internet/send',{...draft,body:'Different body'})).status,409);
 const userDraft={...draft,request_id:'internet-http-user-127',confirmed_from:login.data.from,confirmed_helo:login.data.helo};
 const userResult=await api('/api/internet/send',userDraft,user);assert.equal(userResult.status,200);assert.equal(userResult.data.message.status,'ACCEPTED');assert.equal(userResult.data.message.from,'mail@127.0.0.2');assert.equal(deliveries.at(-1).from,'mail@127.0.0.2');assert.equal(deliveries.at(-1).helo,'[127.0.0.2]');assert.equal(deliveries.length,2);
 assert.equal((await api('/api/internet/send',userDraft,user)).data.replayed,true);assert.equal(deliveries.length,2);
 assert.equal((await api('/api/internet/config',{enabled:true,from:'sender@sender.org',helo:'mail.sender.org'},user)).status,403);
 const userHistory=await api('/api/internet/outbox',undefined,user),operatorHistory=await api('/api/internet/outbox');assert.equal(userHistory.data.messages.length,1);assert.equal(userHistory.data.messages[0].from,'mail@127.0.0.2');assert.equal(operatorHistory.data.messages.length,1);assert.equal(operatorHistory.data.messages[0].from,'sender@sender.org');
 const operatorAddress=(await api('/api/internet/status')).data.assigned_address;
 running.store.send(credentials['postmaster@local.test'],{to:[login.data.assigned_address],subject:'Only the user Inbox',body:'Private synthetic user Inbox body',request_id:'inbox-owner-user-01',max_cost:1});
 running.store.send(user,{to:[operatorAddress],subject:'Only the operator Inbox',body:'Private synthetic operator Inbox body',request_id:'inbox-owner-operator-01',max_cost:1});
 const userInbox=await api('/api/messages',undefined,user),operatorInbox=await api('/api/messages');assert.deepEqual(userInbox.data.map(message=>message.subject),['Only the user Inbox']);assert.deepEqual(operatorInbox.data.map(message=>message.subject),['Only the operator Inbox']);
 assert.equal((await api('/api/messages/'+userInbox.data[0].id)).status,404);assert.equal((await api('/api/messages/'+operatorInbox.data[0].id,undefined,user)).status,404);
 assert.equal((await api('/api/messages/'+userInbox.data[0].id,undefined,user)).data.body,'Private synthetic user Inbox body');
 assert.equal((await api('/api/internet/outbox')).status,200);
 const automaticDraft={to:['davidpaulrussell@linearfinance.org'],subject:'Unified screen automatic Internet route',body:'Synthetic acceptance only',attachments:[],request_id:'unified-http-public-01'};
 const automaticQuote=await api('/api/mail/quote',automaticDraft,user);assert.equal(automaticQuote.status,200);assert.equal(automaticQuote.data.route,'internet');
 const automaticSend=await api('/api/mail/send',{...automaticDraft,expected_route:'internet',confirmed_from:automaticQuote.data.from,confirmed_helo:automaticQuote.data.helo},user);assert.equal(automaticSend.status,200);assert.equal(automaticSend.data.message.status,'ACCEPTED');assert.equal(deliveries.at(-1).to,automaticDraft.to[0]);assert.equal(deliveries.at(-1).from,login.data.assigned_address);
 assert(running.store.verify().ok);
 const raw=fs.readFileSync(path.join(root,'mail.sqlite'));assert(!raw.includes(Buffer.from(draft.body)));assert(!raw.includes(Buffer.from(draft.subject)));
});
