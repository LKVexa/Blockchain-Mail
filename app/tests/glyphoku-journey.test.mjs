import test from 'node:test';import assert from 'node:assert/strict';import {fixture,run,binding} from './glyphoku-helper.mjs';import {freezeDraft} from '../desk/modules/lib/glyphoku/registry.js';
test('G001 real server-owned solver -> domain -> two fresh boards -> READY -> atomic actual mail -> idempotent retry',async t=>{
 const {s,g,a}=fixture(t);const base=s.state().issued;
 await run(g,a,'domain',{label:'lab'},'domain-first-001');let v=g.view(a);assert.equal(v.instance.g,2);assert.equal(v.instance.domains.length,1);const cred=g.credential(a);assert.equal(s.me(cred.token).address,'owner@127.0.0.2');
 const frozen=freezeDraft({from:cred.address,to:cred.address,bcc:cred.address,subject:'Glyphoku delivery',body:'Actual local email π 雪 🚀'},v.instance);assert(frozen.ok);
 await run(g,a,'envelope',{draft:frozen.draft},'envelope-first-002');v=g.view(a);assert.equal(v.instance.g,3);assert.equal(v.instance.permits[0].state,'READY');assert.equal(s.list(cred.token).length,0);assert.equal(s.state().messages.length,0);assert.equal(v.operations[1].boards.length,2);assert.notEqual(v.operations[1].boards[0].fingerprint,v.operations[1].boards[1].fingerprint);
 const trace=g.trace(a,'envelope-first-002');assert(Array.isArray(trace.operation.boards[0].events));assert(trace.operation.boards.every(b=>b.event_count===b.events.length&&b.guesses>=12&&b.retractions>=1));assert(s.verify().ok,JSON.stringify(s.verify()));
 const request={permit_id:v.instance.permits[0].id,draft:frozen.draft,expected_revision:v.revision,instance_id:v.instance_id,operation_id:'send-first-003'};
 const result=g.send(a,request);assert.equal(result.result.status,'DELIVERED_LOCAL');assert.equal(s.list(cred.token).length,1);assert.equal(s.list(cred.token,'Sent').length,1);assert.equal(s.message(cred.token,s.list(cred.token)[0].id).body,frozen.draft.body);assert.equal(s.state().issued,base);assert.equal(s.state().burned,0);assert.equal(g.view(a).revision,3);const height=s.head().header.height;
 assert.equal(g.send(a,request).replayed,true);assert.equal(s.head().header.height,height);assert(s.verify().ok,JSON.stringify(s.verify()));
 const sentRow=s.list(cred.token,'Sent')[0],inboxRow=s.list(cred.token)[0];s.move(cred.token,sentRow.id,'Trash');s.move(cred.token,inboxRow.id,'Trash');assert.equal(s.list(cred.token,'Trash').length,2);assert(s.verify().ok,JSON.stringify(s.verify()));assert(g.send(a,request).replayed);
 assert.throws(()=>s.send(cred.token,{to:['user@local.test'],body:'bypass',request_id:'bypass001',max_cost:1}),e=>e.code==='GAME_GATE_REQUIRED');
 assert.throws(()=>g.start(a,binding(g,a,'domain',{label:'another'},'third-ordinal-004')),e=>e.code==='ISSUANCE_PAUSED');
});
