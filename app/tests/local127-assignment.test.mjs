import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import {Store} from '../src/store.mjs';
import {GlyphokuService} from '../src/glyphoku-service.mjs';
import {run} from './glyphoku-helper.mjs';
import {canonical,hash,signature,merkle,eventsDigest} from '../src/crypto.mjs';
import {readGlyphoku,writeGlyphoku} from '../src/glyphoku-persistence.mjs';
import {expand} from '../src/policy.mjs';
import {claimLocal127} from '../src/local127-registry.mjs';
import {ensureLocal127Assignment,getLocal127Assignment,validateLocal127Assignments,replayLocal127Assignments,validateLocal127AssignmentJournal,validateLocal127AssignmentTransition} from '../src/local127-assignment.mjs';

const work=path.resolve(import.meta.dirname,'../../work');
const code=(fn,expected)=>assert.throws(fn,error=>error.code===expected,`Expected ${expected}`);
const check=store=>assert(store.verify().ok,JSON.stringify(store.verify()));
function fixture(t,{credentials=null,...options}={}){
 fs.mkdirSync(work,{recursive:true});const root=fs.mkdtempSync(path.join(work,'local127-assignment-test-'));
 if(credentials)fs.writeFileSync(path.join(root,'credentials.secret.json'),JSON.stringify(credentials));
 const store=new Store(root,options),all=store.credentials();
 t.after(()=>{try{store.close();}catch{}const target=path.resolve(root);assert(target.startsWith(work+path.sep));fs.rmSync(target,{recursive:true,force:true});});
 return {store,root,a:all['postmaster@local.test'],u:all['user@local.test'],credentials:all};
}

test('RMAIL-01 first login reserves an exclusive alias in one signed block without changing its account or token',t=>{
 const {store,u}=fixture(t),before=store.state(),result=ensureLocal127Assignment(store,u),after=store.state();
 assert.deepEqual(result.assignment,{owner:'user@local.test',address:'mail@127.0.0.2',created_height:1});assert.equal(result.replayed,false);assert.equal(result.block_height,1);
 assert.deepEqual(after.accounts,before.accounts);assert.equal(after.issued,before.issued);assert.equal(store.authenticate(u),'user@local.test');
 assert.deepEqual(after.aliases[result.assignment.address],['user@local.test']);
 assert.deepEqual(after.mailAssignments,{version:1,items:[result.assignment]});
 assert.deepEqual(after.local127.claims,[{address:result.assignment.address,host:'127.0.0.2',kind:'alias',created_height:1}]);
 assert.deepEqual(store.head().events.map(event=>event.type),['LOCAL127_REGISTRY_INITIALIZED','LOCAL127_ADDRESS_CLAIMED','LOCAL127_MAILBOX_ASSIGNED']);check(store);
});

test('RMAIL-02 repeat login and reopen return the same assignment without another block or claim',t=>{
 const {store,u,root}=fixture(t),first=ensureLocal127Assignment(store,u),head=store.head().hash,rows=store.db.prepare('SELECT height,json FROM blocks ORDER BY height').all();
 assert.deepEqual(ensureLocal127Assignment(store,u),{assignment:first.assignment,replayed:true});assert.equal(store.head().hash,head);assert.deepEqual(store.db.prepare('SELECT height,json FROM blocks ORDER BY height').all(),rows);
 const reopened=new Store(root);try{assert.deepEqual(ensureLocal127Assignment(reopened,u),{assignment:first.assignment,replayed:true});assert.equal(reopened.head().hash,head);assert.equal(reopened.state().local127.claims.length,1);check(reopened);}finally{reopened.close();}
});

test('RMAIL-03 separate authenticated accounts get unique addresses across two store handles',async t=>{
 const {store,a,u,root}=fixture(t),second=new Store(root);
 try{
  const [first,other]=await Promise.all([Promise.resolve().then(()=>ensureLocal127Assignment(store,u)),Promise.resolve().then(()=>ensureLocal127Assignment(second,a))]);
  assert.equal(first.assignment.address,'mail@127.0.0.2');assert.equal(other.assignment.address,'mail@127.0.0.3');
  assert.deepEqual(store.state().mailAssignments.items.map(item=>item.owner),['postmaster@local.test','user@local.test']);
  assert.equal(getLocal127Assignment(store.state(),'user@local.test').address,first.assignment.address);
  assert.equal(getLocal127Assignment(store.state(),'postmaster@local.test').address,other.assignment.address);
  assert.equal(ensureLocal127Assignment(second,u).replayed,true);assert.equal(store.head().header.height,2);check(store);check(second);
 }finally{second.close();}
});

test('RMAIL-04 allocation skips both mailbox and alias claims and never allocates the HTTP service',t=>{
 const {store,a,u}=fixture(t);store.createAccount(a,{address:'taken@127.0.0.2',credits:0});store.alias(a,{alias:'group@127.0.0.3',targets:['user@local.test']});
 const made=ensureLocal127Assignment(store,u);assert.equal(made.assignment.address,'mail@127.0.0.4');assert(!store.state().local127.claims.some(item=>item.host==='127.0.0.1'));check(store);
});

test('RMAIL-05 a legacy unrecorded local127 resource reconciles and is skipped without rewriting old blocks',t=>{
 const credentials={'postmaster@local.test':'a'.repeat(40),'user@local.test':'b'.repeat(40),'old@127.0.0.2':'c'.repeat(40)};
 const {store,u}=fixture(t,{credentials}),genesis=store.db.prepare('SELECT hash,json FROM blocks WHERE height=0').get();
 assert.equal(store.state().local127,undefined);assert.equal(ensureLocal127Assignment(store,u).assignment.address,'mail@127.0.0.3');
 assert.deepEqual(store.db.prepare('SELECT hash,json FROM blocks WHERE height=0').get(),genesis);assert.equal(store.state().local127.claims.length,2);check(store);
});

test('RMAIL-06 existing local127 mailbox login reuses its own identity and reconciles its reservation',t=>{
 const own='owner@127.1.2.3',credentials={'postmaster@local.test':'a'.repeat(40),'user@local.test':'b'.repeat(40),[own]:'c'.repeat(40)};
 const {store}=fixture(t,{credentials}),token=credentials[own],before=store.state().accounts[own],made=ensureLocal127Assignment(store,token);
 assert.deepEqual(made.assignment,{owner:own,address:own,created_height:1});assert.deepEqual(store.state().accounts[own],before);assert(!Object.hasOwn(store.state().aliases,own));
 assert.deepEqual(store.head().events.map(event=>event.type),['LOCAL127_REGISTRY_INITIALIZED','LOCAL127_MAILBOX_ASSIGNED']);
 assert.deepEqual(store.state().local127.claims,[{address:own,host:'127.1.2.3',kind:'mailbox',created_height:1}]);assert.equal(ensureLocal127Assignment(store,token).replayed,true);check(store);
});

test('RMAIL-07 local deliveries to an assigned address expand into its original mailbox',t=>{
 const {store,a,u}=fixture(t),assigned=ensureLocal127Assignment(store,u).assignment.address;
 const sent=store.send(a,{to:[assigned],subject:'Assignment delivery test',body:'Synthetic local-only message',request_id:'assignment-local-delivery-01',max_cost:1});
 assert.equal(sent.status,'COMMITTED');assert.equal(store.list(u).length,1);assert.equal(store.list(a,'Sent').length,1);assert.equal(store.message(u,store.list(u)[0].id).subject,'Assignment delivery test');assert.equal(store.authenticate(u),'user@local.test');check(store);
});

test('RMAIL-08 failed signing rolls allocation, alias, assignment and journal back together',t=>{
 let armed=true;const {store,u}=fixture(t,{fault:phase=>{if(armed&&phase==='before-commit')throw Error('synthetic assignment commit fault');}}),before=canonical(store.state()),head=store.head().hash;
 assert.throws(()=>ensureLocal127Assignment(store,u),/synthetic assignment commit fault/);assert.equal(canonical(store.state()),before);assert.equal(store.head().hash,head);assert.equal(getLocal127Assignment(store.state(),'user@local.test'),null);
 armed=false;assert.equal(ensureLocal127Assignment(store,u).assignment.address,'mail@127.0.0.2');check(store);
});

test('RMAIL-09 lost acknowledgment after commit retrieves the existing assignment on retry',t=>{
 let armed=true;const {store,u}=fixture(t,{fault:phase=>{if(armed&&phase==='after-commit')throw Error('synthetic lost acknowledgment');}});
 assert.throws(()=>ensureLocal127Assignment(store,u),/synthetic lost acknowledgment/);const head=store.head().hash;armed=false;
 const replay=ensureLocal127Assignment(store,u);assert.equal(replay.replayed,true);assert.equal(replay.assignment.address,'mail@127.0.0.2');assert.equal(store.head().hash,head);assert.equal(store.state().local127.claims.length,1);check(store);
});

test('RMAIL-10 an exhausted pool fails without creating a partial assignment',t=>{
 const {store,a,u}=fixture(t);store.mutate(a,(s,owner,now,events)=>{const height=store.head().header.height+1;for(let n=2;n<=254;n++){const address='occupied@127.0.0.'+n;claimLocal127(s,address,'alias',height,events);s.aliases[address]=['postmaster@local.test'];}return{};},{admin:true});
 const before=canonical(store.state()),head=store.head().hash;code(()=>ensureLocal127Assignment(store,u),'LOCAL127_CAPACITY');assert.equal(canonical(store.state()),before);assert.equal(store.head().hash,head);assert.equal(store.state().mailAssignments,undefined);check(store);
});

test('RMAIL-11 exact assignment journal rejects replay, malformed events and changed ownership',t=>{
 const {store,u}=fixture(t);ensureLocal127Assignment(store,u);const events=store.head().events,state=store.state(),journal=replayLocal127Assignments(null,events,1);validateLocal127AssignmentJournal(state,journal);
 for(const change of [e=>e.push(e.at(-1)),e=>e.at(-1).created_height=2,e=>e.at(-1).extra=true,e=>e.at(-1).address='mail@127.0.0.1',e=>e.at(-1).address='mail@127.0.0.02',e=>e.at(-1).address='mail@127.0.0.255',e=>e.at(-1).owner='missing@local.test']){
  const altered=structuredClone(events);change(altered);
  if(altered.at(-1).owner==='missing@local.test')code(()=>validateLocal127AssignmentJournal(state,replayLocal127Assignments(null,altered,1)),'LOCAL127_ASSIGNMENT');
  else code(()=>replayLocal127Assignments(null,altered,1),'LOCAL127_ASSIGNMENT');
 }
 const redirected=structuredClone(state);redirected.aliases['mail@127.0.0.2']=['postmaster@local.test'];code(()=>validateLocal127Assignments(redirected),'LOCAL127_ASSIGNMENT');
 const removed=structuredClone(state);removed.mailAssignments.items=[];code(()=>validateLocal127AssignmentJournal(removed,journal),'LOCAL127_ASSIGNMENT');
});

test('RMAIL-12 assignment transitions reject silent metadata changes and unsigned alias takeover',t=>{
 const {store,a,u}=fixture(t);ensureLocal127Assignment(store,u);const head=store.head().hash;
 for(const change of [s=>{s.mailAssignments.items=[];},s=>{delete s.mailAssignments;},s=>{s.mailAssignments.items[0].created_height++;},s=>{s.aliases['mail@127.0.0.2']=['postmaster@local.test'];}])code(()=>store.mutate(a,(s,owner,now,events)=>{change(s);events.push({type:'SYNTHETIC_UNRELATED_EVENT'});return{};},{admin:true}),'LOCAL127_ASSIGNMENT');
 assert.equal(store.head().hash,head);
 const previous=store.state(),next=structuredClone(previous),height=store.head().header.height+1,assignment={owner:'postmaster@local.test',address:'mail@127.0.0.3',created_height:height};
 next.aliases[assignment.address]=[assignment.owner];next.local127.claims.push({address:assignment.address,host:'127.0.0.3',kind:'alias',created_height:height});next.mailAssignments.items.unshift(assignment);
 code(()=>validateLocal127AssignmentTransition(previous,next,[{type:'LOCAL127_MAILBOX_ASSIGNED',...assignment}],height),'LOCAL127_ASSIGNMENT');check(store);
});

test('RMAIL-13 invalid authentication and read-only instances cannot allocate addresses',t=>{
 const {store,u,root}=fixture(t),head=store.head().hash;code(()=>ensureLocal127Assignment(store,'x'.repeat(40)),'AUTH');assert.equal(store.head().hash,head);
 ensureLocal127Assignment(store,u);const readOnly=new Store(root,{readOnly:true});try{assert.equal(getLocal127Assignment(readOnly.state(),'user@local.test').address,'mail@127.0.0.2');code(()=>ensureLocal127Assignment(readOnly,u),'READ_ONLY');check(readOnly);}finally{readOnly.close();}
});

test('RMAIL-14 unsigned assignment-state tampering fails authenticated reads and startup',t=>{
 const {store,u,root}=fixture(t);ensureLocal127Assignment(store,u);const state=store.state();state.mailAssignments.items[0].owner='postmaster@local.test';store.db.prepare('UPDATE state SET json=? WHERE singleton=1').run(canonical(state));
 code(()=>store.me(u),'INTEGRITY');assert.equal(store.verify().ok,false);store.close();code(()=>new Store(root),'INTEGRITY');
});

test('RMAIL-15 a real game owner keeps its signed mailbox, token and game gate on first login',async t=>{
 const {store,a}=fixture(t),game=new GlyphokuService(store,{seedFactory:()=>54});t.after(()=>game.close());
 await run(game,a,'domain',{label:'rmail-owner'},'rmail-game-owner-01');const credential=game.credential(a),before=store.state(),claims=structuredClone(before.local127.claims),oldBlocks=store.db.prepare('SELECT height,json FROM blocks ORDER BY height').all();
 const made=ensureLocal127Assignment(store,credential.token);assert.equal(made.assignment.address,credential.address);assert.equal(made.assignment.owner,credential.address);assert.deepEqual(store.state().accounts,before.accounts);assert.deepEqual(store.state().local127.claims,claims);
 assert.deepEqual(store.db.prepare('SELECT height,json FROM blocks WHERE height<? ORDER BY height').all(store.head().header.height),oldBlocks);assert.equal(game.credential(a).token,credential.token);
 code(()=>store.send(credential.token,{to:[credential.address],subject:'Synthetic gate test',body:'No local send',request_id:'assignment-game-gate-01',max_cost:1}),'GAME_GATE_REQUIRED');check(store);
});

test('RMAIL-16 protected assignment metadata and alias survive restart without appearing in stored plaintext',t=>{
 const key=randomBytes(32);t.after(()=>key.fill(0));const {store,u,root}=fixture(t,{vaultKey:key}),made=ensureLocal127Assignment(store,u);check(store);
 const raw=fs.readFileSync(path.join(root,'mail.sqlite'));assert(!raw.includes(Buffer.from(made.assignment.address)));assert(!raw.includes(Buffer.from('LOCAL127_MAILBOX_ASSIGNED')));
 store.close();const reopened=new Store(root,{vaultKey:key});try{assert.equal(ensureLocal127Assignment(reopened,u).replayed,true);assert.deepEqual(getLocal127Assignment(reopened.state(),'user@local.test'),made.assignment);check(reopened);}finally{reopened.close();}
});

test('MAIL legacy rmail assignment reopens unchanged while new accounts use mail and both addresses deliver',t=>{
 const key=randomBytes(32);t.after(()=>key.fill(0));const {store,a,u,root}=fixture(t,{vaultKey:key}),legacy='rmail@127.0.0.2';
 // Recreate an earlier valid signed assignment using this disposable authority.
 store.mutate(a,(state,actor,now,events)=>{const height=store.head().header.height+1,item={owner:'user@local.test',address:legacy,created_height:height};claimLocal127(state,legacy,'alias',height,events);state.aliases[legacy]=[item.owner];state.mailAssignments={version:1,items:[item]};events.push({type:'LOCAL127_MAILBOX_ASSIGNED',...item});return {};},{admin:true});
 const historical=store.sendMailbox(u,{sender_address:legacy,to:['postmaster@local.test'],subject:'Existing rmail history',body:'Keep the original sender and ownership.',attachments:[],request_id:'legacy-rmail-history-01'});assert.equal(historical.status,'COMMITTED');
 const before=store.state(),head=store.head().hash,height=store.head().header.height,rows=store.db.prepare('SELECT height,json FROM blocks ORDER BY height').all();store.close();
 const reopened=new Store(root,{vaultKey:key});try{
  const old=ensureLocal127Assignment(reopened,u);assert.equal(old.replayed,true);assert.equal(old.assignment.address,legacy);assert.equal(reopened.head().hash,head);assert.deepEqual(reopened.state().mailAssignments,before.mailAssignments);assert.deepEqual(reopened.state().local127,before.local127);
  const fresh=ensureLocal127Assignment(reopened,a);assert.equal(fresh.assignment.address,'mail@127.0.0.3');assert.deepEqual(reopened.state().aliases[legacy],['user@local.test']);
  const sent=reopened.sendMailbox(a,{sender_address:fresh.assignment.address,to:[legacy],subject:'New mail to old rmail',body:'Both prefixes remain usable.',attachments:[],request_id:'new-mail-old-rmail-01'});assert.equal(sent.status,'COMMITTED');
  const inbox=reopened.list(u);assert.equal(inbox.length,1);assert.equal(reopened.message(u,inbox[0].id).from,fresh.assignment.address);assert.throws(()=>reopened.message(a,inbox[0].id),error=>error.code==='NOT_FOUND');
  const oldSent=reopened.list(u,'Sent');assert.equal(oldSent.length,1);assert.equal(reopened.message(u,oldSent[0].id).from,legacy);assert.deepEqual(reopened.db.prepare('SELECT height,json FROM blocks WHERE height<=? ORDER BY height').all(height),rows);assert.equal(reopened.authenticate(u),'user@local.test');check(reopened);
 }finally{reopened.close();}
});

test('RMAIL-17 an assigned alias routes into a preserved legacy game mailbox without widening direct address admission',async t=>{
 const {store,a}=fixture(t),game=new GlyphokuService(store,{seedFactory:()=>54});t.after(()=>game.close());
 await run(game,a,'domain',{label:'legacy-rmail'},'rmail-legacy-game-01');
 // Reconstruct the supported earlier dialect using only this disposable test
 // authority, as the existing registry-upgrade fixtures do. No user state is read.
 const state=store.state(),data=readGlyphoku(store,state),oldBlob=state.glyphoku.blob_id,modern=data.registry.instance.mailboxes[0].address,legacy='owner@legacy-rmail.glyphoku.localhost';
 data.registry.instance.domains[0].address='legacy-rmail.glyphoku.localhost';data.registry.instance.mailboxes[0].address=legacy;
 data.registry.completedOperations[0].result.domain.address='legacy-rmail.glyphoku.localhost';data.registry.completedOperations[0].result.mailbox.address=legacy;
 state.accounts[legacy]=state.accounts[modern];delete state.accounts[modern];delete state.local127;delete state.glyphoku;
 store.db.prepare('DELETE FROM objects WHERE id=?').run(oldBlob);writeGlyphoku(store,state,data);
 const block=store.head();block.events=block.events.filter(event=>!event.type.startsWith('LOCAL127_'));
 const created=block.events.find(event=>event.type==='GLYPHOKU_DOMAIN_CREATED');created.domain_hash=hash('legacy-rmail.glyphoku.localhost');created.mailbox_hash=hash(legacy);
 block.header.state_root=hash(canonical(state));block.header.events_count=block.events.length;block.header.events_hash=eventsDigest(block.events);block.header.events_root=merkle(block.events);
 block.signature=signature('VEXA127-BLOCK/1',block.header,store.key.privateKey);block.hash=hash('VEXA127-BLOCK/1\n'+canonical(block.header)+'\n'+block.signature);
 store.db.prepare('UPDATE blocks SET hash=?,json=? WHERE height=?').run(block.hash,canonical(block),block.header.height);store.db.prepare('UPDATE state SET json=? WHERE singleton=1').run(canonical(state));check(store);
 const oldBlocks=store.db.prepare('SELECT height,json FROM blocks ORDER BY height').all(),credential=game.credential(a),assigned=ensureLocal127Assignment(store,credential.token).assignment;
 assert.equal(credential.address,legacy);assert.equal(assigned.owner,legacy);assert.equal(assigned.address,'mail@127.0.0.2');assert.deepEqual(expand([assigned.address],store.state()),[legacy]);
 assert.deepEqual(store.db.prepare('SELECT height,json FROM blocks WHERE height<? ORDER BY height').all(store.head().header.height),oldBlocks);
 const sent=store.send(a,{to:[assigned.address],subject:'Legacy alias delivery',body:'Synthetic local fixture message',request_id:'rmail-legacy-alias-send-01',max_cost:1});
 assert.equal(sent.status,'COMMITTED');assert.equal(store.list(credential.token).length,1);assert.equal(store.message(credential.token,store.list(credential.token)[0].id).subject,'Legacy alias delivery');
 code(()=>expand([legacy],store.state()),'RELAY_DENIED');
 const arbitrary=structuredClone(store.state());arbitrary.aliases['unassigned@local.test']=[legacy];code(()=>expand(['unassigned@local.test'],arbitrary),'RELAY_DENIED');
 const nested=structuredClone(store.state());nested.aliases['nested@local.test']=[assigned.address];code(()=>expand(['nested@local.test'],nested),'RELAY_DENIED');
 code(()=>expand([assigned.address,'nested@local.test'],nested),'RELAY_DENIED');
 check(store);
});
