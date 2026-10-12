import {local127Host} from './local127-address.mjs';
import {isAttachmentReference,validateAttachmentReference} from './torus-attachments.mjs';
export const PROFILE='LOCAL127_CREDIT_V1';
export const DEFAULTS=Object.freeze({price:1,stamp_ttl_ms:300000,daily_allowance:20,sponsor_daily_quota:0,mailbox_quota_bytes:null,max_body_bytes:128*1024,max_attachment_bytes:512*1024,max_raw_bytes:768*1024,max_recipients:8,max_messages:5000,max_replays:10000,max_blocks:50000,max_mailboxes:64,max_pending_stamps:128,max_connections:24,smtp_idle_ms:30000});
export class MailError extends Error {constructor(code,message,http=400){super(message);this.code=code;this.http=http}}
export function demand(ok,code,message,http=400){if(!ok)throw new MailError(code,message,http)}
export function address(a){demand(typeof a==='string'&&a.length<=150,'ADDRESS','Invalid address');a=a.trim().toLowerCase();demand(/^[a-z0-9][a-z0-9._+-]{0,63}@local\.test$/.test(a)||local127Host(a)!==null,'RELAY_DENIED','Use your assigned @127 address, including its private identifier when present',403);return a}
export function boundedInt(x,min,max,name){demand(Number.isSafeInteger(x)&&x>=min&&x<=max,'PARAMETER',name+' outside permitted integer range');return x}
export function requestId(x){demand(typeof x==='string'&&/^[A-Za-z0-9._:-]{8,96}$/.test(x),'REQUEST_ID','Use an 8–96 character request ID');return x}
export function payload(input,from,state){
 demand(!state.accounts[from]?.glyphoku,'GAME_GATE_REQUIRED','Game mailboxes send only with the game-bound one-use permit',403);
 return validatedPayload(input,from,state);
}
export function mailboxPayload(input,from,state){
 const assignment=(state.torusMail?.network?.status==='ACTIVE'?state.torusMail.assignments?.find(item=>item.owner===from):null)??state.mailAssignments?.items.find(item=>item.owner===from);
 demand(assignment&&input?.sender_address===assignment.address,'SENDER','Open your assigned mailbox before sending',403);
 return validatedPayload(input,from,state);
}
function validatedPayload(input,from,state){
 demand(input&&typeof input==='object'&&!Array.isArray(input),'PAYLOAD','Expected object');
 demand(!('now' in input)||input.now===undefined,'CLIENT_CLOCK','Client clock overrides are not accepted');
 demand(Array.isArray(input.to)&&input.to.length>0&&input.to.length<=DEFAULTS.max_recipients,'RECIPIENTS','Provide 1–8 recipients');
 const to=expand(input.to,state);demand(to.length>0,'RECIPIENTS','No destinations');
 const {subject,body,attachments:clean}=mailContent(input);
 const raw=input.raw??null;demand(raw===null||(typeof raw==='string'&&raw.isWellFormed()&&Buffer.byteLength(raw)<=DEFAULTS.max_raw_bytes),'RAW','Raw message is invalid or exceeds limit');
 const sender=input.sender_address??from;
 demand(sender===from||state.mailAssignments?.items.some(item=>item.owner===from&&item.address===sender)||(state.torusMail?.network?.status==='ACTIVE'&&state.torusMail.assignments?.some(item=>item.owner===from&&item.address===sender)),'SENDER','Use the authenticated mailbox or its assigned email address',403);
 return {version:1,from:sender,to,subject,body,attachments:clean,raw};
}
export function mailContent(input){
 demand(input&&typeof input==='object'&&!Array.isArray(input),'PAYLOAD','Expected object');
 const subject=input.subject??'';const body=input.body??'';
 demand(typeof subject==='string'&&subject.isWellFormed()&&!/[\r\n\0]/.test(subject)&&Buffer.byteLength(subject)<=512,'SUBJECT','Invalid subject');
 demand(typeof body==='string'&&body.isWellFormed()&&Buffer.byteLength(body)<=DEFAULTS.max_body_bytes&&!body.includes('\0'),'BODY','Invalid or oversized body');
 const attachments=input.attachments??[];demand(Array.isArray(attachments)&&attachments.length<=4,'ATTACHMENTS','At most four attachments');let total=0;
 const clean=attachments.map(a=>{if(isAttachmentReference(a))return structuredClone(validateAttachmentReference(a));demand(a&&typeof a.name==='string'&&a.name.isWellFormed()&&a.name.trim().length>0&&a.name.length<=120&&!/[\x00-\x1f\x7f/\\]/.test(a.name)&&a.name!=='.'&&a.name!=='..','ATTACHMENT_NAME','Invalid attachment filename');demand(typeof a.data==='string'&&a.data.length<=DEFAULTS.max_attachment_bytes*2&&/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(a.data),'ATTACHMENT_DATA','Use canonical base64');const b=Buffer.from(a.data,'base64');demand(b.toString('base64')===a.data,'ATTACHMENT_DATA','Invalid base64');total+=b.length;return {name:a.name,data:a.data,type:'application/octet-stream'}});
 demand(total<=DEFAULTS.max_attachment_bytes,'ATTACHMENTS','Attachment bytes exceed limit');
 return {subject,body,attachments:clean};
}
export function expand(list,state){const out=new Set(),memo=new Map();const visit=(s,stack=[])=>{const registeredLegacy=stack.length===1&&/^owner@[a-z0-9](?:[a-z0-9-]{0,22}[a-z0-9])?\.glyphoku\.localhost$/.test(s)&&state.accounts[s]?.glyphoku&&state.aliases[stack[0]]?.length===1&&state.aliases[stack[0]][0]===s&&(state.mailAssignments?.items.some(item=>item.address===stack[0]&&item.owner===s)||(state.torusMail?.network?.status==='ACTIVE'&&state.torusMail.assignments?.some(item=>item.address===stack[0]&&item.owner===s)));const a=registeredLegacy?s:address(s);demand(stack.length<=8,'ALIAS_DEPTH','Alias depth exceeded');demand(!stack.includes(a),'ALIAS_CYCLE','Alias cycle');if(memo.has(a)){const result=memo.get(a);demand(!result.legacy||stack.length===0||registeredLegacy,'RELAY_DENIED','Use an assigned legacy game address directly',403);demand(stack.length+result.depth<=8,'ALIAS_DEPTH','Alias depth exceeded');return result}let result;if(state.aliases[a]){const targets=new Set();let depth=0,legacy=false;for(const t of state.aliases[a]){const child=visit(t,[...stack,a]);depth=Math.max(depth,child.depth+1);legacy=legacy||!!child.legacy;for(const mailbox of child.targets)targets.add(mailbox);demand(targets.size<=DEFAULTS.max_recipients,'RECIPIENTS','Too many expanded recipients')}result={targets,depth,legacy}}else{demand(Boolean(state.accounts[a]),'NO_MAILBOX','Unknown local mailbox',404);result={targets:new Set([a]),depth:0,legacy:!!registeredLegacy}}memo.set(a,result);return result};for(const a of list){for(const mailbox of visit(a).targets)out.add(mailbox);demand(out.size<=DEFAULTS.max_recipients,'RECIPIENTS','Too many expanded recipients')}return [...out].sort()}
export function held(p){return /verify your (account|mailbox)|password reset|wire transfer|bit\.ly|tinyurl|urgent[\s\S]{0,40}action/i.test(p.subject+'\n'+p.body)}
export const BRANCHES=Object.freeze({LOCAL127_CREDIT_V1:{enabled:true,meaning:'Nonredeemable local admission credits; authority-signed stamps consumed atomically. Not an ERC-20 token.'},UTXO_PENALTY:{enabled:false,reason:'Exact transaction/complaint protocol not implemented.'},ERC4337:{enabled:false,reason:'No EVM, EntryPoint, bundler or Paymaster deployment.'},READ2EARN:{enabled:false,reason:'No financial reward pool or verified human-engagement protocol.'},XMTP_MLS:{enabled:false,reason:'Local server encryption is not MLS or end-to-end encryption.'},WAKU_RLN:{enabled:false,reason:'No RLN circuit, membership proof or slashing implementation.'},L3_BASE:{enabled:false,reason:'Single local authority; no L3 settlement or distributed consensus.'},ZK_EMAIL:{enabled:false,reason:'No DKIM proof circuit or verification key.'},PHYSICAL_POSTAGE:{enabled:false,reason:'No physical mailing or provider integration.'},HTLC:{enabled:false,reason:'No payment-channel implementation.'},CLINICAL:{enabled:false,reason:'No clinical/PHI integration or compliance approval.'}});
