/** In-app private computer enrollment. Only a scoped one-time capability is
 * shared; vault keys and mailbox/operator credentials remain on this computer. */
import {randomBytes,timingSafeEqual} from 'node:crypto';
import {canonical,hash,id,signature,verifySignature} from './crypto.mjs';
import {demand} from './policy.mjs';
import {TORUS_DOMAINS,validateTorusInvitation,validateTorusCard,validateTorusDirectory,addressNode} from './torus-mail.mjs';

const DIRECTORY_QUERY='WORKSPACE391-TORUS-DIRECTORY-QUERY/1';
const CODE_TTL=7*24*60*60*1000;
const exact=(value,keys)=>value&&Object.getPrototypeOf(value)===Object.prototype&&Object.keys(value).sort().join(',')===[...keys].sort().join(',');
const unsigned=({signature:ignored,...value})=>value;
const signed=(domain,value,key)=>({...value,signature:signature(domain,value,key)});
const capabilityHash=(invitation,capability)=>hash('WORKSPACE391-TORUS-CONNECTION/1\n'+canonical({invitation,capability}));
const sameHash=(first,second)=>typeof first==='string'&&typeof second==='string'&&/^[a-f0-9]{64}$/.test(first)&&/^[a-f0-9]{64}$/.test(second)&&timingSafeEqual(Buffer.from(first,'hex'),Buffer.from(second,'hex'));

export function decodeConnectionCode(code){
 demand(typeof code==='string'&&code.length<=8192,'TORUS_CONNECTION_CODE','Paste the connection code from the first computer');
 const text=code.trim();demand(/^w391:[A-Za-z0-9_-]+$/.test(text),'TORUS_CONNECTION_CODE','Paste the complete Workspace391 connection code');
 let value;try{const encoded=text.slice(5),bytes=Buffer.from(encoded,'base64url');demand(bytes.toString('base64url')===encoded,'TORUS_CONNECTION_CODE','Invalid connection code');value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{demand(false,'TORUS_CONNECTION_CODE','The connection code could not be read');}
 demand(exact(value,['version','invitation','capability'])&&value.version===1&&typeof value.capability==='string'&&/^[a-f0-9]{64}$/.test(value.capability),'TORUS_CONNECTION_CODE','Invalid computer connection code');
 validateTorusInvitation(value.invitation);return value;
}

export function createTorusOnboarding(store,mail,{transport,refreshMs=60000}={}){
 let closed=false,timer=null,refreshing=null,connecting=false;const pending=new Set();
 const operatorToken=()=>store.credentials()['postmaster@local.test'];
 function read(tok){const state=store.state();store.integrityHead(state);mail.validateState(state);if(tok!==undefined)store.authenticate(tok,state);return state;}
 function ready(){demand(!closed,'TORUS_CLOSED','Private mail is stopping',503);demand(store.vault,'TORUS_PROTECTED_REQUIRED','Open the protected workspace to connect private mail',403);}
 function operator(tok){ready();const state=read(tok);store.operator(tok,state);return state;}
 const endpoint=network=>({onion:network.node_id==='n00'?network.onion:network.invitation.root_onion,port:network.node_id==='n00'?network.port:network.invitation.root_port});
 function track(promise){pending.add(promise);void promise.finally(()=>pending.delete(promise)).catch(()=>{});return promise;}
 function importResult(tok,response){ready();demand(exact(response,['directory']),'TORUS_DIRECTORY','The first computer did not return a signed directory',502);mail.importDirectory(tok,response.directory);return {active:true,...mail.status(tok)};}
 function refresh(){
  ready();if(refreshing)return refreshing;const state=read(),network=state.torusMail?.network;
  if(!network||network.node_id==='n00')return Promise.resolve({active:network?.status==='ACTIVE',replayed:true});
  demand(typeof transport?.fetchDirectory==='function','TORUS_TRANSPORT','The private computer connection is not running',503);
  const freshQuery=()=>{ready();const current=read(),local=current.torusMail.network;demand(local.network_id===network.network_id&&local.node_id===network.node_id,'TORUS_DIRECTORY_PIN','Private computer registration changed while connecting',409);return signed(DIRECTORY_QUERY,{version:1,network_id:local.network_id,node_id:local.node_id,nonce:id(),created_at:store.time(current)},store.key.privateKey);};
  const work=Promise.resolve().then(()=>transport.fetchDirectory(endpoint(network),freshQuery(),{refreshRequest:freshQuery})).then(response=>importResult(operatorToken(),response));
  refreshing=track(work);void work.finally(()=>{if(refreshing===work)refreshing=null;}).catch(()=>{});return work;
 }
 return {
  initialize(){ready();const state=read();if(!state.torusMail)mail.createNetwork(operatorToken());return mail.status(operatorToken());},
  start(){ready();if(timer)return;void refresh().catch(()=>{});timer=setInterval(()=>{if(!closed)void refresh().catch(()=>{});},refreshMs);timer.unref?.();},
  connectionCode(tok){
   const state=operator(tok),network=state.torusMail?.network;demand(network?.status==='ACTIVE'&&network.node_id==='n00','TORUS_COORDINATOR','Get a connection code from the first computer',403);
   const now=store.time(state),available=state.torusMail.leases.find(grant=>{if(network.directory.nodes.some(card=>card.invitation?.invite_id===grant.invite_id))return false;const record=state.torusMail.enrollment?.codes.find(code=>code.invite_id===grant.invite_id);return !record||record.card_hash===null&&record.expires_at<now;});
   const invitation=mail.invitation(tok,available?(available.version===2?{node_id:available.node_id}:{x:available.x,y:available.y}):undefined).invitation,capability=randomBytes(32).toString('hex');
   store.mutate(tok,(s,actor,now,events)=>{const t=s.torusMail;t.enrollment??={version:1,codes:[]};const prior=t.enrollment.codes.find(code=>code.invite_id===invitation.invite_id);demand(!prior?.card_hash,'TORUS_CONNECTION_USED','That connection already belongs to another computer',409);const record={invite_id:invitation.invite_id,capability_hash:capabilityHash(invitation,capability),created_at:now,expires_at:now+CODE_TTL,card_hash:null};if(prior)Object.assign(prior,record);else t.enrollment.codes.push(record);events.push({type:'TORUS_CONNECTION_CODE_CREATED',network_id:t.network.network_id,invite_id:invitation.invite_id,expires_at:record.expires_at});return {created:true};},{admin:true});
   return {code:'w391:'+Buffer.from(canonical({version:1,invitation,capability}),'utf8').toString('base64url'),expires_in_days:7};
  },
  async connect(tok,code){
   operator(tok);demand(!connecting,'TORUS_CONNECTING','This computer is already connecting',409);const value=decodeConnectionCode(code);demand(typeof transport?.enroll==='function','TORUS_TRANSPORT','The private computer connection is not running',503);connecting=true;
   const work=Promise.resolve().then(async()=>{const {card}=mail.join(tok,value.invitation,{replaceStandalone:true});const response=await transport.enroll({onion:value.invitation.root_onion,port:value.invitation.root_port},{...value,card});const result=importResult(tok,response);return {...result,assigned_address:mail.login(tok).assigned_address};});
   track(work);try{return await work;}finally{connecting=false;}
  },
  enroll(value){
   ready();demand(exact(value,['version','invitation','capability','card'])&&value.version===1&&typeof value.capability==='string'&&/^[a-f0-9]{64}$/.test(value.capability),'TORUS_CONNECTION_CODE','Invalid computer connection request');validateTorusInvitation(value.invitation);
   const digest=capabilityHash(value.invitation,value.capability),cardDigest=hash(canonical(value.card));
   const result=store.mutate(operatorToken(),(s,actor,now,events)=>{const t=s.torusMail,n=t?.network;demand(n?.status==='ACTIVE'&&n.node_id==='n00','TORUS_COORDINATOR','This computer does not enroll private computers',403);const record=t.enrollment?.codes.find(code=>code.invite_id===value.invitation.invite_id);
    demand(record&&sameHash(record.capability_hash,digest)&&t.leases.some(grant=>canonical(grant)===canonical(value.invitation)),'TORUS_CONNECTION_CODE','This connection code is no longer valid',403);
    validateTorusCard(value.card,n.root_public,n.network_id);demand(canonical(value.card.invitation)===canonical(value.invitation),'TORUS_CONNECTION_CODE','Computer card differs from its connection code',403);
    const previous=n.directory.nodes.find(card=>card.node_id===value.card.node_id);
    if(record.card_hash!==null){demand(record.card_hash===cardDigest&&canonical(previous)===canonical(value.card),'TORUS_CONNECTION_USED','This connection code already belongs to another computer',403);return {directory:structuredClone(n.directory)};}
    demand(now<=record.expires_at,'TORUS_CONNECTION_EXPIRED','This connection code expired; get a new code from the first computer',403);
    demand(!previous||canonical(previous)===canonical(value.card),'TORUS_PEER_CONFLICT','That computer slot already belongs to another computer',409);
    if(!previous){const nodes=[...n.directory.nodes,value.card].toSorted((a,b)=>a.node_id.localeCompare(b.node_id)),directory=signed(TORUS_DOMAINS.directory,{version:nodes.some(card=>card.version===2)?2:1,network_id:n.network_id,root_public:n.root_public,revision:n.directory.revision+1,nodes},store.key.privateKey);validateTorusDirectory(directory);n.directory=directory;events.push({type:'TORUS_PEER_ADMITTED',network_id:n.network_id,node_id:value.card.node_id,card_hash:cardDigest,revision:directory.revision});}
    record.card_hash=cardDigest;events.push({type:'TORUS_CONNECTION_USED',network_id:n.network_id,invite_id:record.invite_id,card_hash:cardDigest});return {directory:structuredClone(n.directory)};
   },{admin:true});return {directory:result.directory};
  },
  directory(query){
   ready();demand(exact(query,['version','network_id','node_id','nonce','created_at','signature'])&&query.version===1&&typeof query.nonce==='string'&&/^[a-f0-9]{32}$/.test(query.nonce)&&Number.isSafeInteger(query.created_at)&&query.created_at>=0,'TORUS_DIRECTORY_QUERY','Invalid private directory request');
   const state=read(),network=state.torusMail?.network;demand(network?.status==='ACTIVE'&&network.node_id==='n00'&&query.network_id===network.network_id,'TORUS_DIRECTORY_QUERY','This computer does not hold that private directory',403);const card=network.directory.nodes.find(card=>card.node_id===query.node_id);
   demand(card&&Math.abs(store.time(state)-query.created_at)<=180000&&verifySignature(DIRECTORY_QUERY,unsigned(query),query.signature,card.sign_public),'TORUS_DIRECTORY_QUERY','Private computer registration could not be verified',403);return {directory:structuredClone(network.directory)};
  },
  sync(tok){operator(tok);return refresh();},
  async prepare(tok,input){
   const state=read(tok),network=state.torusMail?.network;if(network?.status!=='ACTIVE')return;mail.login(tok);if(network.node_id==='n00'||!Array.isArray(input.to))return;
   const missing=input.to.some(value=>{if(typeof value!=='string'||!/@127\./.test(value.trim().toLowerCase()))return false;try{addressNode(network.directory,value);return false;}catch(error){return error.code==='TORUS_UNKNOWN_RECIPIENT';}});
   if(missing)try{await refresh();}catch{/* Routing still uses the last verified directory. */}
  },
  async close(){closed=true;clearInterval(timer);await Promise.allSettled([...pending]);}
 };
}
