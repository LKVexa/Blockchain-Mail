import http from 'node:http';import fs from 'node:fs';import path from 'node:path';
import {GlyphokuService,CONFIG} from './glyphoku-service.mjs';
import {RegistryError} from '../desk/modules/lib/glyphoku/registry.js';
import {createProtectedApi} from './protected-api.mjs';
import {timingSafeEqual} from 'node:crypto';
import {createMailRouter} from './mail-routing.mjs';
import {createMailApi,mailApiHandles} from './mail-api.mjs';
import {createVirtualMailSocket} from './virtual-mail-socket.mjs';
import {MailError,demand,DEFAULTS,PROFILE,BRANCHES}from './policy.mjs';import {VERSION}from './store.mjs';import {networkPolicy}from './guard.mjs';
const DESK=path.resolve(import.meta.dirname,'../desk');
const WEB=path.resolve(import.meta.dirname,'../web');
function hostAllowed(header,port){return header===(port===80?'127.0.0.1':'127.0.0.1:'+port)}
function originAllowed(origin,port){return origin===undefined||origin==='http://'+(port===80?'127.0.0.1':'127.0.0.1:'+port)}
const headers={'Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; font-src 'none'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",'X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Referrer-Policy':'no-referrer','Cross-Origin-Opener-Policy':'same-origin','Cross-Origin-Resource-Policy':'same-origin','Cache-Control':'no-store'};
function readBody(req,limit=1200000){return new Promise((resolve,reject)=>{const chunks=[];let bytes=0,settled=false;const fail=e=>{if(settled)return;settled=true;chunks.length=0;reject(e);req.resume()};req.on('data',b=>{if(settled)return;bytes+=b.length;if(bytes>limit)return fail(new MailError('SIZE','Request too large',413));chunks.push(b)});req.on('end',()=>{if(settled)return;try{const text=new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks));settled=true;resolve(JSON.parse(text||'{}'))}catch{reject(new MailError('JSON','Malformed UTF-8 JSON'))}});req.on('aborted',()=>fail(new MailError('JSON','Incomplete request body')));req.on('error',fail)})}
export async function startHttp(store,{port=8787,host='127.0.0.1',smtpPort=2525,onShutdown=()=>{},glyphokuOptions={},vaultKey=null,runId=null,internetMail=null,torusMail=null,torusOnboarding=null}={}){
 demand(host==='127.0.0.1','BIND','Only literal 127.0.0.1 is allowed');let boundPort;const sockets=new Set();
 const channel=vaultKey?await createProtectedApi(vaultKey,runId):null;
 demand(!!store.vault===!!channel,'VAULT_CHANNEL_REQUIRED','Protected storage and API must be enabled together',503);
 if(channel)demand(Buffer.isBuffer(vaultKey)&&vaultKey.length===32&&timingSafeEqual(vaultKey,store.vault.master),'VAULT_CHANNEL_KEY','Storage and API keys must match',503);
 const glyphoku=new GlyphokuService(store,glyphokuOptions);
 const mailRouter=createMailRouter(store,internetMail,torusMail);
 const mailApi=createMailApi(store,mailRouter,internetMail,{beforeMail:torusOnboarding?(tok,input)=>torusOnboarding.prepare(tok,input):null,accountView:torusMail?tok=>{torusMail.login(tok);return store.me(tok);}:null});let virtualMail=null;
 const ui=file=>{const bytes=fs.readFileSync(file);return channel&&file.endsWith('.html')?Buffer.from(bytes.toString('utf8').replace('</head>','<link rel="stylesheet" href="/protected.css"><script src="/protected-bootstrap.js"></script></head>')):bytes};
 const deskFiles=new Map();function catalog(dir){for(const d of fs.readdirSync(dir,{withFileTypes:true})){const f=path.join(dir,d.name);if(d.isDirectory())catalog(f);else if(d.isFile()&&/\.(html|css|js|json)$/.test(f))deskFiles.set('/desk/'+path.relative(DESK,f).replaceAll('\\','/'),f);}}if(fs.existsSync(DESK))catalog(DESK);
 const server=http.createServer({maxHeaderSize:16384,requestTimeout:15000,headersTimeout:10000},async(req,res)=>{
  let protectedRequest=null,innerBody=null,responseHeaders={};
  const send=async(status,data,type='application/json')=>{if(res.destroyed||res.writableEnded)return;if(protectedRequest){try{data=await channel.response(protectedRequest,status,data,type,responseHeaders)}catch{data=await channel.response(protectedRequest,413,{error:'SIZE',message:'Protected response exceeds its bounded export limit'},'application/json')}status=200;type='application/json';responseHeaders={}}if(res.destroyed||res.writableEnded)return;const securityHeaders=channel?{...headers,'Content-Security-Policy':headers['Content-Security-Policy'].replace("connect-src 'self'","connect-src 'self' ws://"+(boundPort===80?'127.0.0.1':'127.0.0.1:'+boundPort))}:headers;res.writeHead(status,{...securityHeaders,...responseHeaders,'Content-Type':type});res.end(type==='application/json'?JSON.stringify(data):data)};
  try{
   demand(hostAllowed(req.headers.host,boundPort),'HOST','Host header refused',403);
   demand(originAllowed(req.headers.origin,boundPort),'ORIGIN','Cross-origin request refused',403);
   const site=req.headers['sec-fetch-site'];
   demand(!site||site==='same-origin'||site==='none','CROSS_SITE','Cross-site request refused',403);
   demand(req.method==='GET'||req.method==='POST','METHOD','Method not allowed',405);
   let u=new URL(req.url,'http://127.0.0.1:'+boundPort),r=u.pathname;
   if(req.method==='GET'&&r!=='/desk/index.html'&&deskFiles.has(r)){const file=deskFiles.get(r);demand(fs.existsSync(file),'NOT_FOUND','Local UI build unavailable',404);return send(200,ui(file),file.endsWith('.html')?'text/html; charset=utf-8':file.endsWith('.css')?'text/css; charset=utf-8':'text/javascript; charset=utf-8');}
   if(req.method==='GET'&&['/','/mail/','/internet/','/desk/index.html','/internet.mjs','/internet.css','/app.js','/session.mjs','/theme.mjs','/styles.css','/protected-bootstrap.js','/protected-wire.mjs','/protected-export.mjs','/mail-socket.mjs','/torus-settings.mjs','/attachment-client.mjs','/protected.css'].includes(r)){const mailbox=['/','/mail/','/internet/','/desk/index.html'].includes(r),file=mailbox?'index.html':r.slice(1);return send(200,ui(path.join(WEB,file)),mailbox?'text/html; charset=utf-8':(r.endsWith('.js')||r.endsWith('.mjs'))?'text/javascript; charset=utf-8':'text/css; charset=utf-8')}
   if(req.method==='GET'&&r==='/health')return send(200,channel?{ok:true,version:VERSION,runId,protected:true,protocol:1,mail_socket:{path:'/api/mail/socket',protocol:'workspace.mail.v1'}}:{ok:true,version:VERSION,profile:PROFILE,host:'127.0.0.1',http_port:boundPort,smtp_port:smtpPort,network:networkPolicy,glyphoku:CONFIG});
   if(channel){
    demand(req.method==='POST'&&r==='/api/protected','PROTECTED_REQUIRED','Unlock the protected workspace to use private APIs',403);
    demand((req.headers['content-type']??'').split(';')[0]==='application/json'&&req.headers['x-bve-request']==='1','CONTENT_TYPE','Protected JSON frame required',415);
    protectedRequest=await channel.open(await readBody(req,1700000));
    req.method=protectedRequest.value.method;req.headers=protectedRequest.value.headers;innerBody=protectedRequest.value.body;
    u=new URL(protectedRequest.value.path,'http://127.0.0.1:'+boundPort);r=u.pathname;
    if(req.method==='GET'&&r==='/api/bootstrap')return send(200,{credentials:store.credentials(),protection:{storage:'AES-256-GCM',transport:'AES-256-GCM',smtp:false,ja21_engine:false,master_law:'reference-only'}});
   }
   const bearer=req.headers.authorization;demand(typeof bearer==='string'&&bearer.startsWith('Bearer '),'AUTH','Bearer token required',401);const tok=bearer.slice(7);store.authenticate(tok);
   if(r.startsWith('/api/internet/'))demand(internetMail,'INTERNET_PROTECTED_REQUIRED','Internet email requires the protected workspace launcher',503);
   if(r.startsWith('/api/torus/'))demand(torusMail,'TORUS_UNAVAILABLE','Private peer mail requires the protected workspace launcher',503);
   if(req.method==='GET'){
    if(r==='/api/torus/status')return send(200,torusMail.status(tok));
    if(r==='/api/torus/outbox')return send(200,torusMail.list(tok));
    if(r==='/api/torus/card')return send(200,torusMail.exportCard(tok));
    if(r==='/api/torus/directory')return send(200,torusMail.exportDirectory(tok));
    if(mailApiHandles(req.method,r)){const result=await mailApi({method:req.method,path:r+u.search,headers:req.headers,body:null});responseHeaders=result.headers;return send(result.status,result.data,result.type);}
    if(r==='/api/glyphoku/mail')return send(200,glyphoku.mail(tok));
    if(r==='/api/glyphoku/state')return send(200,glyphoku.view(tok));
    if(r==='/api/glyphoku/operation')return send(200,glyphoku.operation(tok,u.searchParams.get('id')));
    if(r==='/api/glyphoku/trace')return send(200,glyphoku.trace(tok,u.searchParams.get('id')));
    if(r==='/api/directory')return send(200,store.directory(tok));
    if(r==='/api/local127-registry')return send(200,store.local127Registry(tok));
    if(r==='/api/ledger')return send(200,store.ledger(tok));
    if(r==='/api/checkpoint')return send(200,store.checkpoint());
    if(r==='/api/resolution')return send(200,store.resolution(tok));
    if(r==='/api/loopback')return send(200,store.loopback(tok,boundPort));
    if(r==='/api/quarantine')return send(200,store.quarantine(tok));
    if(r==='/api/parents'){const p=path.resolve(import.meta.dirname,'../docs/PARENT_STATUS.json');return send(200,fs.existsSync(p)?JSON.parse(fs.readFileSync(p,'utf8')):{parents:[],notice:'Assessment index not packaged'})}
    if(r==='/api/export'){responseHeaders['Content-Disposition']='attachment; filename="mailbox-export.json"';return send(200,store.exportMailbox(tok))}
   }else{
    demand((req.headers['content-type']??'').split(';')[0]==='application/json'&&req.headers['x-bve-request']==='1','CONTENT_TYPE','JSON and X-BVE-Request: 1 are required',415);let input;if(protectedRequest){try{input=JSON.parse(innerBody)}catch{throw new MailError('JSON','Malformed protected JSON')}}else input=await readBody(req);demand(input&&typeof input==='object'&&!Array.isArray(input),'JSON','Expected a JSON object');
    if(r==='/api/login')return send(200,torusMail?torusMail.login(tok):store.login(tok));
    if(r==='/api/attachments/create')return send(200,store.attachments.create(tok,input));
    if(r==='/api/attachments/chunk')return send(200,store.attachments.put(tok,input));
    if(r==='/api/attachments/commit')return send(200,await store.attachments.finish(tok,input));
    if(r==='/api/attachments/discard-unfinished'){demand(Object.keys(input).length===0,'ATTACHMENT_REQUEST','No file selection is required');return send(200,store.attachments.discardUnfinished(tok));}
    if(r==='/api/torus/create'){demand(Object.keys(input).length===0,'TORUS_SETUP','No network options are required');return send(200,torusMail.createNetwork(tok));}
    if(['/api/torus/connection-code','/api/torus/connect','/api/torus/sync'].includes(r)){demand(torusOnboarding,'TORUS_UNAVAILABLE','Open the workspace with its bundled Tor connection',503);if(r==='/api/torus/connect'){demand(Object.keys(input).length===1&&Object.hasOwn(input,'code'),'TORUS_CONNECTION_CODE','Provide a connection code');return send(200,await torusOnboarding.connect(tok,input.code));}demand(Object.keys(input).length===0,'TORUS_SETUP','No connection options are required');return send(200,r==='/api/torus/connection-code'?torusOnboarding.connectionCode(tok):await torusOnboarding.sync(tok));}
    if(r==='/api/torus/invite')return send(200,torusMail.invitation(tok,input.coordinate));
    if(r==='/api/torus/join')return send(200,torusMail.join(tok,input.invitation));
    if(r==='/api/torus/admit')return send(200,torusMail.admitPeer(tok,input.card));
    if(r==='/api/torus/import-directory')return send(200,torusMail.importDirectory(tok,input.directory));
    if(r==='/api/mail/socket-ticket'){demand(virtualMail,'PROTECTED_REQUIRED','Unlock the protected workspace to open its mail socket',403);demand(Object.keys(input).length===0,'MAIL_SOCKET_TICKET','No socket options are accepted');return send(200,virtualMail.ticket(tok));}
    if(mailApiHandles(req.method,r+u.search)){const result=await mailApi({method:req.method,path:r+u.search,headers:req.headers,body:JSON.stringify(input)});responseHeaders=result.headers;return send(result.status,result.data,result.type);}
    if(r==='/api/internet/login')return send(200,internetMail.login(tok));
    if(r==='/api/internet/config')return send(200,internetMail.configure(tok,input));
    if(r==='/api/internet/send'){demand(!store.state().torusMail,'TORUS_PRIVATE_ONLY','This private network sends only to assigned @127 mailboxes',403);return send(200,await internetMail.send(tok,input));}
    const games={'start':'start','poll':'poll','ack':'ack','advance':'advance','control':'control','commit':'commit','send':'send'};
    const gameName=r.startsWith('/api/glyphoku/')?r.slice('/api/glyphoku/'.length):null;
    if(gameName&&Object.hasOwn(games,gameName))return send(200,glyphoku[games[gameName]](tok,input));
    if(r==='/api/glyphoku/abandon')return send(200,glyphoku.abandon(tok));
    if(r==='/api/glyphoku/credential')return send(200,glyphoku.credential(tok));
    if(r==='/api/pin')return send(200,store.acceptPin(tok,Object.hasOwn(input,'checkpoint')?input.checkpoint:null));
    if(r==='/api/resolution')return send(200,store.recordResolution(tok));
    if(r==='/api/loopback')return send(200,store.recordLoopback(tok,boundPort));
    if(r==='/api/quote')return send(200,store.quote(tok,input));
    if(r==='/api/stamps')return send(201,store.issue(tok,input));
    if(r==='/api/send')return send(201,store.send(tok,input));
    if(r==='/api/cancel-stamp')return send(200,store.cancel(tok,input.id));
    if(r==='/api/preferences')return send(200,store.preferences(tok,input));
    if(r==='/api/move')return send(200,store.move(tok,input.id,input.folder));
    if(r==='/api/rotate-token')return send(200,store.rotateToken(tok));
    if(r==='/api/admin/mailboxes')return send(201,store.createAccount(tok,input));
    if(r==='/api/admin/credit')return send(200,store.credit(tok,input));
    if(r==='/api/admin/sponsor')return send(200,store.sponsor(tok,input));
    if(r==='/api/admin/alias')return send(200,store.alias(tok,input));
    if(r==='/api/admin/release')return send(200,store.release(tok,input.id));
    if(r==='/api/admin/backup')return send(201,store.backup(tok));
    if(r==='/api/admin/verify'){store.operator(tok,store.state());return send(200,store.verify(input.checkpoint??null))}
    if(r==='/api/admin/shutdown'){store.operator(tok,store.state());send(200,{stopping:true});setTimeout(onShutdown,100);return}
   }
   send(404,{error:'NOT_FOUND',message:'No such endpoint'});
  }catch(e){if(e instanceof RegistryError)send(409,{error:e.code,message:e.message});else if(e instanceof MailError){if(e.http===413)res.setHeader('Connection','close');send(e.http,{error:e.code,message:e.message})}else send(500,{error:'INTERNAL',message:'Operation failed; no success claimed. Inspect local verification.'})}
 });
 if(channel)virtualMail=createVirtualMailSocket({server,origin:()=> 'http://'+(boundPort===80?'127.0.0.1':'127.0.0.1:'+boundPort),runId,channel,store,dispatch:mailApi});
 server.on('connection',s=>{sockets.add(s);s.on('close',()=>sockets.delete(s))});server.maxConnections=32;server.keepAliveTimeout=5000;server.on('clientError',(_,s)=>s.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n'));
 try{await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,host,resolve)});}catch(e){await virtualMail?.close();glyphoku.close();throw e;}boundPort=server.address().port;
 return {server,port:boundPort,close:async()=>{await virtualMail?.close();glyphoku.close();for(const s of sockets)s.destroy();await new Promise(resolve=>server.close(resolve))}};
}
