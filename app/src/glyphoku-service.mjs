import {Worker} from 'node:worker_threads';
import {randomBytes} from 'node:crypto';
import {id,hash,canonical,token} from './crypto.mjs';
import {demand,MailError,DEFAULTS,requestId} from './policy.mjs';
import {readGlyphoku,writeGlyphoku,makeGameStamp,checkGlyphoku} from './glyphoku-persistence.mjs';
import {allocateLocal127,claimLocal127,local127View} from './local127-registry.mjs';
import {PROFILE,normalizeLabel,freezeDraft,validateFrozen,canonicalDraft,validateRegistry,createRunAuthority,commitDomain,issuePermit,sendLocal,projectRecipients,exactKeys} from '../desk/modules/lib/glyphoku/registry.js';
import {PLAYED,PREPARATION,eventPolicy,issuanceAllowed,puzzlesRequired,analyzeSolutions,verifyCandidate} from '../desk/modules/lib/glyphoku/rules.js';
import {createSolver} from '../desk/modules/lib/glyphoku/solver.js';
import {verifyLiveTrace,validateEventBudget} from '../desk/modules/lib/glyphoku/trace.js';
export const CONFIG=Object.freeze({profile:PROFILE,puzzle_profile:'GLYPHOKU_VEM_127/1',topology:PLAYED,horizon:2,tick_ms:100,speeds:[1,8,24,40],default_speed:24,preparation:PREPARATION,max_registry_bytes:8*1024*1024,observer_lease_ms:5*60000,run_lifetime_ms:120*60000});
const PROFILE_DIGEST=hash(canonical(CONFIG));
function checked(result){if(!result.ok)throw new MailError(result.code??'GLYPHOKU',result.reason,409);return result;}
function contract(input,keys){try{exactKeys(input,keys,'INPUT_SCHEMA');}catch(e){throw new MailError(e.code,e.message);}}
export class GlyphokuService{
 #run=null;#authority=createRunAuthority();
 constructor(store,{seedFactory=()=>randomBytes(4).readUInt32LE(),monotonicNow=()=>Math.floor(performance.now())}={}){this.store=store;this.seedFactory=seedFactory;this.now=monotonicNow;this.timer=setInterval(()=>this.expire(),1000);this.timer.unref();}
 expire(){const r=this.#run;if(r&&!['COMMITTED','CANCELLED','FAILED'].includes(r.phase)&&(this.now()-r.touched>=CONFIG.observer_lease_ms||this.now()-r.started>=CONFIG.run_lifetime_ms))this.invalidate(r,'OBSERVER_EXPIRED');}
 read(tok){const s=this.store.state();this.store.integrityHead(s);const actor=this.store.operator(tok,s),data=readGlyphoku(this.store,s);return {s,actor,...data};}
 view(tok){const {s,registry}=this.read(tok);this.expire();return {profile:PROFILE,config:CONFIG,profile_digest:PROFILE_DIGEST,instance_id:registry.instanceId,revision:registry.revision,instance:registry.instance,local127_registry:local127View(s),head:this.store.head(),operations:registry.completedOperations.map(({id,kind,intentDigest,runId,result,boards})=>({id,kind,intentDigest,runId,result,boards:boards.map(({events,givens,candidate,...rest})=>rest)})),active:this.#run&&!['COMMITTED','FAILED','CANCELLED'].includes(this.#run.phase)?{id:this.#run.id,phase:this.#run.phase}:null};}
 credential(tok){const {mailboxToken,registry}=this.read(tok);demand(mailboxToken,'NO_MAILBOX','Create the game domain first',404);return {address:registry.instance.mailboxes[0].address,token:mailboxToken,scope:'Read this mailbox at /mail/. Direct credit-based sends from game accounts are refused.'};}
 mail(tok){const {mailboxToken}=this.read(tok);if(!mailboxToken)return {messages:[]};return {messages:[...this.store.list(mailboxToken,'INBOX'),...this.store.list(mailboxToken,'Sent')].map(m=>this.store.message(mailboxToken,m.id))};}
 operation(tok,operationId){const {registry}=this.read(tok);requestId(operationId);const op=registry.completedOperations.find(x=>x.id===operationId);demand(op,'NO_OPERATION','No committed operation with this ID',404);return {operation_id:op.id,kind:op.kind,result:op.result,replayed:true,revision:registry.revision};}
 start(tok,input){
 contract(input,['action','intent','expected_revision','instance_id','operation_id']);requestId(input.operation_id);demand(['domain','envelope'].includes(input.action),'ACTION','Unknown game action');
 const {s,actor,registry}=this.read(tok);demand(input.instance_id===registry.instanceId,'INSTANCE','Different local chain instance',409);
 let intent;if(input.action==='domain'){contract(input.intent,['label']);const normalized=checked(normalizeLabel(input.intent.label));intent={label:normalized.label};}
 else{contract(input.intent,['draft']);try{intent={draft:validateFrozen(input.intent.draft,registry.instance)}}catch(e){throw new MailError(e.code,e.message,409);}}
 const intentDigest=hash(canonical({action:input.action,intent}));const prior=registry.completedOperations.find(x=>x.id===input.operation_id);
 if(prior){demand(prior.kind===input.action&&prior.intentDigest===intentDigest,'REPLAY_CONFLICT','Operation ID already has different intent',409);return {phase:'COMMITTED',operation_id:prior.id,result:prior.result,replayed:true};}
 const allowed=checked(issuanceAllowed(registry.instance.g));
 if(input.action==='domain')demand(!registry.instance.domains.some(d=>d.label===intent.label),'DUPLICATE_DOMAIN','Domain label already registered',409);
 demand((registry.instance.g===1&&input.action==='domain')||(registry.instance.g===2&&input.action==='envelope'),'WRONG_ACTION_FOR_ORDINAL','g=1 is domain; g=2 is envelope',409);
 demand(Number.isSafeInteger(input.expected_revision)&&input.expected_revision===registry.revision,'STALE_REVISION','Registry changed; reload before starting',409);
 this.expire();if(this.#run&&!['COMMITTED','FAILED','CANCELLED'].includes(this.#run.phase))throw new MailError('RUN_BUSY','A live run already owns this instance. Stop it explicitly before starting another.',409);
 const r={id:id(),observer:token(),actor,revision:registry.revision,instanceId:registry.instanceId,g:registry.instance.g,action:input.action,intent,operationId:input.operation_id,intentDigest,phase:'PREPARING',started:this.now(),touched:this.now(),paused:false,index:0,boards:[],receipts:[],pending:null,frameCounter:0,rendered:0,active_ms:0,paused_ms:0,hidden_reports:0,worker:null};this.#run=r;
 const worker=new Worker(new URL('./glyphoku-worker.mjs',import.meta.url),{workerData:{runId:r.id,g:r.g,seed:this.seedFactory(r.g)},resourceLimits:{maxOldGenerationSizeMb:96,stackSizeMb:4}});r.worker=worker;
 r.watchdog=setTimeout(()=>{if(this.#run===r&&r.phase==='PREPARING')this.invalidate(r,'PREPARATION_BUDGET_EXCEEDED');},PREPARATION.wallMs+1000);
 worker.once('message',data=>{if(this.#run!==r||r.phase!=='PREPARING')return;clearTimeout(r.watchdog);r.worker=null;
  try{demand(data.ok,data.code??'PREPARATION','Preparation refused within the fixed budget');demand(data.runId===r.id&&data.boards.length===allowed.puzzles,'PREPARATION','Mismatched worker result');const seen=new Set();for(const b of data.boards){demand(b.fingerprint===hash(JSON.stringify(b.givens))&&!seen.has(b.fingerprint)&&!registry.consumedChallenges.includes(b.fingerprint),'DUPLICATE_CHALLENGE','Challenge reused');demand(b.uniqueness.status==='COMPLETE_ONE'&&b.uniqueness.complete,'UNIQUE_SEARCH_INCOMPLETE','Uniqueness not established');seen.add(b.fingerprint);}
   r.boards=data.boards;r.preparation_ms=data.preparation_ms;r.work_nodes=data.work_nodes;this.beginBoard(r);
  }catch(e){this.invalidate(r,e.code??e.message);}});
 worker.once('error',e=>{if(this.#run===r&&!['CANCELLED','COMMITTED'].includes(r.phase))this.invalidate(r,'PREPARATION_WORKER_FAILED');});
 worker.once('exit',code=>{if(this.#run===r&&r.phase==='PREPARING')this.invalidate(r,code===0?'PREPARATION_NO_RESULT':'PREPARATION_WORKER_FAILED');});
 return {run_id:r.id,observer_key:r.observer,phase:r.phase,operation_id:r.operationId,profile_digest:PROFILE_DIGEST,expected_revision:r.revision,g:r.g};
 }
 beginBoard(r){const b=r.boards[r.index];r.solver=createSolver(b.givens,PLAYED);r.events=[r.solver.step()];r.phase='INITIAL_FRAME';r.boardRendered=0;r.pending=this.frame(r,r.events,true,false);}
 frame(r,events,initial=false,terminal=false){const snapshot=r.solver.snapshot(),frame={id:`${r.id}:${++r.frameCounter}`,board_index:r.index,seq:r.events.length,board:snapshot.board,kind:snapshot.kind,depth:snapshot.depth,nodes:snapshot.nodes,events,initial,terminal};frame.digest=hash(canonical(frame));return frame;}
 locate(tok,input){const s=this.store.state();this.store.integrityHead(s);const actor=this.store.operator(tok,s),r=this.#run;demand(r&&input.run_id===r.id&&actor===r.actor&&input.observer_key===r.observer,'STALE_RUN','Live observer capability unavailable; reloads do not restore it',409);this.expire();r.touched=this.now();return r;}
 publicRun(r){return {run_id:r.id,operation_id:r.operationId,action:r.action,g:r.g,phase:r.phase,paused:r.paused,index:r.index,total:r.boards.length||puzzlesRequired(r.g),frame:r.pending,counts:{events:r.events?.length??0,guesses:r.events?.filter(x=>x.type==='GUESS').length??0,retractions:r.events?.filter(x=>x.type==='RETRACT').length??0,rendered:r.rendered},preparation_ms:r.preparation_ms??null,active_ms:r.active_ms,elapsed_ms:this.now()-r.started,paused_ms:r.paused_ms+(r.pauseStarted!=null?this.now()-r.pauseStarted:0),note:r.error??null,result:r.result??null};}
 poll(tok,input){contract(input,['run_id','observer_key']);return this.publicRun(this.locate(tok,input));}
 ack(tok,input){contract(input,['run_id','observer_key','frame_id','digest']);const r=this.locate(tok,input);demand(!['CANCELLED','FAILED','COMMITTED'].includes(r.phase),'STALE_RUN','Run no longer accepts observation',409);
  if(r.lastAck?.id===input.frame_id&&r.lastAck.digest===input.digest)return this.publicRun(r);
  demand(r.pending&&r.pending.id===input.frame_id&&r.pending.digest===input.digest,'FRAME_MISMATCH','Acknowledge the exact pending rendered frame',409);
  const frame=r.pending;r.lastAck={id:frame.id,digest:frame.digest};r.pending=null;r.rendered++;r.boardRendered++;
  if(frame.initial)r.phase='LIVE SOLVING';
  if(frame.terminal){try{const board=r.boards[r.index],candidate=r.solver.snapshot().board;const trace=verifyLiveTrace(r.g,board.givens,candidate,r.events);const unique=analyzeSolutions(board.givens,PLAYED,{nodeLimit:PREPARATION.uniquenessNodes,deadline:Date.now()+2000});demand(unique.status==='COMPLETE_ONE'&&unique.complete,'UNIQUE_SEARCH_INCOMPLETE','Independent uniqueness verification incomplete',409);
    r.receipts.push({fingerprint:board.fingerprint,givens:board.givens,candidate,events:r.events,...trace,uniqueness:unique,selection:board.selection,initial_frame_ack:true,terminal_frame_ack:true,rendered_checkpoints:r.boardRendered});
    if(r.index+1<r.boards.length){r.index++;this.beginBoard(r);}else{r.phase='COMMIT_READY';r.solver=null;}
   }catch(e){this.invalidate(r,e.code??e.message);throw new MailError(e.code??'VERIFY',e.message,409);}}
  return this.publicRun(r);
 }
 advance(tok,input){contract(input,['run_id','observer_key','count','single_step']);const r=this.locate(tok,input);demand(r.phase==='LIVE SOLVING'&&!r.pending,'BACKPRESSURE','Acknowledge the displayed frame before advancing',409);
  demand(CONFIG.speeds.includes(input.count)&&typeof input.single_step==='boolean','PACE','Unsupported event pacing');demand(!r.paused||input.single_step,'PAUSED','Run is paused',409);if(input.single_step){demand(input.count===1,'PACE','Single step is exactly one event');if(!r.paused)r.pauseStarted=this.now();r.paused=true;}
  const started=performance.now(),batch=[],policy=eventPolicy(r.g);
  try{for(let i=0;i<input.count;i++){demand(r.events.length<policy.cap,'EVENT_BUDGET_EXCEEDED','No cap+1 event is permitted',409);const event=r.solver.step();demand(event,'TRACE_TERMINAL','Solver stopped without a terminal event');r.events.push(event);batch.push(event);validateEventBudget(r.g,r.events.length);if(event.type==='SEARCH_SOLVED'){r.phase='FINAL_FRAME';break;}demand(event.type!=='SEARCH_EXHAUSTED','SEARCH_EXHAUSTED','No solution found within live search',409);}r.active_ms+=performance.now()-started;r.pending=this.frame(r,batch,false,r.phase==='FINAL_FRAME');return this.publicRun(r);
  }catch(e){this.invalidate(r,e.code??e.message);throw new MailError(e.code??'RUN_FAILED',e.message,409);}
 }
 control(tok,input){contract(input,['run_id','observer_key','action']);const r=this.locate(tok,input);demand(['pause','resume','stop','hidden'].includes(input.action),'ACTION','Unknown run control');
  if(input.action==='stop'){demand(r.phase!=='COMMITTED','ALREADY_COMMITTED','Operation already committed; stop cannot undo it',409);this.invalidate(r,'CANCELLED');}
  else{demand(!['COMMITTED','FAILED','CANCELLED'].includes(r.phase),'STALE_RUN','Run no longer active',409);if(input.action==='hidden')r.hidden_reports++;if(input.action==='resume'){if(r.pauseStarted!=null)r.paused_ms+=this.now()-r.pauseStarted;r.pauseStarted=null;r.paused=false;}else{if(!r.paused)r.pauseStarted=this.now();r.paused=true;}}return this.publicRun(r);
 }
 abandon(tok){const {actor}=this.read(tok);if(this.#run&&this.#run.actor===actor&&this.#run.phase!=='COMMITTED')this.invalidate(this.#run,'CANCELLED');return {cancelled:true};}
 invalidate(r,code){clearTimeout(r.watchdog);r.worker?.terminate();r.worker=null;r.solver=null;r.pending=null;r.phase=code==='CANCELLED'?'CANCELLED':'FAILED';r.error=code;}
 commit(tok,input){contract(input,['run_id','observer_key','operation_id']);requestId(input.operation_id);
  const {registry}=this.read(tok),prior=registry.completedOperations.find(x=>x.id===input.operation_id);if(prior){demand(prior.runId===input.run_id,'REPLAY_CONFLICT','Different completed run',409);return {result:prior.result,replayed:true,revision:registry.revision};}
  const r=this.locate(tok,input);demand(r.phase==='COMMIT_READY'&&!r.pending&&!r.paused,'RUN_NOT_READY','A live, unpaused, fully observed and verified run is required',409);demand(input.operation_id===r.operationId,'REPLAY_CONFLICT','Operation differs from run binding',409);
  const puzzles=r.receipts.map(b=>({givens:b.givens,candidate:b.candidate})),ticket=this.#authority.issue(r.action,r.g,r.action==='domain'?r.intent.label:r.intent.draft.digest,puzzles);
  try{const result=this.store.mutate(tok,(s,actor,now,events)=>{
    const data=readGlyphoku(this.store,s),w=data.registry;demand(w.instanceId===r.instanceId&&w.revision===r.revision&&w.instance.g===r.g,'STALE_REVISION','Registry changed while solving',409);
    demand(r.receipts.length===puzzlesRequired(r.g)&&r.receipts.every(b=>!w.consumedChallenges.includes(b.fingerprint)),'DUPLICATE_CHALLENGE','Wrong/reused challenge batch',409);
    let resource;if(r.action==='domain'){
     const height=this.store.head().header.height+1,host=allocateLocal127(s,height,events),made=checked(commitDomain(w.instance,r.intent.label,puzzles,PLAYED,ticket,host));w.instance=made.instance;
     demand(!s.accounts[made.mailbox.address],'DUPLICATE_DOMAIN','Mailbox already present',409);demand(Object.keys(s.accounts).length<DEFAULTS.max_mailboxes,'MAILBOX_CAPACITY','Mailbox capacity reached',507);
     claimLocal127(s,made.mailbox.address,'mailbox',height,events);data.mailboxToken=token();s.accounts[made.mailbox.address]={role:'user',tokenHash:hash(data.mailboxToken),balance:0,quota:DEFAULTS.mailbox_quota_bytes,daily:0,accept:true,blocked:[],glyphoku:true};resource={domain:made.domain,mailbox:made.mailbox,status:'DOMAIN_CREATED'};
     events.push({type:'GLYPHOKU_DOMAIN_CREATED',domain_hash:hash(made.domain.address),mailbox_hash:hash(made.mailbox.address),run_id:r.id});
    }else{const made=checked(issuePermit(w.instance,r.intent.draft,puzzles,PLAYED,ticket));w.instance=made.instance;const signed=makeGameStamp(this.store,s,made.permit,now,r.id);resource={permit_id:made.permit.id,stamp_id:signed.envelope.id,draft_digest:made.permit.draftDigest,status:'READY',not_sent:true};events.push({type:'GLYPHOKU_ENVELOPE_READY',permit_id:made.permit.id,stamp_id:signed.envelope.id,draft_digest:made.permit.draftDigest,run_id:r.id});}
    w.revision++;const receipt={...resource,metrics:{preparation_ms:r.preparation_ms,active_search_us:Math.round(r.active_ms*1000),paused_ms:r.paused_ms,elapsed_ms:this.now()-r.started,rendered_checkpoints:r.rendered,hidden_reports:r.hidden_reports,visible_time_ms:null},operation_id:r.operationId,revision:w.revision,g:w.instance.g,block_height:this.store.head().header.height+1};w.completedOperations.push({id:r.operationId,kind:r.action,intentDigest:r.intentDigest,runId:r.id,result:receipt,boards:r.receipts});w.consumedChallenges.push(...r.receipts.map(b=>b.fingerprint));
    writeGlyphoku(this.store,s,data);events.push({type:'GLYPHOKU_RUN_CONSUMED',run_id:r.id,profile_digest:PROFILE_DIGEST,action:r.action,g:r.g,challenges:r.receipts.map(b=>b.fingerprint),trace_roots:r.receipts.map(b=>b.traceDigest)});return {result:receipt};
   },{admin:true});
   const committed=this.read(tok).registry.completedOperations.find(x=>x.id===r.operationId);demand(committed,'ACKNOWLEDGMENT','Commit acknowledgment unavailable; retrieve operation by ID',503);r.phase='COMMITTED';r.result=committed.result;return {...result,revision:committed.result.revision};
  }catch(e){r.phase='FAILED';r.error=e.code??'COMMIT_UNCERTAIN';throw e;}finally{this.#authority.revoke(ticket);}
 }
 send(tok,input){contract(input,['permit_id','draft','expected_revision','instance_id','operation_id']);requestId(input.operation_id);return this.store.mutate(tok,(s,a,now,events)=>{
  const data=readGlyphoku(this.store,s),w=data.registry;demand(w.instanceId===input.instance_id,'INSTANCE','Different instance',409);let draft;try{draft=validateFrozen(input.draft,w.instance);}catch(e){throw new MailError(e.code,e.message,409);}
  const digest=hash(canonical({permit_id:input.permit_id,draft:canonicalDraft(draft)})),conflict=w.completedOperations.find(o=>o.id===input.operation_id);if(conflict)demand(conflict.kind==='send'&&conflict.intentDigest===digest,'REPLAY_CONFLICT','Operation ID already bound to different work',409);
  const transitioned=checked(sendLocal(w.instance,input.permit_id,draft));const old=w.completedOperations.find(x=>x.kind==='send');if(transitioned.replayed){demand(old&&old.intentDigest===digest,'STORE_CORRUPT','Spent permit lacks matching receipt',503);return {result:old.result,replayed:true};}
  demand(Number.isSafeInteger(input.expected_revision)&&w.revision===input.expected_revision,'STALE_REVISION','Registry changed before send',409);
  const envelope=w.completedOperations.find(x=>x.kind==='envelope');demand(envelope,'NO_PERMIT','Missing envelope operation');const stamp=s.stamps[envelope.result.stamp_id];demand(stamp?.status==='RESERVED','STAMP_USED','Permit stamp not available',409);
  const recipients=projectRecipients(draft);for(const address of [draft.from,...recipients])demand(s.accounts[address]?.glyphoku,'UNKNOWN_LOCAL_MAILBOX','Game mailbox missing from the actual server',409);this.store.checkConsent(s,{from:draft.from,to:recipients});
  const p={version:1,from:draft.from,to:[...draft.to],subject:draft.subject,body:draft.body,attachments:[],raw:null},copies=[...recipients,draft.from];demand(s.messages.length+copies.length<=DEFAULTS.max_messages,'MESSAGE_CAPACITY','Mail capacity reached',507);
  const delivery=this.store.deliverMessage(s,draft.from,p,now,events,stamp,{recipients,forceInbox:true});w.instance=transitioned.instance;w.revision++;const receipt={...delivery,permit_id:input.permit_id,status:'DELIVERED_LOCAL',operation_id:input.operation_id,revision:w.revision,g:w.instance.g,block_height:this.store.head().header.height+1};
  w.completedOperations.push({id:input.operation_id,kind:'send',intentDigest:digest,runId:null,result:receipt,boards:[]});writeGlyphoku(this.store,s,data);events.push({type:'GLYPHOKU_PERMIT_SPENT',permit_id:input.permit_id,stamp_id:stamp.envelope.id,draft_digest:draft.digest});return {result:receipt};
 },{admin:true});}
 trace(tok,operationId){const {registry}=this.read(tok),op=registry.completedOperations.find(x=>x.id===operationId);demand(op,'NO_OPERATION','No completed operation',404);return {format:'GLYPHOKU-TRACE/2',profile:PROFILE,profile_digest:PROFILE_DIGEST,operation:op,limits:CONFIG,scope:'Recorded logical events and cooperative render acknowledgments, not proof of human observation.'};}
 close(){clearInterval(this.timer);if(this.#run&&this.#run.phase!=='COMMITTED')this.invalidate(this.#run,'CANCELLED');}
}
