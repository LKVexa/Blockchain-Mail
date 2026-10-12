/** Read-only characterization of the supplied candidate; synthetic in-memory records only.
 * Known grids intentionally bypass the visible solver to probe the acceptance boundary.
 * These fixtures are NOT valid production authorizations or evidence of a live journey.
 */
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
const root=resolve(process.argv[2] || '../candidate');
const R=await import(pathToFileURL(resolve(root,'src/lib/glyphoku/registry.ts')));
const Q=await import(pathToFileURL(resolve(root,'src/lib/glyphoku/rules.ts')));
const solution=Array.from({length:256},(_,i)=>{const r=Math.floor(i/16),c=i%16;return (4*r+Math.floor(r/4)+c)%16+1});
const puzzle=(empty)=>({givens:solution.map((v,i)=>i<empty?0:v),candidate:solution.slice()});
const p1=puzzle(128),p2=puzzle(136);
const rows=[];
function observe(id,name,expected,fn){try{const observed=fn();rows.push({id,name,expected_after_integration:expected,observed_baseline:observed,scope:'SYNTHETIC_IN_MEMORY_CHARACTERIZATION'});}catch(e){rows.push({id,name,expected_after_integration:expected,observed_baseline:{threw:e.name,message:e.message},scope:'SYNTHETIC_IN_MEMORY_CHARACTERIZATION'});}}
const created=R.commitDomain(R.emptyInstance(),'studio',[p1]);
if(!created.ok)throw new Error('fixture setup failed');
const g2=created.instance;
const frozen=R.freezeDraft({from:created.mailbox.address,to:created.mailbox.address,bcc:'',subject:'Characterization',body:'Original synthetic body'},g2);
if(!frozen.ok)throw new Error('fixture freeze failed');
const issued=R.issuePermit(g2,frozen.draft,[p2,structuredClone(p2)]);
if(!issued.ok)throw new Error('fixture issue failed');
observe('PR01','Raw solved arrays authorize a domain without run/trace identity',{ok:false},()=>({ok:created.ok,g:created.instance.g}));
observe('PR02','Two copies of the same board authorize an envelope',{ok:false},()=>({ok:issued.ok,g:issued.instance.g,permits:issued.instance.permits.length}));
observe('PR03','Changed body retaining the old digest reaches a delivery row',{ok:false},()=>{const x=R.sendLocal(issued.instance,issued.permit.id,{...frozen.draft,body:'Changed after freeze; old digest retained'});return {ok:x.ok,body:x.ok?x.instance.deliveries[0]?.body:null}});
observe('PR04','issuePermit accepts a caller-forged draft bypassing freeze',{ok:false},()=>{const x=R.issuePermit(g2,{...frozen.draft,from:'unregistered@example.com',to:['outsider@example.com'],digest:'0'.repeat(64)},[p2,structuredClone(p2)]);return {ok:x.ok,sender:x.ok?x.permit.sender:null,recipients:x.ok?x.permit.recipients:null}});
observe('PR05','sendLocal does not resolve recipient membership again',{ok:false},()=>{const state=structuredClone(issued.instance);state.permits[0].recipients=['outsider@example.com'];const x=R.sendLocal(state,state.permits[0].id,frozen.draft);return {ok:x.ok,mailbox_row:x.ok?x.instance.deliveries[0]?.mailbox:null,network_delivery:false}});
observe('PR06','Exact prior permit lookup is blocked by g=3 horizon',{ok:true,same_permit:true,new_issuance:false},()=>{const x=R.issuePermit(issued.instance,frozen.draft,[p2,p2]);return x.ok?{ok:true,same_permit:x.permit.id===issued.permit.id}:{ok:false,reason:x.reason}});
observe('PR07','Repeated send is an idempotent no-op',{ok:true,delivery_count:1},()=>{const a=R.sendLocal(issued.instance,issued.permit.id,frozen.draft);if(!a.ok)throw new Error(a.reason);const b=R.sendLocal(a.instance,issued.permit.id,frozen.draft);return {ok:b.ok,delivery_count:b.ok?b.instance.deliveries.length:null}});
observe('PR08','Second domain can consume the envelope ordinal',{ok:false},()=>{const x=R.commitDomain(g2,'second',[p2,p2]);return {ok:x.ok,g:x.ok?x.instance.g:null,domains:x.ok?x.instance.domains.length:null}});
observe('PR09','Caller may replace 4x4 boxes with 1x16 boxes',{ok:false},()=>{const latin=Array.from({length:256},(_,i)=>(Math.floor(i/16)+i%16)%16+1);const x=R.commitDomain(R.emptyInstance(),'latin',[{givens:latin.map((v,i)=>i<128?0:v),candidate:latin}],{order:16,boxRows:1,boxCols:16});return {ok:x.ok,valid_under_PLAYED:Q.verifyCandidate(latin.map((v,i)=>i<128?0:v),latin,Q.PLAYED).ok}});
observe('PR10','Missing spentPermits can throw at send',{structured_refusal:true},()=>{const x=structuredClone(issued.instance);delete x.spentPermits;return R.sendLocal(x,x.permits[0].id,frozen.draft)});
observe('PR11','countSolutions accepts a duplicate-filled completed grid',{valid_input:false,unique:false},()=>({count:Q.countSolutions(Array(256).fill(1),Q.PLAYED),independent_verification:Q.verifyCandidate(Array(256).fill(1),Array(256).fill(1),Q.PLAYED).ok}));
observe('PR12','A changed digest is refused by send',{ok:false},()=>{const x=R.sendLocal(issued.instance,issued.permit.id,{...frozen.draft,digest:'f'.repeat(64)});return {ok:x.ok,reason:x.ok?null:x.reason}});
observe('PR13','freezeDraft rejects an external recipient',{ok:false},()=>{const x=R.freezeDraft({from:created.mailbox.address,to:'outsider@example.com',bcc:'',subject:'Synthetic',body:'Synthetic'},g2);return {ok:x.ok,reason:x.ok?null:x.reason}});
console.log(JSON.stringify({schema:'GLYPHOKU_BASELINE_CHARACTERIZATION/1',node:process.version,platform:process.platform,original_code_modified:false,application_launched:false,live_journeys_run:false,rows},null,2));
