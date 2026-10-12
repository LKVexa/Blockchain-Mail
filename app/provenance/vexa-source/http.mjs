import http from 'node:http';import fs from 'node:fs';import path from 'node:path';
import {MailError,demand,DEFAULTS,PROFILE,BRANCHES}from './policy.mjs';import {VERSION}from './store.mjs';import {networkPolicy}from './guard.mjs';import {toEml}from './mime.mjs';
const WEB=path.resolve(import.meta.dirname,'../web');
const headers={'Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; font-src 'none'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",'X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Referrer-Policy':'no-referrer','Cross-Origin-Opener-Policy':'same-origin','Cross-Origin-Resource-Policy':'same-origin','Cache-Control':'no-store'};
function readBody(req){return new Promise((resolve,reject)=>{const chunks=[];let bytes=0;req.on('data',b=>{bytes+=b.length;if(bytes>1200000){reject(new MailError('SIZE','Request too large',413));req.destroy();return}chunks.push(b)});req.on('end',()=>{try{resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')||'{}'))}catch{reject(new MailError('JSON','Malformed JSON'))}});req.on('error',reject)})}
export async function startHttp(store,{port=8787,host='127.0.0.1',smtpPort=2525,onShutdown=()=>{}}={}){
 demand(host==='127.0.0.1','BIND','Only literal 127.0.0.1 is allowed');let boundPort;const sockets=new Set();
 const server=http.createServer({maxHeaderSize:16384,requestTimeout:15000,headersTimeout:10000},async(req,res)=>{
  const send=(status,data,type='application/json')=>{if(res.destroyed||res.writableEnded)return;res.writeHead(status,{...headers,'Content-Type':type});res.end(type==='application/json'?JSON.stringify(data):data)};
  try{
   demand(req.headers.host==='127.0.0.1:'+boundPort,'HOST','Host header refused',403);
   demand(!req.headers.origin||req.headers.origin==='http://127.0.0.1:'+boundPort,'ORIGIN','Cross-origin request refused',403);
   demand(!['cross-site','same-site'].includes(req.headers['sec-fetch-site']),'CROSS_SITE','Cross-site request refused',403);
   demand(req.method==='GET'||req.method==='POST','METHOD','Method not allowed',405);
   const u=new URL(req.url,'http://127.0.0.1:'+boundPort),r=u.pathname;
   if(req.method==='GET'&&['/','/app.js','/session.mjs','/styles.css'].includes(r)){const file=r==='/'?'index.html':r.slice(1);return send(200,fs.readFileSync(path.join(WEB,file)),r==='/'?'text/html; charset=utf-8':(r.endsWith('.js')||r.endsWith('.mjs'))?'text/javascript; charset=utf-8':'text/css; charset=utf-8')}
   if(req.method==='GET'&&r==='/health')return send(200,{ok:true,version:VERSION,profile:PROFILE,host:'127.0.0.1',http_port:boundPort,smtp_port:smtpPort,network:networkPolicy});
   const bearer=req.headers.authorization;demand(typeof bearer==='string'&&bearer.startsWith('Bearer '),'AUTH','Bearer token required',401);const tok=bearer.slice(7);store.authenticate(tok);
   if(req.method==='GET'){
    if(r==='/api/mailbox-page')return send(200,store.page(tok,{folder:u.searchParams.get('folder')??'INBOX',limit:u.searchParams.has('limit')?Number(u.searchParams.get('limit')):25,before:u.searchParams.get('before'),head:u.searchParams.get('head')}));
    if(r==='/api/me')return send(200,store.me(tok));
    if(r==='/api/messages')return send(200,store.list(tok,u.searchParams.get('folder')??'INBOX'));
    if(r==='/api/directory')return send(200,store.directory(tok));
    if(r==='/api/ledger')return send(200,store.ledger(tok));
    if(r==='/api/checkpoint')return send(200,store.checkpoint());
    if(r==='/api/quarantine')return send(200,store.quarantine(tok));
    if(r==='/api/parents'){const p=path.resolve(import.meta.dirname,'../docs/PARENT_STATUS.json');return send(200,fs.existsSync(p)?JSON.parse(fs.readFileSync(p,'utf8')):{parents:[],notice:'Assessment index not packaged'})}
    if(r==='/api/export'){res.setHeader('Content-Disposition','attachment; filename="vexa127-mailbox-export.json"');return send(200,store.exportMailbox(tok))}
    const match=/^\/api\/messages\/([a-f0-9]{32})(?:\/(eml|attachment)(?:\/(\d))?)?$/.exec(r);
    if(match){const m=store.message(tok,match[1]);if(match[2]==='eml'){res.setHeader('Content-Disposition','attachment; filename="'+m.message_id+'.eml"');return send(200,toEml(m),'application/octet-stream')}if(match[2]==='attachment'){const a=m.attachments[Number(match[3])];demand(a,'NOT_FOUND','Attachment not found',404);res.setHeader('Content-Disposition',"attachment; filename*=UTF-8''"+encodeURIComponent(a.name));return send(200,Buffer.from(a.data,'base64'),'application/octet-stream')}return send(200,m)}
   }else{
    demand((req.headers['content-type']??'').split(';')[0]==='application/json'&&req.headers['x-bve-request']==='1','CONTENT_TYPE','JSON and X-BVE-Request: 1 are required',415);const input=await readBody(req);demand(input&&typeof input==='object'&&!Array.isArray(input),'JSON','Expected a JSON object');
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
  }catch(e){if(e instanceof MailError)send(e.http,{error:e.code,message:e.message});else send(500,{error:'INTERNAL',message:'Operation failed; no success claimed. Inspect local verification.'})}
 });
 server.on('connection',s=>{sockets.add(s);s.on('close',()=>sockets.delete(s))});server.maxConnections=32;server.keepAliveTimeout=5000;server.on('clientError',(_,s)=>s.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n'));
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,host,resolve)});boundPort=server.address().port;
 return {server,port:boundPort,close:()=>new Promise(resolve=>{for(const s of sockets)s.destroy();server.close(resolve)})};
}
