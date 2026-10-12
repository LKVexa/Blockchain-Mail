import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import {randomBytes,createHash} from 'node:crypto';
import {Store} from '../src/store.mjs';
import {createInternetMail} from '../src/internet-mail.mjs';
import {createMailRouter} from '../src/mail-routing.mjs';
import {createProtectedApi} from '../src/protected-api.mjs';
import {createVirtualMailSocket,MAIL_SOCKET_PATH,MAIL_SOCKET_PROTOCOL,MAIL_SOCKET_LIMITS} from '../src/virtual-mail-socket.mjs';
import {deriveTransport,encodeFrame,decodeFrame,unbase64} from '../web/protected-wire.mjs';

const tick=()=>new Promise(resolve=>setImmediate(resolve));
function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no});return {promise,resolve,reject};}
function clientFrame(value,{op=1,fin=true,masked=true,rsv=0,declaredLength,forcedLength}={}){
 const payload=Buffer.isBuffer(value)?value:Buffer.from(value),length=declaredLength??payload.length;
 const mode=forcedLength??(length<126?length:length<65536?126:127),extension=mode===126?2:mode===127?8:0;
 const header=Buffer.alloc(2+extension+(masked?4:0));header[0]=(fin?128:0)|rsv|op;header[1]=(masked?128:0)|mode;
 if(mode===126)header.writeUInt16BE(length,2);else if(mode===127)header.writeBigUInt64BE(BigInt(length),2);
 const body=Buffer.from(payload);if(masked){const mask=randomBytes(4);mask.copy(header,2+extension);for(let i=0;i<body.length;i++)body[i]^=mask[i&3];}
 return Buffer.concat([header,body]);
}
async function connect(ctx,{origin=ctx.origin,host=new URL(ctx.origin).host,url=MAIL_SOCKET_PATH,protocol=MAIL_SOCKET_PROTOCOL,key=randomBytes(16).toString('base64'),tail=Buffer.alloc(0)}={}){
 const socket=net.connect({host:'127.0.0.1',port:ctx.port}),handshake=deferred(),closed=deferred(),frames=[],waiters=[];
 let buffer=Buffer.alloc(0),upgraded=false,settled=false;
 const publish=frame=>{const index=waiters.findIndex(waiter=>waiter.op===frame.op);if(index>=0){const waiter=waiters.splice(index,1)[0];clearTimeout(waiter.timer);waiter.resolve(frame);}else frames.push(frame);};
 socket.setNoDelay(true);socket.on('error',error=>{if(!settled)handshake.reject(error);});socket.on('close',()=>closed.resolve());
 socket.on('data',chunk=>{
  buffer=Buffer.concat([buffer,chunk]);
  if(!settled){const end=buffer.indexOf('\r\n\r\n');if(end<0)return;const text=buffer.subarray(0,end).toString('ascii');buffer=buffer.subarray(end+4);const status=Number(/^HTTP\/1\.1 ([0-9]+)/.exec(text)?.[1]);settled=true;upgraded=status===101;handshake.resolve({status,headers:text});}
  if(!upgraded)return;
  while(buffer.length>=2){const op=buffer[0]&15;let length=buffer[1]&127,header=2;if(length===126){if(buffer.length<4)return;length=buffer.readUInt16BE(2);header=4;}else if(length===127){if(buffer.length<10)return;length=Number(buffer.readBigUInt64BE(2));header=10;}assert.equal(buffer[1]&128,0,'server frames are unmasked');if(buffer.length<header+length)return;const payload=Buffer.from(buffer.subarray(header,header+length));buffer=buffer.subarray(header+length);publish({op,payload,code:op===8&&payload.length>=2?payload.readUInt16BE(0):null});}
 });
 await new Promise((resolve,reject)=>{socket.once('connect',resolve);socket.once('error',reject);});
 const request=Buffer.from(['GET '+url+' HTTP/1.1','Host: '+host,'Upgrade: websocket','Connection: Upgrade','Sec-WebSocket-Version: 13','Sec-WebSocket-Key: '+key,'Sec-WebSocket-Protocol: '+protocol,...(origin===null?[]:['Origin: '+origin]),'',''].join('\r\n'));
 socket.write(Buffer.concat([request,tail]));
 const reply=await handshake.promise;
 const peer={socket,...reply,closed:closed.promise,send:value=>socket.write(clientFrame(typeof value==='string'?value:JSON.stringify(value))),raw:bytes=>socket.write(bytes),
  next(op=1){const index=frames.findIndex(frame=>frame.op===op);if(index>=0)return Promise.resolve(frames.splice(index,1)[0]);return new Promise((resolve,reject)=>{const waiter={op,resolve,reject,timer:null};waiter.timer=setTimeout(()=>{const i=waiters.indexOf(waiter);if(i>=0)waiters.splice(i,1);reject(Error('Timed out waiting for server frame '+op));},3000);waiters.push(waiter);});},
  async ready(value){this.send({ticket:value});const frame=await this.next();assert.deepEqual(JSON.parse(frame.payload),{ready:true,protocol:MAIL_SOCKET_PROTOCOL});},
  async end(){socket.destroy();await closed.promise;}
 };
 ctx.clients.add(peer);return peer;
}
async function fixture(t,{clock=Date.now,transport,dispatchHook}={}){
 const work=path.resolve(import.meta.dirname,'../../work');fs.mkdirSync(work,{recursive:true});
 const root=fs.mkdtempSync(path.join(work,'virtual-mail-socket-test-')),key=randomBytes(32),runId=randomBytes(16).toString('hex');
 const store=new Store(root,{vaultKey:key}),credentials=store.credentials(),calls=[],deliveries=[],clients=new Set();
 const internet=createInternetMail(store,transport??{async deliver(envelope){deliveries.push(envelope);return {status:'ACCEPTED',code:250,mx:'mx.recipient.org',detail:'Synthetic recipient accepted the message.'}},async close(){}}),router=createMailRouter(store,internet);
 store.login(credentials['postmaster@local.test']);store.login(credentials['user@local.test']);internet.login(credentials['user@local.test']);
 const server=http.createServer((req,res)=>{res.writeHead(404);res.end();});let port;
 const origin=()=>`http://127.0.0.1:${port}`;
 const channel=await createProtectedApi(key,runId),wire=await deriveTransport(key,runId);
 const dispatch=async value=>{
  calls.push({method:value.method,path:value.path});if(dispatchHook)await dispatchHook(value);
  const tok=value.headers.authorization.slice(7),u=new URL(value.path,origin());let data;
  if(value.method==='GET'){
   if(u.pathname==='/api/me')data=store.me(tok);
   else if(u.pathname==='/api/mailbox-page')data=store.page(tok,{folder:u.searchParams.get('folder')??'INBOX',limit:25});
   else if(u.pathname==='/api/messages')data=store.list(tok,u.searchParams.get('folder')??'INBOX');
   else if(u.pathname==='/api/internet/status')data=internet.status(tok);
   else if(u.pathname==='/api/internet/outbox')data=internet.list(tok);
   else {const match=/^\/api\/messages\/([a-f0-9]{32})(?:\/(proof))?$/.exec(u.pathname);data=match?.[2]?store.proof(tok,match[1]):store.message(tok,match?.[1]);}
  }else{const body=JSON.parse(value.body);data=u.pathname==='/api/mail/quote'?router.quote(tok,body):await router.send(tok,body);}
  return {status:200,data};
 };
 const service=createVirtualMailSocket({server,origin,runId,channel,store,dispatch,clock});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',()=>{port=server.address().port;resolve();}));
 const ctx={store,credentials,calls,deliveries,server,service,port,origin:origin(),wire,clients,user:credentials['user@local.test'],operator:credentials['postmaster@local.test']};
 t.after(async()=>{for(const peer of clients)peer.socket.destroy();await service.close();await internet.close();await new Promise(resolve=>server.close(resolve));store.close();key.fill(0);fs.rmSync(root,{recursive:true,force:true});});
 ctx.frame=(route,body,token=ctx.user)=>encodeFrame(wire,'request',{method:body===undefined?'GET':'POST',path:route,headers:{authorization:'Bearer '+token,...(body===undefined?{}:{'content-type':'application/json','x-bve-request':'1'})},body:body===undefined?null:JSON.stringify(body)});
 ctx.request=async(peer,route,body,token=ctx.user)=>{const frame=await ctx.frame(route,body,token);peer.send(frame);const reply=JSON.parse((await peer.next()).payload);const decoded=await decodeFrame(wire,'response',reply,frame);return {status:decoded.status,data:JSON.parse(Buffer.concat(decoded.chunks.map(chunk=>Buffer.from(unbase64(chunk)))).toString('utf8'))};};
 ctx.admit=async(token=ctx.user)=>{const peer=await connect(ctx);assert.equal(peer.status,101);assert.match(peer.headers,new RegExp('Sec-WebSocket-Protocol: '+MAIL_SOCKET_PROTOCOL));await peer.ready(service.ticket(token).ticket);return peer;};
 return ctx;
}

test('MAIL-SOCKET real protected mailbox send, own Inbox read and public-domain routing share durable services',async t=>{
 const ctx=await fixture(t),peer=await ctx.admit();
 const me=await ctx.request(peer,'/api/me');assert.equal(me.status,200);assert.match(me.data.assigned_address,/^mail@127\.0\.0\./);
 const local={to:[me.data.assigned_address],subject:'Private local WebSocket mail',body:'Synthetic local content',attachments:[],request_id:'socket-local-synthetic-01'};
 const quote=await ctx.request(peer,'/api/mail/quote',local);assert.equal(quote.data.route,'local');
 assert.equal((await ctx.request(peer,'/api/mail/send',{...local,expected_route:'local',max_cost:quote.data.cost})).status,200);
 const inbox=await ctx.request(peer,'/api/mailbox-page?folder=INBOX');assert.equal(inbox.status,200);assert.equal(inbox.data.messages[0].subject,local.subject);
 const message=await ctx.request(peer,'/api/messages/'+inbox.data.messages[0].id);assert.equal(message.data.body,local.body);assert.equal(message.data.from,me.data.assigned_address);
 const external={...local,to:['recipient@recipient.org'],request_id:'socket-internet-synthetic-01'};
 const externalQuote=await ctx.request(peer,'/api/mail/quote',external);assert.equal(externalQuote.data.route,'internet');
 const payload={...external,expected_route:'internet',confirmed_from:externalQuote.data.from,confirmed_helo:externalQuote.data.helo};
 const sent=await ctx.request(peer,'/api/mail/send',payload);assert.equal(sent.data.message.status,'ACCEPTED');assert.equal(ctx.deliveries.length,1);
 assert.equal((await ctx.request(peer,'/api/mail/send',payload)).data.replayed,true);assert.equal(ctx.deliveries.length,1);
 assert.equal((await ctx.request(peer,'/api/internet/outbox')).data.messages.length,1);assert(ctx.store.verify().ok);
 const raw=fs.readFileSync(path.join(ctx.store.root,'mail.sqlite'));assert(!raw.includes(Buffer.from(local.body)));
});

test('MAIL-SOCKET rejects wrong origins, hosts, paths, credentials in URL, missing Origin and terminal subprotocol',async t=>{
 const ctx=await fixture(t);
 for(const options of [{origin:'https://attacker.org'},{origin:null},{host:'localhost:'+ctx.port},{url:MAIL_SOCKET_PATH+'?ticket=secret'},{url:'/ws/terminal'},{protocol:'hermit.vws.v2'},{key:'!!!!!!!!!!!!!!!!!!!!!!=='}]){
  const peer=await connect(ctx,options);assert.notEqual(peer.status,101);await peer.end();
 }
 assert.equal(ctx.calls.length,0);assert.equal(ctx.service.status().connections,0);
});

test('MAIL-SOCKET tickets are account-bound, one-use, expire after 30 seconds and reject duplicate keys',async t=>{
 let now=Date.now();const ctx=await fixture(t,{clock:()=>now});
 const issued=ctx.service.ticket(ctx.user);assert.equal(issued.expires_at,now+30_000);assert.equal(issued.path,MAIL_SOCKET_PATH);
 const first=await connect(ctx);await first.ready(issued.ticket);
 const replay=await connect(ctx);replay.send({ticket:issued.ticket});assert.equal((await replay.next(8)).code,1008);await replay.end();
 const expired=ctx.service.ticket(ctx.user);now+=30_001;const second=await connect(ctx);second.send({ticket:expired.ticket});assert.equal((await second.next(8)).code,1008);await second.end();
 const fresh=ctx.service.ticket(ctx.user),duplicates=await connect(ctx);duplicates.send('{"ticket":"'+fresh.ticket+'","ticket":"'+fresh.ticket+'"}');assert.equal((await duplicates.next(8)).code,1008);await duplicates.end();
 assert.throws(()=>ctx.service.ticket('invalid'),/Bearer token|Invalid bearer|Invalid token|Unknown token|Unauthorized|Authentication/);
 assert.equal(ctx.calls.length,0);
});

test('MAIL-SOCKET each operation rejects another account and revalidates rotated tokens',async t=>{
 const ctx=await fixture(t),peer=await ctx.admit();
 const denied=await ctx.request(peer,'/api/me',undefined,ctx.operator);assert.equal(denied.status,403);assert.equal(denied.data.error,'MAIL_SOCKET_OWNER');assert.equal(ctx.calls.length,0);
 assert.equal((await ctx.request(peer,'/api/me')).status,200);ctx.store.rotateToken(ctx.user);
 const rotated=await ctx.request(peer,'/api/me');assert.equal(rotated.status,401);assert.equal(ctx.calls.length,1);
});

test('MAIL-SOCKET blocks bootstrap, administrative operations and terminal commands before dispatch',async t=>{
 const ctx=await fixture(t),peer=await ctx.admit();
 for(const [route,body] of [['/api/bootstrap',undefined],['/api/admin/shutdown',{}],['/api/rotate-token',{}],['/api/send',{}],['/api/mail/socket-ticket',{}],['/api/terminal/exec',{command:'mail'}],['/api/mail/send?alternate=1',{}]]){
  const denied=await ctx.request(peer,route,body);assert.equal(denied.status,403);assert.equal(denied.data.error,'MAIL_SOCKET_ROUTE');
 }
 assert.equal(ctx.calls.length,0);
});

test('MAIL-SOCKET body and proof reads retain own-Inbox boundaries even for the operator',async t=>{
 const ctx=await fixture(t),peer=await ctx.admit(ctx.operator),assigned=ctx.store.me(ctx.user).assigned_address;
 ctx.store.send(ctx.operator,{to:[assigned],subject:'Only user Inbox',body:'Private other-account body',request_id:'socket-isolation-synthetic-01',max_cost:1});
 const other=ctx.store.list(ctx.user)[0].id;
 for(const suffix of ['', '/proof']){const denied=await ctx.request(peer,'/api/messages/'+other+suffix,undefined,ctx.operator);assert.equal(denied.status,404);assert.equal(denied.data.error,'NOT_FOUND');assert(!JSON.stringify(denied).includes('Private other-account body'));}
 const inbox=await ctx.request(peer,'/api/messages',undefined,ctx.operator);assert.deepEqual(inbox.data,[]);
});

test('MAIL-SOCKET accepts masked fragmented encrypted requests with interleaved ping and split headers',async t=>{
 const ctx=await fixture(t),peer=await ctx.admit(),frame=await ctx.frame('/api/me'),bytes=Buffer.from(JSON.stringify(frame)),cut=Math.floor(bytes.length/2);
 const first=clientFrame(bytes.subarray(0,cut),{fin:false});
 for(let index=0;index<first.length;index+=3){peer.raw(first.subarray(index,index+3));await tick();}
 peer.raw(clientFrame('hello',{op:9}));assert.equal((await peer.next(10)).payload.toString(),'hello');
 peer.raw(clientFrame(bytes.subarray(cut),{op:0}));
 const result=await decodeFrame(ctx.wire,'response',JSON.parse((await peer.next()).payload),frame);assert.equal(result.status,200);assert.equal(ctx.calls.length,1);
});

test('MAIL-SOCKET rejects unmasked data, binary frames, invalid UTF-8 and reserved frame bits',async t=>{
 const ctx=await fixture(t);
 for(const [bytes,code] of [[clientFrame('{}',{masked:false}),1002],[clientFrame('{}',{op:2}),1003],[clientFrame(Buffer.from([0xff])),1007],[clientFrame('{}',{rsv:64}),1002],[clientFrame('{}',{forcedLength:126}),1002]]){
  const peer=await ctx.admit();peer.raw(bytes);assert.equal((await peer.next(8)).code,code);await peer.end();
 }
 assert.equal(ctx.calls.length,0);
});

test('MAIL-SOCKET rejects oversize headers before allocating payload and excessive fragments',async t=>{
 const ctx=await fixture(t),large=await ctx.admit();
 large.raw(clientFrame('',{declaredLength:MAIL_SOCKET_LIMITS.request_bytes+1}));assert.equal((await large.next(8)).code,1009);await large.end();
 const fragments=await ctx.admit();fragments.raw(clientFrame('{',{fin:false}));for(let count=0;count<MAIL_SOCKET_LIMITS.fragments;count++)fragments.raw(clientFrame(' ',{op:0,fin:false}));
 assert.equal((await fragments.next(8)).code,1009);assert.equal(ctx.calls.length,0);
});

test('MAIL-SOCKET encrypted frame replay and tampering close the connection without dispatch',async t=>{
 const ctx=await fixture(t),peer=await ctx.admit(),frame=await ctx.frame('/api/me');peer.send(frame);await peer.next();assert.equal(ctx.calls.length,1);
 peer.send(frame);assert.equal((await peer.next(8)).code,1008);await peer.end();
 const tampered=await ctx.admit(),second=await ctx.frame('/api/me');second.data=second.data.slice(0,-4)+'AAAA';tampered.send(second);assert.equal((await tampered.next(8)).code,1008);assert.equal(ctx.calls.length,1);
});

test('MAIL-SOCKET caps unauthenticated sockets and ticket retention',async t=>{
 const ctx=await fixture(t),waiting=[];
 for(let count=0;count<MAIL_SOCKET_LIMITS.preadmission;count++){const peer=await connect(ctx);assert.equal(peer.status,101);waiting.push(peer);}
 const denied=await connect(ctx);assert.equal(denied.status,429);await denied.end();
 for(const peer of waiting)await peer.end();await tick();
 for(let count=0;count<MAIL_SOCKET_LIMITS.tickets;count++)ctx.service.ticket(ctx.user);
 assert.throws(()=>ctx.service.ticket(ctx.user),error=>error.code==='MAIL_SOCKET_BUSY'&&error.http===429);
 assert.equal(ctx.service.status().tickets,MAIL_SOCKET_LIMITS.tickets);
});

test('MAIL-SOCKET caps pending work and waits for authorized jobs during shutdown',async t=>{
 const hold=deferred(),started=deferred();let entered=0,completed=0;
 const ctx=await fixture(t,{dispatchHook:async()=>{entered++;if(entered===MAIL_SOCKET_LIMITS.pending)started.resolve();await hold.promise;completed++;}}),peer=await ctx.admit();
 for(let count=0;count<MAIL_SOCKET_LIMITS.pending;count++)peer.send(await ctx.frame('/api/me'));
 await started.promise;assert.equal(ctx.service.status().pending,MAIL_SOCKET_LIMITS.pending);
 peer.send(await ctx.frame('/api/me'));assert.equal((await peer.next(8)).code,1013);
 let stopped=false;const stopping=ctx.service.close().then(()=>{stopped=true;});await tick();assert.equal(stopped,false);
 hold.resolve();await stopping;assert.equal(completed,MAIL_SOCKET_LIMITS.pending);assert.equal(ctx.service.status().pending,0);assert.equal(ctx.service.status().connections,0);
});

test('MAIL-SOCKET disconnect after authorized Internet send never resends and preserves its eventual result',async t=>{
 const hold=deferred(),started=deferred();let attempts=0;
 const ctx=await fixture(t,{transport:{async deliver(){attempts++;started.resolve();await hold.promise;return {status:'ACCEPTED',code:250,mx:'mx.recipient.org',detail:'Synthetic acceptance after socket close.'}},async close(){hold.resolve();}}}),peer=await ctx.admit();
 const draft={to:['recipient@recipient.org'],subject:'Disconnect synthetic send',body:'No real Internet transmission',attachments:[],request_id:'socket-disconnect-send-01'},quote=await ctx.request(peer,'/api/mail/quote',draft);
 peer.send(await ctx.frame('/api/mail/send',{...draft,expected_route:'internet',confirmed_from:quote.data.from,confirmed_helo:quote.data.helo}));await started.promise;await peer.end();assert.equal(attempts,1);
 hold.resolve();await ctx.service.close();assert.equal(attempts,1);assert.equal(ctx.store.state().internetMail.envelopes[0].status,'ACCEPTED');assert(ctx.store.verify().ok);
});
