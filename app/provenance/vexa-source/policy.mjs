export const PROFILE='LOCAL127_CREDIT_V1';
export const DEFAULTS=Object.freeze({price:1,stamp_ttl_ms:300000,daily_allowance:20,sponsor_daily_quota:0,mailbox_quota_bytes:8*1024*1024,max_body_bytes:128*1024,max_attachment_bytes:512*1024,max_raw_bytes:768*1024,max_recipients:8,max_messages:5000,max_replays:10000,max_blocks:50000,max_mailboxes:64,max_pending_stamps:128,max_connections:24,smtp_idle_ms:30000});
export class MailError extends Error {constructor(code,message,http=400){super(message);this.code=code;this.http=http}}
export function demand(ok,code,message,http=400){if(!ok)throw new MailError(code,message,http)}
export function address(a){demand(typeof a==='string'&&a.length<=150,'ADDRESS','Invalid address');a=a.trim().toLowerCase();demand(/^[a-z0-9][a-z0-9._+-]{0,63}@local\.test$/.test(a),'RELAY_DENIED','Only @local.test addresses are admitted',403);return a}
export function boundedInt(x,min,max,name){demand(Number.isSafeInteger(x)&&x>=min&&x<=max,'PARAMETER',name+' outside permitted integer range');return x}
export function requestId(x){demand(typeof x==='string'&&/^[A-Za-z0-9._:-]{8,96}$/.test(x),'REQUEST_ID','Use an 8–96 character request ID');return x}
export function payload(input,from,state){
 demand(input&&typeof input==='object'&&!Array.isArray(input),'PAYLOAD','Expected object');
 demand(!('now' in input)||input.now===undefined,'CLIENT_CLOCK','Client clock overrides are not accepted');
 demand(Array.isArray(input.to)&&input.to.length>0&&input.to.length<=DEFAULTS.max_recipients,'RECIPIENTS','Provide 1–8 recipients');
 const to=expand(input.to,state);demand(to.length>0,'RECIPIENTS','No destinations');
 const subject=input.subject??'';const body=input.body??'';
 demand(typeof subject==='string'&&!/[\r\n\0]/.test(subject)&&Buffer.byteLength(subject)<=512,'SUBJECT','Invalid subject');
 demand(typeof body==='string'&&Buffer.byteLength(body)<=DEFAULTS.max_body_bytes&&!body.includes('\0'),'BODY','Invalid or oversized body');
 const attachments=input.attachments??[];demand(Array.isArray(attachments)&&attachments.length<=4,'ATTACHMENTS','At most four attachments');let total=0;
 const clean=attachments.map(a=>{demand(a&&typeof a.name==='string'&&a.name.length<=120&&!/[\x00-\x1f/\\]/.test(a.name)&&a.name!=='.'&&a.name!=='..','ATTACHMENT_NAME','Invalid attachment filename');demand(typeof a.data==='string'&&a.data.length<=DEFAULTS.max_attachment_bytes*2&&/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(a.data),'ATTACHMENT_DATA','Use canonical base64');const b=Buffer.from(a.data,'base64');demand(b.toString('base64')===a.data,'ATTACHMENT_DATA','Invalid base64');total+=b.length;return {name:a.name,data:a.data,type:'application/octet-stream'}});
 demand(total<=DEFAULTS.max_attachment_bytes,'ATTACHMENTS','Attachment bytes exceed limit');
 const raw=input.raw??null;demand(raw===null||(typeof raw==='string'&&Buffer.byteLength(raw)<=DEFAULTS.max_raw_bytes),'RAW','Raw message exceeds limit');
 return {version:1,from,to,subject,body,attachments:clean,raw};
}
export function expand(list,state){const out=new Set();const visit=(s,stack=[])=>{const a=address(s);demand(stack.length<=8,'ALIAS_DEPTH','Alias depth exceeded');demand(!stack.includes(a),'ALIAS_CYCLE','Alias cycle');if(state.aliases[a]){for(const t of state.aliases[a])visit(t,[...stack,a]);return}demand(Boolean(state.accounts[a]),'NO_MAILBOX','Unknown local mailbox',404);out.add(a);demand(out.size<=DEFAULTS.max_recipients,'RECIPIENTS','Too many expanded recipients')};for(const a of list)visit(a);return [...out].sort()}
export function held(p){return /verify your (account|mailbox)|password reset|wire transfer|bit\.ly|tinyurl|urgent[\s\S]{0,40}action/i.test(p.subject+'\n'+p.body)}
export const BRANCHES=Object.freeze({LOCAL127_CREDIT_V1:{enabled:true,meaning:'Nonredeemable local admission credits; authority-signed stamps consumed atomically. Not an ERC-20 token.'},UTXO_PENALTY:{enabled:false,reason:'Exact transaction/complaint protocol not implemented.'},ERC4337:{enabled:false,reason:'No EVM, EntryPoint, bundler or Paymaster deployment.'},READ2EARN:{enabled:false,reason:'No financial reward pool or verified human-engagement protocol.'},XMTP_MLS:{enabled:false,reason:'Local server encryption is not MLS or end-to-end encryption.'},WAKU_RLN:{enabled:false,reason:'No RLN circuit, membership proof or slashing implementation.'},L3_BASE:{enabled:false,reason:'Single local authority; no L3 settlement or distributed consensus.'},ZK_EMAIL:{enabled:false,reason:'No DKIM proof circuit or verification key.'},PHYSICAL_POSTAGE:{enabled:false,reason:'No physical mailing or provider integration.'},HTLC:{enabled:false,reason:'No payment-channel implementation.'},CLINICAL:{enabled:false,reason:'No clinical/PHI integration or compliance approval.'}});
