import test from 'node:test';
import assert from 'node:assert/strict';
import {createMailSocket,supportsMailSocket,MAIL_SOCKET_PROTOCOL,MAIL_SOCKET_LIMITS} from '../web/mail-socket.mjs';

const turn=()=>new Promise(resolve=>setImmediate(resolve));
const auth='Bearer synthetic-user-a';
const frame=(number=1)=>({v:1,runId:'a'.repeat(32),id:number.toString(16).padStart(32,'0'),issued:1760000000000,nonce:'A'.repeat(16),data:'A'.repeat(24)});
const admission={ticket:'synthetic-ticket-0123456789abcdef',path:'/api/mail/socket',protocol:MAIL_SOCKET_PROTOCOL,owner:'user@local.test',expires_at:1760000060000};
class FakeWebSocket {
  constructor(url,protocol){this.url=url;this.protocol=protocol;this.readyState=0;this.bufferedAmount=0;this.listeners=new Map();this.sent=[];this.closes=0;}
  addEventListener(event,handler){const list=this.listeners.get(event)??new Set();list.add(handler);this.listeners.set(event,list);}
  removeEventListener(event,handler){this.listeners.get(event)?.delete(handler);}
  emit(event,value={}){for(const handler of [...(this.listeners.get(event)??[])])handler(value);}
  open(){this.readyState=1;this.emit('open');}
  send(text){if(this.throwSend)throw Error('Untrusted private socket error');this.sent.push(text);}
  receive(value){this.emit('message',{data:typeof value==='string'?value:JSON.stringify(value)});}
  ready(){this.receive({ready:true,protocol:MAIL_SOCKET_PROTOCOL});}
  close(){this.closes++;this.readyState=3;this.emit('close');}
  disconnect(){this.readyState=3;this.emit('close');}
}
function fixture(t,options={}){
  const sockets=[],tickets=[];
  class Socket extends FakeWebSocket{constructor(...args){super(...args);sockets.push(this);}}
  const client=createMailSocket({origin:'http://127.0.0.1:39391',acquireTicket:async authorization=>{tickets.push(authorization);return options.acquireTicket?options.acquireTicket(authorization):admission;},WebSocketCtor:options.WebSocketCtor??Socket,...options.timeouts});
  t.after(()=>client.close());
  return {client,sockets,tickets,async socket(){await turn();assert(sockets.length);return sockets.at(-1);},async connect(){const socket=await this.socket();socket.open();socket.ready();await turn();return socket;}};
}
function capture(promise){return promise.then(value=>({value}),error=>({error}));}
function assertFailure(result,{safe=false,code}={}){assert(result.error);assert.equal(result.error.safeToFallback,safe);if(code)assert.equal(result.error.code,code);return result.error;}

test('MAIL-SOCKET-UI-01 only mailbox read routes and unified compose routes use the mail socket',()=>{
  const id='a'.repeat(32);
  for(const path of ['/api/me','/api/mailbox-page?folder=INBOX&limit=25','/api/messages?folder=Sent','/api/messages/'+id,'/api/messages/'+id+'/proof','/api/messages/'+id+'/eml','/api/messages/'+id+'/attachment/0','/api/internet/status','/api/internet/outbox'])assert(supportsMailSocket(path,'GET'),path);
  for(const path of ['/api/mail/quote','/api/mail/send'])assert(supportsMailSocket(path,'POST'),path);
  for(const [path,method]of [['/api/bootstrap','GET'],['/api/login','POST'],['/api/admin/mailboxes','POST'],['/api/internet/config','POST'],['/api/internet/send','POST'],['/api/mail/socket-ticket','POST'],['/api/ledger','GET'],['/api/mail/send','GET'],['/api/me','POST'],['/api/messages/'+id+'/attachment/00','GET'],['/api/messages/'+id+'/admin','GET'],['/api/me#secret','GET'],['http://127.0.0.1:39391/api/me','GET'],['/api/admin/../me','GET'],['/api/%6de','GET'],['/api/me\n','GET'],['/api/mail/send?other=1','POST']])assert.equal(supportsMailSocket(path,method),false,path);
  for(const origin of ['https://127.0.0.1:39391','http://localhost:39391','http://127.0.0.2:39391','http://example.org:39391','http://user:secret@127.0.0.1:39391','http://127.0.0.1:39391/?ticket=secret'])assert.throws(()=>createMailSocket({origin,acquireTicket:async()=>admission}));
});

test('MAIL-SOCKET-UI-02 encrypted HTTP tickets admit one local socket before any request frame is submitted',async t=>{
  const f=fixture(t),request=frame(),pending=f.client.request(request,{authorization:auth}),socket=await f.socket();
  assert.deepEqual(f.tickets,[auth]);assert.equal(socket.url,'ws://127.0.0.1:39391/api/mail/socket');assert.equal(socket.protocol,MAIL_SOCKET_PROTOCOL);assert(!socket.url.includes(admission.ticket));assert(!socket.url.includes(auth));assert.equal(socket.sent.length,0);
  socket.open();assert.deepEqual(JSON.parse(socket.sent[0]),{ticket:admission.ticket});assert.equal(socket.sent.length,1);
  await turn();assert.equal(socket.sent.length,1);socket.ready();await turn();assert.deepEqual(JSON.parse(socket.sent[1]),request);
  socket.receive({...request,data:'B'.repeat(24)});assert.equal((await pending).data,'B'.repeat(24));assert.equal(socket.closes,0);
  const second=frame(2),next=f.client.request(second,{authorization:auth});await turn();assert.equal(f.tickets.length,1);assert.equal(f.sockets.length,1);socket.receive(second);assert.deepEqual(await next,second);
});

test('MAIL-SOCKET-UI-03 encrypted replies match their exact pending request, including out-of-order responses',async t=>{
  const f=fixture(t),first=frame(1),second=frame(2),a=f.client.request(first,{authorization:auth}),b=f.client.request(second,{authorization:auth}),socket=await f.connect();
  assert.equal(socket.sent.length,3);socket.receive(second);assert.deepEqual(await b,second);socket.receive(first);assert.deepEqual(await a,first);
  for(const corrupt of [value=>({...value,id:'f'.repeat(32)}),value=>({...value,issued:value.issued+1}),value=>({...value,runId:'b'.repeat(32)}),()=>({ready:true,protocol:MAIL_SOCKET_PROTOCOL})]){
    f.client.close();const request=frame(3),pending=capture(f.client.request(request,{authorization:auth})),current=await f.connect();current.receive(corrupt(request));assertFailure(await pending,{code:'MAIL_SOCKET_RESPONSE'});assert.equal(current.closes,1);
  }
});

test('MAIL-SOCKET-UI-04 ticket, protocol and admission failures allow protected HTTP fallback before frame submission',async t=>{
  for(const acquireTicket of [async()=>{throw Error('Untrusted bearer secret');},async()=>({...admission,path:'/api/admin'}),async()=>({...admission,protocol:'wrong'}),async()=>({...admission,ticket:'tiny'}),async()=>({...admission,metadata:'x'.repeat(5000)})]){
    const f=fixture(t,{acquireTicket}),result=await capture(f.client.request(frame(),{authorization:auth}));assertFailure(result,{safe:true});assert.equal(f.sockets.length,0);
    await capture(f.client.request(frame(2),{authorization:auth}));assert.equal(f.tickets.length,1,'Failed admission remains latched; do not reconnect automatically');
  }
  const ctorFailure=fixture(t,{WebSocketCtor:class{constructor(){throw Error('Private constructor reason');}}});assertFailure(await capture(ctorFailure.client.request(frame(),{authorization:auth})),{safe:true});
  const invalidSocket=fixture(t,{WebSocketCtor:class{}});assertFailure(await capture(invalidSocket.client.request(frame(),{authorization:auth})),{safe:true});
  for(const kind of ['protocol','refused','early-frame','binary','disconnect']){
    const f=fixture(t),pending=capture(f.client.request(frame(),{authorization:auth})),socket=await f.socket();
    if(kind==='protocol')socket.protocol='';socket.open();
    if(kind==='refused')socket.receive({error:'denied'});
    if(kind==='early-frame')socket.receive(frame());
    if(kind==='binary')socket.emit('message',{data:new Uint8Array([1])});
    if(kind==='disconnect')socket.disconnect();
    assertFailure(await pending,{safe:true});assert.ok(socket.sent.length<=1);assert.equal(socket.sent.some(text=>JSON.parse(text).id),false);
  }
});

test('MAIL-SOCKET-UI-05 account switches close pending old-account requests and ignore late replies',async t=>{
  const f=fixture(t),oldFrame=frame(1),old=capture(f.client.request(oldFrame,{authorization:auth})),oldSocket=await f.connect();
  const newFrame=frame(2),next=f.client.request(newFrame,{authorization:'Bearer synthetic-user-b'});
  assertFailure(await old,{code:'MAIL_SOCKET_SESSION'});assert.equal(oldSocket.closes,1);const newSocket=await f.connect();assert.equal(f.sockets.length,2);assert.deepEqual(f.tickets,[auth,'Bearer synthetic-user-b']);
  oldSocket.receive(oldFrame);assert.equal(newSocket.sent.length,2);newSocket.receive(newFrame);assert.deepEqual(await next,newFrame);
});

test('MAIL-SOCKET-UI-06 account changes during ticket acquisition cannot open a late old-account socket',async t=>{
  let release;
  const held=new Promise(resolve=>{release=resolve}),f=fixture(t,{acquireTicket:authorization=>authorization===auth?held:admission});
  const old=capture(f.client.request(frame(1),{authorization:auth}));await turn();const next=f.client.request(frame(2),{authorization:'Bearer synthetic-user-b'}),socket=await f.connect();
  assertFailure(await old,{code:'MAIL_SOCKET_SESSION'});release(admission);await turn();assert.equal(f.sockets.length,1);socket.receive(frame(2));await next;
});

test('MAIL-SOCKET-UI-07 abort closes the shared account connection without HTTP fallback or resubmission',async t=>{
  const f=fixture(t),controller=new AbortController(),a=capture(f.client.request(frame(1),{authorization:auth,signal:controller.signal})),b=capture(f.client.request(frame(2),{authorization:auth})),socket=await f.connect();
  controller.abort();assert.equal(assertFailure(await a,{code:'MAIL_SOCKET_ABORTED'}).name,'AbortError');assert.equal(assertFailure(await b,{code:'MAIL_SOCKET_ABORTED'}).name,'AbortError');assert.equal(socket.closes,1);assert.equal(socket.sent.length,3);
  const already=new AbortController();already.abort();assertFailure(await capture(f.client.request(frame(3),{authorization:auth,signal:already.signal})),{code:'MAIL_SOCKET_ABORTED'});assert.equal(f.tickets.length,1);
});

test('MAIL-SOCKET-UI-08 disconnect, send throws and request timeouts after submission never permit automatic HTTP replay',async t=>{
  for(const kind of ['disconnect','throw','timeout']){
    const f=fixture(t,{timeouts:{requestTimeoutMs:150,admissionTimeoutMs:100}}),pending=capture(f.client.request(frame(1),{authorization:auth})),socket=await f.socket();socket.open();if(kind==='throw')socket.throwSend=true;socket.ready();await turn();
    if(kind==='disconnect')socket.disconnect();const failure=assertFailure(await pending);assert.match(failure.code,/MAIL_SOCKET_(?:CONNECTION|TIMEOUT)/);assert.equal(socket.closes,1);
    const count=f.sockets.length;await turn();assert.equal(f.sockets.length,count);assert.equal(f.tickets.length,1);
    // A new explicit operation can fall back to protected HTTP. The failed
    // submitted operation above did not permit fallback or resend itself.
    assertFailure(await capture(f.client.request(frame(2),{authorization:auth})),{safe:true});assert.equal(f.sockets.length,count);
  }
});

test('MAIL-SOCKET-UI-09 pending requests, encrypted frame sizes and response sizes are bounded',async t=>{
  const f=fixture(t),requests=Array.from({length:4},(_,i)=>capture(f.client.request(frame(i+1),{authorization:auth})));
  assertFailure(await capture(f.client.request(frame(5),{authorization:auth})),{code:'MAIL_SOCKET_BUSY'});const socket=await f.connect();assert.equal(socket.sent.length,5);f.client.close();for(const pending of requests)assertFailure(await pending,{code:'MAIL_SOCKET_SESSION'});
  const oversized=frame(6);oversized.data='A'.repeat(Math.ceil(MAIL_SOCKET_LIMITS.requestBytes/4)*4);assertFailure(await capture(f.client.request(oversized,{authorization:auth})),{code:'MAIL_SOCKET_FRAME'});assert.equal(f.sockets.length,1);
  const response=frame(7),pending=capture(f.client.request(response,{authorization:auth})),nextSocket=await f.connect();nextSocket.receive(' '.repeat(MAIL_SOCKET_LIMITS.responseBytes+1));assertFailure(await pending,{code:'MAIL_SOCKET_RESPONSE'});assert.equal(nextSocket.closes,1);
  f.client.close();const buffered=capture(f.client.request(frame(8),{authorization:auth})),bufferedSocket=await f.socket();bufferedSocket.open();bufferedSocket.bufferedAmount=MAIL_SOCKET_LIMITS.requestBytes*MAIL_SOCKET_LIMITS.pending;bufferedSocket.ready();assertFailure(await buffered,{code:'MAIL_SOCKET_BUSY'});assert.equal(bufferedSocket.sent.length,1);
});

test('MAIL-SOCKET-UI-10 duplicate frames are not submitted twice and caller edits cannot change response binding',async t=>{
  const f=fixture(t),original=frame(1),expected={...original},pending=f.client.request(original,{authorization:auth});
  assertFailure(await capture(f.client.request(original,{authorization:auth})),{code:'MAIL_SOCKET_DUPLICATE'});original.id='b'.repeat(32);original.issued++;const socket=await f.connect();assert.deepEqual(JSON.parse(socket.sent[1]),expected);socket.receive(expected);assert.deepEqual(await pending,expected);
});

test('MAIL-SOCKET-UI-11 admission timeouts allow fallback and ignore late tickets',async t=>{
  let release;const held=new Promise(resolve=>{release=resolve}),f=fixture(t,{acquireTicket:()=>held,timeouts:{admissionTimeoutMs:25,requestTimeoutMs:200}});
  assertFailure(await capture(f.client.request(frame(),{authorization:auth})),{safe:true,code:'MAIL_SOCKET_ADMISSION_TIMEOUT'});release(admission);await turn();assert.equal(f.sockets.length,0);
});
