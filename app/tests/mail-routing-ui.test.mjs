import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {randomUUID} from 'node:crypto';
import {SessionFence,SessionChangedError} from '../web/session.mjs';

const recipient='davidpaulrussell@linearfinance.org';
const assigned='rmail@127.0.0.2';
const actor={address:'user@local.test',assigned_address:assigned,role:'user',balance:0,used_bytes:0,daily:0,used_today:30,accept:true,blocked:[],stamps:[]};
const remoteQuote={route:'internet',from:assigned,helo:'[127.0.0.2]',to:[recipient]};
const event={preventDefault(){}};
const response=(body,status=200)=>({ok:status<400,status,json:async()=>body});
function harness(handler=async()=>response({}),confirmations=[]){
 const elements=new Map(),requests=[],reviews=[];
 function element(id){
  if(!elements.has(id))elements.set(id,{value:'',files:[],dataset:{},hidden:false,textContent:'',innerHTML:'',disabled:false,readOnly:false,
   classList:{toggle(){}},append(){},querySelectorAll(){return[]},close(){this.open=false},showModal(){this.open=true},focus(){},reset(){}});
  return elements.get(id);
 }
 element('#compose-form').reset=()=>{for(const id of ['#to','#subject','#body'])element(id).value='';element('#attachments').files=[]};
 const storage=new Map();
 const context=vm.createContext({document:{documentElement:{dataset:{}},querySelector:element,querySelectorAll:()=>[],createElement:()=>({click(){}})},
  window:{},initializeTheme(){},renderTorusSettings:async()=>{},createAttachmentUploads:()=>({clear(){}}),crypto:{randomUUID},SessionFence,SessionChangedError,AbortController,TextEncoder,Uint8Array,ArrayBuffer,Blob,URL,URLSearchParams,
  btoa:s=>Buffer.from(s,'binary').toString('base64'),setTimeout:()=>0,clearTimeout(){},localStorage:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value)},
  confirm:message=>{reviews.push(message);return confirmations.length?confirmations.shift():true},prompt:()=>null,
  fetch:async(path,init)=>{requests.push({path,body:init.body?JSON.parse(init.body):undefined,signal:init.signal});
   if(path==='/api/me')return response(actor);
   if(path==='/api/ledger')return response({head:{header:{height:3}},sponsor:{daily:0}});
   if(path.startsWith('/api/mailbox-page?'))return response({total:0,start:0,messages:[],next_before:null});
   if(path==='/api/pin')return response({checkpoint:{height:4}});
   return handler(path,init);
  }});
 const source=fs.readFileSync(new URL('../web/app.js',import.meta.url),'utf8').replace(/^import .*?from ['"]\.\/(?:session|theme|torus-settings|attachment-client)\.mjs['"];?\s*/gm,'');
 vm.runInContext(source,context,{filename:'workspace-mail.js'});
 const run=code=>vm.runInContext(code,context);
 run('access="synthetic-user-token";me='+JSON.stringify(actor)+';ledger={sponsor:{daily:0}};');
 element('#to').value=recipient;element('#subject').value='Synthetic message';element('#body').value='Synthetic body';
 return{element,run,requests,reviews};
}

test('MAIL-ROUTING-UI-01 one compose form sends public recipients through the unified route with its account sender',async()=>{
 const h=harness(async path=>path==='/api/mail/quote'?response(remoteQuote):response({route:'internet',message:{status:'ACCEPTED'}}));
 await h.element('#compose-form').onsubmit(event);
 assert.deepEqual(h.requests.map(request=>request.path),['/api/mail/quote','/api/mail/send']);
 const payload=h.requests[1].body;
 assert.deepEqual(payload.to,[recipient]);assert.equal(payload.expected_route,'internet');assert.equal(payload.confirmed_from,assigned);assert.equal(payload.confirmed_helo,'[127.0.0.2]');
 assert(!Object.hasOwn(payload,'max_cost'));assert.match(h.reviews[0],new RegExp(assigned.replaceAll('.','\\.')));assert.match(h.reviews[0],/linearfinance\.org/);
 assert.match(h.element('#send-result').textContent,/Recipient server accepted/);assert.match(h.element('#send-result').textContent,/does not prove inbox delivery/);
 assert.equal(h.element('#send').disabled,true);assert.equal(h.element('#compose-from').value,assigned);
});

test('MAIL-ROUTING-UI-02 the same compose form sends local mail with zero balance and no purchase or confirmation',async()=>{
 const localRecipient='rmail@127.0.0.1:10000000000000000000000000000002',h=harness(async path=>path==='/api/mail/quote'?response({route:'local',from:assigned,to:[localRecipient],cost:0}):response({route:'local',block_height:4}));
 h.element('#to').value=localRecipient;
 await h.element('#compose-form').onsubmit({...event,target:h.element('#compose-form')});
 const send=h.requests.find(request=>request.path==='/api/mail/send').body;
 assert.equal(send.expected_route,'local');assert(!Object.hasOwn(send,'max_cost'));assert.deepEqual(send.to,[localRecipient]);assert(!Object.hasOwn(send,'confirmed_from'));
 assert.equal(h.run('me.balance'),0);assert.equal(h.run('me.daily'),0);assert.equal(h.run('me.used_today'),30);assert.equal(h.run('internetAttempt'),null);assert.equal(h.reviews.length,0);assert.match(h.element('#quote-result').textContent,/Local delivery/);assert(!/credits|payer|postage/i.test(h.element('#quote-result').textContent));assert.match(h.element('#toast').textContent,/Message sent/);assert.equal(h.element('#to').value,'');
});

test('MAIL-ROUTING-UI-03 lost Internet responses preserve immutable draft and replay the same request without another quote',async()=>{
 let sends=0;
 const h=harness(async path=>{
  if(path==='/api/mail/quote')return response(remoteQuote);
  if(sends++===0)throw Error('Synthetic lost acknowledgment');
  return response({route:'internet',message:{status:'ACCEPTED'},replayed:true});
 });
 await h.element('#compose-form').onsubmit(event);
 assert.match(h.element('#send-result').textContent,/Delivery uncertain/);assert.equal(h.element('#subject').readOnly,true);assert.equal(h.element('#attachments').disabled,true);
 h.element('#subject').value='Accidental edit';h.element('#compose-form').oninput();
 assert.equal(h.element('#subject').value,'Synthetic message');
 await h.element('#compose-form').onsubmit(event);
 const attempts=h.requests.filter(request=>request.path==='/api/mail/send');assert.equal(attempts.length,2);assert.deepEqual(attempts[0].body,attempts[1].body);
 assert.equal(h.requests.filter(request=>request.path==='/api/mail/quote').length,1);assert.equal(h.reviews.length,1);assert.match(h.element('#send-result').textContent,/existing send attempt/);
 await h.element('#compose-form').onsubmit(event);assert.equal(h.requests.filter(request=>request.path==='/api/mail/send').length,2);
});

test('MAIL-ROUTING-UI-04 ambiguous attempts require an explicit new message before a new request ID',async()=>{
 const h=harness(async path=>path==='/api/mail/quote'?response(remoteQuote):response({route:'internet',message:{status:'UNKNOWN'}}),[true,false,true]);
 await h.element('#compose-form').onsubmit(event);const prior=h.run('internetAttempt.payload.request_id');
 h.element('#new-draft').onclick();assert.equal(h.run('internetAttempt.payload.request_id'),prior);assert.equal(h.element('#subject').readOnly,true);
 h.element('#new-draft').onclick();assert.equal(h.run('internetAttempt'),null);assert.equal(h.element('#subject').readOnly,false);assert.notEqual(h.run('requestKey'),prior);
 assert.match(h.reviews[1],/could produce a duplicate/);assert.equal(h.element('#subject').value,'');
});

test('MAIL-ROUTING-UI-05 delivery validation preserves drafts and avoids transport requests',async()=>{
 const h=harness(async()=>response({error:'INTERNET_ATTACHMENTS',message:'Internet email currently supports plain text without attachments.'},400));
 h.element('#attachments').files=[{name:'fixture.txt',size:1,arrayBuffer:async()=>Uint8Array.from([1]).buffer}];
 await h.element('#compose-form').onsubmit(event);
 assert.deepEqual(h.requests.map(request=>request.path),['/api/mail/quote']);assert.equal(h.element('#body').value,'Synthetic body');assert.equal(h.element('#attachments').files.length,1);
 assert.equal(h.run('internetAttempt'),null);assert.equal(h.element('#send').disabled,false);assert.match(h.element('#send-result').textContent,/without attachments/);
});

test('MAIL-ROUTING-UI-06 reviewing a send can be cancelled without changing its draft or request identity',async()=>{
 const h=harness(async()=>response(remoteQuote),[false]),prior=h.run('requestKey');
 await h.element('#compose-form').onsubmit(event);
 assert.equal(h.requests.length,1);assert.equal(h.run('requestKey'),prior);assert.equal(h.run('internetAttempt'),null);assert.equal(h.element('#body').value,'Synthetic body');assert.equal(h.element('#to').readOnly,false);
});

test('MAIL-ROUTING-UI-07 logout during a send aborts and rejects late private results',async()=>{
 let release,sendSignal;const pending=new Promise(resolve=>{release=resolve});
 const h=harness(async(path,init)=>{if(path==='/api/mail/quote')return response(remoteQuote);sendSignal=init.signal;return pending});
 const task=h.element('#compose-form').onsubmit(event);while(!sendSignal)await Promise.resolve();
 h.element('#logout').onclick();assert(sendSignal.aborted);release(response({route:'internet',message:{status:'ACCEPTED'}}));await task;
 assert.equal(h.run('internetAttempt'),null);assert.equal(h.element('#body').value,'');assert.equal(h.element('#send-result').textContent,'');assert.equal(h.element('#compose-from').value,'');assert.equal(h.run('access'),'');
});

test('MAIL-ROUTING-UI-08 simultaneous submit events cannot create duplicate transport requests',async()=>{
 let release;const pending=new Promise(resolve=>{release=resolve});
 const h=harness(async path=>path==='/api/mail/quote'?pending:response({route:'internet',message:{status:'ACCEPTED'}}));
 const first=h.element('#compose-form').onsubmit(event);await Promise.resolve();await h.element('#compose-form').onsubmit(event);
 release(response(remoteQuote));await first;
 assert.equal(h.requests.filter(request=>request.path==='/api/mail/quote').length,1);assert.equal(h.requests.filter(request=>request.path==='/api/mail/send').length,1);
});

test('MAIL-ROUTING-UI-09 assigned identity is prominent and Sent includes both local messages and account Internet results',async()=>{
 const h=harness(async path=>path==='/api/internet/outbox'?response({messages:[{subject:'<img onerror=bad()>',from:assigned,to:recipient,status:'UNKNOWN',detail:'<script>untrusted</script>'}]}):response({}));
 await h.run('page="Sent";refresh();');
 assert.equal(h.element('#identity').textContent,assigned+' · user');assert.equal(h.element('#compose-from').value,assigned);
 const html=h.element('#content').innerHTML;assert.match(html,/Local deliveries/);assert.match(html,/Internet delivery attempts/);assert.match(html,/Delivery uncertain/);
 assert.match(html,/&lt;img onerror=bad\(\)&gt;/);assert.match(html,/&lt;script&gt;untrusted&lt;\/script&gt;/);assert(!html.includes('<script>'));
 assert.equal(h.requests.filter(request=>request.path==='/api/internet/outbox').length,1);
});

test('MAIL-ROUTING-UI-10 workspace presents one mail interface with one recipient form and fixed assigned address',()=>{
 const html=fs.readFileSync(new URL('../web/index.html',import.meta.url),'utf8');
 assert.equal([...html.matchAll(/id="compose-form"/g)].length,1);assert.equal([...html.matchAll(/id="login-form"/g)].length,1);
 assert(!/href="\/(?:internet|mail)\//.test(html));assert(!/<(?:select|input)[^>]*(?:name|id)="(?:transport|route|sender-domain)"/.test(html));
 assert.match(html,/<input id="compose-from" readonly/);assert.match(html,/<button id="send" class="primary">Send<\/button>/);
 assert(!/data-page="history"/.test(html));
 assert(!/id="balance"|Available credits|postage/i.test(html));assert.match(html,/placeholder="mail@127\.0\.0\.1:[1-9][0-9]{31}"/);assert.match(html,/Local and Torus delivery are chosen automatically/);
});

test('MAIL-ROUTING-UI-11 paused account sending can be enabled in Settings without changing its saved sender',async()=>{
 for(const current of [{from:assigned,helo:'[127.0.0.2]'},{from:'operator@example.org',helo:'mail.example.org'}]){
  const status={enabled:false,assigned_address:assigned,...current},h=harness(async(path,init)=>path==='/api/internet/status'?response(status):response({...status,...JSON.parse(init.body)}));
  await h.run((current.from===assigned?'':'me.role="operator";')+'page="settings";render();');
  assert.equal(h.element('#internet-enabled').checked,false);assert.match(h.element('#internet-settings-status').textContent,/paused/);
  h.element('#internet-enabled').checked=true;await h.element('#internet-enabled').onchange();
  const request=h.requests.find(item=>item.path==='/api/internet/config');assert.deepEqual(request.body,{enabled:true,...current});
  assert.equal(h.element('#internet-enabled').checked,true);assert.match(h.element('#internet-settings-status').textContent,/enabled/);
  h.element('#internet-enabled').checked=false;await h.element('#internet-enabled').onchange();
  assert.deepEqual(h.requests.filter(item=>item.path==='/api/internet/config').at(-1).body,{enabled:false,...current});assert.equal(h.element('#internet-enabled').checked,false);
  assert(!h.requests.some(item=>item.path==='/api/mail/send'));assert(!/select|href="\/internet\//.test(h.element('#internet-settings-controls').innerHTML));
 }
});

test('MAIL-ROUTING-UI-12 failed preference changes restore the prior setting and cleared senders can recover their assigned address',async()=>{
 const paused={enabled:false,assigned_address:assigned,from:'',helo:''},h=harness(async path=>path==='/api/internet/status'?response(paused):response({error:'INTERNET_CONFIG',message:'Synthetic save failure'},409));
 await h.run('page="settings";render();');h.element('#internet-enabled').checked=true;await h.element('#internet-enabled').onchange();
 assert.deepEqual(h.requests.find(item=>item.path==='/api/internet/config').body,{enabled:true,from:assigned,helo:'[127.0.0.2]'});
 assert.equal(h.element('#internet-enabled').checked,false);assert.equal(h.element('#internet-enabled').disabled,false);assert.match(h.element('#internet-settings-status').textContent,/not saved/);
});

test('MAIL-ROUTING-UI-13 plaintext Settings reports unavailable Internet sending without an unusable toggle',async()=>{
 const h=harness(async()=>response({error:'INTERNET_PROTECTED_REQUIRED',message:'Protected workspace required'},503));
 await h.run('page="settings";render();');
 assert.equal(h.element('#internet-settings-controls').innerHTML,'');assert.match(h.element('#internet-settings-status').textContent,/protected workspace/);
 assert(!h.requests.some(item=>item.path==='/api/internet/config'));
});
