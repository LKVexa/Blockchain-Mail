import {canonical} from './crypto.mjs';
import {demand} from './policy.mjs';
import {local127Host} from './local127-address.mjs';
import {allocateLocal127,claimLocal127,ensureLocal127Registry,LOCAL127_SERVICE,MAX_LOCAL127_CLAIMS} from './local127-registry.mjs';

const EVENT='LOCAL127_MAILBOX_ASSIGNED';
const exact=(value,keys)=>value&&Object.getPrototypeOf(value)===Object.prototype&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
const sorted=items=>items.toSorted((a,b)=>a.owner<b.owner?-1:a.owner>b.owner?1:0);
const fail=(ok,message)=>demand(ok,'LOCAL127_ASSIGNMENT',message,503);
const canonicalOwner=owner=>typeof owner==='string'&&owner.length<=254&&(/^[a-z0-9][a-z0-9._+-]{0,63}@[a-z0-9.-]+$/.test(owner)||local127Host(owner)!==null);
function allocatedAlias(address){
 if(/^(?:mail|rmail)@127\.0\.0\.1:[1-9][0-9]{0,31}$/.test(address??''))return true;
 const match=/^(?:mail|rmail)@127\.0\.0\.(\d+)$/.exec(address??'');
 return !!match&&String(Number(match[1]))===match[1]&&Number(match[1])>=2&&Number(match[1])<=254;
}
function checkAssignment(item,height=null){
 fail(exact(item,['owner','address','created_height'])&&canonicalOwner(item.owner)&&typeof item.address==='string'&&local127Host(item.address)!==null&&local127Host(item.address)!==LOCAL127_SERVICE.host&&Number.isSafeInteger(item.created_height)&&item.created_height>0&&(height===null||item.created_height===height),'Invalid local127 mailbox assignment');
 fail(item.address===item.owner||allocatedAlias(item.address),'An assigned alias must use the local127 allocation pool');
}
function checkJournal(journal){
 fail(exact(journal,['version','items'])&&journal.version===1&&Array.isArray(journal.items)&&journal.items.length<=MAX_LOCAL127_CLAIMS,'Invalid local127 mailbox assignment journal');
 const owners=new Set(),addresses=new Set();
 for(const item of journal.items){checkAssignment(item);fail(!owners.has(item.owner)&&!addresses.has(item.address),'Duplicate local127 mailbox assignment');owners.add(item.owner);addresses.add(item.address);}
 fail(canonical(journal.items)===canonical(sorted(journal.items)),'Local127 mailbox assignments must have canonical owner order');
}

export function getLocal127Assignment(s,owner){
 return structuredClone(s.mailAssignments?.items.find(item=>item.owner===owner)??null);
}

export function validateLocal127Assignments(s){
 if(s.mailAssignments===undefined)return;
 checkJournal(s.mailAssignments);
 for(const item of s.mailAssignments.items){
  fail(!!s.accounts?.[item.owner],'Local127 mailbox assignment owner is missing');
  const self=item.address===item.owner,claim=s.local127?.claims?.find(c=>c.address===item.address);
  fail(claim&&claim.kind===(self?'mailbox':'alias')&&claim.host===local127Host(item.address)&&claim.created_height<=item.created_height,'Local127 mailbox assignment lacks its signed reservation');
  if(self)fail(!!s.accounts[item.address]&&!Object.hasOwn(s.aliases,item.address),'A reused local127 mailbox must belong to its authenticated owner');
  else fail(!Object.hasOwn(s.accounts,item.address)&&canonical(s.aliases[item.address]??null)===canonical([item.owner])&&claim.created_height===item.created_height,'Assigned local127 alias does not exclusively target its owner');
 }
}

// Availability and ownership are committed together under Store's write lock.
// The original mailbox and authentication token remain the account identity.
export function ensureLocal127Assignment(store,tok){
 return store.mutate(tok,(s,owner,now,events)=>{
  validateLocal127Assignments(s);
  const prior=getLocal127Assignment(s,owner);
  if(prior)return {assignment:prior,replayed:true};
  const height=store.head().header.height+1;
  let address;
  if(local127Host(owner)!==null&&local127Host(owner)!==LOCAL127_SERVICE.host){
   ensureLocal127Registry(s,height,events);address=owner;
   fail(s.local127.claims.some(c=>c.address===owner&&c.kind==='mailbox'),'Existing local127 mailbox has no exclusive reservation');
  }else{
   address='mail@'+allocateLocal127(s,height,events);
   fail(!Object.hasOwn(s.accounts,address)&&!Object.hasOwn(s.aliases,address),'Allocated local127 address is already a resource');
   claimLocal127(s,address,'alias',height,events);s.aliases[address]=[owner];
  }
  const assignment={owner,address,created_height:height};
  s.mailAssignments??={version:1,items:[]};
  s.mailAssignments.items=sorted([...s.mailAssignments.items,assignment]);
  events.push({type:EVENT,...assignment});
  return {assignment:structuredClone(assignment),replayed:false};
 });
}

// Replay only after the containing block's signature and event commitment pass.
export function replayLocal127Assignments(journal,events,height){
 if(journal!==null)checkJournal(journal);
 for(const event of events){
  if(event.type!==EVENT)continue;
  fail(exact(event,['type','owner','address','created_height']),'Malformed local127 mailbox assignment event');
  const {type,...assignment}=event;checkAssignment(assignment,height);
  journal??={version:1,items:[]};
  fail(!journal.items.some(item=>item.owner===assignment.owner||item.address===assignment.address),'Replayed local127 mailbox assignment');
  journal.items=sorted([...journal.items,structuredClone(assignment)]);checkJournal(journal);
 }
 return journal;
}

export function validateLocal127AssignmentJournal(s,journal){
 validateLocal127Assignments(s);
 fail(canonical(s.mailAssignments??null)===canonical(journal),'Signed local127 assignment journal differs from current ownership');
}

export function validateLocal127AssignmentTransition(previous,s,events,height){
 validateLocal127Assignments(s);
 const before=previous?.mailAssignments??null,after=replayLocal127Assignments(structuredClone(before),events,height);
 validateLocal127AssignmentJournal(s,after);
 for(const event of events){
  if(event.type!==EVENT)continue;
  const {owner,address}=event;
  fail(!!previous?.accounts?.[owner],'Local127 assignment must belong to an existing authenticated account');
  if(address===owner){
   fail(!!previous.accounts[address]&&local127Host(address)!==null&&local127Host(address)!==LOCAL127_SERVICE.host,'Invalid reuse of an existing local127 mailbox');
  }else{
   fail(!Object.hasOwn(previous.accounts,address)&&!Object.hasOwn(previous.aliases,address),'Assignment cannot take over a previously existing resource');
   const claims=events.filter(e=>e.type==='LOCAL127_ADDRESS_CLAIMED'&&e.address===address);
   fail(claims.length===1&&claims[0].kind==='alias'&&claims[0].host===local127Host(address)&&claims[0].created_height===height,'A new local127 assignment requires its fresh alias reservation in the same block');
  }
 }
}
