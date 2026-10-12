import test from 'node:test';import assert from 'node:assert/strict';
import {fixture} from './glyphoku-helper.mjs';import {startHttp} from '../src/http.mjs';
test('L127-14 literal address register is an authenticated read-only HTTP view',async t=>{
 const {s,a,u}=fixture(t),web=await startHttp(s,{port:0});t.after(()=>web.close());const origin='http://127.0.0.1:'+web.port;
 let response=await fetch(origin+'/api/local127-registry');assert.equal(response.status,401);
 s.createAccount(a,{address:'mail@127.0.0.2',credits:0});s.alias(a,{alias:'alias@127.0.0.3',targets:['mail@127.0.0.2']});const before=s.head().hash;
 response=await fetch(origin+'/api/local127-registry',{headers:{Authorization:'Bearer '+u}});assert.equal(response.status,200);assert.deepEqual(await response.json(),s.local127Registry(u));
 const state=await fetch(origin+'/api/glyphoku/state',{headers:{Authorization:'Bearer '+a}});assert.equal(state.status,200);assert.deepEqual((await state.json()).local127_registry,s.local127Registry(a));
 response=await fetch(origin+'/api/local127-registry',{method:'POST',headers:{Authorization:'Bearer '+a,'Content-Type':'application/json','X-BVE-Request':'1'},body:'{}'});assert.equal(response.status,404);assert.equal(s.head().hash,before);assert.equal(web.server.address().address,'127.0.0.1');
});
