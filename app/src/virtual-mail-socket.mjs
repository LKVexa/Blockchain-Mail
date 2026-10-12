/** Local mailbox adapter over the supplied HERMIT RFC 6455 framing source.
 * The terminal/worker protocol is deliberately not exposed by this endpoint.
 */
import {randomBytes,createHash} from 'node:crypto';
import framing from './ramws-framing.cjs';
import {MailError,demand} from './policy.mjs';
import {mailApiHandles} from './mail-api.mjs';

export const MAIL_SOCKET_PATH='/api/mail/socket';
export const MAIL_SOCKET_PROTOCOL='workspace.mail.v1';
export const MAIL_SOCKET_LIMITS=Object.freeze({
 request_bytes:1_700_000,response_bytes:16_100_000,send_queue_bytes:17_000_000,
 sockets:8,preadmission:4,pending:4,tickets:64,ticket_ms:30_000,
 authentication_ms:5_000,assembly_ms:5_000,idle_ms:120_000,heartbeat_ms:30_000,fragments:64,
 messages_per_second:40
});
const fingerprint=value=>createHash('sha256').update(value).digest('hex');
const exactTicket=/^\s*\{\s*"ticket"\s*:\s*"([a-f0-9]{64})"\s*\}\s*$/;
const messageRoute=/^\/api\/messages\/([a-f0-9]{32})(?:\/(?:eml|proof|attachment\/[0-9]))?$/;
function errorResult(error){
 return error instanceof MailError?{status:error.http,data:{error:error.code,message:error.message}}:
  {status:500,data:{error:'INTERNAL',message:'Mailbox operation failed; no success claimed.'}};
}

export function createVirtualMailSocket({server,origin,runId,channel,store,dispatch,clock=Date.now}){
 demand(server&&typeof origin==='function'&&typeof dispatch==='function','MAIL_SOCKET_CONFIG','A local mailbox server is required',503);
 demand(channel&&/^[a-f0-9]{32}$/.test(runId),'MAIL_SOCKET_PROTECTED','Mail sockets require the protected workspace',503);
 const tickets=new Map(),peers=new Set(),jobs=new Set();let closed=false;
 const sweep=()=>{const now=clock();for(const [key,item] of tickets)if(item.expires<=now)tickets.delete(key);};
 function localOrigin(){const value=origin(),u=new URL(value);demand(u.origin===value&&u.protocol==='http:'&&u.hostname==='127.0.0.1','MAIL_SOCKET_ORIGIN','Mail sockets require the local workspace origin',503);return value;}
 function ticket(tok){
  demand(!closed,'MAIL_SOCKET_CLOSED','The mailbox connection is stopping',503);
  const owner=store.authenticate(tok),boundOrigin=localOrigin();sweep();
  demand(tickets.size<MAIL_SOCKET_LIMITS.tickets,'MAIL_SOCKET_BUSY','Mailbox connection capacity reached',429);
  const value=randomBytes(32).toString('hex'),expires=clock()+MAIL_SOCKET_LIMITS.ticket_ms;
  tickets.set(fingerprint(value),{owner,origin:boundOrigin,runId,purpose:MAIL_SOCKET_PATH,expires});
  return {ticket:value,path:MAIL_SOCKET_PATH,protocol:MAIL_SOCKET_PROTOCOL,expires_at:expires};
 }
 function consume(value,boundOrigin){
  const key=fingerprint(value),record=tickets.get(key);tickets.delete(key);sweep();
  return record&&record.expires>clock()&&record.origin===boundOrigin&&record.runId===runId&&record.purpose===MAIL_SOCKET_PATH?record:null;
 }
 function upgrade(req,socket,head){
  // HTTP itself checks these boundaries too; upgrade events bypass its callback.
  let boundOrigin;
  try{
   demand(!closed,'MAIL_SOCKET_CLOSED','Unavailable',503);
   boundOrigin=localOrigin();const host=new URL(boundOrigin).host;
   demand(req.url===MAIL_SOCKET_PATH,'MAIL_SOCKET_PATH','Mailbox socket endpoint required',404);
   demand(socket.remoteAddress==='127.0.0.1'&&req.headers.host===host&&req.headers.origin===boundOrigin,'MAIL_SOCKET_ORIGIN','Local origin required',403);
   demand(!req.headers['sec-fetch-site']||['same-origin','none'].includes(req.headers['sec-fetch-site']),'MAIL_SOCKET_ORIGIN','Local origin required',403);
   demand(!head?.length,'MAIL_SOCKET_UPGRADE','Early socket data refused');
   demand(peers.size<MAIL_SOCKET_LIMITS.sockets&&[...peers].filter(peer=>!peer.owner).length<MAIL_SOCKET_LIMITS.preadmission,'MAIL_SOCKET_BUSY','Mailbox connection capacity reached',429);
   const checked=framing.checkUpgrade(req,MAIL_SOCKET_PROTOCOL);
   demand(checked.ok,'MAIL_SOCKET_UPGRADE','Mailbox WebSocket handshake required',checked.status??400);
   // The source parser accepts the alphabet; this adapter also requires canonical
   // base64 and the RFC's 16-byte nonce, including zero trailing padding bits.
   demand(Buffer.from(checked.key,'base64').length===16&&Buffer.from(checked.key,'base64').toString('base64')===checked.key,'MAIL_SOCKET_UPGRADE','Invalid WebSocket key');
   framing.acceptUpgrade(socket,checked.key,MAIL_SOCKET_PROTOCOL);
  }catch(error){framing.rejectUpgrade(socket,error instanceof MailError?error.http:503,'Mailbox socket refused');return;}
  const ws=new framing.WsConnection(socket,{maxMessageBytes:MAIL_SOCKET_LIMITS.request_bytes,maxFragments:MAIL_SOCKET_LIMITS.fragments,sendQueueBytes:MAIL_SOCKET_LIMITS.send_queue_bytes,controlReserve:4096,assemblyMs:MAIL_SOCKET_LIMITS.assembly_ms,closeWaitMs:1000});
  const peer={ws,owner:null,pending:0,authTimer:null,idleTimer:null,pingTimer:null,ping:null,count:0,countAt:clock()};peers.add(peer);
  const closePeer=(code=1008)=>ws.close(code,'Mailbox connection ended');
  const touch=()=>{clearTimeout(peer.idleTimer);peer.idleTimer=setTimeout(()=>closePeer(1001),MAIL_SOCKET_LIMITS.idle_ms);peer.idleTimer.unref?.();};
  peer.authTimer=setTimeout(()=>closePeer(),MAIL_SOCKET_LIMITS.authentication_ms);peer.authTimer.unref?.();
  ws.on('binary',()=>closePeer(1003));
  ws.on('close',()=>{clearTimeout(peer.authTimer);clearTimeout(peer.idleTimer);clearInterval(peer.pingTimer);peer.ping=null;peers.delete(peer);});
  ws.on('pong',bytes=>{if(peer.owner&&peer.ping&&Buffer.isBuffer(bytes)&&bytes.equals(peer.ping)){peer.ping=null;touch();}});
  ws.on('text',bytes=>{
   if(closed||ws.state!=='OPEN')return;
   if(clock()-peer.countAt>=1000){peer.countAt=clock();peer.count=0;}
   if(++peer.count>MAIL_SOCKET_LIMITS.messages_per_second)return closePeer(1008);
   if(!peer.owner){
    // This exact one-field grammar also rejects duplicate JSON ticket keys.
    if(bytes.length>256)return closePeer();
    const match=exactTicket.exec(bytes.toString('utf8')),record=match?consume(match[1],boundOrigin):null;
    if(!record)return closePeer();
    peer.owner=record.owner;clearTimeout(peer.authTimer);touch();
    peer.pingTimer=setInterval(()=>{if(ws.state!=='OPEN')return;peer.ping=randomBytes(8);ws.ping(peer.ping);},MAIL_SOCKET_LIMITS.heartbeat_ms);peer.pingTimer.unref?.();
    if(!ws.sendText(JSON.stringify({ready:true,protocol:MAIL_SOCKET_PROTOCOL})))closePeer(1013);
    return;
   }
   touch();
   if(peer.pending>=MAIL_SOCKET_LIMITS.pending)return closePeer(1013);
   // The parser's buffer view dies when this event returns. Parse synchronously,
   // then retain only a bounded plain encrypted frame for asynchronous handling.
   let frame;try{frame=JSON.parse(bytes.toString('utf8'));}catch{return closePeer();}
   peer.pending++;
   const job=(async()=>{
    let opened;
    try{
     opened=await channel.open(frame);
     let result;
     try{
      const bearer=opened.value.headers.authorization;
      demand(typeof bearer==='string'&&bearer.startsWith('Bearer '),'AUTH','Bearer token required',401);
      const tok=bearer.slice(7),owner=store.authenticate(tok);
      demand(owner===peer.owner,'MAIL_SOCKET_OWNER','Use this connection’s own mailbox account',403);
      demand(mailApiHandles(opened.value.method,opened.value.path),'MAIL_SOCKET_ROUTE','This connection supports mailbox operations only',403);
      // Operator proof access is broader in the legacy API. This mailbox channel
      // always applies the same own-message boundary as body and attachment reads.
      const url=new URL(opened.value.path,boundOrigin),match=messageRoute.exec(url.pathname);
      if(match&&url.pathname.endsWith('/proof'))store.message(tok,match[1]);
      result=await dispatch(opened.value);
     }catch(error){result=errorResult(error);}
     if(ws.state!=='OPEN'||closed)return;
     const response=await channel.response(opened,result.status,result.data,result.type??'application/json',result.headers??{}),text=JSON.stringify(response);
     if(Buffer.byteLength(text)>MAIL_SOCKET_LIMITS.response_bytes||!ws.sendText(text))closePeer(1013);
    }catch{closePeer();}
   })();
   jobs.add(job);void job.finally(()=>{peer.pending--;jobs.delete(job);});
  });
 }
 server.on('upgrade',upgrade);
 return {
  ticket,
  status(){sweep();return {enabled:!closed,protocol:MAIL_SOCKET_PROTOCOL,path:MAIL_SOCKET_PATH,connections:peers.size,tickets:tickets.size,pending:jobs.size};},
  async close(){closed=true;tickets.clear();server.removeListener('upgrade',upgrade);for(const peer of peers)peer.ws.terminate(1001,'Workspace stopping');await Promise.allSettled([...jobs]);}
 };
}
