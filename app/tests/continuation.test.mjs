import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {Store} from '../src/store.mjs';
import {parseMail} from '../src/mime.mjs';
import {startHttp} from '../src/http.mjs';
const raw = (headers, body='hello') => `From: postmaster@local.test\r\n${headers}\r\n\r\n${body}`;
const expectCode=(fn,code)=>assert.throws(fn,e=>e.code===code);
function fixture(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'vexa-r03-'));const s=new Store(root);const c=JSON.parse(fs.readFileSync(path.join(root,'credentials.secret.json')));t.after(()=>{s.close();fs.rmSync(root,{recursive:true,force:true})});return {s,root,a:c['postmaster@local.test'],u:c['user@local.test']}}
function send(f,seq=0){return f.s.send(f.a,{to:['user@local.test'],subject:'page '+seq,body:'synthetic '+seq,request_id:'r03-request-'+seq,max_cost:1})}
function corrupt(f){const s=f.s.state();s.accounts['user@local.test'].accept=false;f.s.db.prepare('UPDATE state SET json=? WHERE singleton=1').run(JSON.stringify(s))}
function multipart(boundary){return raw('Content-Type: multipart/mixed; boundary="'+boundary+'"',`--${boundary}\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\nhello\r\n--${boundary}--\r\n`)}
test('T061 empty first Subject does not allow a duplicate security header',()=>expectCode(()=>parseMail(raw('Subject:\r\nSubject: ambiguous')),'MIME'));
test('T062 near-match text/plain media type is refused',()=>expectCode(()=>parseMail(raw('Content-Type: text/plain-junk')),'MIME_UNSUPPORTED'));
test('T063 near-match multipart/mixed media type is refused',()=>expectCode(()=>parseMail(multipart('b').replace('multipart/mixed','multipart/mixed-junk')),'MIME_UNSUPPORTED'));
test('T064 boundary ending in two hyphens has a distinct closing delimiter',()=>assert.equal(parseMail(multipart('valid--')).body,'hello'));
test('T065 MIME boundary transport padding is tolerated',()=>assert.equal(parseMail(multipart('valid').replaceAll('--valid\r\n','--valid \t\r\n').replace('--valid--\r\n','--valid-- \t\r\n')).body,'hello'));
test('T066 quoted-printable rejects unencoded non-ASCII rather than corrupting it',()=>expectCode(()=>parseMail(raw('Content-Transfer-Encoding: quoted-printable','🚀')),'MIME'));
test('T067 quoted-printable UTF-8 byte escapes decode exactly',()=>assert.equal(parseMail(raw('Content-Transfer-Encoding: quoted-printable','=F0=9F=9A=80')).body,'🚀'));
for(const [n,method] of [[68,'directory'],[69,'ledger'],[70,'exportMailbox'],[71,'quarantine']])test(`T0${n} ${method} fails closed on changed signed state`,t=>{const f=fixture(t);send(f);corrupt(f);expectCode(()=>f.s[method](f.a),'INTEGRITY')});
test('T072 checkpoint fails closed on a changed current-state root',t=>{const f=fixture(t);corrupt(f);expectCode(()=>f.s.checkpoint(),'INTEGRITY')});
test('T073 mailbox pages enumerate 105 messages exactly once, including beyond legacy cap',t=>{const f=fixture(t);f.s.preferences(f.a,{daily:1000});f.s.credit(f.a,{address:'postmaster@local.test',amount:100,request_id:'r03-page-funding'});for(let i=0;i<105;i++)send(f,i);let before=null,head=null,ids=[],pages=0;do{const p=f.s.page(f.u,{limit:25,before,head});assert.equal(p.total,105);assert(p.messages.length<=25);ids.push(...p.messages.map(m=>m.id));before=p.next_before;head=p.head;pages++}while(before);assert.equal(pages,5);assert.equal(ids.length,105);assert.equal(new Set(ids).size,105);assert.equal(f.s.list(f.u).length,100);assert.equal(f.s.verify().ok,true)});
test('T074 pagination refuses cursors after any signed-head change',t=>{const f=fixture(t);send(f,1);send(f,2);const p=f.s.page(f.u,{limit:1});f.s.preferences(f.u,{accept:false});expectCode(()=>f.s.page(f.u,{limit:1,before:p.next_before,head:p.head}),'PAGE_CHANGED')});
test('T075 pagination cursor cannot cross mailbox ownership',t=>{const f=fixture(t);send(f);const p=f.s.page(f.u,{limit:1});expectCode(()=>f.s.page(f.a,{folder:'Sent',before:p.messages[0].id,head:p.head}),'PAGE_CURSOR')});
test('T076 pagination validates folder, limits, paired cursor fields and authentication',t=>{const f=fixture(t);for(const x of [0,101,1.1,NaN])expectCode(()=>f.s.page(f.u,{limit:x}),'PARAMETER');expectCode(()=>f.s.page(f.u,{folder:'../INBOX'}),'FOLDER');expectCode(()=>f.s.page(f.u,{before:'0'.repeat(32)}),'PAGE_CURSOR');expectCode(()=>f.s.page('wrong-token-value'),'AUTH')});
test('T077 empty page response is bounded and has a verified head',t=>{const f=fixture(t),p=f.s.page(f.u,{});assert.equal(p.total,0);assert.deepEqual(p.messages,[]);assert.equal(p.next_before,null);assert.equal(p.head,f.s.head().hash)});
test('T078 page HTTP route preserves ownership and errors on invalid limits',async t=>{const f=fixture(t),h=await startHttp(f.s,{port:0});t.after(()=>h.close());send(f);const get=async q=>{const r=await fetch(`http://127.0.0.1:${h.port}/api/mailbox-page${q}`,{headers:{Authorization:'Bearer '+f.u}});return {status:r.status,data:await r.json()}};const p=await get('?limit=1');assert.equal(p.status,200);assert.equal(p.data.messages.length,1);assert.equal((await get('?limit=NaN')).status,400);assert.equal((await get('?folder=Sent')).data.total,0)});
