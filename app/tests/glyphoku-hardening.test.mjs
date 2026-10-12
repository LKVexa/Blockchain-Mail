import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,binding,run} from './glyphoku-helper.mjs';
import {GlyphokuService,CONFIG} from '../src/glyphoku-service.mjs';
import {readGlyphoku,checkGlyphoku} from '../src/glyphoku-persistence.mjs';
import {validateRegistry,hexDigest,stableObject} from '../desk/modules/lib/glyphoku/registry.js';
import {canAcknowledgeFrame} from '../desk/modules/lib/glyphoku/client.js';

test('G029 expired observer and lifetime fences apply synchronously before the timer runs',t=>{
 const f=fixture(t);f.g.close();let now=0;
 const g=new GlyphokuService(f.s,{monotonicNow:()=>now,seedFactory:()=>54});t.after(()=>g.close());
 let h=g.start(f.a,binding(g,f.a,'domain',{label:'lease'},'lease-fence-001'));
 let ref={run_id:h.run_id,observer_key:h.observer_key};
 now=CONFIG.observer_lease_ms;
 assert.equal(g.poll(f.a,ref).phase,'FAILED');
 assert.equal(g.poll(f.a,ref).note,'OBSERVER_EXPIRED');
 assert.throws(()=>g.ack(f.a,{...ref,frame_id:'late',digest:'late'}),e=>e.code==='STALE_RUN');
 assert.equal(g.view(f.a).active,null);
 const started=now;h=g.start(f.a,binding(g,f.a,'domain',{label:'lease'},'lease-fence-002'));
 ref={run_id:h.run_id,observer_key:h.observer_key};
 for(now=started+240000;now<started+CONFIG.run_lifetime_ms;now+=240000)assert.equal(g.poll(f.a,ref).phase,'PREPARING');
 assert.equal(g.poll(f.a,ref).note,'OBSERVER_EXPIRED');
 assert.throws(()=>g.commit(f.a,{...ref,operation_id:h.operation_id}),e=>e.code==='RUN_NOT_READY');
 assert.equal(g.view(f.a).revision,0);assert.equal(f.s.head().header.height,0);
});

test('G030 persisted traces, uniqueness and replay intents are independently reconciled',async t=>{
 const f=fixture(t);await run(f.g,f.a,'domain',{label:'reconcile'},'reconcile-domain-001');
 const registry=readGlyphoku(f.s,f.s.state()).registry;validateRegistry(registry);
 for(const mutate of [
  x=>{const b=x.completedOperations[0].boards[0];b.events[0].rule='FORGED_GIVENS';b.traceDigest=hexDigest(stableObject(b.events));},
  x=>x.completedOperations[0].boards[0].uniqueness.nodes++,
  x=>x.completedOperations[0].intentDigest='0'.repeat(64)
 ]){const bad=structuredClone(registry);mutate(bad);assert.throws(()=>validateRegistry(bad),e=>e.code==='STORE_CORRUPT');}
 const bad=f.s.state(),address=registry.instance.mailboxes[0].address;bad.accounts[address].role='operator';
 assert.throws(()=>checkGlyphoku(f.s,bad),e=>e.code==='GLYPHOKU_ACCOUNT');
 const orphan=f.s.state();delete orphan.glyphoku;
 assert.throws(()=>checkGlyphoku(f.s,orphan),e=>e.code==='GLYPHOKU_STATE');
 const indexed=f.s.db.prepare('SELECT id,nonce FROM objects WHERE id=?').get(bad.glyphoku.blob_id);
 try{f.s.db.prepare('UPDATE objects SET nonce=? WHERE id=?').run('0'.repeat(24),indexed.id);assert.throws(()=>readGlyphoku(f.s,f.s.state()),e=>e.code==='GLYPHOKU_STATE');}
 finally{f.s.db.prepare('UPDATE objects SET nonce=? WHERE id=?').run(indexed.nonce,indexed.id);}
 assert(f.s.verify().ok);
});

test('G031 queued frame acknowledgments cannot cross a run, viewport or committed DOM change',()=>{
 const frame={id:'run:1',digest:'digest'},valid={epoch:4,generation:4,active:true,hidden:false,visible:true,inflight:0,live:{run_id:'run'},status:{run_id:'run',frame},frame,renderedFrameId:'run:1'};
 assert(canAcknowledgeFrame(valid));
 for(const changed of [
  {generation:5},{active:false},{hidden:true},{visible:false},{inflight:1},
  {live:{run_id:'replacement'}},{status:{run_id:'run',frame:{id:'run:2',digest:'next'}}},
  {renderedFrameId:'old-dom'},{frame:null},{live:null}
 ])assert.equal(canAcknowledgeFrame({...valid,...changed}),false);
});
