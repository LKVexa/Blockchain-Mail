import {canonical} from './crypto.mjs';
import {demand} from './policy.mjs';
import {local127Host} from './local127-address.mjs';
export const LOCAL127_FORMAT='VEXA127-ADDRESS-REGISTRY/1';
export const LOCAL127_SERVICE=Object.freeze({host:'127.0.0.1',kind:'http-service'});
export const MAX_LOCAL127_CLAIMS=65535;
const sorted=claims=>claims.toSorted((a,b)=>a.address<b.address?-1:a.address>b.address?1:0);
const exact=(value,keys)=>value&&Object.getPrototypeOf(value)===Object.prototype&&Object.keys(value).length===keys.length&&keys.every(k=>Object.hasOwn(value,k));
const fail=(ok,message)=>demand(ok,'LOCAL127_REGISTRY',message,503);
function checkClaim(claim,height=null){
 fail(exact(claim,['address','host','kind','created_height'])&&['mailbox','alias'].includes(claim.kind)&&local127Host(claim.address)===claim.host&&claim.host!==LOCAL127_SERVICE.host&&Number.isSafeInteger(claim.created_height)&&claim.created_height>0&&(height===null||claim.created_height===height),'Invalid local127 address claim');
}
function checkClaims(claims){
 fail(Array.isArray(claims)&&claims.length<=MAX_LOCAL127_CLAIMS,'Local127 claim capacity exceeded');
 const addresses=new Set(),hosts=new Set();for(const c of claims){checkClaim(c);fail(!addresses.has(c.address)&&!hosts.has(c.host),'Duplicate local127 address or host claim');addresses.add(c.address);hosts.add(c.host);}
 fail(canonical(claims)===canonical(sorted(claims)),'Local127 claims must have canonical address order');
}
function resourceClaims(s,height){
 const claims=[];for(const [kind,values]of [['mailbox',s.accounts],['alias',s.aliases]])for(const address of Object.keys(values)){const host=local127Host(address);if(host)claims.push({address,host,kind,created_height:height});}
 return sorted(claims);
}
export function validateLocal127(s){
 if(s.local127===undefined)return;
 const r=s.local127;fail(exact(r,['format','service','claims'])&&r.format===LOCAL127_FORMAT&&canonical(r.service)===canonical(LOCAL127_SERVICE),'Invalid local127 registry schema or service reservation');checkClaims(r.claims);
 const resources=resourceClaims(s,1).map(({created_height,...c})=>c),claims=r.claims.map(({created_height,...c})=>c);
 fail(canonical(resources)===canonical(claims),'Local127 claims do not match all mailbox and alias resources');
}
function initialize(s,height,events){
 if(s.local127!==undefined){validateLocal127(s);return s.local127;}
 const claims=resourceClaims(s,height);checkClaims(claims);
 const r={format:LOCAL127_FORMAT,service:{...LOCAL127_SERVICE},claims};s.local127=r;
 // Existing resources are reconciled in this new signed event; old blocks stay exact.
 events.push({type:'LOCAL127_REGISTRY_INITIALIZED',...structuredClone(r),reconciliation:'existing-logical-resources'});return r;
}
export function ensureLocal127Registry(s,height,events){return initialize(s,height,events);}
export function allocateLocal127(s,height,events){
 const r=initialize(s,height,events),used=new Set(r.claims.map(c=>c.host));
 demand(r.claims.length<MAX_LOCAL127_CLAIMS,'LOCAL127_CAPACITY','Local127 logical address capacity reached',507);
 if(s.torusMail?.network?.node_id==='n00'&&s.torusMail.network.card.version===2){
  const prefix=s.torusMail.network.prefix;
  for(let index=0;index<=r.claims.length;index++){const domain=prefix+(10000000000000000001n+BigInt(index)).toString();if(!used.has(domain))return domain;}
  demand(false,'LOCAL127_CAPACITY','Private identifier allocation pool exhausted',507);
 }
 for(let n=2;n<=254;n++){const host='127.0.0.'+n;if(!used.has(host))return host;}
 demand(false,'LOCAL127_CAPACITY','Local127 logical allocation pool exhausted',507);
}
export function claimLocal127(s,address,kind,height,events){
 const host=local127Host(address);if(!host)return;
 demand(host!==LOCAL127_SERVICE.host,'LOCAL127_RESERVED','127.0.0.1 is reserved for the local HTTP service',409);
 const r=initialize(s,height,events);
 demand(!r.claims.some(c=>c.address===address||c.host===host),'LOCAL127_EXISTS','Local127 address or host is already reserved in this ledger',409);
 demand(r.claims.length<MAX_LOCAL127_CLAIMS,'LOCAL127_CAPACITY','Local127 logical address capacity reached',507);
 const claim={address,host,kind,created_height:height};checkClaim(claim,height);r.claims=sorted([...r.claims,claim]);events.push({type:'LOCAL127_ADDRESS_CLAIMED',...claim});
}
export function local127View(s){
 validateLocal127(s);
 const recorded=s.local127!==undefined,unreconciled_claims=recorded?[]:resourceClaims(s,1).map(({created_height,...claim})=>claim),groups=new Map();
 for(const claim of unreconciled_claims){const group=groups.get(claim.host)??[];group.push(claim.address);groups.set(claim.host,group);}
 const reconciliation_conflicts=[...groups].filter(([host,addresses])=>host===LOCAL127_SERVICE.host||addresses.length>1).map(([host,addresses])=>({host,addresses:[...new Set(addresses)].sort(),service_reserved:host===LOCAL127_SERVICE.host})).toSorted((a,b)=>a.host<b.host?-1:a.host>b.host?1:0);
 return {format:LOCAL127_FORMAT,recorded,service:{...LOCAL127_SERVICE},claims:structuredClone(s.local127?.claims??[]),reconciliation_required:unreconciled_claims.length>0,unreconciled_claims,reconciliation_conflicts,scope:'single-local-ledger',logical_only:true};
}
// Replay only the literal reservation journal, after each block's signature has passed.
export function replayLocal127(journal,events,height){
 for(const event of events){
  if(event.type==='LOCAL127_REGISTRY_INITIALIZED'){
   fail(journal===null&&exact(event,['type','format','service','claims','reconciliation'])&&event.format===LOCAL127_FORMAT&&canonical(event.service)===canonical(LOCAL127_SERVICE)&&event.reconciliation==='existing-logical-resources','Duplicate or malformed local127 initialization event');
   checkClaims(event.claims);for(const c of event.claims)checkClaim(c,height);journal={format:LOCAL127_FORMAT,service:{...LOCAL127_SERVICE},claims:structuredClone(event.claims)};
  }else if(event.type==='LOCAL127_ADDRESS_CLAIMED'){
   fail(journal!==null&&exact(event,['type','address','host','kind','created_height']),'Local127 claim event lacks its initialization');const {type,...claim}=event;checkClaim(claim,height);
   fail(!journal.claims.some(c=>c.address===claim.address||c.host===claim.host),'Replayed local127 address or host claim');journal.claims=sorted([...journal.claims,claim]);checkClaims(journal.claims);
  }
 }
 return journal;
}
export function validateLocal127Journal(s,journal){fail(canonical(s.local127??null)===canonical(journal),'Signed local127 event journal differs from current reservations');}
export function validateLocal127Transition(previous,s,events,height){
 validateLocal127(s);const before=previous?.local127??null,after=replayLocal127(structuredClone(before),events,height);validateLocal127Journal(s,after);
 if(previous!==null&&before===null&&after===null)fail(canonical(resourceClaims(previous,height))===canonical(resourceClaims(s,height)),'Local127 resources changed without an explicit signed reservation journal');
 if(before===null&&after!==null){const event=events.find(e=>e.type==='LOCAL127_REGISTRY_INITIALIZED');fail(canonical(event.claims)===canonical(resourceClaims(previous??{accounts:{},aliases:{}},height)),'Local127 initialization does not reconcile the prior resources');}
}
