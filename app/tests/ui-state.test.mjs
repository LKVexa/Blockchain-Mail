import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {randomUUID} from 'node:crypto';
import {SessionFence,SessionChangedError} from '../web/session.mjs';
import {initializeTheme} from '../web/theme.mjs';
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no});return {promise,resolve,reject}};
function app(fetch){
 const elements=new Map();
 function element(id){if(!elements.has(id))elements.set(id,{value:'',files:[],hidden:id==='#toast',textContent:'',innerHTML:'',disabled:false,reset(){},close(){},showModal(){},querySelectorAll(){return []},classList:{toggle(){}},append(){}});return elements.get(id)}
 const context=vm.createContext({document:{documentElement:{dataset:{}},querySelector:element,querySelectorAll:()=>[],createElement:()=>({click(){}})},window:{matchMedia:()=>({matches:false,addEventListener(){},removeEventListener(){}}),addEventListener(){},removeEventListener(){}},initializeTheme,renderTorusSettings:async()=>{},createAttachmentUploads:()=>({clear(){}}),crypto:{randomUUID},SessionFence,SessionChangedError,AbortController,FormData:class{constructor(form){this.fields=form.fields??{};}get(name){return this.fields[name]??null;}},fetch,TextEncoder,Uint8Array,ArrayBuffer,Blob,URL,URLSearchParams,btoa:s=>Buffer.from(s,'binary').toString('base64'),setTimeout:()=>0,clearTimeout:()=>{},confirm:()=>true,prompt:()=>null,downloads:[],console});
 let source=fs.readFileSync(new URL('../web/app.js',import.meta.url),'utf8').replace(/^import .*?from ['"]\.\/(?:session|theme|torus-settings|attachment-client)\.mjs['"];?\s*/gm,'');
 vm.runInContext(source,context,{filename:'packaged-web-app.js'});vm.runInContext('download=(...args)=>downloads.push(args); access="synthetic-test-token";',context);
 return {context,element,run:code=>vm.runInContext(code,context)};
}
test('T079 packaged UI discards an attachment download completed after logout',async()=>{const bytes=deferred(),f=app(async()=>({ok:true,arrayBuffer:()=>bytes.promise}));const task=f.run('fileGet("/api/messages/a/attachment/0","synthetic.bin")');await Promise.resolve();f.element('#logout').onclick();bytes.resolve(Uint8Array.from([1,2]).buffer);await assert.rejects(task,e=>e.code==='SESSION_CHANGED');assert.equal(f.context.downloads.length,0)});
test('T080 packaged UI rejects old attachment preparation after an identity change',async()=>{const bytes=deferred(),f=app(async()=>({ok:true,json:async()=>({})}));f.element('#attachments').files=[{name:'synthetic.txt',size:2,arrayBuffer:()=>bytes.promise}];f.element('#to').value='user@local.test';const task=f.run('draft()');f.element('#logout').onclick();bytes.resolve(Uint8Array.from([1,2]).buffer);await assert.rejects(task,e=>e.code==='SESSION_CHANGED')});
test('T081 logout aborts outstanding packaged API requests and rejects a late response',async()=>{const headers=deferred();let signal;const f=app(async(u,o)=>{signal=o.signal;return headers.promise});const task=f.run('api("/api/me")');f.element('#logout').onclick();assert.equal(signal?.aborted,true);headers.resolve({ok:true,json:async()=>({address:'old@local.test'})});await assert.rejects(task,e=>e.code==='SESSION_CHANGED')});
test('T082 current-session attachment downloads remain usable',async()=>{const f=app(async()=>({ok:true,arrayBuffer:async()=>Uint8Array.from([4,5]).buffer}));await f.run('fileGet("/api/messages/a/attachment/0","synthetic.bin")');assert.equal(f.context.downloads.length,1);assert.equal(f.context.downloads[0][1],'synthetic.bin')});
test('T083 new session requests are independent of invalidated controllers',()=>{const f=new SessionFence(),old=f.begin();f.invalidate();const current=f.begin();assert(old.signal.aborted);assert.throws(old.check,e=>e.code==='SESSION_CHANGED');assert.doesNotThrow(current.check);assert(!current.signal.aborted);old.finish();current.finish()});
test('T084 a draft uses an immutable form snapshot during file preparation',async()=>{const bytes=deferred(),f=app(async()=>({ok:true,json:async()=>({})}));f.element('#attachments').files=[{name:'owned.txt',size:1,arrayBuffer:()=>bytes.promise}];f.element('#to').value='user@local.test';f.element('#subject').value='original';const task=f.run('draft()');f.element('#subject').value='later edit';bytes.resolve(Uint8Array.from([1]).buffer);const d=await task;assert.equal(d.subject,'original')});
test('T085 session changes do not surface obsolete errors on the login screen',async()=>{const f=app(async()=>{throw new SessionChangedError()});await f.run('safe(async()=>{throw new SessionChangedError()})({})');assert.notEqual(f.element('#toast').hidden,false)});
test('T086 browser source does not persist access tokens in web storage',()=>{const s=fs.readFileSync(new URL('../web/app.js',import.meta.url),'utf8');assert(!/sessionStorage|indexedDB|document\.cookie/.test(s));const keys=[...s.matchAll(/localStorage\.(?:get|set)Item\(\s*'([^']+)'/g)].map(m=>m[1]);assert.deepEqual([...new Set(keys)],['vexa127-head-pin']);assert(!/localStorage\.setItem\([^)]*token/.test(s));assert(!/localStorage\.setItem\([^)]*access/.test(s))});
test('MAIL-UI-01 skip navigation and its focus target belong to the authenticated shell',()=>{
 const html=fs.readFileSync(new URL('../web/index.html',import.meta.url),'utf8');
 const shell=/<div\b(?=[^>]*\bid="shell")(?=[^>]*\bhidden)[^>]*>([\s\S]*?)<\/main><\/div>/.exec(html)?.[1];
 assert(shell,'Initially hidden authenticated shell is present');
 assert.equal([...html.matchAll(/class="skip-link"/g)].length,1);
 assert.match(shell,/<a\b[^>]*class="skip-link"[^>]*href="#content"/);
 assert.match(shell,/<div\b[^>]*id="content"[^>]*tabindex="-1"/);
});
test('MAIL-UI-02 rendered user and operator Settings give every control a unique accessible label',async()=>{
 for(const role of ['user','operator']){
  const f=app(async()=>{throw Error('Rendering Settings must not request credentials');});
  await f.run('me='+JSON.stringify({role,daily:20,accept:true,blocked:[],used_today:0,stamps:[]})+';ledger={sponsor:{daily:2}};page="settings";render();');
  const html=f.element('#content').innerHTML;
  const controls=[...html.matchAll(/<(?:input|select)\b([^>]*)>/g)],ids=[];
  const labels=new Map([...html.matchAll(/<label\b[^>]*\bfor="([^"]+)"[^>]*>([^<]+)<\/label>/g)].map(match=>[match[1],match[2]]));
  assert.equal(controls.length,role==='operator'?3:2);
  for(const control of controls){const id=/\bid="([^"]+)"/.exec(control[1])?.[1];assert(id,'Settings control has an ID');assert(labels.get(id)?.trim(),'Settings control has a nonempty associated label');ids.push(id);}
  assert.equal(new Set(ids).size,ids.length,'Control IDs are unique');
  const names=controls.map(control=>/\bname="([^"]+)"/.exec(control[1])?.[1]);
  assert.deepEqual(names,role==='operator'?['accept','blocked','address']:['accept','blocked']);assert(!/credit|sponsor|reserved stamps|cancel \/ refund|daily authorized/i.test(html),'ordinary Settings have no purchase, balance, daily-credit or stamp controls');
 }
});

test('MAIL-UI-03 mailbox creation requires only an address and policy saving preserves the historical credit allowance',async()=>{
 const actor={address:'postmaster@local.test',assigned_address:'rmail@127.0.0.1:1',role:'operator',balance:0,daily:7,accept:true,blocked:[],used_bytes:0},requests=[],response=data=>({ok:true,status:200,json:async()=>data});
 const f=app(async(route,options)=>{const body=options.body?JSON.parse(options.body):undefined;requests.push({route,body});if(route==='/api/me')return response(actor);if(route==='/api/ledger')return response({head:{header:{height:9}}});if(route==='/api/internet/status')return {ok:false,status:503,json:async()=>({error:'INTERNET_PROTECTED_REQUIRED',message:'Synthetic settings unavailable'})};if(route==='/api/admin/mailboxes')return response({address:body.address,token:'synthetic-created-account-token'});if(route==='/api/preferences')return response({ok:true});throw Error('Unexpected route '+route);});
 await f.run('me='+JSON.stringify(actor)+';page="settings";render();');f.element('#account').fields={address:' new@local.test '};await f.element('#account').onsubmit({preventDefault(){},target:f.element('#account')});assert.deepEqual(requests.find(item=>item.route==='/api/admin/mailboxes').body,{address:'new@local.test'});
 f.element('#prefs').fields={accept:'false',blocked:'blocked@local.test'};await f.element('#prefs').onsubmit({preventDefault(){},target:f.element('#prefs')});assert.deepEqual(requests.find(item=>item.route==='/api/preferences').body,{daily:7,accept:false,blocked:['blocked@local.test']});assert(!requests.some(item=>/credit|sponsor|cancel-stamp/.test(item.route)));assert(!/credit|sponsor|reserved stamps|daily authorized/i.test(f.element('#content').innerHTML));
});
