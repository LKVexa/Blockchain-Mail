import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import net from 'node:net';
import {spawnSync} from 'node:child_process';
import {Store} from '../src/store.mjs';
import {startHttp} from '../src/http.mjs';
import {startSmtp} from '../src/smtp.mjs';
import {serve} from '../src/main.mjs';
import {canonical,hash,keys,seal,unseal,signature,verifySignature} from '../src/crypto.mjs';
import {expand} from '../src/policy.mjs';
import {parseMail,fromAddress} from '../src/mime.mjs';

function fixture(t,options={}){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'vexa-mail-hardening-'));
 const store=new Store(root,options),creds=JSON.parse(fs.readFileSync(path.join(root,'credentials.secret.json'),'utf8'));
 t.after(()=>{try{store.close()}catch{}fs.rmSync(root,{recursive:true,force:true})});
 return {root,store,token:creds['postmaster@local.test'],user:creds['user@local.test']};
}
const draft=extra=>({to:['user@local.test'],subject:'Hardening',body:'hello',request_id:'hardening-send-001',max_cost:1,...extra});
const rejects=(fn,code)=>assert.throws(fn,error=>error.code===code);
function request(port,{headers={},body,path='/health'}={}){
 return new Promise((resolve,reject)=>{const req=http.request({hostname:'127.0.0.1',port,path,method:body===undefined?'GET':'POST',headers},res=>{let text='';res.setEncoding('utf8');res.on('data',chunk=>text+=chunk);res.on('end',()=>resolve({status:res.statusCode,text,headers:res.headers}))});req.on('error',reject);req.end(body)});
}

test('MAIL-HARDEN-01 loopback server rejects preview hosts and empty or noncanonical origins',async t=>{
 const f=fixture(t),web=await startHttp(f.store,{port:0});t.after(()=>web.close());
 for(const host of ['app.grok-sandbox.com','preview.grok.mil','evil.grok.me','localhost:'+web.port])assert.equal((await request(web.port,{headers:{Host:host}})).status,403);
 for(const origin of ['', 'null','http://127.0.0.1:'+web.port+'/', 'https://127.0.0.1:'+web.port])assert.equal((await request(web.port,{headers:{Origin:origin}})).status,403);
 assert.equal((await request(web.port,{headers:{Origin:'http://127.0.0.1:'+web.port,'Sec-Fetch-Site':'same-origin'}})).status,200);
 assert.equal((await request(web.port,{headers:{'Sec-Fetch-Site':'same-site'}})).status,403);
});

test('MAIL-HARDEN-02 malformed UTF-8 JSON and oversize uploads do not mutate state',async t=>{
 const f=fixture(t),web=await startHttp(f.store,{port:0});t.after(()=>web.close());
 const headers={Authorization:'Bearer '+f.token,'Content-Type':'application/json','X-BVE-Request':'1'};
 const invalid=Buffer.concat([Buffer.from('{"accept":true,"note":"'),Buffer.from([0xc0]),Buffer.from('"}')]);
 assert.equal((await request(web.port,{path:'/api/preferences',headers,body:invalid})).status,400);
 const large=JSON.stringify({note:'x'.repeat(1200000)}),response=await request(web.port,{path:'/api/preferences',headers,body:large});
 assert.equal(response.status,413);assert.equal(response.headers.connection,'close');assert.equal(f.store.head().header.height,0);
});

test('MAIL-HARDEN-03 SMTP authentication cutoff discards already buffered commands',async t=>{
 const f=fixture(t),smtp=await startSmtp(f.store,{port:0});t.after(()=>smtp.close());
 const socket=net.createConnection({host:'127.0.0.1',port:smtp.port});t.after(()=>socket.destroy());
 const valid=Buffer.from('\0postmaster@local.test\0'+f.token).toString('base64');
 const output=await new Promise((resolve,reject)=>{
  let result='',sent=false;const timer=setTimeout(()=>{socket.destroy();reject(new Error('SMTP cutoff did not close'))},4000);
  socket.on('error',reject);socket.on('close',()=>{clearTimeout(timer);resolve(result)});
  socket.on('data',chunk=>{result+=chunk.toString();if(!sent&&result.includes('220 ')){sent=true;socket.write(['EHLO test','AUTH PLAIN bad','AUTH PLAIN bad','AUTH PLAIN bad','AUTH PLAIN '+valid,'MAIL FROM:<postmaster@local.test>','RCPT TO:<user@local.test>','DATA','From: postmaster@local.test','Subject: Hardening','','hello','.',''].join('\r\n'))}});
 });
 assert.equal((output.match(/535 /g)??[]).length,3);assert.doesNotMatch(output,/235 |COMMITTED/);assert.equal(f.store.head().header.height,0);assert.equal(f.store.me(f.token).balance,100);
});

test('MAIL-HARDEN-04 altered nonce index is detected and cannot permit encryption nonce reuse',t=>{
 const f=fixture(t,{nonceFactory:()=>Buffer.alloc(12,9)});f.store.send(f.token,draft());
 f.store.db.prepare('UPDATE objects SET nonce=?').run('f'.repeat(24));
 assert.equal(f.store.verify().ok,false);assert.match(f.store.verify().errors[0],/nonce index/);
 rejects(()=>f.store.send(f.token,draft({request_id:'hardening-send-002'})),'NONCE_REUSE');
 assert.equal(f.store.head().header.height,1);assert.equal(f.store.state().burned,1);assert.equal(f.store.state().messages.length,2);
});

test('MAIL-HARDEN-05 alias fanout expands each node once while retaining cycle and depth checks',()=>{
 const accounts={'user@local.test':{}},aliases={};let accesses=0;
 for(let depth=0;depth<8;depth++){const next=depth===7?'user@local.test':'a'+(depth+1)+'@local.test',targets=Array(8).fill(next);Object.defineProperty(aliases,'a'+depth+'@local.test',{get(){accesses++;return targets},enumerable:true})}
 assert.deepEqual(expand(['a0@local.test'],{accounts,aliases}),['user@local.test']);assert(accesses<=16,'Alias expansion must stay proportional to the alias graph');
 const deeper={...aliases,'deep@local.test':['a0@local.test']};rejects(()=>expand(['a0@local.test','deep@local.test'],{accounts,aliases:deeper}),'ALIAS_DEPTH');
 rejects(()=>expand(['cycle@local.test'],{accounts,aliases:{'cycle@local.test':['cycle@local.test']}}),'ALIAS_CYCLE');
});

test('MAIL-HARDEN-06 MIME control bytes and unbalanced From headers fail closed',t=>{
 for(const header of ['X-Test: value\nFrom: forged','X-Test: value\rFrom: forged','X-Test: nul\0','X-Test: del\x7f'])rejects(()=>parseMail('From: postmaster@local.test\r\n'+header+'\r\n\r\nhello'),'MIME');
 for(const from of ['<postmaster@local.test','postmaster@local.test>','Alice <postmaster@local.test'])rejects(()=>fromAddress(from),'RAW_BINDING');
 assert.equal(fromAddress('Alice <postmaster@local.test>'),'postmaster@local.test');
 const f=fixture(t);rejects(()=>f.store.send(f.token,draft({raw:'From: <postmaster@local.test\r\nSubject: Hardening\r\n\r\nhello'})),'RAW_BINDING');assert.equal(f.store.head().header.height,0);
});

test('MAIL-HARDEN-07 mailbox creation respects the same credit supply cap as credits',t=>{
 const f=fixture(t);f.store.mutate(f.token,(state,actor,now,events)=>{const extra=1e9-state.issued;state.sponsor.balance+=extra;state.issued+=extra;events.push({type:'TEST_SUPPLY_CAP'});return {}});
 rejects(()=>f.store.createAccount(f.token,{address:'over-cap@local.test',credits:1}),'SUPPLY');assert.equal(f.store.state().issued,1e9);assert.equal(f.store.head().header.height,1);assert(f.store.verify().ok);
});

test('MAIL-HARDEN-08 startup rejects mismatched authority secrets and malformed seal keys',t=>{
 const f=fixture(t);f.store.close();const keyPath=path.join(f.root,'node.secret.json'),original=JSON.parse(fs.readFileSync(keyPath,'utf8'));
 fs.writeFileSync(keyPath,JSON.stringify({...original,privateKey:keys().privateKey}));rejects(()=>new Store(f.root),'KEY');
 fs.writeFileSync(keyPath,JSON.stringify({...original,sealKey:'z'.repeat(64)}));rejects(()=>new Store(f.root),'KEY');
 fs.writeFileSync(keyPath,JSON.stringify(original));const reopened=new Store(f.root);assert(reopened.verify().ok);reopened.close();
});

test('MAIL-HARDEN-09 encryption rejects noncanonical encodings and accepts 12-byte Uint8Array nonces',()=>{
 const key=keys().sealKey,blob=seal({hello:'world'},key,'test',new Uint8Array(12));assert.equal(blob.nonce,'0'.repeat(24));assert.deepEqual(unseal(blob,key,'test'),{hello:'world'});
 assert.throws(()=>unseal({...blob,ciphertext:blob.ciphertext+'\n'},key,'test'));assert.throws(()=>seal({},key,'test',Buffer.alloc(11)));assert.throws(()=>seal({},'not-a-key','test'));
});

test('MAIL-HARDEN-10 ill-formed Unicode and blank attachment names cannot create unreadable exports',t=>{
 const f=fixture(t);rejects(()=>f.store.send(f.token,draft({subject:'\ud800'})),'SUBJECT');rejects(()=>f.store.send(f.token,draft({body:'\ud800'})),'BODY');
 for(const name of ['','   ','\ud800','bad\x7f'])rejects(()=>f.store.send(f.token,draft({attachments:[{name,data:''}]})),'ATTACHMENT_NAME');
 rejects(()=>f.store.send(f.token,draft({raw:'\ud800'})),'RAW');assert.equal(f.store.head().header.height,0);
});

test('MAIL-HARDEN-11 guard denies public UDP constructor and inherited listener handles',()=>{
 const script=`import net from 'node:net';import dgram from 'node:dgram';import {installGuard} from './src/guard.mjs';const OriginalSocket=dgram.Socket,existing=new OriginalSocket('udp4');installGuard();const probes=[()=>new dgram.Socket('udp4'),()=>new OriginalSocket('udp4').send('x',25,'203.0.113.1'),()=>existing.bind(0,'127.0.0.1'),()=>net.createServer().listen({host:'127.0.0.1',path:'guard-test-pipe'}),()=>net.createServer().listen({host:'127.0.0.1',fd:1})];for(const probe of probes){let blocked=false;try{probe()}catch(error){if(error.code!=='ELOCAL127')throw error;blocked=true}if(!blocked)throw new Error('Guard bypass');}existing.close();`;
 const result=spawnSync(process.execPath,['--input-type=module','-e',script],{cwd:path.resolve(import.meta.dirname,'..'),encoding:'utf8',timeout:5000});assert.equal(result.status,0,result.stderr);
});

test('MAIL-HARDEN-12 lock owner replaces stale discovery and removes only its own listener record',async t=>{
 const f=fixture(t);f.store.close();const listener=path.join(f.root,'listener.json');fs.writeFileSync(listener,'{"pid":1,"run_id":"stale"}');
 const running=await serve({root:f.root,httpPort:0,smtpPort:0});t.after(()=>running.stop());
 const current=JSON.parse(fs.readFileSync(listener,'utf8'));assert.equal(current.pid,process.pid);assert.equal(current.run_id,running.run_id);assert.notEqual(current.run_id,'stale');
 assert(!fs.readdirSync(f.root).some(name=>name.startsWith('.listener-')));
 fs.writeFileSync(listener,JSON.stringify({...current,run_id:'someone-else'}));await running.stop();assert.equal(JSON.parse(fs.readFileSync(listener,'utf8')).run_id,'someone-else');assert(!fs.existsSync(path.join(f.root,'server.lock')));
});

test('MAIL-HARDEN-13 signature encoding cannot malleate a valid signed chain head',t=>{
 const key=keys(),value={ok:true},signed=signature('TEST',value,key.privateKey);assert(verifySignature('TEST',value,signed,key.publicKey));
 for(const altered of [signed+'\n',signed+'!'])assert.equal(verifySignature('TEST',value,altered,key.publicKey),false);
 const f=fixture(t),block=f.store.head();block.signature+='\n';block.hash=hash('VEXA127-BLOCK/1\n'+canonical(block.header)+'\n'+block.signature);f.store.db.prepare('UPDATE blocks SET hash=?,json=? WHERE height=0').run(block.hash,canonical(block));
 assert.equal(f.store.verify().ok,false);assert.match(f.store.verify().errors[0],/signature invalid/);
});
