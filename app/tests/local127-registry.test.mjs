import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';
import {fixture,run} from './glyphoku-helper.mjs';
import {Store,restoreNew} from '../src/store.mjs';
import {address} from '../src/policy.mjs';
import {canonical,hash,signature,merkle,eventsDigest,verifySignature} from '../src/crypto.mjs';
import {canonical127Host,local127Host} from '../src/local127-address.mjs';
import {allocateLocal127,claimLocal127,validateLocal127,replayLocal127,validateLocal127Journal,MAX_LOCAL127_CLAIMS} from '../src/local127-registry.mjs';
import {readGlyphoku,writeGlyphoku,legacyLoopbackRecord,legacyLoopbackRecordV2} from '../src/glyphoku-persistence.mjs';
import {canonical127Host as tsHost,resolveMailbox,validateRegistry} from '../desk/modules/lib/glyphoku/registry.js';
const code=(fn,c)=>assert.throws(fn,e=>e.code===c,`Expected ${c}`);
const check=s=>assert(s.verify().ok,JSON.stringify(s.verify()));

test('L127-01 only canonical four-octet literal127 hosts enter either address grammar',()=>{
 for(const host of ['127.0.0.2','127.1.2.3','127.255.255.255']){assert(canonical127Host(host));assert(tsHost(host));assert.equal(local127Host('owner@'+host),host);assert.equal(address(' OWNER@'+host+' '),'owner@'+host);}
 for(const host of ['127.0.2','127.00.0.2','127.0.0.256','127.0.0.2:0','127.0.0.2:01','127.0.0.2:'+'1'.repeat(33),'127.1','2130706434','0x7f000002','127.0.0.2.example','localhost','128.0.0.2','::1']){assert.equal(canonical127Host(host),false,host);assert.equal(tsHost(host),false,host);code(()=>address('owner@'+host),'RELAY_DENIED');}
 for(const domain of ['127.0.0.2:8787','127.255.255.255:12345678901234567890123456789012']){assert.equal(canonical127Host(domain),false);assert.equal(local127Host('owner@'+domain),domain);assert.equal(address('OWNER@'+domain),'owner@'+domain);}
 assert.equal(canonical127Host('127.0.0.2\n'),false);assert.equal(tsHost('127.0.0.2\n'),false);
 assert.equal(address('USER@LOCAL.TEST'),'user@local.test');code(()=>address('owner@example.com'),'RELAY_DENIED');
});
test('L127-02 mailbox reservation is literal, signed, sorted, authenticated and matches resource',t=>{
 const {s,a,u}=fixture(t);assert.equal(s.local127Registry(u).recorded,false);assert.equal(s.state().local127,undefined);code(()=>s.local127Registry('x'.repeat(40)),'AUTH');
 const created=s.createAccount(a,{address:'OWNER@127.1.2.3',credits:0}),r=s.local127Registry(u);assert.equal(r.recorded,true);assert.deepEqual(r.service,{host:'127.0.0.1',kind:'http-service'});assert.equal(r.logical_only,true);assert.equal(r.scope,'single-local-ledger');assert.deepEqual(r.claims,[{address:'owner@127.1.2.3',host:'127.1.2.3',kind:'mailbox',created_height:created.block_height}]);
 const b=s.head();assert(verifySignature('VEXA127-BLOCK/1',b.header,b.signature,s.key.publicKey));assert.deepEqual(b.events.find(e=>e.type==='LOCAL127_ADDRESS_CLAIMED'),{type:'LOCAL127_ADDRESS_CLAIMED',...r.claims[0]});assert.equal(s.me(created.token).address,'owner@127.1.2.3');check(s);
});
test('L127-03 duplicate addresses and shared mailbox/alias hosts, including service host, are refused',t=>{
 const {s,a}=fixture(t);s.createAccount(a,{address:'a@127.0.0.2',credits:0});s.alias(a,{alias:'all@127.0.0.3',targets:['a@127.0.0.2']});const before=s.head().hash;
 code(()=>s.createAccount(a,{address:'b@127.0.0.2'}),'LOCAL127_EXISTS');code(()=>s.createAccount(a,{address:'b@127.0.0.3'}),'LOCAL127_EXISTS');code(()=>s.alias(a,{alias:'b@127.0.0.2',targets:['user@local.test']}),'LOCAL127_EXISTS');code(()=>s.alias(a,{alias:'all@127.0.0.3',targets:['user@local.test']}),'LOCAL127_EXISTS');
 code(()=>s.createAccount(a,{address:'operator@127.0.0.1'}),'LOCAL127_RESERVED');code(()=>s.alias(a,{alias:'service@127.0.0.1',targets:['user@local.test']}),'LOCAL127_RESERVED');assert.equal(s.head().hash,before);assert.equal(s.local127Registry(a).claims.length,2);check(s);
});
test('L127-04 failed commit or alias expansion leaves no registry, resource or signed event',t=>{
 let armed=true;const {s,a}=fixture(t,{fault:p=>{if(armed&&p==='before-commit')throw Error('synthetic commit fault')}}),before=s.head().hash;
 assert.throws(()=>s.createAccount(a,{address:'a@127.0.0.2',credits:0}),/synthetic commit fault/);armed=false;code(()=>s.alias(a,{alias:'cycle@127.0.0.2',targets:['cycle@127.0.0.2']}),'ALIAS_CYCLE');assert.equal(s.state().local127,undefined);assert.equal(s.head().hash,before);assert(!s.state().accounts['a@127.0.0.2']);assert(!s.state().aliases['cycle@127.0.0.2']);s.createAccount(a,{address:'a@127.0.0.2',credits:0});check(s);
});
test('L127-05 two store handles and restart retain exclusive claims',t=>{
 const {s,a,root}=fixture(t),second=new Store(root);try{s.createAccount(a,{address:'a@127.0.0.2',credits:0});code(()=>second.createAccount(a,{address:'other@127.0.0.2',credits:0}),'LOCAL127_EXISTS');second.alias(a,{alias:'alias@127.0.0.3',targets:['a@127.0.0.2']});assert.equal(s.local127Registry(a).claims.length,2);}finally{second.close();}
 const opened=new Store(root);try{code(()=>opened.createAccount(a,{address:'other@127.0.0.3',credits:0}),'LOCAL127_EXISTS');check(opened);}finally{opened.close();}
});
test('L127-06 backup restore retains claims; an external newer checkpoint detects rollback',t=>{
 const {s,a,root}=fixture(t);s.createAccount(a,{address:'a@127.0.0.2',credits:0});const backup=s.backup(a);s.alias(a,{alias:'alias@127.0.0.3',targets:['a@127.0.0.2']});const pin=s.checkpoint(),dest=path.join(root,'restored127');restoreNew(backup.backup,dest);const restored=new Store(dest);try{code(()=>restored.createAccount(a,{address:'b@127.0.0.2',credits:0}),'LOCAL127_EXISTS');assert.equal(restored.verify(pin).ok,false);code(()=>restored.acceptPin(a,pin),'ROLLBACK');assert(restored.verify(backup.checkpoint).ok);}finally{restored.close();}
});
test('L127-07 signed state mutations cannot remove, alter or bypass the append-only claim journal',t=>{
 const {s,a}=fixture(t);s.createAccount(a,{address:'a@127.0.0.2',credits:0});const before=s.head().hash;
 for(const change of [x=>x.local127.claims[0].created_height++,x=>{delete x.accounts['a@127.0.0.2'];x.local127.claims=[];},x=>{x.accounts['b@127.0.0.2']=x.accounts['a@127.0.0.2'];delete x.accounts['a@127.0.0.2'];x.local127.claims[0].address='b@127.0.0.2';}])code(()=>s.mutate(a,(state,actor,now,events)=>{change(state);events.push({type:'SYNTHETIC_UNRELATED_EVENT'});return{};},{admin:true}),'LOCAL127_REGISTRY');
 code(()=>s.mutate(a,(state,actor,now,events)=>{state.accounts['b@127.0.0.4']={...state.accounts['a@127.0.0.2']};events.push({type:'SYNTHETIC_UNRELATED_EVENT'});return{};},{admin:true}),'LOCAL127_REGISTRY');assert.equal(s.head().hash,before);check(s);
});
test('L127-08 exact reservation event fields and heights reject replay and malformed metadata',()=>{
 const s={accounts:{},aliases:{}},events=[];claimLocal127(s,'a@127.0.0.2','mailbox',1,events);s.accounts['a@127.0.0.2']={};validateLocal127(s);const journal=replayLocal127(null,events,1);validateLocal127Journal(s,journal);
 for(const changes of [e=>e.push(e[1]),e=>e[1].created_height=2,e=>e[1].host='127.0.0.3',e=>e[1].kind='service',e=>e[1].extra=true,e=>e.reverse(),e=>e.push(e[0]),e=>e[0].service.host='127.0.0.2']){const altered=structuredClone(events);changes(altered);code(()=>replayLocal127(null,altered,1),'LOCAL127_REGISTRY');}
 const missing=structuredClone(s);delete missing.local127.claims[0].created_height;code(()=>validateLocal127(missing),'LOCAL127_REGISTRY');
});
test('L127-09 unsigned registry tampering fails authenticated reads and startup',t=>{
 const {s,a,root}=fixture(t);s.createAccount(a,{address:'a@127.0.0.2',credits:0});const state=s.state();state.local127.claims[0].host='127.0.0.3';s.db.prepare('UPDATE state SET json=? WHERE singleton=1').run(canonical(state));code(()=>s.local127Registry(a),'INTEGRITY');assert.equal(s.verify().ok,false);s.close();code(()=>new Store(root),'INTEGRITY');
});
test('L127-10 bounded pool and claim capacity fail closed and never allocate the service host',()=>{
 const s={accounts:{},aliases:{}},events=[];for(let n=2;n<=254;n++){const host='127.0.0.'+n,a='alias@'+host;claimLocal127(s,a,'alias',1,events);s.aliases[a]=['user@local.test'];}
 assert.equal(s.local127.claims.length,253);assert(MAX_LOCAL127_CLAIMS>253);validateLocal127(s);code(()=>allocateLocal127(s,2,[]),'LOCAL127_CAPACITY');claimLocal127(s,'extra@127.1.0.1:12345678901234567890123456789012','alias',2,[]);s.aliases['extra@127.1.0.1:12345678901234567890123456789012']=['user@local.test'];validateLocal127(s);assert(!s.local127.claims.some(c=>c.host==='127.0.0.1'));
});
test('L127-11 game commit skips already signed mailbox and alias reservations',async t=>{
 const {s,g,a}=fixture(t);s.createAccount(a,{address:'existing@127.0.0.2',credits:0});s.alias(a,{alias:'alias@127.0.0.3',targets:['user@local.test']});const prior=s.checkpoint();await run(g,a,'domain',{label:'literal'},'local127-domain-01');const v=g.view(a),box=g.credential(a);assert.equal(v.instance.domains[0].address,'127.0.0.4');assert.equal(box.address,'owner@127.0.0.4');assert.deepEqual(v.local127_registry,s.local127Registry(a));assert.equal(resolveMailbox(box.address,v.instance).ok,true);assert.equal(resolveMailbox('other@127.0.0.4',v.instance).ok,false);const height=s.head().header.height;assert.equal(v.local127_registry.claims.find(c=>c.address===box.address).created_height,height);check(s);assert(s.verify(prior).ok);
});

// Construct an authenticated legacy fixture from a real completed run. This uses
// only its disposable authority and leaves old block bytes unchanged thereafter.
async function legacyFixture(t,make){
 const f=fixture(t);await run(f.g,f.a,'domain',{label:'legacy'},'legacy-domain-01');const {s}=f,state=s.state(),data=readGlyphoku(s,state),old=state.glyphoku.blob_id,modern=data.registry.instance.mailboxes[0].address,legacy='owner@legacy.glyphoku.localhost';
 data.registry.instance.domains[0].address='legacy.glyphoku.localhost';data.registry.instance.mailboxes[0].address=legacy;data.registry.completedOperations[0].result.domain.address='legacy.glyphoku.localhost';data.registry.completedOperations[0].result.mailbox.address=legacy;
 state.accounts[legacy]=state.accounts[modern];delete state.accounts[modern];delete state.local127;delete state.glyphoku;s.db.prepare('DELETE FROM objects WHERE id=?').run(old);writeGlyphoku(s,state,data);
 const b=s.head();b.events=b.events.filter(e=>!e.type.startsWith('LOCAL127_'));const created=b.events.find(e=>e.type==='GLYPHOKU_DOMAIN_CREATED');created.domain_hash=hash('legacy.glyphoku.localhost');created.mailbox_hash=hash(legacy);b.header.state_root=hash(canonical(state));b.header.events_count=b.events.length;b.header.events_hash=eventsDigest(b.events);b.header.events_root=merkle(b.events);b.signature=signature('VEXA127-BLOCK/1',b.header,s.key.privateKey);b.hash=hash('VEXA127-BLOCK/1\n'+canonical(b.header)+'\n'+b.signature);
 s.db.prepare('UPDATE blocks SET hash=?,json=? WHERE height=?').run(b.hash,canonical(b),b.header.height);s.db.prepare('UPDATE state SET json=? WHERE singleton=1').run(canonical(state));check(s);
 s.mutate(f.a,(st,actor,now,events)=>{st.loopback=make(st.chain_id,8787,data.registry.instance.domains[0]);events.push({type:'LOOPBACK_NAME',format:st.loopback.format,name_hash:hash(st.loopback.name),mailbox_hash:hash(st.loopback.mailbox),port:8787,reachable:false});return{};},{admin:true});return f;
}
for(const [format,make]of [['1',legacyLoopbackRecord],['2',legacyLoopbackRecordV2]])test('L127-12/'+format+' exact signed legacy domains, annotations and backups remain readable',async t=>{
 const {s,g,a,root}=await legacyFixture(t,make),rows=s.db.prepare('SELECT height,json FROM blocks ORDER BY height').all(),old=s.loopback(a,8787).loopback;assert.equal(old.format,'VEXA127-LOOPBACK/'+format);assert.equal(g.credential(a).address,'owner@legacy.glyphoku.localhost');assert.equal(s.recordLoopback(a,8787).replayed,true);assert.deepEqual(s.db.prepare('SELECT height,json FROM blocks ORDER BY height').all(),rows);
 s.createAccount(a,{address:'new@127.0.0.2',credits:0});assert.deepEqual(s.db.prepare('SELECT height,json FROM blocks WHERE height<=2 ORDER BY height').all(),rows);assert.deepEqual(s.loopback(a,8787).loopback,old);assert.equal(g.view(a).instance.domains[0].address,'legacy.glyphoku.localhost');const b=s.backup(a),dest=path.join(root,'legacy-restored');restoreNew(b.backup,dest);const restored=new Store(dest);try{assert.deepEqual(restored.loopback(a,8787).loopback,old);assert.equal(restored.local127Registry(a).claims.length,1);check(restored);}finally{restored.close();}
});
test('L127-13 registry readers refuse shortened, zero-prefixed, reserved or substituted hosts',async t=>{
 const {s,g,a}=fixture(t);await run(g,a,'domain',{label:'validation'},'host-validation-01');const original=readGlyphoku(s,s.state()).registry;validateRegistry(original);
 for(const host of ['127.0.2','127.00.0.2','127.0.0.1','127.0.0.256','label.other.localhost','other.glyphoku.localhost']){const v=structuredClone(original);v.instance.domains[0].address=host;v.instance.mailboxes[0].address='owner@'+host;v.completedOperations[0].result.domain.address=host;v.completedOperations[0].result.mailbox.address='owner@'+host;assert.throws(()=>validateRegistry(v),e=>e.code==='STORE_CORRUPT');}
});
test('L127-15 preseeded legacy resources are visible without GET signing and reconcile explicitly on mutation',t=>{
 const f=fixture(t),root=path.join(f.root,'legacy-preseed');fs.mkdirSync(root);fs.writeFileSync(path.join(root,'credentials.secret.json'),JSON.stringify({'postmaster@local.test':f.a,'user@local.test':f.u,'old@127.0.0.2':'q'.repeat(40)}));const s=new Store(root);try{
  const before=s.head(),rows=s.db.prepare('SELECT height,json FROM blocks ORDER BY height').all(),view=s.local127Registry(f.a);assert.equal(view.recorded,false);assert.equal(view.reconciliation_required,true);assert.deepEqual(view.claims,[]);assert.deepEqual(view.unreconciled_claims,[{address:'old@127.0.0.2',host:'127.0.0.2',kind:'mailbox'}]);assert.deepEqual(view.reconciliation_conflicts,[]);assert.equal(s.state().local127,undefined);assert.equal(s.head().hash,before.hash);assert.deepEqual(s.db.prepare('SELECT height,json FROM blocks ORDER BY height').all(),rows);
  s.createAccount(f.a,{address:'new@127.0.0.3',credits:0});const after=s.local127Registry(f.a);assert.equal(after.recorded,true);assert.equal(after.reconciliation_required,false);assert.deepEqual(after.unreconciled_claims,[]);assert.deepEqual(after.reconciliation_conflicts,[]);assert.equal(after.claims.length,2);assert(after.claims.every(c=>c.created_height===1));assert.deepEqual(s.db.prepare('SELECT height,json FROM blocks WHERE height=0').all(),rows);assert.deepEqual(s.head().events.find(e=>e.type==='LOCAL127_REGISTRY_INITIALIZED').claims,[{address:'old@127.0.0.2',host:'127.0.0.2',kind:'mailbox',created_height:1}]);check(s);
 }finally{s.close();}
});
test('L127-16 imported host and service conflicts are reported read-only and prevent signing inconsistent claims',t=>{
 const f=fixture(t),root=path.join(f.root,'legacy-conflict');fs.mkdirSync(root);fs.writeFileSync(path.join(root,'credentials.secret.json'),JSON.stringify({'postmaster@local.test':f.a,'user@local.test':f.u,'a@127.0.0.2':'q'.repeat(40),'b@127.0.0.2':'r'.repeat(40),'service@127.0.0.1':'s'.repeat(40)}));const s=new Store(root);try{
  const before=s.head().hash,view=s.local127Registry(f.a);assert.equal(view.recorded,false);assert.equal(view.reconciliation_required,true);assert.equal(view.unreconciled_claims.length,3);assert.deepEqual(view.reconciliation_conflicts,[{host:'127.0.0.1',addresses:['service@127.0.0.1'],service_reserved:true},{host:'127.0.0.2',addresses:['a@127.0.0.2','b@127.0.0.2'],service_reserved:false}]);assert.equal(s.head().hash,before);code(()=>s.createAccount(f.a,{address:'new@127.0.0.3',credits:0}),'LOCAL127_REGISTRY');assert.equal(s.head().hash,before);assert.equal(s.state().local127,undefined);assert(!s.state().accounts['new@127.0.0.3']);check(s);
 }finally{s.close();}
});
test('L127-17 raw internal mutations cannot add, remove or relabel unjournaled127 resources',t=>{
 const f=fixture(t),before=f.s.head().hash;
 for(const change of [s=>{s.accounts['new@127.0.0.2']={...s.accounts['user@local.test'],balance:0};},s=>{s.aliases['new@127.0.0.2']=['user@local.test'];}])code(()=>f.s.mutate(f.a,(state,actor,now,events)=>{change(state);events.push({type:'SYNTHETIC_UNRELATED_EVENT'});return{};},{admin:true}),'LOCAL127_REGISTRY');assert.equal(f.s.head().hash,before);assert.equal(f.s.state().local127,undefined);check(f.s);
 const root=path.join(f.root,'legacy-transition');fs.mkdirSync(root);fs.writeFileSync(path.join(root,'credentials.secret.json'),JSON.stringify({'postmaster@local.test':f.a,'user@local.test':f.u,'old@127.0.0.2':'q'.repeat(40)}));const s=new Store(root);try{
  const head=s.head().hash;for(const change of [st=>{st.accounts['renamed@127.0.0.2']=st.accounts['old@127.0.0.2'];delete st.accounts['old@127.0.0.2'];},st=>{st.issued-=st.accounts['old@127.0.0.2'].balance;delete st.accounts['old@127.0.0.2'];}])code(()=>s.mutate(f.a,(state,actor,now,events)=>{change(state);events.push({type:'SYNTHETIC_UNRELATED_EVENT'});return{};},{admin:true}),'LOCAL127_REGISTRY');assert.equal(s.head().hash,head);s.alias(f.a,{alias:'legacy@local.test',targets:['old@127.0.0.2']});assert.equal(s.state().local127,undefined);check(s);
 }finally{s.close();}
});
