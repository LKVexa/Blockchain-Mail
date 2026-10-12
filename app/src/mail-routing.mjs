import {MailError,demand,DEFAULTS,address,requestId} from './policy.mjs';
import {publicMailAddress} from './internet-mail.mjs';
import {getLocal127Assignment} from './local127-assignment.mjs';

const fields=['to','subject','body','attachments','request_id','max_cost','expected_route','confirmed_from','confirmed_helo'];
function inputDraft(input){
 demand(input&&Object.getPrototypeOf(input)===Object.prototype&&Object.keys(input).every(key=>fields.includes(key)),'MAIL_DRAFT','Provide a recipient, subject and message');
 requestId(input.request_id);
 demand(Array.isArray(input.to)&&input.to.length>0&&input.to.length<=DEFAULTS.max_recipients,'RECIPIENTS','Enter one Internet recipient or up to eight local recipients');
 demand(typeof input.subject==='string'&&input.subject.isWellFormed()&&!/[\x00-\x1f\x7f]/.test(input.subject)&&Buffer.byteLength(input.subject)<=512,'SUBJECT','Invalid subject');
 demand(typeof input.body==='string'&&input.body.isWellFormed()&&!input.body.includes('\0')&&Buffer.byteLength(input.body)<=DEFAULTS.max_body_bytes,'BODY','Invalid or oversized message');
 demand(input.attachments===undefined||Array.isArray(input.attachments),'ATTACHMENTS','Attachments must be a list');
 return input;
}
function destinations(state,input,torusMail,tok){
 const destinations=input.to.map(value=>{
  demand(typeof value==='string'&&value.trim().length>0,'RECIPIENT_ADDRESS','Enter a complete email address');
  const candidate=value.trim().toLowerCase();
  demand(!(state.torusMail?.network?.status==='PENDING'&&candidate.includes('@127.')),'TORUS_PENDING','This computer is still joining the private network. Retry its connection before sending to an assigned @127 address',409);
  if(state.torusMail){
   demand(torusMail,'TORUS_UNAVAILABLE','Private peer mail is unavailable',503);
   if(candidate.includes('@127.'))return torusMail.resolve(tok,candidate);
   demand(candidate.endsWith('@local.test'),'TORUS_PRIVATE_ONLY','This private network sends only to assigned @127 mailboxes',403);
  }
  // A preserved game mailbox can be addressed through its signed assignment.
  if(state.accounts[candidate]?.glyphoku){
   const assigned=getLocal127Assignment(state,candidate);
   if(assigned)return {route:'local',address:assigned.address};
  }
  try{return {route:'local',address:address(candidate)};}catch{}
  try{return {route:'internet',address:publicMailAddress(value.trim())};}
  catch{throw new MailError('RECIPIENT_ADDRESS','Enter a complete local mailbox or Internet address, such as name@example.org');}
 });
 const routes=new Set(destinations.map(item=>item.route));
 demand(routes.size===1,'MIXED_RECIPIENTS','Send local and Internet recipients in separate messages',400);
 const route=destinations[0].route,to=[...new Set(destinations.map(item=>item.address??item.recipient))];
 if(route==='peer')demand(to.length===1,'TORUS_RECIPIENTS','Send private peer mail to one recipient at a time');
 if(route==='internet'){
  demand(to.length===1,'INTERNET_RECIPIENTS','Internet messages support one recipient at a time');
  demand((input.attachments??[]).length===0,'INTERNET_ATTACHMENTS','Internet messages currently support plain text; remove attachments to send this message');
 }
 return {route,to};
}
export function createMailRouter(store,internetMail,torusMail=null){
 function classify(tok,input){inputDraft(input);const state=store.state();store.integrityHead(state);store.authenticate(tok,state);return destinations(state,input,torusMail,tok);}
 function localInput(tok,input,to){const account=store.me(tok);return {to,subject:input.subject,body:input.body,attachments:input.attachments??[],request_id:input.request_id,sender_address:account.assigned_address??account.address,...(input.max_cost===undefined?{}:{max_cost:input.max_cost})};}
 return {
  quote(tok,input){
   const selection=classify(tok,input);
   if(selection.route==='peer')return torusMail.quote(tok,{...input,to:selection.to});
   if(selection.route==='local')return {route:'local',...store.quoteMailbox(tok,localInput(tok,input,selection.to)),from:store.me(tok).assigned_address??store.me(tok).address};
   demand(internetMail,'INTERNET_PROTECTED_REQUIRED','Unlock the protected workspace to send to Internet domains',503);
   // Login assignment is idempotent and sends no message or network traffic.
   const status=internetMail.login(tok);
   demand(status.enabled&&status.configured,'INTERNET_DISABLED','Internet sending is paused in this account’s settings',409);
   return {route:'internet',to:selection.to,from:status.from,helo:status.helo,enabled:status.enabled,cost:0};
  },
  async send(tok,input){
   const selection=classify(tok,input);
   demand(input.expected_route===selection.route,'MAIL_ROUTE_CHANGED','The recipient or delivery route changed; review the message again',409);
   if(selection.route==='peer')return {route:'peer',...await torusMail.send(tok,{...input,to:selection.to})};
   if(selection.route==='local')return {route:'local',...store.sendMailbox(tok,localInput(tok,input,selection.to))};
   demand(internetMail,'INTERNET_PROTECTED_REQUIRED','Unlock the protected workspace to send to Internet domains',503);
   const result=await internetMail.send(tok,{to:selection.to[0],subject:input.subject,body:input.body,request_id:input.request_id,confirmed_from:input.confirmed_from,confirmed_helo:input.confirmed_helo});
   return {route:'internet',...result};
  }
 };
}
