import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import http from 'node:http';
import {randomBytes,generateKeyPairSync,createHash} from 'node:crypto';
import {canonical,hash,keys,signature} from '../src/crypto.mjs';
import {TORUS_DOMAINS,torusEnvelopeDigest,torusRoute,addressNode,validateTorusDirectory} from '../src/torus-mail.mjs';
import {createTorusPeer,sealPeerEnvelope,openPeerEnvelope,validatePeerPacket,validatePeerReceipt,validOnionName,TORUS_PEER_LIMITS,TORUS_ENROLLMENT_LIMITS,TORUS_ATTACHMENT_CHUNK_BYTES,validatePeerAttachmentDescriptor,sealPeerAttachment,openPeerAttachment} from '../src/torus-peer.mjs';

const sign=(domain,value,key)=>({...value,signature:signature(domain,value,key)});
const deferred=()=>{let resolve;return {promise:new Promise(yes=>{resolve=yes;}),resolve};};
function onion(){const publicBytes=randomBytes(32),version=Buffer.from([3]),checksum=createHash('sha3-256').update(Buffer.concat([Buffer.from('.onion checksum'),publicBytes,version])).digest().subarray(0,2),bytes=Buffer.concat([publicBytes,checksum,version]);let accumulator=0,bits=0,text='';for(const byte of bytes){accumulator=(accumulator<<8)|byte;bits+=8;while(bits>=5){bits-=5;text+='abcdefghijklmnopqrstuvwxyz234567'[(accumulator>>>bits)&31];}}return text+'.onion';}
function network(coordinates=['n00','n01','n11']){
 const network_id='a'.repeat(32),root=keys(),locals=[],cards=[];
 for(const [index,coordinate]of coordinates.entries()){
  const expanded=coordinate.startsWith('v'),hostNumber=expanded?parseInt(coordinate.slice(1),16):null,version=expanded?2:1,x=expanded?Math.floor(hostNumber/4096):Number(coordinate[1]),y=expanded?hostNumber%4096:Number(coordinate[2]),prefix=expanded?`127.${hostNumber>>>16}.${(hostNumber>>>8)&255}.${hostNumber&255}:`:`127.${x}.${y}.`;
  const signing=index===0?root:keys(),box=generateKeyPairSync('x25519'),host=onion(),grant=index===0?null:sign(TORUS_DOMAINS.invitation,{version,network_id,root_public:root.publicKey,root_onion:cards[0].onion,root_port:80,invite_id:index.toString(16).padStart(32,'0'),node_id:coordinate,x,y,prefix},root.privateKey);
  const card=sign(TORUS_DOMAINS.card,{version,network_id,node_id:coordinate,x,y,prefix,onion:host,port:80,sign_public:signing.publicKey,box_public:box.publicKey.export({type:'spki',format:'pem'}),invitation:grant},signing.privateKey);cards.push(card);
  locals.push({node_id:coordinate,sign_public:signing.publicKey,sign_private:signing.privateKey,box_public:card.box_public,box_private:box.privateKey.export({type:'pkcs8',format:'pem'}),onion:host,port:80});
 }
 const directory=sign(TORUS_DOMAINS.directory,{version:cards.some(card=>card.version===2)?2:1,network_id,root_public:root.publicKey,revision:cards.length,nodes:cards.toSorted((left,right)=>left.node_id.localeCompare(right.node_id))},root.privateKey);
 return {directory,contexts:locals.map(local=>({directory,local}))};
}
function envelope(ctx,{from='rmail@127.0.0.2',to='rmail@127.1.1.2',id=randomBytes(16).toString('hex'),body='Synthetic private mail: no real network delivery',attachments=[],created_at=Date.now(),route}={}){
 const recipient=addressNode(ctx.directory,to);const value={version:1,network_id:ctx.directory.network_id,id,from,to,subject:'Synthetic private torus mail',body,attachments,sender_node:ctx.local.node_id,recipient_node:recipient.node_id,route:route??torusRoute(ctx.directory,ctx.local.node_id,recipient.node_id),created_at};return sign(TORUS_DOMAINS.envelope,{...value,digest:torusEnvelopeDigest(value)},ctx.local.sign_private);
}
function receipt(value,ctx){return sign(TORUS_DOMAINS.receipt,{version:1,network_id:value.network_id,id:value.id,digest:value.digest,sender_node:value.sender_node,recipient_node:value.recipient_node,status:'DELIVERED',delivery_id:'f'.repeat(32),received_at:Date.now()},ctx.local.sign_private);}
async function proxy(t,targets,{refuse=false,beforeReply=null,dropResponse=null}={}){
 const requests=[],captured=[],sockets=new Set();const server=net.createServer(socket=>{sockets.add(socket);socket.on('close',()=>sockets.delete(socket));socket.on('error',()=>{});let bytes=Buffer.alloc(0),stage=0,upstream;
  const onData=chunk=>{bytes=Buffer.concat([bytes,chunk]);if(stage===0){if(bytes.length<3)return;assert.deepEqual([...bytes.subarray(0,3)],[5,1,0]);bytes=bytes.subarray(3);stage=1;socket.write(Buffer.from([5]));setImmediate(()=>socket.write(Buffer.from([0])));}
   if(stage===1){if(bytes.length<5)return;assert.equal(bytes[3],3,'Onion stays a SOCKS domain, never local DNS/IP');const size=bytes[4];if(bytes.length<7+size)return;const host=bytes.subarray(5,5+size).toString('ascii'),port=bytes.readUInt16BE(5+size);requests.push({host,port});bytes=bytes.subarray(7+size);stage=2;
    const refused=typeof refuse==='function'?refuse({host,port,index:requests.length-1}):refuse;if(refused||!targets.has(host)){socket.end(Buffer.from([5,typeof refused==='number'?refused:5,0,1,0,0,0,0,0,0]));return;}
    const requestIndex=requests.length-1;upstream=net.connect({host:'127.0.0.1',port:targets.get(host)});sockets.add(upstream);upstream.on('error',()=>socket.destroy());upstream.on('close',()=>sockets.delete(upstream));upstream.once('connect',async()=>{try{if(beforeReply)await beforeReply({host,port,index:requestIndex});if(socket.destroyed)return;socket.write(Buffer.from([5,0,0,1,0,0,0,0,0,0]));socket.removeListener('data',onData);socket.on('data',part=>captured.push(Buffer.from(part)));if(bytes.length)upstream.write(bytes);socket.pipe(upstream);if(dropResponse?.({host,port,index:requestIndex}))upstream.on('data',()=>{socket.destroy();upstream.destroy();});else upstream.pipe(socket);}catch{socket.destroy();}});socket.on('close',()=>upstream?.destroy());
   }
  };socket.on('data',onData);
 });await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(async()=>{for(const socket of sockets)socket.destroy();await new Promise(resolve=>server.close(resolve));});return {port:server.address().port,requests,captured};
}
async function fixture(t,{holdReceive,refuse=false,readAttachmentChunks,stageAttachmentChunk,receiveHook,netw=network(),timeoutMs=3000,proxyOptions={}}={}){
 const targets=new Map(),socks=await proxy(t,targets,{refuse,...proxyOptions}),received=new Map(),observed=[],services=[];
 for(const ctx of netw.contexts){const service=createTorusPeer({socksPort:socks.port,timeoutMs,currentNetwork:()=>ctx,readAttachmentChunks:readAttachmentChunks?((...args)=>readAttachmentChunks(...args,ctx)):null,stageAttachmentChunk:stageAttachmentChunk?((...args)=>stageAttachmentChunk(...args,ctx)):null,receive:async value=>{observed.push({node:ctx.local.node_id,value});if(holdReceive)await holdReceive(value);if(receiveHook)await receiveHook(value,ctx);const previous=received.get(value.id);if(previous){assert.equal(previous.digest,value.digest);return {status:'DELIVERED',receipt:previous};}const accepted=receipt(value,ctx);received.set(value.id,accepted);return {status:'DELIVERED',receipt:accepted};},lookupReceipt:query=>{const old=received.get(query.id);assert(!old||old.digest===query.digest);return old??null;}});await service.start();targets.set(ctx.local.onion,service.port);services.push(service);}
 t.after(async()=>{for(const service of services)await service.close();});return {...netw,targets,socks,received,observed,services};
}
function post(port,host,path,body,headers={}){return new Promise((resolve,reject)=>{const request=http.request({host:'127.0.0.1',port,path,method:'POST',headers:{host,'content-type':'application/json','x-torus-peer':'1',...headers}},response=>{const parts=[];response.on('data',part=>parts.push(part));response.on('end',()=>resolve({status:response.statusCode,value:JSON.parse(Buffer.concat(parts))}));});request.on('error',reject);request.end(JSON.stringify(body));});}

test('TORUS-PEER validates v3 onion checksum/version rather than accepting invented names',()=>{
 const name=onion();assert(validOnionName(name));assert.equal(validOnionName('a'.repeat(56)+'.onion'),false);assert.equal(validOnionName(name.toUpperCase()),false);assert.equal(validOnionName('127.0.0.1'),false);assert.equal(validOnionName('example.org'),false);assert.equal(validOnionName(name+'?secret=1'),false);
});
test('TORUS-PEER destination-only encryption binds authenticated sender, route, digest and network',()=>{
 const {contexts}=network(),message=envelope(contexts[0]),packet=sealPeerEnvelope(message,contexts[0]);assert(!JSON.stringify(packet).includes(message.body));assert(!JSON.stringify(packet).includes(message.to));assert.deepEqual(openPeerEnvelope(packet,contexts[2]),message);assert.throws(()=>openPeerEnvelope(packet,contexts[1]));
 for(const mutate of [value=>({...value,network_id:'b'.repeat(32)}),value=>({...value,digest:'c'.repeat(64)}),value=>({...value,route:['n00','n11']}),value=>({...value,ciphertext:value.ciphertext.slice(0,-4)+'AAAA'}),value=>({...value,sender_node:'n01'})])assert.throws(()=>openPeerEnvelope(mutate(packet),contexts[2]));
 assert.throws(()=>validatePeerPacket(packet,contexts[0].directory,packet.expires_at+1));assert.throws(()=>validatePeerPacket({...packet,expires_at:packet.expires_at+1},contexts[0].directory));
 const fakeReceipt=receipt(message,contexts[1]);assert.throws(()=>validatePeerReceipt(fakeReceipt,message,contexts[0].directory));assert.deepEqual(validatePeerReceipt(receipt(message,contexts[2]),message,contexts[0].directory).status,'DELIVERED');
});
test('TORUS-PEER expanded destination encryption preserves every digit of a 32-digit private ID',()=>{
 const {contexts}=network(['n00','v030001','v030011']),source=contexts[1],destination=contexts[2],from='rmail@127.3.0.1:10000000000000000001',to='rmail@127.3.0.17:12345678901234567890123456789012',message=envelope(source,{from,to}),packet=sealPeerEnvelope(message,source);
 assert.equal(packet.version,1,'The expanded directory keeps the existing encrypted mail protocol');assert.deepEqual(packet.route,['v030001','n00','v030011']);assert.equal(openPeerEnvelope(packet,destination).to,to);assert(!JSON.stringify(packet).includes(to));
 assert.throws(()=>openPeerEnvelope(packet,contexts[0]),'The relay cannot open the destination mailbox content');
 assert.throws(()=>sealPeerEnvelope({...message,to:to.slice(0,-1)+'3'},source),'Recipient digits are bound to both the digest and sender signature');
 for(const invalid of ['rmail@127.3.0.17:0','rmail@127.3.0.17:01234567890123456789012345678901','rmail@127.3.0.17:123456789012345678901234567890123'])assert.throws(()=>envelope(source,{from,to:invalid}));
});
test('TORUS-PEER real local SOCKS proxy forwards two adjacent encrypted hops and verifies durable receipt',async t=>{
 const f=await fixture(t),message=envelope(f.contexts[0]),sent=await f.services[0].deliver(message,f.contexts[0]);assert.equal(sent.status,'DELIVERED');assert.equal(f.received.size,1);assert.deepEqual(f.observed.map(item=>item.node),['n11']);assert.deepEqual(f.socks.requests.map(item=>item.host),[f.contexts[1].local.onion,f.contexts[2].local.onion]);assert(f.socks.requests.every(item=>item.port===80));assert(!Buffer.concat(f.socks.captured).includes(Buffer.from(message.body)));
 assert.equal((await f.services[0].checkReceipt(message,f.contexts[0])).status,'DELIVERED');assert.equal((await f.services[0].deliver(message,f.contexts[0])).status,'DELIVERED');assert.equal(f.received.size,1,'same immutable ID commits only once');
 const other=envelope(f.contexts[0]);assert.equal((await f.services[0].checkReceipt(other,f.contexts[0])).status,'UNKNOWN');assert.equal(f.received.size,1);
});
test('TORUS-PEER expanded signed membership routes 32-digit mailbox IDs without TCP-port coercion',{timeout:15_000},async t=>{
 const coordinates=['n00','n01','n02','n10','n11','n12','n20','n21','n22','v030001','v030011'],netw=network(coordinates);validateTorusDirectory(netw.directory);
 const f=await fixture(t,{netw}),source=f.contexts.find(ctx=>ctx.local.node_id==='v030001'),destination=f.contexts.find(ctx=>ctx.local.node_id==='v030011'),sourceIndex=f.contexts.indexOf(source),mailboxes=new Map(),from='rmail@127.3.0.1:10000000000000000001';
 // These IDs deliberately exceed integer precision and differ only at the end.
 const ids=['12345678901234567890123456789012','12345678901234567890123456789013'];
 const messages=ids.map(mailbox=>envelope(source,{from,to:'rmail@127.3.0.17:'+mailbox}));
 assert.notEqual(messages[0].digest,messages[1].digest);assert.deepEqual(messages.map(value=>value.recipient_node),['v030011','v030011']);
 for(const message of messages){assert.equal((await f.services[sourceIndex].deliver(message,source)).status,'DELIVERED');const stored=f.observed.at(-1);assert.equal(stored.node,destination.local.node_id);assert.equal(stored.value.to,message.to);mailboxes.set(stored.value.to,stored.value.id);}
 assert.equal(mailboxes.size,2,'Full logical IDs identify two distinct recipient mailboxes');assert.equal(f.received.size,2);
 assert.deepEqual(f.socks.requests.map(value=>value.host),[f.contexts[0].local.onion,destination.local.onion,f.contexts[0].local.onion,destination.local.onion]);assert(f.socks.requests.every(value=>value.port===80),'Logical mailbox IDs never become network ports');
 const substituted={...messages[0],to:messages[1].to};assert.throws(()=>sealPeerEnvelope(substituted,source),'Signature and content digest bind every recipient digit');
 assert.equal((await f.services[sourceIndex].checkReceipt(messages[0],source)).status,'DELIVERED');assert.equal(f.received.size,2,'Receipt lookup does not resubmit either message');
});
test('TORUS-PEER validates and forwards a simple signed route longer than the former nine-computer cap',{timeout:15_000},async t=>{
 const netw=network(['n00','n01','n02','n10','n11','n12','n20','n21','n22','v030001']),f=await fixture(t,{netw}),source=f.contexts.at(-1),route=['v030001','n00','n01','n02','n12','n11','n10','n20','n21','n22'];
 const message=envelope(source,{from:'rmail@127.3.0.1:99999999999999999999999999999999',to:'rmail@127.2.2.2',route});assert(route.length>9);
 assert.deepEqual(openPeerEnvelope(sealPeerEnvelope(message,source),f.contexts.find(ctx=>ctx.local.node_id==='n22')),message);
 assert.equal((await f.services.at(-1).deliver(message,source)).status,'DELIVERED');assert.equal(f.received.size,1);assert.deepEqual(f.observed.map(value=>value.node),['n22']);
 assert.deepEqual(f.socks.requests.map(value=>value.host),route.slice(1).map(nodeId=>f.contexts.find(ctx=>ctx.local.node_id===nodeId).local.onion));assert(f.socks.requests.every(value=>value.port===80));
 const repeated=envelope(source,{from:message.from,to:message.to,route:[...route.slice(0,-1),'n01','n22']});assert.throws(()=>sealPeerEnvelope(repeated,source),'An expanded directory does not permit route loops');
 const skip=envelope(source,{from:message.from,to:message.to,route:['v030001','n11','n22']});assert.throws(()=>sealPeerEnvelope(skip,source),'Every hop must still be a signed topology neighbor');
});
test('TORUS-PEER SOCKS refusal does not dial onion directly or fall back to Internet delivery',async t=>{
 const f=await fixture(t,{refuse:true}),message=envelope(f.contexts[0]),result=await f.services[0].deliver(message,f.contexts[0]);assert.equal(result.status,'FAILED');assert.equal(f.socks.requests.length,1);assert.equal(f.received.size,0);assert.equal(f.observed.length,0);assert.equal((await f.services[0].checkReceipt(message,f.contexts[0])).status,'UNKNOWN');
});
test('TORUS-PEER listener refuses vault routes, malformed wrappers and wrong hop identity before receipt',async t=>{
 const f=await fixture(t),ctx=f.contexts[1],host=ctx.local.onion;
 for(const path of ['/api/bootstrap','/api/protected','/torus/v1/deliver?alternate=1','/torus/v1/deliver']){const reply=await post(f.services[1].port,host,path,{});assert.equal(reply.status,403);assert.deepEqual(reply.value,{error:'TORUS_PEER_REFUSED'});}
 const message=envelope(f.contexts[0]),packet=sealPeerEnvelope(message,f.contexts[0]),wrapper={version:1,payload:packet,hop:1,from_node:'n00',to_node:'n01',issued_at:Date.now(),nonce:'f'.repeat(32)};
 const wrong=sign('WORKSPACE391-TORUS-HOP/1',wrapper,f.contexts[2].local.sign_private);assert.equal((await post(f.services[1].port,host,'/torus/v1/deliver',wrong)).status,403);assert.equal(f.received.size,0);assert.equal(f.socks.requests.length,0);
});
test('TORUS-PEER closes sockets but waits for an already authorized durable commit',{timeout:10_000},async t=>{
 const entered=deferred(),hold=deferred(),f=await fixture(t,{holdReceive:async()=>{entered.resolve();await hold.promise;}}),message=envelope(f.contexts[0]);const sending=f.services[0].deliver(message,f.contexts[0]);await entered.promise;
 let stopped=false;const stopping=f.services[2].close().then(()=>{stopped=true;});await new Promise(resolve=>setImmediate(resolve));assert.equal(stopped,false);hold.resolve();await stopping;assert.equal(f.received.size,1);assert.equal((await sending).status,'UNKNOWN','lost acknowledgment is never reported as definite non-delivery');assert.equal(f.socks.requests.length,2,'no automatic resubmission');
});
test('TORUS-PEER rejects oversized plaintext attachments and forged long routes before transmission',()=>{
 const {contexts}=network(),message=envelope(contexts[0]);message.attachments=[{name:'large.bin',data:Buffer.alloc(DEFAULT_MAX_ATTACHMENT+1).toString('base64'),type:'application/octet-stream'}];assert.throws(()=>sealPeerEnvelope(message,contexts[0]));
 const invalid=envelope(contexts[0]);invalid.route=['n00','n01','n11','n01'];assert.throws(()=>sealPeerEnvelope(invalid,contexts[0]));assert(TORUS_PEER_LIMITS.packet_bytes<2_000_000);
});
const DEFAULT_MAX_ATTACHMENT=512*1024;

function descriptor(bytes,{size=bytes.length}={}){return {name:'Synthetic large file.bin',type:'application/octet-stream',attachment_id:randomBytes(16).toString('hex'),size,sha256:hash(bytes),chunk_size:TORUS_ATTACHMENT_CHUNK_BYTES,chunk_count:Math.ceil(size/TORUS_ATTACHMENT_CHUNK_BYTES)};}
test('TORUS-PEER large descriptor sizes have no file/total ceiling and chunks bind encrypted owner/context',()=>{
 const {contexts}=network(),data=Buffer.alloc(TORUS_ATTACHMENT_CHUNK_BYTES,23),file=descriptor(data),message=envelope(contexts[0],{attachments:[file]}),packet=sealPeerAttachment(message,file,0,data,contexts[0]);assert(!JSON.stringify(packet).includes(file.name));assert.deepEqual(openPeerAttachment(packet,contexts[2]).data,data);assert.throws(()=>openPeerAttachment(packet,contexts[1]));assert.throws(()=>openPeerAttachment({...packet,chunk_index:1},contexts[2]));assert.throws(()=>sealPeerAttachment(message,file,0,Buffer.alloc(TORUS_ATTACHMENT_CHUNK_BYTES+1),contexts[0]));
 const huge=descriptor(Buffer.alloc(0),{size:4*1024*1024*1024*1024});assert.equal(validatePeerAttachmentDescriptor(huge).size,huge.size);assert(validatePeerAttachmentDescriptor(descriptor(Buffer.alloc(0))).chunk_count===0);
});
test('TORUS-PEER streams attachments beyond old limits through opaque adjacent hops before final Inbox ACK',{timeout:10000},async t=>{
 const bytes=Buffer.alloc(TORUS_ATTACHMENT_CHUNK_BYTES*3+17,71),file=descriptor(bytes),staged=[],f=await fixture(t,{readAttachmentChunks:async function*(value,desc){for(let index=0;index<desc.chunk_count;index++)yield {index,data:bytes.subarray(index*desc.chunk_size,(index+1)*desc.chunk_size)};},stageAttachmentChunk:async(value,ctx)=>{assert.equal(ctx.local.node_id,'n11');assert.equal(value.descriptor.attachment_id,file.attachment_id);assert(value.data.length<=TORUS_ATTACHMENT_CHUNK_BYTES);staged.push(value);},receiveHook:async()=>{assert.deepEqual(staged.map(value=>value.index),[-1,0,1,2,3]);assert.equal(hash(Buffer.concat(staged.filter(value=>value.index>=0).map(value=>value.data))),file.sha256);}}),message=envelope(f.contexts[0],{attachments:[file]});
 const sent=await f.services[0].deliver(message,f.contexts[0]);assert.equal(sent.status,'DELIVERED');assert.equal(f.received.size,1);assert.equal(f.socks.requests.length,12,'prepare + four chunks + final envelope each traverse two links');assert(!Buffer.concat(f.socks.captured).includes(bytes));
});
test('TORUS-PEER lost durable chunk acknowledgment retries identical bytes before one final mailbox submission',{timeout:10000},async t=>{
 const bytes=Buffer.alloc(TORUS_ATTACHMENT_CHUNK_BYTES,0x37),expected=Buffer.from(bytes),file=descriptor(bytes),staged=new Map();let writes=0,duplicates=0;
 const f=await fixture(t,{proxyOptions:{dropResponse:({index})=>{if(index!==3)return false;bytes.fill(0xa3);return true;}},readAttachmentChunks:async function*(){yield {index:0,data:bytes};},stageAttachmentChunk:async value=>{if(value.index<0)return;assert.deepEqual(value.data,expected);const key=value.id+'|'+value.descriptor.attachment_id+'|'+value.index;if(staged.has(key)){assert.deepEqual(value.data,staged.get(key));duplicates++;}else{staged.set(key,Buffer.from(value.data));writes++;}},receiveHook:async()=>{assert.equal(writes,1);assert.equal(duplicates,1);assert.equal(hash([...staged.values()][0]),file.sha256);}}),message=envelope(f.contexts[0],{attachments:[file]});
 const result=await f.services[0].deliver(message,f.contexts[0]);assert.equal(result.status,'DELIVERED');assert.equal(f.received.size,1);assert.equal(f.observed.length,1);assert.equal(f.socks.requests.length,8,'Only the lost chunk is retried through two hops');assert.equal(writes,1);assert.equal(duplicates,1);
});
test('TORUS-PEER recoverable chunk failures stop after bounded retries and never submit final mail',{timeout:10000},async t=>{
 const file=descriptor(Buffer.from('Fixture bytes')),f=await fixture(t,{refuse:true,readAttachmentChunks:async function*(){yield {index:0,data:Buffer.from('Fixture bytes')};},stageAttachmentChunk:async()=>{assert.fail('No receiver is reachable');}}),message=envelope(f.contexts[0],{attachments:[file]});assert.equal((await f.services[0].deliver(message,f.contexts[0])).status,'FAILED');assert.equal(f.socks.requests.length,TORUS_PEER_LIMITS.attachment_attempts);assert.equal(f.received.size,0);assert.equal(f.observed.length,0);
});
test('TORUS-PEER authentication failures are not chunk retries and lost final mail ACK remains uncertain',{timeout:10000},async t=>{
 const bytes=Buffer.alloc(31,0x41),file=descriptor(bytes),bad=await fixture(t,{readAttachmentChunks:async function*(){yield {index:0,data:bytes};},stageAttachmentChunk:async value=>{if(value.index>=0)value.data.fill(0x42);}}),badMessage=envelope(bad.contexts[0],{attachments:[file]});assert.equal((await bad.services[0].deliver(badMessage,bad.contexts[0])).status,'FAILED');assert.equal(bad.socks.requests.length,4,'A signed chunk hash differing from the original bytes is refused immediately');assert.equal(bad.received.size,0);
 const lost=await fixture(t,{proxyOptions:{dropResponse:({index})=>index===5},readAttachmentChunks:async function*(){yield {index:0,data:bytes};},stageAttachmentChunk:async()=>{}}),message=envelope(lost.contexts[0],{attachments:[file]});assert.equal((await lost.services[0].deliver(message,lost.contexts[0])).status,'UNKNOWN');assert.equal(lost.received.size,1);assert.equal(lost.observed.length,1);assert.equal(lost.socks.requests.length,6,'The final mail envelope is never automatically submitted again');
});
test('TORUS-PEER an authenticated chunk body may arrive slower than the former receive cutoff within its exchange budget',{timeout:10000},async t=>{
 // Scale the actual createServer deadlines by 100: old 15s receive / 90s
 // exchange becomes 150ms / 900ms. The encrypted body arrives over 300ms.
 const nativeCreateServer=http.createServer;let f;http.createServer=(options,listener)=>nativeCreateServer({...options,requestTimeout:Math.max(1,Math.floor(options.requestTimeout/100)),headersTimeout:Math.max(1,Math.floor(options.headersTimeout/100)),connectionsCheckingInterval:5},listener);
 const bytes=Buffer.alloc(TORUS_ATTACHMENT_CHUNK_BYTES,0x5a),file=descriptor(bytes);let staged=0;try{f=await fixture(t,{timeoutMs:TORUS_PEER_LIMITS.timeout_ms,stageAttachmentChunk:async value=>{staged++;assert.deepEqual(value.data,bytes);}});}finally{http.createServer=nativeCreateServer;}
 const message=envelope(f.contexts[0],{attachments:[file]}),packet=sealPeerAttachment(message,file,0,bytes,f.contexts[0]),value={version:1,payload:packet,hop:2,from_node:'n01',to_node:'n11',issued_at:Date.now(),nonce:randomBytes(16).toString('hex')},body=Buffer.from(JSON.stringify(sign('WORKSPACE391-TORUS-HOP/1',value,f.contexts[1].local.sign_private)));
 const fragmented=(port,host)=>new Promise((resolve,reject)=>{const request=http.request({host:'127.0.0.1',port,path:'/torus/v1/attachment',method:'POST',headers:{host,'content-type':'application/json','x-torus-peer':'1','content-length':body.length}},response=>{const parts=[];response.on('data',part=>parts.push(part));response.on('end',()=>resolve({status:response.statusCode,body:Buffer.concat(parts).toString('utf8')}));});request.on('error',reject);request.write(body.subarray(0,Math.floor(body.length/2)));const timer=setTimeout(()=>request.end(body.subarray(Math.floor(body.length/2))),300);request.on('close',()=>clearTimeout(timer));});
 const control=nativeCreateServer({requestTimeout:150,headersTimeout:100,connectionsCheckingInterval:5},(req,res)=>{req.resume();req.on('end',()=>{res.writeHead(200);res.end('Control completed');});});await new Promise(resolve=>control.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>control.close(resolve)));
 const old=await fragmented(control.address().port,f.contexts[2].local.onion).catch(error=>({status:0,error}));assert(old.status===408||old.status===0,'The former receive budget rejects this slow body');const reply=await fragmented(f.services[2].port,f.contexts[2].local.onion);assert.equal(reply.status,200);assert.equal(JSON.parse(reply.body).status,'STAGED');assert.equal(staged,1);assert.equal(f.received.size,0,'Staging an authenticated chunk alone does not submit mail');
});
test('TORUS-PEER failed or missing attachment chunks never submit the final mail envelope',{timeout:10000},async t=>{
 const bytes=Buffer.alloc(TORUS_ATTACHMENT_CHUNK_BYTES+1),file=descriptor(bytes),f=await fixture(t,{readAttachmentChunks:async function*(){yield {index:0,data:bytes.subarray(0,TORUS_ATTACHMENT_CHUNK_BYTES)};},stageAttachmentChunk:async()=>{}}),message=envelope(f.contexts[0],{attachments:[file]});assert.equal((await f.services[0].deliver(message,f.contexts[0])).status,'FAILED');assert.equal(f.received.size,0);assert.equal(f.observed.length,0);assert.equal(f.socks.requests.length,4);
});
test('TORUS-PEER empty files use authenticated prepare without allocating a file-sized buffer',{timeout:10000},async t=>{
 const file=descriptor(Buffer.alloc(0)),indices=[],f=await fixture(t,{readAttachmentChunks:async function*(){},stageAttachmentChunk:async value=>{indices.push(value.index);assert.equal(value.data.length,0);}}),message=envelope(f.contexts[0],{attachments:[file]});assert.equal((await f.services[0].deliver(message,f.contexts[0])).status,'DELIVERED');assert.deepEqual(indices,[-1]);assert.equal(f.socks.requests.length,4);
});

async function enrollmentFixture(t,{enroll,directory,timeoutMs=3000,proxyOptions={}}={}){
 const targets=new Map(),socks=await proxy(t,targets,proxyOptions),endpoint={onion:onion(),port:80},unexpected=()=>{assert.fail('Enrollment must work before a mail context exists');},noop=()=>null;
 const server=createTorusPeer({socksPort:socks.port,timeoutMs:Math.max(3000,timeoutMs),currentNetwork:unexpected,currentEndpoint:()=>endpoint,enroll,directory,receive:noop,lookupReceipt:noop});await server.start();targets.set(endpoint.onion,server.port);
 const client=createTorusPeer({socksPort:socks.port,timeoutMs,currentNetwork:unexpected,receive:noop,lookupReceipt:noop});t.after(async()=>{await client.close();await server.close();});return {server,client,endpoint,socks};
}
test('TORUS-PEER enrollment exchanges signed public records over SOCKS before a node is active',async t=>{
 const signedDirectory=network().directory,payload={version:1,invitation:{signed:'public invitation'},capability:'single use enrollment capability',card:{signed:'public card'}},query={version:1,network_id:signedDirectory.network_id,node_id:'n01',nonce:randomBytes(16).toString('hex'),created_at:Date.now(),signature:'participant signature'},observed=[];
 // A bounded larger reply proves enrollment is not limited to the mail receipt cap.
 const answer={directory:signedDirectory,padding:'x'.repeat(TORUS_PEER_LIMITS.response_bytes)},f=await enrollmentFixture(t,{enroll:async value=>{assert.deepEqual(value,payload);observed.push('enroll');return answer;},directory:async value=>{assert.deepEqual(value,query);observed.push('directory');return {directory:signedDirectory};}});
 assert.deepEqual(await f.client.enroll(f.endpoint,payload),answer);assert.deepEqual(await f.client.fetchDirectory(f.endpoint,query),{directory:signedDirectory});assert.deepEqual(observed,['enroll','directory']);assert.deepEqual(f.socks.requests,[f.endpoint,f.endpoint].map(value=>({host:value.onion,port:value.port})));
 assert.equal(f.server.status().pending,0);assert(!JSON.stringify(payload).includes('mailbox token'));
});
test('TORUS-PEER enrollment waits beyond the mail exchange deadline without submitting before CONNECT',{timeout:10_000},async t=>{
 const entered=deferred(),release=deferred();let calls=0,settled=false;const f=await enrollmentFixture(t,{timeoutMs:20,proxyOptions:{beforeReply:()=>{entered.resolve();return release.promise;}},enroll:value=>{calls++;return {directory:{accepted:value.card}};}}),input={version:1,invitation:{signed:'owned fixture grant'},capability:'owned fixture capability',card:{signed:'stable card'}},sending=f.client.enroll(f.endpoint,input);
 void sending.then(()=>{settled=true;},()=>{settled=true;});await entered.promise;await new Promise(resolve=>setTimeout(resolve,100));assert.equal(settled,false,'Enrollment has no replacement total handshake deadline');assert.equal(calls,0,'No enrollment mutation occurs before the private connection is ready');release.resolve();assert.deepEqual(await sending,{directory:{accepted:input.card}});assert.equal(calls,1);assert.equal(f.socks.requests.length,1);
});
test('TORUS-PEER retries unpublished onion descriptors with one immutable enrollment and no total cutoff',{timeout:10_000},async t=>{
 const first=deferred(),input={version:1,invitation:{signed:'original grant'},capability:'original capability',card:{signed:'original card'}},expected=structuredClone(input);let calls=0;const f=await enrollmentFixture(t,{timeoutMs:20,proxyOptions:{refuse:({index})=>{if(index===0)first.resolve();return index<2?0xf0:false;}},enroll:value=>{calls++;assert.deepEqual(value,expected);return {directory:{admitted:true}};}}),peer={...f.endpoint},sending=f.client.enroll(peer,input);
 await first.promise;input.card.signed='caller changed the draft';peer.onion=onion();assert.deepEqual(await sending,{directory:{admitted:true}});assert.equal(calls,1);assert.equal(f.socks.requests.length,3);assert(f.socks.requests.every(value=>value.host===f.endpoint.onion&&value.port===80));
});
test('TORUS-PEER directory query is refreshed only after a delayed CONNECT, keeping authentication fresh',{timeout:10_000},async t=>{
 const entered=deferred(),release=deferred(),original={version:1,network_id:'a'.repeat(32),node_id:'n01',nonce:'b'.repeat(32),created_at:1,signature:'initial signature'};let refreshed=0,observed;const f=await enrollmentFixture(t,{timeoutMs:20,proxyOptions:{beforeReply:()=>{entered.resolve();return release.promise;}},directory:value=>{observed=value;return {directory:{revision:2}};}}),sending=f.client.fetchDirectory(f.endpoint,original,{refreshRequest:()=>{refreshed++;return {...original,nonce:'c'.repeat(32),created_at:Date.now(),signature:'fresh signature'};}});
 await entered.promise;await new Promise(resolve=>setTimeout(resolve,100));assert.equal(refreshed,0);assert.equal(observed,undefined);release.resolve();assert.deepEqual(await sending,{directory:{revision:2}});assert.equal(refreshed,1);assert.equal(observed.signature,'fresh signature');assert.equal(observed.nonce,'c'.repeat(32));assert(observed.created_at>original.created_at);
});
test('TORUS-PEER closing cancels a waiting CONNECT and retry backoff before any enrollment mutation',{timeout:10_000},async t=>{
 const entered=deferred(),release=deferred();let calls=0;const held=await enrollmentFixture(t,{timeoutMs:20,proxyOptions:{beforeReply:()=>{entered.resolve();return release.promise;}},enroll:()=>{calls++;return {directory:{}};}}),waiting=held.client.enroll(held.endpoint,{}),rejected=assert.rejects(waiting,error=>error.code==='TORUS_CLOSED');await entered.promise;await held.client.close();await rejected;release.resolve();assert.equal(calls,0);
 const refused=deferred(),retry=await enrollmentFixture(t,{proxyOptions:{refuse:()=>{refused.resolve();return 0xf0;}},enroll:()=>{calls++;return {directory:{}};}}),backoff=retry.client.enroll(retry.endpoint,{}),cancelled=assert.rejects(backoff,error=>error.code==='TORUS_CLOSED');await refused.promise;await new Promise(resolve=>setImmediate(resolve));await retry.client.close();await cancelled;const attempts=retry.socks.requests.length;await new Promise(resolve=>setTimeout(resolve,TORUS_ENROLLMENT_LIMITS.retry_initial_ms+30));assert.equal(retry.socks.requests.length,attempts,'Closing leaves no later retry timer');assert.equal(calls,0);
});
test('TORUS-PEER missing onion authorization and HTTP authentication refusals are never retried',{timeout:10_000},async t=>{
 let calls=0;const denied=await enrollmentFixture(t,{proxyOptions:{refuse:0xf4},enroll:()=>{calls++;return {directory:{}};}});await assert.rejects(denied.client.enroll(denied.endpoint,{}),error=>error.socksReply===0xf4&&!error.retryableSocks);assert.equal(denied.socks.requests.length,1);assert.equal(calls,0);
 const refused=await enrollmentFixture(t,{enroll:()=>{calls++;throw Error('Fixture authority refused admission');}});await assert.rejects(refused.client.enroll(refused.endpoint,{}));assert.equal(refused.socks.requests.length,1);assert.equal(calls,1);
});
test('TORUS-PEER refresh transfers a verified expanded directory exceeding the former 64 KiB reply cap',{timeout:15_000},async t=>{
 const coordinates=['n00',...Array.from({length:63},(_,index)=>'v'+(0x030001+index).toString(16).padStart(6,'0'))],signedDirectory=network(coordinates).directory;validateTorusDirectory(signedDirectory);
 const answer={directory:signedDirectory},bytes=Buffer.byteLength(JSON.stringify(answer));assert(bytes>65_536);assert(bytes<TORUS_ENROLLMENT_LIMITS.response_bytes);
 const query={version:1,network_id:signedDirectory.network_id,node_id:coordinates[1],nonce:randomBytes(16).toString('hex'),created_at:Date.now(),signature:'Signed query validation belongs to enrollment service'},f=await enrollmentFixture(t,{directory:value=>{assert.deepEqual(value,query);return answer;}});
 const result=await f.client.fetchDirectory(f.endpoint,query);assert.deepEqual(result,answer);validateTorusDirectory(result.directory);assert.deepEqual(f.socks.requests,[{host:f.endpoint.onion,port:80}]);
});
test('TORUS-PEER enrollment rejects unknown routes, wrong origin/host, nonobject and oversized requests',async t=>{
 let calls=0;const f=await enrollmentFixture(t,{enroll:()=>{calls++;return {directory:{}};},directory:()=>({directory:{}})});
 for(const [path,body,host,headers]of [
  ['/api/bootstrap',{},f.endpoint.onion,{}],['/torus/v1/enroll?alternate=1',{},f.endpoint.onion,{}],['/torus/v1/enroll',{},'localhost',{}],['/torus/v1/enroll',{},f.endpoint.onion,{origin:'http://127.0.0.1'}],['/torus/v1/enroll',null,f.endpoint.onion,{}],['/torus/v1/enroll',[],f.endpoint.onion,{}],['/torus/v1/enroll','capability',f.endpoint.onion,{}],['/torus/v1/enroll',{oversized:'x'.repeat(TORUS_ENROLLMENT_LIMITS.request_bytes)},f.endpoint.onion,{}]
 ]){const result=await post(f.server.port,host,path,body,headers);assert.equal(result.status,403);assert.deepEqual(result.value,{error:'TORUS_PEER_REFUSED'});}
 assert.equal(calls,0);await assert.rejects(f.client.enroll({onion:'example.org',port:80},{}));await assert.rejects(f.client.enroll(f.endpoint,{oversized:'x'.repeat(TORUS_ENROLLMENT_LIMITS.request_bytes)}));await assert.rejects(f.client.fetchDirectory(f.endpoint,[]));assert.equal(f.socks.requests.length,0,'Rejected input never opens a Tor connection');
});
test('TORUS-PEER enrollment endpoints remain denied without explicit handlers and cap callback replies',async t=>{
 const absent=await enrollmentFixture(t);assert.equal((await post(absent.server.port,absent.endpoint.onion,'/torus/v1/enroll',{})).status,403);assert.equal((await post(absent.server.port,absent.endpoint.onion,'/torus/v1/directory',{})).status,403);
 const huge=await enrollmentFixture(t,{enroll:()=>({directory:{oversized:'x'.repeat(TORUS_ENROLLMENT_LIMITS.response_bytes)}})});const reply=await post(huge.server.port,huge.endpoint.onion,'/torus/v1/enroll',{});assert.equal(reply.status,403);assert.deepEqual(reply.value,{error:'TORUS_PEER_REFUSED'});await assert.rejects(huge.client.enroll(huge.endpoint,{}));
});
test('TORUS-PEER enrollment shares the fixed admission concurrency bound',{timeout:10_000},async t=>{
 const entered=deferred(),hold=deferred();let calls=0;const f=await enrollmentFixture(t,{enroll:async()=>{if(++calls===TORUS_PEER_LIMITS.pending)entered.resolve();await hold.promise;return {directory:{}};}}),pending=Array.from({length:TORUS_PEER_LIMITS.pending},()=>post(f.server.port,f.endpoint.onion,'/torus/v1/enroll',{}));await entered.promise;
 const busy=await post(f.server.port,f.endpoint.onion,'/torus/v1/enroll',{});assert.equal(busy.status,429);assert.deepEqual(busy.value,{error:'TORUS_BUSY'});assert.equal(calls,TORUS_PEER_LIMITS.pending);hold.resolve();assert((await Promise.all(pending)).every(value=>value.status===200));
});
test('TORUS-PEER close cancels enrollment transport but waits for an authorized admission',{timeout:10_000},async t=>{
 const entered=deferred(),hold=deferred();let committed=0;const f=await enrollmentFixture(t,{enroll:async()=>{entered.resolve();await hold.promise;committed++;return {directory:{}};}}),result=f.client.enroll(f.endpoint,{});const rejected=assert.rejects(result);await entered.promise;
 let stopped=false;const stopping=f.server.close().then(()=>{stopped=true;});await new Promise(resolve=>setImmediate(resolve));assert.equal(stopped,false);await f.client.close();await rejected;hold.resolve();await stopping;assert.equal(committed,1);assert.equal(f.server.status().listening,false);assert.equal(f.client.close(),f.client.close(),'Stopping is idempotent');await assert.rejects(f.client.enroll(f.endpoint,{}));
});
