import {issuanceAllowed,inBand,verifyCandidate,PLAYED,exactTopology,eventPolicy,analyzeSolutions,PREPARATION,type Topology} from './rules.ts';
import {createSolver} from './solver.ts';
import {sha256} from '../sha256.ts';
export const PROFILE='GLYPHOKU_VEXA127/2';
export class RegistryError extends Error{code:string;constructor(code:string,message:string){super(message);this.code=code;}}
export function requireRule(ok:unknown,code:string,message:string):asserts ok{if(!ok)throw new RegistryError(code,message);}
export type Domain={id:string;label:string;address:string;ordinal:number};
export type Mailbox={id:string;domainId:string;address:string;role:'owner'};
export type FrozenDraft={from:string;to:string[];bcc:string[];subject:string;body:string;digest:string};
export type Permit={id:string;ordinal:number;sender:string;draftDigest:string;recipients:string[];bcc:string[];state:'READY'|'DELIVERED_LOCAL';draft:FrozenDraft};
export type Delivery={id:string;permitId:string;mailbox:string;from:string;to:string[];subject:string;body:string};
export type Instance={g:number;domains:Domain[];mailboxes:Mailbox[];permits:Permit[];deliveries:Delivery[];spentPermits:string[]};
export type Registry={schema:'GLYPHOKU_LOCAL_REGISTRY/2';profile:typeof PROFILE;instanceId:string;revision:number;instance:Instance;completedOperations:Operation[];consumedChallenges:string[]};
export type Operation={id:string;kind:'domain'|'envelope'|'send';intentDigest:string;runId:string|null;result:any;boards:any[]};
export function emptyInstance():Instance{return {g:1,domains:[],mailboxes:[],permits:[],deliveries:[],spentPermits:[]};}
export function emptyRegistry(instanceId:string):Registry{return {schema:'GLYPHOKU_LOCAL_REGISTRY/2',profile:PROFILE,instanceId,revision:0,instance:emptyInstance(),completedOperations:[],consumedChallenges:[]};}
export function hexDigest(value:string):string{return Array.from(sha256(new TextEncoder().encode(value)),x=>x.toString(16).padStart(2,'0')).join('');}
export function plain(o:unknown):o is Record<string,unknown>{return !!o&&typeof o==='object'&&!Array.isArray(o)&&(Object.getPrototypeOf(o)===Object.prototype||Object.getPrototypeOf(o)===null);}
export function exactKeys(o:unknown,keys:string[],code='SCHEMA'):asserts o is Record<string,any>{requireRule(plain(o)&&Object.keys(o).length===keys.length&&keys.every(k=>Object.hasOwn(o,k)),code,'Object fields do not match the selected schema.');}
const LABEL=/^[a-z0-9](?:[a-z0-9-]{0,22}[a-z0-9])?$/;
const RESERVED=new Set(['localhost','mail','www','glyphoku']);
export function normalizeLabel(raw:string){if(typeof raw!=='string')return {ok:false as const,code:'INVALID_LABEL',reason:'Label must be a string.'};const label=raw.trim().toLowerCase();if(!LABEL.test(label)||RESERVED.has(label))return {ok:false as const,code:'INVALID_LABEL',reason:'Use an unreserved label of 1–24 letters, digits or internal hyphens.'};return {ok:true as const,label};}
export function domainAddress(label:string){return `${label}.glyphoku.localhost`;}
export function canonical127Host(host:unknown):host is string{return typeof host==='string'&&/^127\.(?:0|[1-9][0-9]{0,2})\.(?:0|[1-9][0-9]{0,2})\.(?:0|[1-9][0-9]{0,2})$/.test(host)&&host.split('.').every(x=>Number(x)<=255);}
export function resolveMailbox(raw:string,instance:Instance){
 if(typeof raw!=='string')return {ok:false as const,code:'UNKNOWN_LOCAL_MAILBOX',reason:'A mailbox address must be a string.'};const address=raw.trim().toLowerCase();
 if(!/^[a-z0-9][a-z0-9._+-]{0,63}@[a-z0-9](?:[a-z0-9-]{0,22}[a-z0-9])?\.glyphoku\.localhost$/.test(address)&&!(/^[a-z0-9][a-z0-9._+-]{0,63}@/.test(address)&&canonical127Host(address.slice(address.indexOf('@')+1))))return {ok:false as const,code:'EXTERNAL_RECIPIENT',reason:'External addresses are refused without DNS or MX lookup.'};
 if(!Array.isArray(instance.mailboxes)||!instance.mailboxes.some(m=>m.address===address))return {ok:false as const,code:'UNKNOWN_LOCAL_MAILBOX',reason:'Mailbox is not registered on this local instance.'};return {ok:true as const,address};
}
export function canonicalDraft(d:Pick<FrozenDraft,'from'|'to'|'bcc'|'subject'|'body'>){return JSON.stringify({from:d.from,to:d.to,bcc:d.bcc,subject:d.subject,body:d.body});}
function splitAddresses(s:string){return [...new Set(s.split(/[,\s]+/).map(x=>x.trim().toLowerCase()).filter(Boolean))];}
export function freezeDraft(input:{from:string;to:string;bcc:string;subject:string;body:string},instance:Instance){
 try{exactKeys(input,['from','to','bcc','subject','body'],'DRAFT_SCHEMA');for(const k of Object.keys(input))requireRule(typeof input[k as keyof typeof input]==='string','DRAFT_SCHEMA','Every draft field must be text.');
 requireRule(!/[\r\n]/.test(input.subject),'SUBJECT','Subject cannot contain a line break.');
 const subject=input.subject.trim(),body=input.body.replace(/\r\n/g,'\n'),to=splitAddresses(input.to),bcc=splitAddresses(input.bcc);
 requireRule(subject.length>=1&&subject.length<=120,'SUBJECT','Subject must contain 1–120 JavaScript code units.');requireRule(body.trim().length>0&&body.length<=4000,'BODY','Body must contain text and be at most 4,000 JavaScript code units.');
 requireRule(to.length>0&&to.length<=8&&bcc.length<=8&&new Set([...to,...bcc]).size<=8,'RECIPIENTS','Use 1–8 unique local recipients and at least one To address.');
 requireRule(instance.mailboxes.some(m=>m.address===input.from),'UNKNOWN_LOCAL_MAILBOX','Sender must be an existing normalized mailbox.');
 for(const a of [...to,...bcc]){const r=resolveMailbox(a,instance);if(!r.ok)throw new RegistryError(r.code,r.reason);}
 const data={from:input.from,to:[...to],bcc:[...bcc],subject,body};const draft:FrozenDraft={...data,digest:hexDigest(canonicalDraft(data))};Object.freeze(draft.to);Object.freeze(draft.bcc);Object.freeze(draft);return {ok:true as const,draft};
 }catch(e){return {ok:false as const,code:(e as RegistryError).code??'DRAFT_SCHEMA',reason:(e as Error).message};}
}
export function validateFrozen(d:FrozenDraft,instance:Instance):FrozenDraft{
 exactKeys(d,['from','to','bcc','subject','body','digest'],'DRAFT_SCHEMA');
 requireRule(Array.isArray(d.to)&&Array.isArray(d.bcc)&&d.to.every((x:unknown)=>typeof x==='string')&&d.bcc.every((x:unknown)=>typeof x==='string'),'DRAFT_SCHEMA','Recipients must be text arrays.');
 requireRule(typeof d.digest==='string'&&/^[a-f0-9]{64}$/.test(d.digest),'DRAFT_DIGEST_MISMATCH','Invalid draft digest.');
 const v=freezeDraft({from:d.from,to:d.to.join(','),bcc:d.bcc.join(','),subject:d.subject,body:d.body},instance);if(!v.ok)throw new RegistryError(v.code,v.reason);
 requireRule(v.draft.digest===d.digest&&canonicalDraft(v.draft)===canonicalDraft(d),'DRAFT_DIGEST_MISMATCH','Frozen bytes or digest changed.');return v.draft;
}
export function stableObject(value:any):string{if(value===null||typeof value!=='object')return JSON.stringify(value);if(Array.isArray(value))return '['+value.map(stableObject).join(',')+']';return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+stableObject(value[k])).join(',')+'}';}
export function projectRecipients(d:FrozenDraft){return [...new Set([...d.to,...d.bcc])];}
export type Puzzle={givens:readonly number[];candidate:readonly number[]};
const grants=new WeakMap<object,{action:string;g:number;intent:string;batch:string}>();
/** The server owns the returned issuer; no HTTP request accepts a grant or raw proof. */
export function createRunAuthority(){return {issue(action:'domain'|'envelope',g:number,intent:string,puzzles:Puzzle[]){const ticket=Object.freeze({});grants.set(ticket,{action,g,intent,batch:hexDigest(JSON.stringify(puzzles))});return ticket;},revoke(ticket:object){grants.delete(ticket);}};}
function validateBatch(instance:Instance,action:'domain'|'envelope',intent:string,puzzles:Puzzle[],t:Topology,ticket?:object){
 requireRule(exactTopology(t),'INVALID_TOPOLOGY','Played topology cannot be overridden.');
 const allowed=issuanceAllowed(instance.g);if(!allowed.ok)throw new RegistryError(allowed.code,allowed.reason);
 requireRule((instance.g===1&&action==='domain')||(instance.g===2&&action==='envelope'),'WRONG_ACTION_FOR_ORDINAL','g=1 is reserved for the domain; g=2 for its envelope.');
 requireRule(Array.isArray(puzzles)&&puzzles.length===allowed.puzzles,'WRONG_BATCH_LENGTH',`g=${instance.g} requires exactly ${allowed.puzzles} boards.`);
 const seen=new Set<string>();for(const p of puzzles){exactKeys(p,['givens','candidate'],'INVALID_CANDIDATE');const v=verifyCandidate(p.givens,p.candidate,PLAYED);if(!v.ok)throw new RegistryError(v.code,v.reason);requireRule(inBand(instance.g,p.givens),'OUT_OF_BAND','Givens are outside this ordinal’s empty-cell band.');const fingerprint=hexDigest(JSON.stringify(p.givens));requireRule(!seen.has(fingerprint),'DUPLICATE_CHALLENGE','The batch repeats a challenge.');seen.add(fingerprint);}
 const a=ticket&&grants.get(ticket);requireRule(a&&a.action===action&&a.g===instance.g&&a.intent===intent&&a.batch===hexDigest(JSON.stringify(puzzles)),'REPLAY_NOT_AUTHORIZED','A current completed server-owned run is required; raw arrays are not authority.');
}
function failure(e:unknown){return {ok:false as const,code:(e as RegistryError).code??'SCHEMA',reason:(e as Error).message};}
export function commitDomain(instance:Instance,labelRaw:string,puzzles:Puzzle[],t:Topology=PLAYED,ticket?:object,assignedHost?:string){try{
 const label=normalizeLabel(labelRaw);if(!label.ok)throw new RegistryError(label.code,label.reason);requireRule(!instance.domains.some(d=>d.label===label.label),'DUPLICATE_DOMAIN','This local domain already exists.');validateBatch(instance,'domain',label.label,puzzles,t,ticket);
 requireRule(assignedHost===undefined||(canonical127Host(assignedHost)&&assignedHost!=='127.0.0.1'),'INVALID_LOCAL127_HOST','The authority must assign a canonical unreserved four-octet local127 host.');
 const domain:Domain={id:'dom-1',label:label.label,address:assignedHost??domainAddress(label.label),ordinal:1};const mailbox:Mailbox={id:'box-1',domainId:domain.id,address:`owner@${domain.address}`,role:'owner'};
 return {ok:true as const,instance:{...instance,g:2,domains:[domain],mailboxes:[mailbox]},domain,mailbox};
 }catch(e){return failure(e);}}
export function issuePermit(instance:Instance,raw:FrozenDraft,puzzles:Puzzle[],t:Topology=PLAYED,ticket?:object){try{
 const draft=validateFrozen(raw,instance);validateBatch(instance,'envelope',draft.digest,puzzles,t,ticket);
 const permit:Permit={id:'env-1',ordinal:2,sender:draft.from,draftDigest:draft.digest,recipients:[...draft.to],bcc:[...draft.bcc],state:'READY',draft:JSON.parse(JSON.stringify(draft))};
 return {ok:true as const,instance:{...instance,g:3,permits:[permit]},permit};
 }catch(e){return failure(e);}}
export function sendLocal(instance:Instance,id:string,raw:FrozenDraft){try{
 const draft=validateFrozen(raw,instance),permit=instance.permits.find(p=>p.id===id);requireRule(permit,'NO_PERMIT','No such permit.');validateFrozen(permit.draft,instance);
 requireRule(permit.sender===draft.from&&permit.draftDigest===draft.digest&&canonicalDraft(permit.draft)===canonicalDraft(draft)&&JSON.stringify(permit.recipients)===JSON.stringify(draft.to)&&JSON.stringify(permit.bcc)===JSON.stringify(draft.bcc),'DRAFT_DIGEST_MISMATCH','Permit does not bind this exact frozen message.');
 requireRule(Array.isArray(instance.spentPermits),'STORE_CORRUPT','Spend journal is missing.');
 const recipients=projectRecipients(draft),rows:Delivery[]=recipients.map((mailbox,i)=>({id:`${id}-${i}`,permitId:id,mailbox,from:draft.from,to:[...draft.to],subject:draft.subject,body:draft.body}));
 if(permit.state==='DELIVERED_LOCAL'){requireRule(instance.spentPermits.length===1&&instance.spentPermits[0]===id&&stableObject(instance.deliveries)===stableObject(rows),'STORE_CORRUPT','Delivered permit and complete journal disagree.');return {ok:true as const,instance,replayed:true};}
 requireRule(permit.state==='READY'&&!instance.spentPermits.includes(id)&&!instance.deliveries.some(x=>x.permitId===id),'INVALID_PERMIT_STATE','Only a consistent READY permit can be spent.');
 return {ok:true as const,instance:{...instance,spentPermits:[...instance.spentPermits,id],permits:instance.permits.map(p=>p.id===id?{...p,state:'DELIVERED_LOCAL' as const}:p),deliveries:[...instance.deliveries,...rows]},replayed:false};
 }catch(e){return failure(e);}}
export function validateRegistry(value:unknown,{verifyTraces=true}:{verifyTraces?:boolean}={}):asserts value is Registry{
 exactKeys(value,['schema','profile','instanceId','revision','instance','completedOperations','consumedChallenges'],'STORE_CORRUPT');const w=value;
 requireRule(w.schema==='GLYPHOKU_LOCAL_REGISTRY/2'&&w.profile===PROFILE,'UNSUPPORTED_SCHEMA','Registry profile/schema differs.');requireRule(typeof w.instanceId==='string'&&/^[a-f0-9]{32}$/.test(w.instanceId)&&Number.isSafeInteger(w.revision)&&w.revision>=0&&w.revision<=3,'STORE_CORRUPT','Invalid instance identity/revision.');
 exactKeys(w.instance,['g','domains','mailboxes','permits','deliveries','spentPermits'],'STORE_CORRUPT');const s=w.instance as Instance;
 for(const k of ['domains','mailboxes','permits','deliveries','spentPermits'] as const)requireRule(Array.isArray(s[k]),'STORE_CORRUPT','Missing registry array.');
 requireRule(s.domains.length<=1&&s.mailboxes.length===s.domains.length&&s.permits.length<=s.domains.length&&s.spentPermits.length<=s.permits.length&&s.deliveries.length<=8,'STORE_CORRUPT','Resource counts exceed the two-journey profile.');
 requireRule(s.g===1+s.domains.length+s.permits.length,'STORE_CORRUPT','Ordinal disagrees with issuance history.');
 for(const d of s.domains){exactKeys(d,['id','label','address','ordinal'],'STORE_CORRUPT');const n=normalizeLabel(d.label);requireRule(n.ok&&n.label===d.label&&d.id==='dom-1'&&d.ordinal===1&&(d.address===domainAddress(d.label)||(canonical127Host(d.address)&&d.address!=='127.0.0.1')),'STORE_CORRUPT','Domain is malformed.');}
 for(const m of s.mailboxes){exactKeys(m,['id','domainId','address','role'],'STORE_CORRUPT');const d=s.domains.find(d=>d.id===m.domainId);requireRule(d&&m.id==='box-1'&&m.role==='owner'&&m.address===`owner@${d.address}`,'STORE_CORRUPT','Mailbox/domain relationship invalid.');}
 for(const p of s.permits){exactKeys(p,['id','ordinal','sender','draftDigest','recipients','bcc','state','draft'],'STORE_CORRUPT');validateFrozen(p.draft,s);requireRule(p.id==='env-1'&&p.ordinal===2&&p.sender===p.draft.from&&p.draftDigest===p.draft.digest&&JSON.stringify(p.recipients)===JSON.stringify(p.draft.to)&&JSON.stringify(p.bcc)===JSON.stringify(p.draft.bcc),'STORE_CORRUPT','Permit/draft relationship invalid.');requireRule(p.state==='READY'||p.state==='DELIVERED_LOCAL','STORE_CORRUPT','Unsupported permit state.');if(p.state==='READY')requireRule(!s.spentPermits.length&&!s.deliveries.length,'STORE_CORRUPT','READY cannot have deliveries or a spend.');else{const checked=sendLocal(s,p.id,p.draft);requireRule(checked.ok,'STORE_CORRUPT','Delivered permit/spend/rows disagree.');}}
 requireRule(s.permits.length>0||(!s.deliveries.length&&!s.spentPermits.length),'STORE_CORRUPT','Orphan delivery/spend.');
 for(const row of s.deliveries){exactKeys(row,['id','permitId','mailbox','from','to','subject','body'],'STORE_CORRUPT');requireRule(!Object.hasOwn(row,'bcc'),'STORE_CORRUPT','Recipient projection includes Bcc.');}
 requireRule(Array.isArray(w.completedOperations)&&w.completedOperations.length===w.revision&&Array.isArray(w.consumedChallenges),'STORE_CORRUPT','Operation/revision journal invalid.');
 requireRule(w.completedOperations.length===s.domains.length+s.permits.length+(s.spentPermits.length?1:0),'STORE_CORRUPT','Missing or extra completed operation.');
 const ids=new Set<string>(),runs=new Set<string>();let boardCount=0;const fingerprints:string[]=[];
 for(let j=0;j<w.completedOperations.length;j++){const op=w.completedOperations[j];exactKeys(op,['id','kind','intentDigest','runId','result','boards'],'STORE_CORRUPT');requireRule(typeof op.id==='string'&&/^[a-zA-Z0-9._:-]{8,96}$/.test(op.id)&&!ids.has(op.id),'STORE_CORRUPT','Invalid/duplicate operation ID.');ids.add(op.id);
 requireRule(op.kind===['domain','envelope','send'][j]&&typeof op.intentDigest==='string'&&/^[a-f0-9]{64}$/.test(op.intentDigest)&&plain(op.result)&&Array.isArray(op.boards),'STORE_CORRUPT','Operation type, digest or result invalid.');
 const intent=j===0?{action:'domain',intent:{label:s.domains[0]!.label}}:j===1?{action:'envelope',intent:{draft:s.permits[0]!.draft}}:{permit_id:s.permits[0]!.id,draft:canonicalDraft(s.permits[0]!.draft)};
 requireRule(op.intentDigest===hexDigest(stableObject(intent)),'STORE_CORRUPT','Operation intent digest differs from its issued resource.');
 requireRule(op.result.operation_id===op.id&&op.result.revision===j+1&&op.result.g===Math.min(j+2,3)&&typeof op.result.block_height==='number'&&Number.isSafeInteger(op.result.block_height)&&op.result.block_height>0,'STORE_CORRUPT','Operation receipt relation invalid.');
 if(j===0)requireRule(op.result.status==='DOMAIN_CREATED'&&stableObject(op.result.domain)===stableObject(s.domains[0])&&stableObject(op.result.mailbox)===stableObject(s.mailboxes[0]),'STORE_CORRUPT','Domain receipt mismatch.');
 if(j===1)requireRule(op.result.status==='READY'&&op.result.not_sent===true&&op.result.permit_id===s.permits[0].id&&op.result.draft_digest===s.permits[0].draftDigest&&op.result.stamp_id===op.runId,'STORE_CORRUPT','Envelope receipt mismatch.');
 if(j===2)requireRule(op.result.status==='DELIVERED_LOCAL'&&op.result.permit_id===s.permits[0].id&&op.result.stamp_id===w.completedOperations[1].runId&&op.result.cost===0&&op.result.payer==='GAME'&&typeof op.result.message_id==='string'&&/^[a-f0-9]{32}$/.test(op.result.message_id)&&Array.isArray(op.result.deliveries)&&op.result.deliveries.length===projectRecipients(s.permits[0].draft).length+1,'STORE_CORRUPT','Send receipt mismatch.');
 if(j<2){requireRule(typeof op.runId==='string'&&/^[a-f0-9]{32}$/.test(op.runId)&&!runs.has(op.runId)&&op.boards.length===2**j,'STORE_CORRUPT','Run/batch receipt invalid.');runs.add(op.runId);for(const b of op.boards){exactKeys(b,['fingerprint','givens','candidate','events','event_count','guesses','retractions','traceDigest','candidateDigest','uniqueness','selection','initial_frame_ack','terminal_frame_ack','rendered_checkpoints'],'STORE_CORRUPT');
 const policy=eventPolicy(j+1);requireRule(verifyCandidate(b.givens,b.candidate,PLAYED).ok&&inBand(j+1,b.givens),'STORE_CORRUPT','Stored puzzle is invalid.');requireRule(b.fingerprint===hexDigest(JSON.stringify(b.givens))&&b.candidateDigest===hexDigest(JSON.stringify(b.candidate)),'STORE_CORRUPT','Stored puzzle digest mismatch.');
 requireRule(Array.isArray(b.events)&&Number.isSafeInteger(b.event_count)&&b.events.length===b.event_count&&b.event_count>1&&b.event_count<=policy.cap&&b.guesses>=policy.minGuesses&&b.retractions>=policy.minRetractions,'STORE_CORRUPT','Stored event counters invalid.');
 const replay=verifyTraces?createSolver(b.givens,PLAYED):null;
 let guesses=0,retractions=0;for(let k=0;k<b.events.length;k++){const e=b.events[k];exactKeys(e,['seq','type','cell','oldValue','newValue','rule','depth','nodes'],'STORE_CORRUPT');requireRule(e.seq===k+1&&['INIT','ASSIGN','GUESS','CONTRADICTION','RETRACT','SEARCH_SOLVED','SEARCH_EXHAUSTED'].includes(e.type)&&(e.cell===null||(Number.isInteger(e.cell)&&e.cell>=0&&e.cell<256&&b.givens[e.cell]===0))&&Number.isInteger(e.oldValue)&&e.oldValue>=0&&e.oldValue<=16&&Number.isInteger(e.newValue)&&e.newValue>=0&&e.newValue<=16&&Number.isInteger(e.depth)&&e.depth>=0&&Number.isInteger(e.nodes)&&e.nodes>=0&&typeof e.rule==='string','STORE_CORRUPT','Stored event shape/sequence invalid.');if(replay)requireRule(stableObject(replay.step())===stableObject(e),'STORE_CORRUPT','Stored event differs from deterministic solver semantics.');if(e.type==='GUESS')guesses++;if(e.type==='RETRACT')retractions++;}
 if(replay){requireRule(replay.step()===null&&JSON.stringify(replay.snapshot().board)===JSON.stringify(b.candidate),'STORE_CORRUPT','Stored trace does not complete its candidate.');const unique=analyzeSolutions(b.givens,PLAYED,{nodeLimit:PREPARATION.uniquenessNodes});requireRule(unique.status==='COMPLETE_ONE'&&unique.complete&&unique.nodes===b.uniqueness?.nodes,'STORE_CORRUPT','Stored uniqueness claim does not match the bounded independent search.');}
 requireRule(b.events[0].type==='INIT'&&b.events.at(-1).type==='SEARCH_SOLVED'&&guesses===b.guesses&&retractions===b.retractions&&b.traceDigest===hexDigest(stableObject(b.events)),'STORE_CORRUPT','Stored trace commitment or counters mismatch.');
 requireRule(plain(b.uniqueness)&&b.uniqueness.status==='COMPLETE_ONE'&&b.uniqueness.complete===true&&b.uniqueness.found===1&&typeof b.uniqueness.nodes==='number'&&Number.isSafeInteger(b.uniqueness.nodes)&&b.uniqueness.nodes>0&&plain(b.selection)&&b.selection.events===b.event_count&&b.selection.guesses===guesses&&b.selection.retractions===retractions,'STORE_CORRUPT','Stored preparation/uniqueness evidence invalid.');
 requireRule(b.initial_frame_ack===true&&b.terminal_frame_ack===true&&Number.isInteger(b.rendered_checkpoints)&&b.rendered_checkpoints>=2&&b.rendered_checkpoints<=b.event_count,'STORE_CORRUPT','Stored observer checkpoints invalid.');fingerprints.push(b.fingerprint);boardCount++;}}
 else requireRule(op.runId===null&&!op.boards.length,'STORE_CORRUPT','Send is not a new game.');
 }
 requireRule(w.consumedChallenges.length===boardCount&&new Set(w.consumedChallenges).size===boardCount&&JSON.stringify(w.consumedChallenges)===JSON.stringify(fingerprints),'STORE_CORRUPT','Consumed challenge journal disagrees.');
 requireRule(new TextEncoder().encode(JSON.stringify(w)).length<=8*1024*1024,'STORE_CAPACITY','Registry exceeds the explicit 8 MiB bound.');
}
