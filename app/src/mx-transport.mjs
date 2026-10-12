/** Narrow outbound capability. Import before installGuard(); its ordinary DNS and
 * socket APIs remain denied. SMTP routing: RFC 5321 §5; null MX: RFC 7505;
 * STARTTLS reset: RFC 3207 §4.2. This transport deliberately requires verified TLS. */
import dns from 'node:dns';
import net from 'node:net';
import tls from 'node:tls';
import {randomInt} from 'node:crypto';

const RawResolver = dns.promises.Resolver;
const rawResolve = Object.fromEntries(['resolveMx','resolve4','resolve6','cancel'].map(name => [name,RawResolver.prototype[name]]));
const rawConnect = net.Socket.prototype.connect;
const rawTlsConnect = tls.connect;
const LIMITS = Object.freeze({totalMs:90000,connectMs:8000,stepMs:15000,dnsMs:5000,maxAttempts:12,maxConcurrent:4,maxMx:32,maxAddresses:32,maxReplyBytes:16384,maxReplyLines:64,maxLineBytes:512});
const TRANSIENT_NETWORK = new Set(['ECONNREFUSED','ECONNRESET','ECONNABORTED','EPIPE','ETIMEDOUT','ENETUNREACH','EHOSTUNREACH','ENETDOWN','EHOSTDOWN']);
const TRANSIENT_DNS = new Set(['ETIMEOUT','ETIMEDOUT','ESERVFAIL','EAI_AGAIN','ECANCELLED','EREFUSED']);
const CONNECT_DETAIL = 'Cannot connect to the recipient mail server on SMTP port 25. Check outbound SMTP access in your network settings.';
const TIMEOUT_DETAILS = Object.freeze({
  'mx-dns':'The recipient domain mail-server DNS lookup timed out.',
  'address-dns':'The recipient mail-server IP address lookup timed out.',
  connect:CONNECT_DETAIL,
  greeting:'Connected to SMTP port 25, but the recipient mail server did not send its greeting within the time limit.',
  EHLO:'The recipient mail server did not answer the SMTP greeting within the time limit.',
  STARTTLS:'The recipient mail server did not answer the STARTTLS request within the time limit.',
  tls:'The recipient mail server did not complete the secure connection within the time limit.',
  'EHLO after TLS':'The recipient mail server did not answer the secure SMTP greeting within the time limit.',
  'the sender':'The recipient mail server did not answer the sender request within the time limit.',
  'the recipient':'The recipient mail server did not answer the recipient request within the time limit.',
  DATA:'The recipient mail server did not answer the message submission request within the time limit.',
  acknowledgement:'The recipient mail server did not confirm message acceptance within the time limit.'
});

class MxError extends Error {
  constructor(code,detail,retry=false){super(detail);this.code=code;this.detail=detail;this.retry=retry;}
}
function fail(code,detail,retry=false){return new MxError(code,detail,retry);}
function result(status,mx,error){return {status,mx:mx??null,code:/^SMTP_[2-5][0-9]{2}$/.test(error.code)?Number(error.code.slice(5)):null,detail:error.detail};}
function networkError(error,phase){
  if(error instanceof MxError){
    if(phase==='connect'&&['MX_NETWORK','MX_DISCONNECTED','MX_TRANSPORT'].includes(error.code))return fail(error.code,CONNECT_DETAIL,error.retry);
    return error;
  }
  if(TRANSIENT_NETWORK.has(error?.code))return fail('MX_NETWORK',phase==='connect'?CONNECT_DETAIL:'The recipient mail server could not be reached or disconnected.',true);
  if(/^ERR_TLS|^ERR_SSL|^CERT_|^UNABLE_TO_|^DEPTH_|^SELF_SIGNED/.test(error?.code??''))return fail('MX_TLS_CERTIFICATE','The recipient mail server did not present a valid trusted certificate.','mx');
  return fail('MX_TRANSPORT',phase==='connect'?CONNECT_DETAIL:'The recipient mail server connection failed.');
}
function dnsError(error){
  if(error instanceof MxError)return error;
  if(error?.code==='ENOTFOUND')return fail('MX_DOMAIN_NOT_FOUND','The recipient domain or mail server does not exist.');
  if(TRANSIENT_DNS.has(error?.code))return fail('MX_DNS_TEMPORARY','Recipient mail server DNS is temporarily unavailable.',true);
  return fail('MX_DNS','Recipient mail server DNS lookup failed.');
}
function domain(value,allowLocal=false){
  if(allowLocal&&typeof value==='string'&&(value.toLowerCase()==='local.test'||(net.isIP(value)===4&&value.startsWith('127.')&&value.split('.').map(Number).join('.')===value)))return value.toLowerCase();
  if(typeof value!=='string'||value.length>253||!value.includes('.')||net.isIP(value)||/[^\x21-\x7e]/.test(value))throw fail('MX_ADDRESS','A public ASCII domain is required.');
  const normalized=value.toLowerCase();
  const labels=normalized.split('.');
  if(labels.some(label=>!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))||!/[a-z]/.test(labels.at(-1))||/(?:^|\.)(?:localhost|local|localdomain|test|invalid|example|internal|intranet|lan|home|onion)$/.test(normalized)||normalized.endsWith('.home.arpa'))throw fail('MX_ADDRESS','A public ASCII domain is required.');
  return normalized;
}
function mailbox(value,allowLocal=false){
  if(typeof value!=='string'||value.length>254)throw fail('MX_ADDRESS','A single public ASCII email address is required.');
  const match=/^([A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*)@([^@]+)$/.exec(value);
  if(!match||match[1].length>64)throw fail('MX_ADDRESS','A single public ASCII email address is required.');
  const host=domain(match[2],allowLocal);return {value:match[1]+'@'+host,domain:host};
}
function heloName(value){
  if(typeof value==='string'&&/^\[(?:\d{1,3}\.){3}\d{1,3}\]$/.test(value)){
    const address=value.slice(1,-1);
    if(net.isIP(address)===4&&address.split('.').map(Number).join('.')===address)return value;
    throw fail('MX_HEADER','Invalid outbound HELO address literal.');
  }
  if(typeof value==='string'&&/^\[IPv6:[0-9a-f:]+\]$/i.test(value)){
    const address=value.slice(6,-1);
    if(net.isIP(address)===6)return '[IPv6:'+address.toLowerCase()+']';
    throw fail('MX_HEADER','Invalid outbound HELO address literal.');
  }
  return domain(value);
}
function ip4Number(value){return value.split('.').reduce((number,part)=>number*256+Number(part),0);}
function in4(value,prefix,bits){return Math.floor(value/2**(32-bits))===Math.floor(ip4Number(prefix)/2**(32-bits));}
function ip6Number(value){
  if(value.includes('.')){const start=value.lastIndexOf(':')+1,number=ip4Number(value.slice(start));value=value.slice(0,start)+(number>>>16).toString(16)+':'+(number&65535).toString(16);}
  const halves=value.split('::'),left=halves[0]?halves[0].split(':'):[],right=halves[1]?halves[1].split(':'):[];
  const words=halves.length===1?left:[...left,...Array(8-left.length-right.length).fill('0'),...right];
  return BigInt('0x'+words.map(word=>word.padStart(4,'0')).join(''));
}
function in6(value,prefix,bits){return (value>>BigInt(128-bits))===(ip6Number(prefix)>>BigInt(128-bits));}
function publicAddress(address){
  if(typeof address!=='string'||address.includes('%'))return false;
  const family=net.isIP(address);
  if(family===4){
    const number=ip4Number(address);
    return ![['0.0.0.0',8],['10.0.0.0',8],['100.64.0.0',10],['127.0.0.0',8],['169.254.0.0',16],['172.16.0.0',12],['192.0.0.0',24],['192.0.2.0',24],['192.88.99.0',24],['192.168.0.0',16],['198.18.0.0',15],['198.51.100.0',24],['203.0.113.0',24],['224.0.0.0',4],['240.0.0.0',4]].some(([prefix,bits])=>in4(number,prefix,bits));
  }
  if(family!==6)return false;
  const number=ip6Number(address);
  // Only ordinary global unicast is admitted; transition schemes, mapped IPv4,
  // ULA, link-local, multicast, documentation and IETF special ranges are denied.
  return in6(number,'2000::',3)&&![['2001::',23],['2001:db8::',32],['2002::',16],['3ffe::',16],['3fff::',20]].some(([prefix,bits])=>in6(number,prefix,bits));
}
function subjectWords(subject){
  const pieces=[];let part='',bytes=0;
  for(const character of subject){const size=Buffer.byteLength(character);if(bytes+size>42){pieces.push(part);part='';bytes=0;}part+=character;bytes+=size;}
  if(part)pieces.push(part);
  return pieces.map(piece=>'=?UTF-8?B?'+Buffer.from(piece).toString('base64')+'?=').join('\r\n ');
}
function message(input){
  if(!input||typeof input!=='object')throw fail('MX_PAYLOAD','Invalid outbound message.');
  const from=mailbox(input.from,true),to=mailbox(input.to),helo=heloName(input.helo);
  if(typeof input.subject!=='string'||!input.subject.isWellFormed()||/[\x00-\x1f\x7f]/.test(input.subject)||Buffer.byteLength(input.subject)>512)throw fail('MX_HEADER','Invalid outbound Subject header.');
  if(typeof input.body!=='string'||!input.body.isWellFormed()||input.body.includes('\0')||Buffer.byteLength(input.body)>128*1024)throw fail('MX_PAYLOAD','Invalid or oversized outbound message body.');
  const id=/^<([A-Za-z0-9._-]{1,128})@([^<>@\s]+)>$/.exec(input.message_id??'');
  if(!id)throw fail('MX_HEADER','Invalid outbound Message-ID header.');
  const messageId='<'+id[1]+'@'+domain(id[2],true)+'>';
  if(!['string','number'].includes(typeof input.created_at)||(typeof input.created_at==='string'&&!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(input.created_at)))throw fail('MX_HEADER','Invalid outbound message date.');
  const date=new Date(input.created_at);
  if(!Number.isFinite(date.getTime()))throw fail('MX_HEADER','Invalid outbound message date.');
  const body=Buffer.from(input.body,'utf8').toString('base64').match(/.{1,76}/g)?.join('\r\n')??'';
  const data=['From: '+from.value,'To: '+to.value,'Subject: '+subjectWords(input.subject),'Date: '+date.toUTCString().replace(/GMT$/,'+0000'),'Message-ID: '+messageId,'MIME-Version: 1.0','Content-Type: text/plain; charset=UTF-8','Content-Transfer-Encoding: base64','',''+body,''].join('\r\n');
  return {from:from.value,to:to.value,domain:to.domain,helo,data:data.replace(/(^|\r\n)\./g,'$1..')+'.\r\n'};
}
function timeoutError(context,code='MX_TIMEOUT'){return fail(code,TIMEOUT_DETAILS[context.phase]??'The recipient mail server did not respond within the time limit.',code!=='MX_DELIVERY_TIMEOUT');}
function aborted(context){if(context.signal.aborted)throw context.signal.reason;if(Date.now()>=context.deadline)throw timeoutError(context,'MX_DELIVERY_TIMEOUT');}
function bounded(context,ms,operation,timeoutCode='MX_TIMEOUT'){
  aborted(context);
  return new Promise((resolve,reject)=>{
    let done=false;
    const finish=(error,value)=>{if(done)return;done=true;clearTimeout(timer);context.signal.removeEventListener('abort',onAbort);error?reject(error):resolve(value);};
    const onAbort=()=>finish(context.signal.reason);
    const timer=setTimeout(()=>finish(timeoutError(context,timeoutCode)),Math.max(1,Math.min(ms,context.deadline-Date.now())));
    context.signal.addEventListener('abort',onAbort,{once:true});
    Promise.resolve().then(()=>{aborted(context);return operation();}).then(value=>finish(null,value),error=>finish(error));
  });
}

/** A single in-flight reply. Reject surplus replies and mismatched multiline
 * codes rather than allowing a server to pre-supply later command responses. */
class Replies {
  constructor(socket,limits){
    this.socket=socket;this.limits=limits;this.buffer=Buffer.alloc(0);this.lines=[];this.bytes=0;this.code=null;this.pending=null;this.error=null;
    this.onData=chunk=>this.push(Buffer.from(chunk));this.onError=error=>this.fail(networkError(error));
    this.onClose=()=>this.fail(fail('MX_DISCONNECTED','The recipient mail server disconnected.',true));
    socket.on('data',this.onData);socket.on('error',this.onError);socket.on('end',this.onClose);socket.on('close',this.onClose);
  }
  assert(){if(this.error)throw this.error;}
  fail(error){if(this.error)return;this.error=error;const pending=this.pending;this.pending=null;pending?.reject(error);this.socket.destroy();}
  push(chunk){
    if(this.error)return;
    if(!this.pending){this.fail(fail('MX_PROTOCOL','The recipient mail server sent an unsolicited reply.'));return;}
    this.bytes+=chunk.length;
    if(this.bytes>this.limits.maxReplyBytes){this.fail(fail('MX_PROTOCOL','The recipient mail server reply exceeded its size limit.'));return;}
    this.buffer=Buffer.concat([this.buffer,chunk]);
    while(this.buffer.length){
      const newline=this.buffer.indexOf('\r\n');
      if(newline<0){if(this.buffer.length>this.limits.maxLineBytes-2||this.buffer.includes(10))this.fail(fail('MX_PROTOCOL','The recipient mail server sent a malformed reply line.'));return;}
      const line=this.buffer.subarray(0,newline);this.buffer=this.buffer.subarray(newline+2);
      if(line.length+2>this.limits.maxLineBytes||line.some(byte=>(byte<32&&byte!==9)||byte>126)){this.fail(fail('MX_PROTOCOL','The recipient mail server sent a malformed reply line.'));return;}
      const match=/^([2-5][0-9]{2})(?:([- ])(.*))?$/.exec(line.toString('ascii'));
      if(!match||(this.code!==null&&this.code!==Number(match[1]))){this.fail(fail('MX_PROTOCOL','The recipient mail server sent inconsistent reply codes.'));return;}
      this.code=Number(match[1]);this.lines.push(match[3]??'');
      if(this.lines.length>this.limits.maxReplyLines){this.fail(fail('MX_PROTOCOL','The recipient mail server reply exceeded its line limit.'));return;}
      if(match[2]!=='-'){
        if(this.buffer.length){this.fail(fail('MX_PROTOCOL','The recipient mail server sent surplus reply bytes.'));return;}
        const pending=this.pending,reply={code:this.code,lines:this.lines};this.pending=null;this.code=null;this.lines=[];this.bytes=0;pending.resolve(reply);return;
      }
    }
  }
  prepare(){
    this.assert();if(this.pending)throw fail('MX_PROTOCOL','Overlapping mail server replies are not supported.');
    const promise=new Promise((resolve,reject)=>{this.pending={resolve,reject};});
    // The greeting waiter is installed before connecting, but its reply timeout
    // starts only after TCP connects. Keep early close/errors handled too.
    promise.catch(()=>{});
    return promise;
  }
  wait(context,promise){
    return bounded(context,this.limits.stepMs,()=>promise).catch(error=>{this.fail(error);throw error;});
  }
  read(context){return this.wait(context,this.prepare());}
  detach(){
    this.assert();if(this.pending||this.buffer.length||this.lines.length)throw fail('MX_PROTOCOL','Unfinished reply at the TLS boundary.');
    this.socket.off('data',this.onData);this.socket.off('error',this.onError);this.socket.off('end',this.onClose);this.socket.off('close',this.onClose);
  }
}
function check(reply,expected,stage){
  if(expected.includes(reply.code))return reply;
  if(reply.code>=400&&reply.code<=599)throw fail('SMTP_'+reply.code,'The recipient mail server rejected '+stage+'.',reply.code<500);
  throw fail('MX_PROTOCOL','The recipient mail server returned an unexpected reply.');
}
async function command(reader,socket,context,text,expected,stage){
  reader.assert();aborted(context);context.phase=stage;const pending=reader.read(context);
  try{socket.write(text+'\r\n');}catch(error){reader.fail(networkError(error));}
  const reply=await pending;reader.assert();return check(reply,expected,stage);
}
function secureHandshake(socket,context,limits){
  context.phase='tls';
  const handshake=new Promise((resolve,reject)=>{
    const cleanup=()=>{socket.off('secureConnect',secure);socket.off('error',error);socket.off('close',closed);context.signal.removeEventListener('abort',abort);};
    const error=e=>{cleanup();reject(networkError(e));},closed=()=>error(fail('MX_DISCONNECTED','The recipient mail server disconnected during TLS negotiation.',true));
    const abort=()=>error(context.signal.reason);
    const secure=()=>{cleanup();if(socket.authorized!==true)reject(fail('MX_TLS_CERTIFICATE','The recipient mail server did not present a valid trusted certificate.','mx'));else if(!['TLSv1.2','TLSv1.3'].includes(socket.getProtocol()))reject(fail('MX_TLS_VERSION','The recipient mail server did not negotiate TLS 1.2 or newer.','mx'));else resolve();};
    socket.once('secureConnect',secure);socket.once('error',error);socket.once('close',closed);context.signal.addEventListener('abort',abort,{once:true});
  });
  handshake.catch(()=>{});
  return bounded(context,limits.stepMs,()=>handshake,'MX_TLS_TIMEOUT');
}
function resolver(){
  const instance=new RawResolver({timeout:3000,tries:1});
  return Object.fromEntries(Object.entries(rawResolve).map(([name,method])=>[name,method.bind(instance)]));
}

/** Internal dependencies make protocol tests deterministic. Production callers
 * pass no dependencies and cannot choose arbitrary ports, hosts or TLS policy. */
export function createMxTransport(options={}){
  const limits={...LIMITS,...options.limits},dependencies=options.dependencies??{},contexts=new Set(),sockets=new Set();let closed=false;
  for(const [key,value]of Object.entries(limits))if(!Object.hasOwn(LIMITS,key)||!Number.isSafeInteger(value)||value<1||value>LIMITS[key])throw new TypeError('Invalid MX transport limit');
  function track(socket,context){socket.on('error',()=>{});sockets.add(socket);context.sockets.add(socket);return socket;}
  function destroy(context){for(const socket of context.sockets){socket.destroy();sockets.delete(socket);}context.sockets.clear();}
  async function lookupMx(context,target){
    context.phase='mx-dns';
    let records;
    try{records=await bounded(context,limits.dnsMs,()=>context.resolver.resolveMx(target),'MX_DNS_TIMEOUT');}
    catch(error){if(error?.code==='ENODATA')records=[];else throw dnsError(error);}
    if(!Array.isArray(records)||records.length>limits.maxMx)throw fail('MX_DNS','Recipient DNS returned an invalid or excessive mail server list.');
    if(records.some(record=>record?.exchange==='.'||record?.exchange===''))throw fail('MX_NULL','The recipient domain explicitly does not accept email.');
    if(!records.length)return [{priority:0,exchange:target}];
    const seen=new Map();
    for(const record of records){
      if(!record||!Number.isInteger(record.priority)||record.priority<0||record.priority>65535)throw fail('MX_DNS','Recipient DNS returned an invalid mail server record.');
      const exchange=domain(typeof record.exchange==='string'?record.exchange.replace(/\.$/,''):record.exchange);
      if(!seen.has(exchange)||record.priority<seen.get(exchange).priority)seen.set(exchange,{priority:record.priority,exchange});
    }
    const ordered=[...seen.values()];
    for(let i=ordered.length-1;i>0;i--){const j=randomInt(i+1);[ordered[i],ordered[j]]=[ordered[j],ordered[i]];}
    return ordered.sort((a,b)=>a.priority-b.priority);
  }
  async function lookupAddresses(context,host){
    context.phase='address-dns';
    const outcomes=await Promise.allSettled(['resolve4','resolve6'].map(method=>bounded(context,limits.dnsMs,()=>context.resolver[method](host),'MX_DNS_TIMEOUT')));
    const families=[[],[]],all=[],failures=[];
    for(let i=0;i<outcomes.length;i++){
      const outcome=outcomes[i];
      if(outcome.status==='rejected'){if(!['ENODATA','ENOTFOUND'].includes(outcome.reason?.code))failures.push(dnsError(outcome.reason));continue;}
      if(!Array.isArray(outcome.value)||outcome.value.length>limits.maxAddresses)throw fail('MX_DNS','Recipient DNS returned an invalid or excessive address list.');
      for(const address of outcome.value){
        if(net.isIP(address)!==(i===0?4:6)||!publicAddress(address))throw fail('MX_PRIVATE_ADDRESS','Recipient DNS resolved to a nonpublic or reserved network address.');
        if(!all.some(entry=>entry.address===address)){const entry={address,family:i===0?4:6};all.push(entry);families[i].push(entry);}
      }
    }
    // Validate every fulfilled answer before tolerating a temporary failure of
    // the other family. An answer containing a private address remains fatal.
    const permanentFailure=failures.find(error=>error.retry!==true);
    if(permanentFailure)throw permanentFailure;
    if(!all.length)throw failures[0]??fail('MX_NO_ADDRESS','The recipient mail server has no usable public IP address.','mx');
    if(all.length>limits.maxAddresses)throw fail('MX_DNS','Recipient DNS returned too many mail server addresses.');
    const interleaved=[];
    for(let i=0;i<Math.max(...families.map(family=>family.length));i++)for(const family of families)if(family[i])interleaved.push(family[i]);
    return interleaved;
  }
  async function attempt(context,payload,mx,address){
    let reader,raw,secure;
    try{
      aborted(context);
      raw=track(dependencies.makeSocket?.()??new net.Socket(),context);reader=new Replies(raw,limits);
      const greeting=reader.prepare();
      context.phase='connect';
      let cleanup,rejectConnection;
      const connected=new Promise((resolve,reject)=>{
        cleanup=()=>{raw.off('connect',onConnect);raw.off('error',onError);raw.off('close',onClose);};
        const onConnect=()=>{cleanup();resolve();},onError=error=>{cleanup();reject(networkError(error,'connect'));},onClose=()=>{cleanup();reject(fail('MX_DISCONNECTED',CONNECT_DETAIL,true));};
        rejectConnection=onError;
        raw.once('connect',onConnect);raw.once('error',onError);raw.once('close',onClose);
      });
      connected.catch(()=>{});
      const pinned={host:address.address,port:25,family:address.family,autoSelectFamily:false,lookup(host,options,callback){if(host!==address.address){callback(fail('MX_ADDRESS','The pinned mail server address changed.'));return;}callback(null,address.address,address.family);}};
      try{if(dependencies.connectSocket)dependencies.connectSocket(raw,pinned);else rawConnect.call(raw,pinned);}catch(error){rejectConnection(error);reader.fail(networkError(error,'connect'));}
      try{await bounded(context,limits.connectMs,()=>connected,'MX_CONNECT_TIMEOUT');}finally{cleanup();}
      context.phase='greeting';check(await reader.wait(context,greeting),[220],'the connection');reader.assert();
      const hello=await command(reader,raw,context,'EHLO '+payload.helo,[250],'EHLO');
      // EHLO's first line names the server; only subsequent lines are extensions.
      if(!hello.lines.slice(1).some(line=>/^STARTTLS(?: |$)/i.test(line)))throw fail('MX_TLS_REQUIRED','The recipient mail server does not advertise STARTTLS.','mx');
      await command(reader,raw,context,'STARTTLS',[220],'STARTTLS');reader.detach();
      secure=track((dependencies.startTls??rawTlsConnect)({socket:raw,servername:mx,rejectUnauthorized:true,minVersion:'TLSv1.2',checkServerIdentity:tls.checkServerIdentity}),context);
      reader=new Replies(secure,limits);await secureHandshake(secure,context,limits);reader.assert();
      await command(reader,secure,context,'EHLO '+payload.helo,[250],'EHLO after TLS');
      await command(reader,secure,context,'MAIL FROM:<'+payload.from+'>',[250],'the sender');
      await command(reader,secure,context,'RCPT TO:<'+payload.to+'>',[250,251],'the recipient');
      await command(reader,secure,context,'DATA',[354],'DATA');
      aborted(context);reader.assert();context.phase='acknowledgement';const acknowledgement=reader.read(context);
      // From this point a disconnected session can have delivered mail. Never
      // fail over or automatically retry a transaction after handing it bytes.
      context.dataSent=true;
      try{secure.write(payload.data);}catch(error){reader.fail(networkError(error));}
      const final=await acknowledgement;
      if(final.code===250)return result('ACCEPTED',mx,fail('SMTP_250','The recipient mail server accepted the message; inbox delivery is not confirmed.'));
      if(final.code>=400&&final.code<=599)return result('FAILED',mx,fail('SMTP_'+final.code,'The recipient mail server rejected the message after DATA.'));
      throw fail('MX_PROTOCOL','The recipient mail server returned an unexpected final acknowledgement.');
    }catch(error){
      const known=networkError(error,context.phase);
      if(context.dataSent)return result('UNKNOWN',mx,fail('MX_ACCEPTANCE_UNKNOWN','The connection ended without a conclusive final acknowledgement. Do not automatically resend this message.'));
      throw known;
    }finally{
      for(const socket of [secure,raw])if(socket){socket.destroy();sockets.delete(socket);context.sockets.delete(socket);}
    }
  }
  async function deliver(input){
    if(closed)return result('FAILED',null,fail('MX_CLOSED','Outbound mail transport is closed.'));
    if(contexts.size>=limits.maxConcurrent)return result('FAILED',null,fail('MX_BUSY','The outbound mail connection limit has been reached.'));
    let payload;
    try{payload=message(input);}catch(error){return result('FAILED',null,error instanceof MxError?error:fail('MX_PAYLOAD','Invalid outbound message.'));}
    const controller=new AbortController(),context={signal:controller.signal,controller,deadline:Date.now()+limits.totalMs,resolver:dependencies.resolver??resolver(),sockets:new Set(),dataSent:false,phase:'mx-dns'};
    contexts.add(context);
    const timer=setTimeout(()=>{controller.abort(timeoutError(context,'MX_DELIVERY_TIMEOUT'));context.resolver.cancel?.();destroy(context);},limits.totalMs);
    let currentMx=null,attempts=0,last=fail('MX_NO_SERVER','No recipient mail server could accept the message.');
    try{
      const records=await lookupMx(context,payload.domain);
      for(const record of records){
        currentMx=record.exchange;let addresses;
        try{addresses=await lookupAddresses(context,currentMx);}catch(error){last=dnsError(error);if(last.retry)continue;throw last;}
        for(const address of addresses){
          aborted(context);
          if(attempts++>=limits.maxAttempts)throw fail('MX_ATTEMPT_LIMIT','The outbound mail server attempt limit was reached.');
          try{return await attempt(context,payload,currentMx,address);}catch(error){last=networkError(error);if(last.retry==='mx')break;if(!last.retry)throw last;}
        }
      }
      return result('FAILED',currentMx,last);
    }catch(error){return result(context.dataSent?'UNKNOWN':'FAILED',currentMx,context.dataSent?fail('MX_ACCEPTANCE_UNKNOWN','The connection ended without a conclusive final acknowledgement. Do not automatically resend this message.'):networkError(error));}
    finally{clearTimeout(timer);context.resolver.cancel?.();destroy(context);contexts.delete(context);}
  }
  function close(){
    if(closed)return;closed=true;
    for(const context of contexts){context.controller.abort(fail('MX_CLOSED','Outbound mail transport was closed.'));context.resolver.cancel?.();destroy(context);}
    for(const socket of sockets)socket.destroy();sockets.clear();
  }
  return {deliver,close};
}
