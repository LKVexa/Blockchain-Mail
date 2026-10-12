/** Actual protected HTTP dispatcher and browser controller with Node's native
 * WebSocket. Peer delivery is synthetic; no Tor or Internet mail is contacted. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {randomBytes,createHash} from 'node:crypto';
import {Store} from '../src/store.mjs';
import {keys,signature} from '../src/crypto.mjs';
import {startHttp} from '../src/http.mjs';
import {createInternetMail} from '../src/internet-mail.mjs';
import {createTorusMail,TORUS_DOMAINS} from '../src/torus-mail.mjs';
import {createMailSocket} from '../web/mail-socket.mjs';
import {deriveTransport,encodeFrame,decodeFrame,unbase64} from '../web/protected-wire.mjs';

function onion(){const publicBytes=randomBytes(32),version=Buffer.from([3]),checksum=createHash('sha3-256').update(Buffer.concat([Buffer.from('.onion checksum'),publicBytes,version])).digest().subarray(0,2),bytes=Buffer.concat([publicBytes,checksum,version]);let accumulator=0,bits=0,text='';for(const byte of bytes){accumulator=(accumulator<<8)|byte;bits+=8;while(bits>=5){bits-=5;text+='abcdefghijklmnopqrstuvwxyz234567'[(accumulator>>>bits)&31];}}return text+'.onion';}
const unsigned=({signature:ignored,...value})=>value;
const sign=(domain,value,key)=>({...value,signature:signature(domain,value,key)});
async function fixture(t){
 const scratch=path.resolve(import.meta.dirname,'../../work');fs.mkdirSync(scratch,{recursive:true});const root=fs.mkdtempSync(path.join(scratch,'torus-http-')),nodes=[],peerCalls=[];let internetCalls=0;
 for(let index=0;index<2;index++){
  const key=randomBytes(32),nodeRoot=path.join(root,String(index)),store=new Store(nodeRoot,{vaultKey:key}),credentials=store.credentials(),runId=randomBytes(16).toString('hex'),node={key,root:nodeRoot,store,credentials,user:credentials['user@local.test'],operator:credentials['postmaster@local.test'],runId};
  node.internet=createInternetMail(store,{deliver:async()=>{internetCalls++;return {status:'ACCEPTED',code:250,mx:'mx.synthetic.example',detail:'Synthetic acceptance'};},close:async()=>{}});
  node.mail=createTorusMail(store,{localOnion:onion(),peerPort:80,transport:{deliver:async envelope=>{peerCalls.push(envelope.id);return nodes.find(candidate=>candidate.mail.context()?.local.node_id===envelope.recipient_node).mail.receive(envelope);},checkReceipt:async envelope=>{const target=nodes.find(candidate=>candidate.mail.context()?.local.node_id===envelope.recipient_node),receipt=target.mail.lookupReceipt(envelope);return receipt?{status:'DELIVERED',receipt}:{status:'UNKNOWN',receipt:null};},close:async()=>{}}});
  node.web=await startHttp(store,{port:0,vaultKey:key,runId,torusMail:node.mail,internetMail:node.internet});node.origin='http://127.0.0.1:'+node.web.port;node.wire=await deriveTransport(key,runId);nodes.push(node);
  node.frame=(route,body,token=node.user)=>encodeFrame(node.wire,'request',{method:body===undefined?'GET':'POST',path:route,headers:{authorization:'Bearer '+token,...(body===undefined?{}:{'content-type':'application/json','x-bve-request':'1'})},body:body===undefined?null:JSON.stringify(body)});
  node.decode=async(response,request)=>{const decoded=await decodeFrame(node.wire,'response',response,request),bytes=Buffer.concat(decoded.chunks.map(value=>Buffer.from(unbase64(value))));return {status:decoded.status,data:JSON.parse(bytes.toString('utf8'))};};
  node.api=async(route,body,token=node.user)=>{const frame=await node.frame(route,body,token),response=await fetch(node.origin+'/api/protected',{method:'POST',headers:{'content-type':'application/json','x-bve-request':'1',Origin:node.origin},body:JSON.stringify(frame),signal:AbortSignal.timeout(120000)});assert.equal(response.status,200,'outer HTTP carries the protected response');return node.decode(await response.json(),frame);};
 }
 t.after(async()=>{for(const node of nodes){await node.web.close();await node.mail.close();await node.internet.close();node.store.close();node.key.fill(0);}assert.equal(path.dirname(root),scratch);fs.rmSync(root,{recursive:true,force:true});});
 return {nodes,peerCalls,get internetCalls(){return internetCalls;}};
}

test('TORUS-HTTP protected setup, account isolation and actual native WebSocket controller share mailbox dispatch',{timeout:180000},async t=>{
 const f=await fixture(t),[source,destination]=f.nodes;
 const initial=await source.api('/api/login',{});assert.equal(initial.status,200);assert.match(initial.data.assigned_address,/^mail@127\.0\.0\./);assert.equal(initial.data.active,false);assert.equal((await source.api('/api/torus/status')).data.configured,false);
 assert.equal((await source.api('/api/torus/create',{})).status,403,'ordinary account cannot create a network');assert.equal((await source.api('/api/torus/create',{},source.operator)).status,200);
 assert.equal((await source.api('/api/torus/invite',{coordinate:'n01'})).status,403);const invitation=(await source.api('/api/torus/invite',{coordinate:'n01'},source.operator)).data.invitation;
 assert.equal((await destination.api('/api/torus/join',{invitation})).status,403);const joining=await destination.api('/api/torus/join',{invitation},destination.operator);assert.equal(joining.status,200);assert.equal(joining.data.status,'PENDING');
 const admitted=await source.api('/api/torus/admit',{card:joining.data.card},source.operator);assert.equal(admitted.status,200);const directory=admitted.data.directory;
 const foreignKeys=keys(),foreignNetwork=randomBytes(16).toString('hex'),foreignCard=sign(TORUS_DOMAINS.card,{...unsigned(directory.nodes[0]),network_id:foreignNetwork,sign_public:foreignKeys.publicKey},foreignKeys.privateKey),foreignDirectory=sign(TORUS_DOMAINS.directory,{version:directory.version,network_id:foreignNetwork,root_public:foreignKeys.publicKey,revision:1,nodes:[foreignCard]},foreignKeys.privateKey);
 const pinRejected=await destination.api('/api/torus/import-directory',{directory:foreignDirectory},destination.operator);assert.equal(pinRejected.status,403);assert.equal(pinRejected.data.error,'TORUS_DIRECTORY_PIN');assert.equal((await destination.api('/api/torus/import-directory',{directory},destination.operator)).status,200);
 const remote=(await destination.api('/api/login',{})).data;assert.match(remote.assigned_address,/^mail@127\.0\.1\./);const local=(await source.api('/api/login',{})).data;
 const publicDraft={to:['recipient@synthetic.example.org'],subject:'Never send public mail in private mode',body:'Synthetic',attachments:[],request_id:'http-private-denial-001'};
 const publicQuote=await source.api('/api/mail/quote',publicDraft);assert.equal(publicQuote.status,403);assert.equal(publicQuote.data.error,'TORUS_PRIVATE_ONLY');const legacy=await source.api('/api/internet/send',{to:publicDraft.to[0],subject:'Synthetic',body:'Synthetic',request_id:'legacy-private-denial-001'});assert.equal(legacy.status,403);assert.equal(legacy.data.error,'TORUS_PRIVATE_ONLY');assert.equal(f.internetCalls,0);

 // Node's native WebSocket has an options form for browser-equivalent Origin.
 const NativeWebSocket=globalThis.WebSocket;assert.equal(typeof NativeWebSocket,'function');const sockets=[];
 class OriginWebSocket extends NativeWebSocket{constructor(url,protocol){super(url,{protocols:[protocol],headers:{Origin:source.origin}});sockets.push(this);}}
 const controller=createMailSocket({origin:source.origin,WebSocketCtor:OriginWebSocket,requestTimeoutMs:120000,acquireTicket:async authorization=>{const reply=await source.api('/api/mail/socket-ticket',{},authorization.slice(7));assert.equal(reply.status,200);return reply.data;}});t.after(()=>controller.close());
 const wsApi=async(route,body,token=source.user)=>{const frame=await source.frame(route,body,token),response=await controller.request(frame,{authorization:'Bearer '+token,signal:AbortSignal.timeout(120000)});return source.decode(response,frame);};
 const self={to:[local.assigned_address],subject:'Actual socket local mail',body:'Native socket synthetic local content',attachments:[],request_id:'native-socket-local-001'},localQuote=await wsApi('/api/mail/quote',self);assert.equal(localQuote.status,200);assert.equal(localQuote.data.route,'local');
 assert.equal((await wsApi('/api/mail/send',{...self,expected_route:'local',max_cost:localQuote.data.cost})).status,200);assert.equal(sockets.length,1);assert.equal(sockets[0].protocol,'workspace.mail.v1');
 const inbox=await wsApi('/api/mailbox-page?folder=INBOX');assert.equal(inbox.data.messages.length,1);const localID=inbox.data.messages[0].id;assert.equal((await source.api('/api/messages/'+localID)).data.body,self.body);assert.equal((await source.api('/api/messages/'+localID,undefined,source.operator)).status,404);assert.equal((await source.api('/api/messages/'+localID+'/proof',undefined,source.operator)).status,404);
 const peerDraft={to:[remote.assigned_address],subject:'Actual socket private peer mail',body:'Protected HTTP/controller integration content',attachments:[],request_id:'native-socket-peer-001'},peerQuote=await wsApi('/api/mail/quote',peerDraft);assert.equal(peerQuote.data.route,'peer');const peerPayload={...peerDraft,expected_route:'peer',confirmed_from:peerQuote.data.from},sent=await wsApi('/api/mail/send',peerPayload);assert.equal(sent.data.message.status,'DELIVERED');assert.equal(f.peerCalls.length,1);
 const recipientInbox=await destination.api('/api/mailbox-page?folder=INBOX');assert.equal(recipientInbox.data.messages.length,1);const incomingID=recipientInbox.data.messages[0].id;assert.equal((await destination.api('/api/messages/'+incomingID)).data.body,peerDraft.body);assert.equal((await destination.api('/api/messages/'+incomingID+'/proof')).data.verified,true);assert.equal((await destination.api('/api/messages/'+incomingID,undefined,destination.operator)).status,404);assert.equal((await destination.api('/api/messages/'+incomingID+'/proof',undefined,destination.operator)).status,404);assert.equal((await destination.api('/api/messages?folder=Sent')).data.length,0);
 assert.equal((await source.api('/api/messages?folder=Sent')).data.length,2);assert.equal((await source.api('/api/messages?folder=Sent',undefined,source.operator)).data.length,0);assert.equal((await source.api('/api/torus/outbox')).data.messages.length,1);assert.equal((await source.api('/api/torus/outbox',undefined,source.operator)).data.messages.length,0);
 assert.equal((await wsApi('/api/mail/send',peerPayload)).data.replayed,true);assert.equal(f.peerCalls.length,1);assert.equal((await destination.api('/api/messages')).data.length,1);
 // Switching accounts changes admission; old-account data cannot cross replies.
 assert.equal((await wsApi('/api/me',undefined,source.operator)).data.address,'postmaster@local.test');assert.equal(sockets.length,2);assert.equal(f.internetCalls,0);for(const node of f.nodes)assert(node.store.verify().ok);
});
