/** Private node-to-node mailbox transport. Onion names are sent only to a local
 * SOCKS5 proxy. The peer listener never exposes the workspace vault or UI. */
import http from 'node:http';
import net from 'node:net';
import {randomBytes,generateKeyPairSync,createPrivateKey,createPublicKey,diffieHellman,hkdfSync,createCipheriv,createDecipheriv,createHash} from 'node:crypto';
import {canonical,hash,signature,verifySignature} from './crypto.mjs';
import {demand,MailError,DEFAULTS} from './policy.mjs';
import {validateTorusDirectory,addressNode} from './torus-mail.mjs';
import {torusDirectoryNeighbors} from './torus-topology.mjs';

export const TORUS_PEER_LIMITS=Object.freeze({packet_bytes:1_500_000,plain_bytes:1_050_000,response_bytes:16_384,header_bytes:8192,pending:4,connections:12,timeout_ms:90_000,ttl_ms:180_000,skew_ms:120_000,attachment_attempts:3});
/** Enrollment contains public signed records plus a single-use capability. It
 * needs neither a mailbox token nor an already active mail directory. */
// Expanded signed directories contain up to 256 computer cards. Enrollment and
// directory refresh have a separate bounded reply allowance; mail/chunk replies
// remain small and attachments continue to stream one chunk at a time.
export const TORUS_ENROLLMENT_LIMITS=Object.freeze({request_bytes:32_768,response_bytes:1_048_576,retry_initial_ms:250,retry_max_ms:5000});
export const TORUS_ATTACHMENT_CHUNK_BYTES=256*1024;
const DOMAIN={packet:'WORKSPACE391-TORUS-PACKET/1',hop:'WORKSPACE391-TORUS-HOP/1',envelope:'WORKSPACE391-TORUS-ENVELOPE/1',receipt:'WORKSPACE391-TORUS-RECEIPT/1',query:'WORKSPACE391-TORUS-QUERY/1'};
const envelopeKeys=['version','network_id','id','from','to','subject','body','attachments','sender_node','recipient_node','digest','route','created_at','signature'];
const packetKeys=['version','network_id','id','digest','sender_node','recipient_node','route','created_at','expires_at','ephemeral','nonce','ciphertext','signature'];
const receiptKeys=['version','network_id','id','digest','sender_node','recipient_node','status','delivery_id','received_at','signature'];
const queryKeys=['version','network_id','id','digest','sender_node','recipient_node','created_at','signature'];
const descriptorKeys=['name','type','attachment_id','size','sha256','chunk_size','chunk_count'];
const exact=(value,keys)=>value&&Object.getPrototypeOf(value)===Object.prototype&&Object.keys(value).sort().join(',')===[...keys].sort().join(',');
const withoutSignature=({signature:ignored,...value})=>value;
const refuse=(ok)=>demand(ok,'TORUS_AUTH','Private peer authentication failed',403);
function publicBox(pem){const key=createPublicKey(pem);refuse(key.asymmetricKeyType==='x25519');return key;}
function privateBox(pem){const key=createPrivateKey(pem);refuse(key.asymmetricKeyType==='x25519');return key;}
function canonical64(value,max){refuse(typeof value==='string'&&value.length<=Math.ceil(max/3)*4);const bytes=Buffer.from(value,'base64');refuse(bytes.length<=max&&bytes.toString('base64')===value);return bytes;}
export function validOnionName(name){
 if(typeof name!=='string'||!/^[a-z2-7]{56}\.onion$/.test(name))return false;
 let accumulator=0,bits=0;const bytes=[];for(const ch of name.slice(0,56)){accumulator=(accumulator<<5)|'abcdefghijklmnopqrstuvwxyz234567'.indexOf(ch);bits+=5;if(bits>=8){bits-=8;bytes.push((accumulator>>>bits)&255);}}
 const address=Buffer.from(bytes);if(address.length!==35||address[34]!==3)return false;
 const checksum=createHash('sha3-256').update(Buffer.concat([Buffer.from('.onion checksum'),address.subarray(0,32),Buffer.from([3])])).digest().subarray(0,2);
 return checksum.equals(address.subarray(32,34));
}
function context(value){
 refuse(value&&value.directory&&value.local);validateTorusDirectory(value.directory);
 const {directory,local}=value,card=directory.nodes.find(node=>node.node_id===local.node_id);
 refuse(card&&card.sign_public===local.sign_public&&card.box_public===local.box_public&&card.onion===local.onion&&card.port===local.port);
 refuse(signature('WORKSPACE391-TORUS-KEY-CHECK/1',{},local.sign_private)&&createPublicKey(local.sign_private).export({type:'spki',format:'pem'})===local.sign_public);
 refuse(createPublicKey(privateBox(local.box_private)).export({type:'spki',format:'pem'})===local.box_public);
 return value;
}
function routeCheck(directory,value){
 refuse(value.version===1&&value.network_id===directory.network_id&&typeof value.id==='string'&&/^[a-f0-9]{32}$/.test(value.id)&&typeof value.digest==='string'&&/^[a-f0-9]{64}$/.test(value.digest));
 const source=directory.nodes.find(node=>node.node_id===value.sender_node),destination=directory.nodes.find(node=>node.node_id===value.recipient_node);
 refuse(source&&destination&&Array.isArray(value.route)&&value.route.length>=2&&value.route.length<=directory.nodes.length&&new Set(value.route).size===value.route.length&&value.route[0]===value.sender_node&&value.route.at(-1)===value.recipient_node);
 for(let i=0;i<value.route.length;i++){const current=directory.nodes.find(node=>node.node_id===value.route[i]);refuse(current);if(i)refuse(torusDirectoryNeighbors(directory,value.route[i-1]).includes(current.node_id));}
 return {source,destination};
}
export function validatePeerEnvelope(envelope,directory){
 refuse(exact(envelope,envelopeKeys));const peers=routeCheck(directory,envelope);
 refuse(addressNode(directory,envelope.from)?.node_id===envelope.sender_node&&addressNode(directory,envelope.to)?.node_id===envelope.recipient_node);
 refuse(typeof envelope.subject==='string'&&envelope.subject.isWellFormed()&&!/[\x00-\x1f\x7f]/.test(envelope.subject)&&Buffer.byteLength(envelope.subject)<=512&&typeof envelope.body==='string'&&envelope.body.isWellFormed()&&!envelope.body.includes('\0')&&Buffer.byteLength(envelope.body)<=DEFAULTS.max_body_bytes);
 refuse(Array.isArray(envelope.attachments)&&envelope.attachments.length<=1000&&Number.isSafeInteger(envelope.created_at)&&envelope.created_at>=0);
 let total=0,inline=0;for(const attachment of envelope.attachments){if(attachment?.attachment_id!==undefined){validatePeerAttachmentDescriptor(attachment);continue;}refuse(++inline<=4&&attachment&&typeof attachment.name==='string'&&attachment.name.length>0&&attachment.name.length<=120&&!/[\x00-\x1f\x7f/\\]/.test(attachment.name));total+=canonical64(attachment.data,DEFAULTS.max_attachment_bytes).length;}
 refuse(total<=DEFAULTS.max_attachment_bytes);
 const content={network_id:envelope.network_id,id:envelope.id,from:envelope.from,to:envelope.to,subject:envelope.subject,body:envelope.body,attachments:envelope.attachments,sender_node:envelope.sender_node,recipient_node:envelope.recipient_node,created_at:envelope.created_at};
 refuse(envelope.digest===hash('WORKSPACE391-TORUS-CONTENT/1\n'+canonical(content))&&verifySignature(DOMAIN.envelope,withoutSignature(envelope),envelope.signature,peers.source.sign_public));return peers;
}
function packetHeader(packet){const {ciphertext,signature:ignored,...header}=packet;return header;}
function boxKey(privateKey,publicKey,header){return Buffer.from(hkdfSync('sha256',diffieHellman({privateKey,publicKey}),Buffer.from(hash(header.network_id),'hex'),Buffer.from('WORKSPACE391-TORUS-BOX/1\n'+canonical(header)),32));}
export function validatePeerAttachmentDescriptor(value){
 refuse(exact(value,descriptorKeys)&&typeof value.name==='string'&&value.name.isWellFormed()&&value.name.trim().length>0&&value.name.length<=120&&!/[\x00-\x1f\x7f/\\]/.test(value.name)&&!['.','..'].includes(value.name)&&value.type==='application/octet-stream'&&typeof value.attachment_id==='string'&&/^[a-f0-9]{32}$/.test(value.attachment_id)&&Number.isSafeInteger(value.size)&&value.size>=0&&typeof value.sha256==='string'&&/^[a-f0-9]{64}$/.test(value.sha256)&&value.chunk_size===TORUS_ATTACHMENT_CHUNK_BYTES&&value.chunk_count===Math.ceil(value.size/TORUS_ATTACHMENT_CHUNK_BYTES));return value;
}
function sealPayload(payload,ctx,now,extras={}){
 const {destination}=routeCheck(ctx.directory,payload),ephemeral=generateKeyPairSync('x25519'),header={version:1,network_id:payload.network_id,id:payload.id,digest:payload.digest,sender_node:payload.sender_node,recipient_node:payload.recipient_node,route:payload.route,created_at:now,expires_at:now+TORUS_PEER_LIMITS.ttl_ms,ephemeral:ephemeral.publicKey.export({type:'spki',format:'pem'}),nonce:randomBytes(12).toString('base64'),...extras};
 const key=boxKey(ephemeral.privateKey,publicBox(destination.box_public),header);let ciphertext;try{const cipher=createCipheriv('aes-256-gcm',key,Buffer.from(header.nonce,'base64'));cipher.setAAD(Buffer.from(canonical(header)));const plain=Buffer.from(canonical(payload));refuse(plain.length<=TORUS_PEER_LIMITS.plain_bytes);ciphertext=Buffer.concat([cipher.update(plain),cipher.final(),cipher.getAuthTag()]).toString('base64');}finally{key.fill(0);}
 const packet={...header,ciphertext};return {...packet,signature:signature(DOMAIN.packet,packet,ctx.local.sign_private)};
}
export function sealPeerEnvelope(envelope,{directory,local},now=Date.now()){
 context({directory,local});validatePeerEnvelope(envelope,directory);refuse(local.node_id===envelope.sender_node&&envelope.created_at<=now+TORUS_PEER_LIMITS.skew_ms);return sealPayload(envelope,{directory,local},now);
}
export function validatePeerPacket(packet,directory,now=Date.now()){
 refuse(exact(packet,packet.kind==='attachment'?[...packetKeys,'kind','attachment_id','chunk_index']:packetKeys));const peers=routeCheck(directory,packet);
 if(packet.kind==='attachment')refuse(typeof packet.attachment_id==='string'&&/^[a-f0-9]{32}$/.test(packet.attachment_id)&&Number.isSafeInteger(packet.chunk_index)&&packet.chunk_index>=-1);
 refuse(Number.isSafeInteger(packet.created_at)&&packet.created_at>=0&&packet.created_at<=now+TORUS_PEER_LIMITS.skew_ms&&packet.expires_at===packet.created_at+TORUS_PEER_LIMITS.ttl_ms&&packet.expires_at>=now);
 refuse(typeof packet.ephemeral==='string'&&packet.ephemeral.length<=256);publicBox(packet.ephemeral);refuse(canonical64(packet.nonce,12).length===12);refuse(canonical64(packet.ciphertext,TORUS_PEER_LIMITS.plain_bytes+16).length>=16);
 refuse(verifySignature(DOMAIN.packet,withoutSignature(packet),packet.signature,peers.source.sign_public));return peers;
}
function openPayload(packet,{directory,local},now=Date.now()){
 context({directory,local});validatePeerPacket(packet,directory,now);refuse(packet.recipient_node===local.node_id);
 const header=packetHeader(packet),key=boxKey(privateBox(local.box_private),publicBox(packet.ephemeral),header),encrypted=canonical64(packet.ciphertext,TORUS_PEER_LIMITS.plain_bytes+16);
 let envelope;try{const decipher=createDecipheriv('aes-256-gcm',key,Buffer.from(packet.nonce,'base64'));decipher.setAAD(Buffer.from(canonical(header)));decipher.setAuthTag(encrypted.subarray(-16));const plain=Buffer.concat([decipher.update(encrypted.subarray(0,-16)),decipher.final()]);envelope=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(plain));}finally{key.fill(0);}
 for(const field of ['network_id','id','digest','sender_node','recipient_node'])refuse(envelope[field]===packet[field]);refuse(canonical(envelope.route)===canonical(packet.route));return envelope;
}
export function openPeerEnvelope(packet,ctx,now=Date.now()){
 refuse(packet.kind===undefined);const envelope=openPayload(packet,ctx,now);validatePeerEnvelope(envelope,ctx.directory);refuse(envelope.created_at<=packet.created_at+TORUS_PEER_LIMITS.skew_ms);return envelope;
}
export function sealPeerAttachment(envelope,descriptor,index,data,ctx,now=Date.now()){
 context(ctx);validatePeerEnvelope(envelope,ctx.directory);validatePeerAttachmentDescriptor(descriptor);refuse(ctx.local.node_id===envelope.sender_node&&envelope.attachments.some(item=>canonical(item)===canonical(descriptor)));
 refuse(Buffer.isBuffer(data)&&Number.isSafeInteger(index)&&index>=-1&&index<descriptor.chunk_count&&(index>=0||data.length===0));if(index>=0)refuse(data.length===Math.min(descriptor.chunk_size,descriptor.size-index*descriptor.chunk_size));
 const payload={version:1,network_id:envelope.network_id,id:envelope.id,digest:envelope.digest,sender_node:envelope.sender_node,recipient_node:envelope.recipient_node,route:envelope.route,from:envelope.from,to:envelope.to,descriptor,index,data:data.toString('base64')};return sealPayload(payload,ctx,now,{kind:'attachment',attachment_id:descriptor.attachment_id,chunk_index:index});
}
export function openPeerAttachment(packet,ctx,now=Date.now()){
 refuse(packet.kind==='attachment');const value=openPayload(packet,ctx,now);refuse(exact(value,['version','network_id','id','digest','sender_node','recipient_node','route','from','to','descriptor','index','data'])&&value.version===1);validatePeerAttachmentDescriptor(value.descriptor);
 refuse(value.descriptor.attachment_id===packet.attachment_id&&value.index===packet.chunk_index&&value.index<value.descriptor.chunk_count&&addressNode(ctx.directory,value.from).node_id===value.sender_node&&addressNode(ctx.directory,value.to).node_id===value.recipient_node);
 const data=canonical64(value.data,TORUS_ATTACHMENT_CHUNK_BYTES);refuse(value.index===-1?data.length===0:data.length===Math.min(value.descriptor.chunk_size,value.descriptor.size-value.index*value.descriptor.chunk_size));return {...value,data};
}
export function validatePeerReceipt(receipt,envelope,directory){
 refuse(exact(receipt,receiptKeys)&&receipt.version===1&&receipt.status==='DELIVERED'&&typeof receipt.delivery_id==='string'&&/^[a-f0-9]{32}$/.test(receipt.delivery_id)&&Number.isSafeInteger(receipt.received_at)&&receipt.received_at>=0);
 for(const field of ['network_id','id','digest','sender_node','recipient_node'])refuse(receipt[field]===envelope[field]);const peer=directory.nodes.find(node=>node.node_id===receipt.recipient_node);refuse(peer&&verifySignature(DOMAIN.receipt,withoutSignature(receipt),receipt.signature,peer.sign_public));return receipt;
}
function wrapper(payload,hop,local,now){const value={version:1,payload,hop,from_node:local.node_id,to_node:payload.route[hop],issued_at:now,nonce:randomBytes(16).toString('hex')};return {...value,signature:signature(DOMAIN.hop,value,local.sign_private)};}
function validateWrapper(value,ctx,kind,now){
 refuse(exact(value,['version','payload','hop','from_node','to_node','issued_at','nonce','signature'])&&value.version===1&&Number.isSafeInteger(value.hop)&&value.hop>0&&Number.isSafeInteger(value.issued_at)&&Math.abs(now-value.issued_at)<=TORUS_PEER_LIMITS.skew_ms&&typeof value.nonce==='string'&&/^[a-f0-9]{32}$/.test(value.nonce));
 const payload=value.payload;refuse(payload&&value.hop<payload.route?.length);const peers=routeCheck(ctx.directory,payload);
 refuse(value.to_node===ctx.local.node_id&&value.to_node===payload.route[value.hop]&&value.from_node===payload.route[value.hop-1]);const previous=ctx.directory.nodes.find(node=>node.node_id===value.from_node);
 refuse(previous&&verifySignature(DOMAIN.hop,withoutSignature(value),value.signature,previous.sign_public));
 if(kind!=='receipt'){validatePeerPacket(payload,ctx.directory,now);refuse(kind==='attachment'?payload.kind==='attachment':payload.kind===undefined);}else refuse(exact(payload,[...queryKeys,'route'])&&Number.isSafeInteger(payload.created_at)&&Math.abs(now-payload.created_at)<=TORUS_PEER_LIMITS.skew_ms&&verifySignature(DOMAIN.query,withoutSignature(payload),payload.signature,peers.source.sign_public));return payload;
}
function validateChunkAck(receipt,packet,directory,expectedHash=null){
 refuse(exact(receipt,['version','network_id','id','digest','sender_node','recipient_node','status','attachment_id','index','chunk_hash','received_at','signature'])&&receipt.version===1&&receipt.status==='STAGED'&&receipt.attachment_id===packet.attachment_id&&receipt.index===packet.chunk_index&&typeof receipt.chunk_hash==='string'&&/^[a-f0-9]{64}$/.test(receipt.chunk_hash)&&Number.isSafeInteger(receipt.received_at)&&receipt.received_at>=0&&(expectedHash===null||receipt.chunk_hash===expectedHash));
 for(const field of ['network_id','id','digest','sender_node','recipient_node'])refuse(receipt[field]===packet[field]);const destination=directory.nodes.find(node=>node.node_id===packet.recipient_node);refuse(destination&&verifySignature('WORKSPACE391-TORUS-CHUNK-ACK/1',withoutSignature(receipt),receipt.signature,destination.sign_public));return receipt;
}
function reader(socket,max){let bytes=Buffer.alloc(0),waiting=null,failure=null;const wake=()=>{if(waiting){const action=waiting;waiting=null;action();}};socket.on('data',chunk=>{if(bytes.length+chunk.length>max){failure=Error('BOUND');socket.destroy();}else bytes=Buffer.concat([bytes,chunk]);wake();});socket.on('error',()=>{failure=Error('CONNECTION');wake();});socket.on('close',()=>{failure??=Error('CONNECTION');wake();});return {async need(n){while(bytes.length<n){if(failure)throw failure;await new Promise(resolve=>{waiting=resolve;});}const part=bytes.subarray(0,n);bytes=bytes.subarray(n);return part;},async header(){while(true){const end=bytes.indexOf('\r\n\r\n');if(end>=0){refuse(end<=TORUS_PEER_LIMITS.header_bytes);return this.need(end+4);}refuse(bytes.length<=TORUS_PEER_LIMITS.header_bytes);if(failure)throw failure;await new Promise(resolve=>{waiting=resolve;});}}};}
/** A domain-address SOCKS5 CONNECT followed by a bounded single HTTP exchange.
 * No HTTP agent, DNS resolver, redirect handling or direct fallback is used. */
async function onionRequest(peer,route,body,{socksPort,sockets,clock,timeoutMs,refreshRequest=null,requestBytes=TORUS_PEER_LIMITS.packet_bytes,responseBytes=TORUS_PEER_LIMITS.response_bytes}){
 refuse(peer&&validOnionName(peer.onion)&&Number.isSafeInteger(peer.port)&&peer.port>0&&peer.port<=65535);let text=Buffer.from(JSON.stringify(body));refuse(text.length<=requestBytes);
 const socket=new net.Socket();sockets.add(socket);let submitted=false,timedOut=false;const input=reader(socket,responseBytes+TORUS_PEER_LIMITS.header_bytes+512),timer=timeoutMs===null?null:setTimeout(()=>{timedOut=true;socket.destroy();},timeoutMs);timer?.unref?.();
 try{
  await new Promise((resolve,reject)=>{socket.once('connect',resolve);socket.once('error',reject);socket.once('close',()=>reject(Error('CONNECTION')));socket.connect({host:'127.0.0.1',port:socksPort});});socket.setNoDelay(true);
  socket.write(Buffer.from([5,1,0]));const greeting=await input.need(2);refuse(greeting[0]===5&&greeting[1]===0);
  const host=Buffer.from(peer.onion,'ascii'),port=Buffer.alloc(2);port.writeUInt16BE(peer.port);socket.write(Buffer.concat([Buffer.from([5,1,0,3,host.length]),host,port]));
  const reply=await input.need(4);refuse(reply[0]===5&&reply[2]===0&&[1,3,4].includes(reply[3]));
  if(reply[1]!==0){const error=Error('The private onion service is not reachable yet');error.socksReply=reply[1];
   // Tor descriptor publication/introduction/rendezvous failures can recover.
   // Missing/wrong client authorization, invalid descriptors/addresses and
   // unsupported SOCKS operations remain refusals, never a weaker fallback.
   error.retryableSocks=[1,3,4,5,6,0xf0,0xf2,0xf3,0xf7].includes(reply[1]);throw error;
  }
  if(reply[3]===1)await input.need(6);else if(reply[3]===4)await input.need(18);else{const count=(await input.need(1))[0];await input.need(count+2);}
  // Directory queries are signed after CONNECT so a long publication wait
  // cannot make the coordinator's short authentication freshness check expire.
  if(refreshRequest){const refreshed=await refreshRequest();refuse(refreshed&&Object.getPrototypeOf(refreshed)===Object.prototype);text=Buffer.from(JSON.stringify(refreshed));refuse(text.length<=requestBytes);}
  const head=Buffer.from('POST '+route+' HTTP/1.1\r\nHost: '+peer.onion+(peer.port===80?'':':'+peer.port)+'\r\nContent-Type: application/json\r\nX-Torus-Peer: 1\r\nContent-Length: '+text.length+'\r\nConnection: close\r\n\r\n');submitted=true;socket.write(head);socket.write(text);
  const response=(await input.header()).toString('ascii'),lines=response.trimEnd().split('\r\n'),status=/^HTTP\/1\.1 ([1-5][0-9]{2})(?: |$)/.exec(lines.shift());refuse(status);if(status[1]!=='200'){const error=Error('Private peer HTTP exchange refused');error.statusCode=Number(status[1]);error.retryableTransport=[408,429,502,503,504].includes(error.statusCode);throw error;}const fields=new Map();for(const line of lines){const split=line.indexOf(':');refuse(split>0);const name=line.slice(0,split).toLowerCase();refuse(!fields.has(name));fields.set(name,line.slice(split+1).trim());}
  refuse(!fields.has('transfer-encoding')&&fields.get('content-type')==='application/json'&&/^(0|[1-9][0-9]*)$/.test(fields.get('content-length')??''));const length=Number(fields.get('content-length'));refuse(length<=responseBytes);return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await input.need(length)));
 }catch(error){const failure=Error('Private peer exchange failed');failure.submitted=submitted;failure.retryableSocks=!submitted&&error.retryableSocks===true;failure.socksReply=error.socksReply??null;failure.retryableTransport=failure.retryableSocks||timedOut||error.retryableTransport===true||error.message==='CONNECTION'||['ECONNREFUSED','ECONNRESET','EPIPE','ETIMEDOUT'].includes(error.code);failure.transportReason=timedOut?'EXCHANGE_TIMEOUT':error.statusCode===408?'HTTP_TIMEOUT':error.statusCode?'HTTP_REFUSED':failure.retryableSocks?'SOCKS_UNAVAILABLE':failure.retryableTransport?'CONNECTION_LOST':'PEER_REFUSED';throw failure;}finally{if(timer)clearTimeout(timer);sockets.delete(socket);socket.destroy();}
}
function readRequest(req,maxBytes=TORUS_PEER_LIMITS.packet_bytes){return new Promise((resolve,reject)=>{const parts=[];let length=0;req.on('data',chunk=>{length+=chunk.length;if(length>maxBytes){reject(Error('BOUND'));req.destroy();return;}parts.push(chunk);});req.on('end',()=>{try{resolve(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(parts))));}catch{reject(Error('JSON'));}});req.on('error',reject);req.on('aborted',()=>reject(Error('CONNECTION')));});}
export function createTorusPeer({currentNetwork,currentEndpoint=null,enroll=null,directory=null,receive,lookupReceipt,readAttachmentChunks=null,stageAttachmentChunk=null,socksPort=9050,listenPort=0,clock=Date.now,timeoutMs=TORUS_PEER_LIMITS.timeout_ms}={}){
 demand(typeof currentNetwork==='function'&&typeof receive==='function'&&typeof lookupReceipt==='function','TORUS_PEER_CONFIG','Private mail callbacks are required');
 demand(Number.isSafeInteger(socksPort)&&socksPort>0&&socksPort<=65535&&Number.isSafeInteger(listenPort)&&listenPort>=0&&listenPort<=65535&&Number.isSafeInteger(timeoutMs)&&timeoutMs>0&&timeoutMs<=TORUS_PEER_LIMITS.timeout_ms,'TORUS_PEER_CONFIG','Invalid local private-mail ports');
 demand((currentEndpoint===null||typeof currentEndpoint==='function')&&(enroll===null||typeof enroll==='function')&&(directory===null||typeof directory==='function'),'TORUS_PEER_CONFIG','Invalid private network enrollment callbacks');
 const outbound=new Set(),incoming=new Set(),jobs=new Set(),exchanges=new Set(),enrollments=new Set(),retryWaits=new Set(),pendingDelivery=new Map();let server=null,closed=false,port=0,stopping=null;
 const request=(peer,path,value,limits={})=>{refuse(!closed);const promise=onionRequest(peer,path,value,{socksPort,sockets:outbound,clock,timeoutMs,...limits});exchanges.add(promise);void promise.then(()=>exchanges.delete(promise),()=>exchanges.delete(promise));return promise;};
 const stopped=()=>Object.assign(Error('Private peer is stopping'),{code:'TORUS_CLOSED',submitted:false});
 const retryPause=attempt=>new Promise((resolve,reject)=>{let timer;const finish=error=>{clearTimeout(timer);retryWaits.delete(cancel);error?reject(error):resolve();},cancel=()=>finish(stopped());retryWaits.add(cancel);if(closed){cancel();return;}timer=setTimeout(()=>finish(),Math.min(TORUS_ENROLLMENT_LIMITS.retry_max_ms,TORUS_ENROLLMENT_LIMITS.retry_initial_ms*2**Math.min(attempt,8)));});
 const enrollmentRequest=(peer,path,value,{refreshRequest=null}={})=>{
  refuse(value&&Object.getPrototypeOf(value)===Object.prototype&&(refreshRequest===null||path==='/torus/v1/directory'&&typeof refreshRequest==='function'));
  const endpoint={onion:peer?.onion,port:peer?.port};refuse(validOnionName(endpoint.onion)&&Number.isSafeInteger(endpoint.port)&&endpoint.port>0&&endpoint.port<=65535);
  const encoded=JSON.stringify(value);refuse(Buffer.byteLength(encoded)<=TORUS_ENROLLMENT_LIMITS.request_bytes);const snapshot=JSON.parse(encoded);
  const promise=(async()=>{for(let attempt=0;;attempt++){if(closed)throw stopped();try{return await request(endpoint,path,snapshot,{timeoutMs:null,refreshRequest,requestBytes:TORUS_ENROLLMENT_LIMITS.request_bytes,responseBytes:TORUS_ENROLLMENT_LIMITS.response_bytes});}catch(error){if(closed)throw stopped();if(!error.retryableSocks)throw error;await retryPause(attempt);}}})();
  enrollments.add(promise);void promise.then(()=>enrollments.delete(promise),()=>enrollments.delete(promise));return promise;
 };
 async function exchange(payload,kind,hop,ctx){if(closed){const failure=Error('Private peer is stopping');failure.submitted=false;throw failure;}const peer=ctx.directory.nodes.find(node=>node.node_id===payload.route[hop]);refuse(peer);return request(peer,'/torus/v1/'+kind,wrapper(payload,hop,ctx.local,clock()));}
 async function attachmentExchange(envelope,descriptor,index,data,ctx){
  const bytes=Buffer.from(data),expectedHash=hash(bytes);try{for(let attempt=0;attempt<TORUS_PEER_LIMITS.attachment_attempts;attempt++){
   if(closed)throw stopped();const packet=sealPeerAttachment(envelope,descriptor,index,bytes,ctx,clock());
   try{return validateChunkAck(await exchange(packet,'attachment',1,ctx),packet,ctx.directory,expectedHash);}catch(error){if(closed)throw stopped();if(!error.retryableTransport||attempt+1===TORUS_PEER_LIMITS.attachment_attempts)throw error;await retryPause(attempt);}
  }}finally{bytes.fill(0);}
 }
 async function handle(req,res){
  const bootstrap=req.url==='/torus/v1/enroll'||req.url==='/torus/v1/directory',responseBytes=bootstrap?TORUS_ENROLLMENT_LIMITS.response_bytes:TORUS_PEER_LIMITS.response_bytes;
  const respond=(status,data)=>{if(res.destroyed||res.writableEnded)return;const body=JSON.stringify(data);refuse(typeof body==='string'&&Buffer.byteLength(body)<=responseBytes);res.writeHead(status,{'Content-Type':'application/json','Content-Length':Buffer.byteLength(body),'Cache-Control':'no-store','Connection':'close'});res.end(body);};
  try{
   refuse(!closed&&req.socket.remoteAddress==='127.0.0.1'&&req.method==='POST'&&['/torus/v1/deliver','/torus/v1/receipt','/torus/v1/attachment','/torus/v1/enroll','/torus/v1/directory'].includes(req.url)&&req.headers.origin===undefined&&req.headers['x-torus-peer']==='1'&&req.headers['content-type']==='application/json');
   demand(jobs.size<TORUS_PEER_LIMITS.pending,'TORUS_BUSY','Private mailbox is busy',429);
   if(bootstrap){
    const handler=req.url==='/torus/v1/enroll'?enroll:directory;refuse(typeof handler==='function'&&typeof currentEndpoint==='function');const endpoint=currentEndpoint();refuse(endpoint&&validOnionName(endpoint.onion)&&Number.isSafeInteger(endpoint.port)&&endpoint.port>0&&endpoint.port<=65535&&req.headers.host===endpoint.onion+(endpoint.port===80?'':':'+endpoint.port));
    refuse(req.headers['transfer-encoding']===undefined&&/^(0|[1-9][0-9]*)$/.test(req.headers['content-length']??'')&&Number(req.headers['content-length'])<=TORUS_ENROLLMENT_LIMITS.request_bytes);const value=await readRequest(req,TORUS_ENROLLMENT_LIMITS.request_bytes);refuse(value&&Object.getPrototypeOf(value)===Object.prototype);respond(200,await handler(value));return;
   }
   const ctx=context(currentNetwork()),own=ctx.directory.nodes.find(node=>node.node_id===ctx.local.node_id);refuse(req.headers.host===own.onion+(own.port===80?'':':'+own.port));
   const kind=req.url.split('/').at(-1),payload=validateWrapper(await readRequest(req),ctx,kind,clock());
   // Reparse-free wrapper metadata is retained separately from the immutable box.
   const index=payload.route.indexOf(ctx.local.node_id);refuse(index>0);
   if(index<payload.route.length-1){const result=await exchange(payload,kind,index+1,ctx);if(kind==='deliver')validatePeerReceipt(result,payload,ctx.directory);else if(kind==='attachment')validateChunkAck(result,payload,ctx.directory);respond(200,result);return;}
   if(kind==='attachment'){
    refuse(typeof stageAttachmentChunk==='function');const chunk=openPeerAttachment(payload,ctx,clock());await stageAttachmentChunk(chunk);
    const acknowledgment={version:1,network_id:payload.network_id,id:payload.id,digest:payload.digest,sender_node:payload.sender_node,recipient_node:payload.recipient_node,status:'STAGED',attachment_id:chunk.descriptor.attachment_id,index:chunk.index,chunk_hash:hash(chunk.data),received_at:clock()};respond(200,{...acknowledgment,signature:signature('WORKSPACE391-TORUS-CHUNK-ACK/1',acknowledgment,ctx.local.sign_private)});return;
   }
   const key=payload.sender_node+'|'+payload.id;let result;
   if(kind==='deliver'){
    const envelope=openPeerEnvelope(payload,ctx,clock());let pending=pendingDelivery.get(key);
    if(pending){refuse(pending.digest===envelope.digest);result=await pending.promise;}else{const promise=Promise.resolve().then(()=>receive(envelope));pending={digest:envelope.digest,promise};pendingDelivery.set(key,pending);try{result=await promise;}finally{pendingDelivery.delete(key);}}
    result=result?.receipt??result;validatePeerReceipt(result,envelope,ctx.directory);
   }else{
    const pending=pendingDelivery.get(key);if(pending){refuse(pending.digest===payload.digest);await pending.promise;}
    result=await lookupReceipt(payload);if(result)validatePeerReceipt(result,payload,ctx.directory);
    else{const missing={version:1,network_id:payload.network_id,id:payload.id,digest:payload.digest,sender_node:payload.sender_node,recipient_node:payload.recipient_node,status:'MISSING',checked_at:clock()};result={...missing,signature:signature(DOMAIN.receipt,missing,ctx.local.sign_private)};}
   }
   respond(200,result);
  }catch(error){respond(error instanceof MailError?error.http:503,{error:error instanceof MailError&&error.code==='TORUS_BUSY'?'TORUS_BUSY':'TORUS_PEER_REFUSED'});}
 }
 return {
  get port(){return port;},status(){return {listening:!!server&&!closed,port,pending:jobs.size};},
  async start(){demand(!server&&!closed,'TORUS_PEER_STATE','Private listener already started or stopped');server=http.createServer({maxHeaderSize:TORUS_PEER_LIMITS.header_bytes,requestTimeout:timeoutMs,headersTimeout:timeoutMs,connectionsCheckingInterval:Math.min(1000,timeoutMs)},(req,res)=>{const job=handle(req,res);jobs.add(job);void job.finally(()=>jobs.delete(job));});server.maxConnections=TORUS_PEER_LIMITS.connections;server.on('connection',socket=>{if(closed){socket.destroy();return;}incoming.add(socket);socket.on('close',()=>incoming.delete(socket));});server.on('clientError',(_,socket)=>socket.destroy());await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(listenPort,'127.0.0.1',resolve);});port=server.address().port;return port;},
  async enroll(peer,value){return enrollmentRequest(peer,'/torus/v1/enroll',value);},
  async fetchDirectory(peer,value,options){return enrollmentRequest(peer,'/torus/v1/directory',value,options);},
  async deliver(envelope,ctx=currentNetwork()){
   let mailSubmitted=false;
   try{refuse(!closed);context(ctx);validatePeerEnvelope(envelope,ctx.directory);
    for(const descriptor of envelope.attachments.filter(value=>value.attachment_id!==undefined)){
     refuse(typeof readAttachmentChunks==='function');await attachmentExchange(envelope,descriptor,-1,Buffer.alloc(0),ctx);
     let count=0,total=0;for await(const chunk of readAttachmentChunks(envelope,descriptor)){refuse(!closed&&chunk.index===count&&Buffer.isBuffer(chunk.data));await attachmentExchange(envelope,descriptor,chunk.index,chunk.data,ctx);count++;total+=chunk.data.length;}
     refuse(count===descriptor.chunk_count&&total===descriptor.size);
    }
    const packet=sealPeerEnvelope(envelope,ctx,clock());mailSubmitted=true;const receipt=await exchange(packet,'deliver',1,ctx);validatePeerReceipt(receipt,envelope,ctx.directory);return {status:'DELIVERED',detail:'The recipient private mailbox committed the message.',receipt};}
   catch(error){const failed=!mailSubmitted||error.submitted===false,detail=!mailSubmitted&&error.transportReason==='HTTP_TIMEOUT'?'The private receiver could not read an attachment chunk in time; no mailbox delivery was submitted.':!mailSubmitted&&error.transportReason==='EXCHANGE_TIMEOUT'?'An attachment chunk could not finish after reconnecting; no mailbox delivery was submitted.':failed?'The private transfer could not finish; no mailbox delivery was submitted.':'Private delivery could not be confirmed. Check the saved attempt before sending again.';return {status:failed?'FAILED':'UNKNOWN',detail};}
  },
  async checkReceipt(envelope,ctx=currentNetwork()){
   try{refuse(!closed);context(ctx);validatePeerEnvelope(envelope,ctx.directory);const value={version:1,network_id:envelope.network_id,id:envelope.id,digest:envelope.digest,sender_node:envelope.sender_node,recipient_node:envelope.recipient_node,created_at:clock(),route:envelope.route},query={...value,signature:signature(DOMAIN.query,value,ctx.local.sign_private)},receipt=await exchange(query,'receipt',1,ctx);
    if(receipt?.status==='DELIVERED'){validatePeerReceipt(receipt,envelope,ctx.directory);return {status:'DELIVERED',detail:'The recipient private mailbox committed the message.',receipt};}
    refuse(exact(receipt,['version','network_id','id','digest','sender_node','recipient_node','status','checked_at','signature'])&&receipt.status==='MISSING'&&Number.isSafeInteger(receipt.checked_at)&&Math.abs(clock()-receipt.checked_at)<=TORUS_PEER_LIMITS.skew_ms);for(const field of ['network_id','id','digest','sender_node','recipient_node'])refuse(receipt[field]===envelope[field]);const peer=ctx.directory.nodes.find(node=>node.node_id===envelope.recipient_node);refuse(verifySignature(DOMAIN.receipt,withoutSignature(receipt),receipt.signature,peer.sign_public));return {status:'UNKNOWN',detail:'The recipient has no committed receipt for this attempt.'};
   }catch{return {status:'UNKNOWN',detail:'The private send result could not be checked.'};}
  },
  close(){if(stopping)return stopping;closed=true;for(const cancel of retryWaits)cancel();for(const socket of outbound)socket.destroy();for(const socket of incoming)socket.destroy();stopping=(async()=>{await Promise.allSettled([...jobs,...exchanges,...enrollments]);if(server)await new Promise(resolve=>server.close(resolve));})();return stopping;}
 };
}
