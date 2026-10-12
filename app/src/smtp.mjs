import net from 'node:net';
import {randomBytes}from 'node:crypto';
import {DEFAULTS,address,demand}from './policy.mjs';import {parseMail,fromAddress}from './mime.mjs';
export async function startSmtp(store,{port=2525,host='127.0.0.1'}={}){
 demand(!store.vault,'VAULT_SMTP_DISABLED','SMTP is disabled for protected vaults; use the protected mail interface',503);
 demand(host==='127.0.0.1','BIND','Only literal 127.0.0.1 is allowed');const sockets=new Set();
 const server=net.createServer(socket=>{
  socket.on('error',()=>{});if(sockets.size>=DEFAULTS.max_connections){socket.end('421 4.3.2 Connection limit\r\n');return}sockets.add(socket);socket.setTimeout(DEFAULTS.smtp_idle_ms);socket.on('close',()=>sockets.delete(socket));
  let buf=Buffer.alloc(0),greeted=false,auth=null,authPending=false,from=null,recipients=[],data=null,bytes=0,failures=0,halted=false;
  const say=(s)=>{if(!halted)socket.write(s+'\r\n')};const reset=()=>{from=null;recipients=[];data=null;bytes=0};
  const terminate=s=>{if(halted)return;halted=true;buf=Buffer.alloc(0);reset();socket.end(s?s+'\r\n':undefined)};socket.on('timeout',()=>terminate('421 4.4.2 Timeout'));
  function login(encoded){try{demand(encoded.length<=1024&&/^[A-Za-z0-9+/]*={0,2}$/.test(encoded),'AUTH','Invalid encoding');const decoded=Buffer.from(encoded,'base64');demand(decoded.toString('base64')===encoded,'AUTH','Noncanonical encoding');const parts=new TextDecoder('utf-8',{fatal:true}).decode(decoded).split('\0');demand(parts.length===3&&(!parts[0]||parts[0]===parts[1]),'AUTH','Invalid AUTH PLAIN');const a=store.authenticate(parts[2]);demand(a===address(parts[1]),'AUTH','Mailbox mismatch');auth={address:a,token:parts[2]};say('235 2.7.0 Authentication successful')}catch{auth=null;failures++;say('535 5.7.8 Authentication failed');if(failures>=3)terminate()}authPending=false}
  say('220 local.test Vexa127 authenticated closed relay');
  socket.on('data',chunk=>{if(halted)return;buf=Buffer.concat([buf,chunk]);for(;!halted;){const nl=buf.indexOf('\r\n');const limit=data!==null?1000:2048;if(nl<0){if(buf.length>limit)terminate('500 5.5.2 Line too long');return}if(nl+2>limit){terminate('500 5.5.2 Line too long');return}const lineBytes=buf.subarray(0,nl);buf=buf.subarray(nl+2);let line;try{line=new TextDecoder('utf-8',{fatal:true}).decode(lineBytes)}catch{terminate('500 5.5.2 Invalid UTF-8');return}
   if(data!==null){if(line==='.'){
    try{const raw=data.join('\r\n')+'\r\n',p=parseMail(raw);demand(fromAddress(p.claimedFrom)===auth.address,'SENDER','Header From differs from authenticated sender');
     const key=p.request_id??'smtp-'+randomBytes(16).toString('hex');const result=store.send(auth.token,{to:recipients,subject:p.subject,body:p.body,attachments:p.attachments,raw:p.raw,request_id:key,max_cost:recipients.length});say('250 2.0.0 '+(result.replayed?'REPLAY ':'COMMITTED ')+result.message_id+' block='+result.block_height)
    }catch(e){const code=['FUNDS','ALLOWANCE','QUOTA','STAMP_CAPACITY','REPLAY_CAPACITY','MESSAGE_CAPACITY'].includes(e.code)?452:e.http===401?530:e.http===503?451:554;say(code+' 5.7.1 '+(e.code??'INTERNAL')+' message not accepted')}reset();continue}
    const unstuffed=line.startsWith('..')?line.slice(1):line;bytes+=Buffer.byteLength(unstuffed)+2;if(bytes>DEFAULTS.max_raw_bytes){terminate('552 5.3.4 Message too large');return}data.push(unstuffed);continue
   }
   if(authPending){login(line);continue}
   const at=line.indexOf(' '),cmd=(at<0?line:line.slice(0,at)).toUpperCase(),arg=at<0?'':line.slice(at+1);
   if(cmd==='QUIT'){terminate('221 2.0.0 Bye');return}
   if(cmd==='EHLO'||cmd==='HELO'){greeted=true;reset();if(cmd==='EHLO'){say('250-local.test');say('250-SIZE '+DEFAULTS.max_raw_bytes);say('250-8BITMIME');say('250-AUTH PLAIN');say('250 HELP')}else say('250 local.test');continue}
   if(cmd==='NOOP'){say('250 2.0.0 OK');continue}if(cmd==='RSET'){reset();say('250 2.0.0 Reset');continue}
   if(!greeted){say('503 5.5.1 Send EHLO first');continue}
   if(cmd==='AUTH'){if(from||auth){say('503 5.5.1 AUTH not permitted now');continue}const parts=arg.split(' ');if(parts[0]?.toUpperCase()!=='PLAIN'||parts.length>2){say('504 5.5.4 Only AUTH PLAIN is supported');continue}if(parts[1])login(parts[1]);else{authPending=true;say('334 ')}continue}
   if(!auth){say('530 5.7.0 Authentication required');continue}
   try{
    if(cmd==='MAIL'){reset();const m=/^FROM:<([^<>]+)>(?: SIZE=(\d+))?$/i.exec(arg);demand(m,'SYNTAX','Malformed MAIL');const a=address(m[1]);demand(a===auth.address,'SENDER','Sender must equal authenticated mailbox',403);if(m[2])demand(Number(m[2])<=DEFAULTS.max_raw_bytes,'SIZE','Message too large');from=a;say('250 2.1.0 Sender accepted')}
    else if(cmd==='RCPT'){demand(from,'SEQUENCE','MAIL required');demand(recipients.length<DEFAULTS.max_recipients,'RECIPIENTS','Recipient limit');const m=/^TO:<([^<>]+)>$/i.exec(arg);demand(m,'SYNTAX','Malformed RCPT');const a=address(m[1]);const s=store.state();demand(s.accounts[a],'NO_MAILBOX','SMTP requires a concrete local mailbox',404);demand(s.accounts[a].accept&&!s.accounts[a].blocked.includes(auth.address),'CONSENT','Recipient refused',403);if(!recipients.includes(a))recipients.push(a);say('250 2.1.5 Recipient accepted')}
    else if(cmd==='DATA'){demand(from&&recipients.length&&arg==='','SEQUENCE','MAIL and RCPT required');data=[];bytes=0;say('354 End with <CRLF>.<CRLF>')}
    else say('502 5.5.1 Command not implemented');
   }catch(e){say((e.code==='SEQUENCE'?503:e.code==='SIZE'?552:550)+' 5.7.1 '+e.code+' refused')}
  }});
 });
 server.maxConnections=DEFAULTS.max_connections+1;
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,host,resolve)});
 return {server,port:server.address().port,close:()=>new Promise(resolve=>{for(const s of sockets)s.destroy();server.close(resolve)})};
}
