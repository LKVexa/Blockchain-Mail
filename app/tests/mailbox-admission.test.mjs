import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import {Store} from '../src/store.mjs';
import {canonical,verifySignature} from '../src/crypto.mjs';
import {createMailRouter} from '../src/mail-routing.mjs';
import {toEml} from '../src/mime.mjs';

function fixture(t,options={}){
 const work=path.resolve(import.meta.dirname,'../../work');fs.mkdirSync(work,{recursive:true});const root=fs.mkdtempSync(path.join(work,'mailbox-admission-')),key=randomBytes(32),store=new Store(root,{vaultKey:key,...options}),credentials=store.credentials(),a=credentials['postmaster@local.test'],u=credentials['user@local.test'];
 store.login(a);store.login(u);const router=createMailRouter(store,null);
 t.after(()=>{try{store.close()}catch{}key.fill(0);fs.rmSync(root,{recursive:true,force:true})});
 return {store,root,key,a,u,router};
}
let sequence=0;
const draft=(f,from=f.a,extra={})=>({to:[f.store.me(f.u).assigned_address],subject:'Free private mailbox delivery',body:'Synthetic local mail only.',attachments:[],request_id:'free-mailbox-'+(++sequence),...extra});
const mailboxDraft=(f,from=f.a,extra={})=>({...draft(f,from,extra),sender_address:f.store.me(from).assigned_address});
const accounting=store=>{const s=store.state();return canonical({balances:Object.fromEntries(Object.entries(s.accounts).map(([name,value])=>[name,value.balance])),issued:s.issued,burned:s.burned,allowance:s.allowance,sponsor:s.sponsor,sponsorUsage:s.sponsorUsage})};
const code=(fn,expected)=>assert.throws(fn,error=>error.code===expected);

test('MAILBOX-FREE-01 one Send path works with zero balance, disabled credit allowance and exhausted historical allowance',async t=>{
 const f=fixture(t),poor=f.store.createAccount(f.a,{address:'no-credits@local.test'}).token;f.store.login(poor);assert.equal(f.store.me(poor).balance,0,'new accounts need no credits setting');f.store.preferences(poor,{daily:0});f.store.sponsor(f.a,{daily:1});
 f.store.mutate(f.a,(s,actor,now,events)=>{s.allowance['no-credits@local.test|'+Math.floor(now/86400000)]=30;events.push({type:'SYNTHETIC_HISTORICAL_ALLOWANCE'});return{};},{admin:true});
 const before=accounting(f.store),message=draft(f,poor),quote=f.router.quote(poor,message);assert.equal(quote.route,'local');assert.equal(quote.cost,0);assert.equal(quote.mechanism,'MAILBOX_ADMISSION_V1');
 const result=await f.router.send(poor,{...message,expected_route:'local'});assert.equal(result.status,'COMMITTED');assert.equal(result.cost,0);assert.equal(accounting(f.store),before,'mail changes no current or historical credit accounting');
 const stamp=f.store.state().stamps[result.stamp_id];assert.equal(stamp.status,'CONSUMED');assert.equal(stamp.envelope.mechanism,'MAILBOX_ADMISSION_V1');assert.equal(stamp.envelope.cost,0);assert(verifySignature('VEXA127-STAMP/1',stamp.envelope,stamp.signature,f.store.key.publicKey));assert(f.store.head().events.some(event=>event.type==='MAILBOX_ADMITTED'));assert(!f.store.head().events.some(event=>event.type==='STAMP_RESERVED'));
 const inbox=f.store.list(f.u)[0],sent=f.store.list(poor,'Sent')[0];assert.equal(inbox.from,f.store.me(poor).assigned_address);assert.equal(f.store.message(f.u,inbox.id).body,message.body);assert.equal(f.store.message(poor,sent.id).body,message.body);code(()=>f.store.message(f.a,inbox.id),'NOT_FOUND');code(()=>f.store.message(f.u,sent.id),'NOT_FOUND');assert(f.store.verify().ok);
});

test('MAILBOX-FREE-02 consent remains atomic and historical mailbox quota fields do not restrict sending',async t=>{
 const f=fixture(t),message=draft(f);f.store.preferences(f.u,{accept:false});const before=f.store.head().hash;code(()=>f.router.quote(f.a,message),'CONSENT');await assert.rejects(f.router.send(f.a,{...message,expected_route:'local'}),error=>error.code==='CONSENT');assert.equal(f.store.head().hash,before);assert.equal(f.store.list(f.a,'Sent').length,0);
 f.store.preferences(f.u,{accept:true,blocked:['postmaster@local.test']});code(()=>f.store.quoteMailbox(f.a,mailboxDraft(f)),'CONSENT');f.store.preferences(f.u,{blocked:[]});
 f.store.mutate(f.a,(s,actor,now,events)=>{s.accounts['user@local.test'].quota=1;events.push({type:'SYNTHETIC_HISTORICAL_MAILBOX_QUOTA'});return{};},{admin:true});const result=f.store.sendMailbox(f.a,mailboxDraft(f));assert.equal(result.status,'COMMITTED');assert.equal(f.store.state().accounts['user@local.test'].quota,1);assert.equal(f.store.me(f.u).quota,null);assert.equal(f.store.me(f.u).storage_limit,'available-disk');assert(f.store.me(f.u).used_bytes>1);assert.equal(f.store.db.prepare('SELECT count(*) n FROM objects').get().n,1);assert(f.store.verify().ok);
});

test('MAILBOX-FREE-03 encrypted attachment ownership and own received-message download remain enforced',async t=>{
 const f=fixture(t),bytes=Buffer.from('An attachment sent through the same free mailbox form.'),upload=f.store.attachments.create(f.a,{name:'example.txt',size:bytes.length});f.store.attachments.put(f.a,{attachment_id:upload.attachment_id,index:0,data:bytes.toString('base64')});const reference=await f.store.attachments.finish(f.a,{attachment_id:upload.attachment_id});
 const invalid=mailboxDraft(f,f.u,{to:[f.store.me(f.a).assigned_address],attachments:[reference]});code(()=>f.store.sendMailbox(f.u,invalid),'ATTACHMENT_REFERENCE');
 const sent=f.store.sendMailbox(f.a,mailboxDraft(f,f.a,{attachments:[reference]})),row=f.store.list(f.u)[0];assert.equal(sent.cost,0);assert.deepEqual(f.store.attachments.readForMessage(f.u,row.id,0,0),bytes);code(()=>f.store.attachments.readForMessage(f.a,row.id,0,0),'NOT_FOUND');assert(f.store.verify().ok);assert.equal((await f.store.attachments.verifyFiles()).files_checked,1);
});

test('MAILBOX-FREE-04 replay survives restart, retains one copy, and rejects a changed message',t=>{
 const f=fixture(t),input=mailboxDraft(f),first=f.store.sendMailbox(f.a,input),head=f.store.head().hash,before=accounting(f.store);assert.equal(f.store.sendMailbox(f.a,{...input,max_cost:999}).replayed,true);assert.equal(f.store.head().hash,head);code(()=>f.store.sendMailbox(f.a,{...input,body:'Changed message'}),'REPLAY_CONFLICT');
 f.store.close();const reopened=new Store(f.root,{vaultKey:f.key});try{const again=reopened.sendMailbox(f.a,input);assert.equal(again.replayed,true);assert.equal(again.message_id,first.message_id);assert.equal(again.block_hash,first.block_hash);assert.equal(reopened.list(f.u).length,1);assert.equal(reopened.list(f.a,'Sent').length,1);assert.equal(accounting(reopened),before);assert(reopened.verify().ok);}finally{reopened.close();}
});

test('MAILBOX-FREE-05 old purchased reservations, paid deliveries and replay receipts remain unchanged',t=>{
 const f=fixture(t),old=mailboxDraft(f,f.a,{request_id:'historical-paid-mail-01',max_cost:1}),paid=f.store.send(f.a,old),reservation=f.store.issue(f.a,{...mailboxDraft(f),max_cost:1});assert.equal(paid.cost,1);assert.equal(reservation.stamp.envelope.cost,1);
 const oldBlocks=f.store.db.prepare('SELECT height,hash,json FROM blocks ORDER BY height').all(),stamps=structuredClone(f.store.state().stamps),before=accounting(f.store);const prior=f.store.sendMailbox(f.a,old);assert.equal(prior.replayed,true);assert.equal(prior.cost,1);assert.equal(prior.message_id,paid.message_id);assert.equal(f.store.head().header.height,oldBlocks.at(-1).height);
 const free=f.store.sendMailbox(f.a,mailboxDraft(f));assert.equal(free.cost,0);assert.equal(accounting(f.store),before);assert.deepEqual(f.store.db.prepare('SELECT height,hash,json FROM blocks WHERE height<? ORDER BY height').all(f.store.head().header.height),oldBlocks);for(const [id,stamp]of Object.entries(stamps))assert.deepEqual(f.store.state().stamps[id],stamp);assert(f.store.verify().ok);
});

for(const phase of ['after-object','before-commit'])test('MAILBOX-FREE-06-'+phase+' interruptions leave no partially admitted message',t=>{
 let armed=false;const f=fixture(t,{fault:current=>{if(armed&&current===phase)throw Error('Synthetic free mailbox interruption');}}),input=mailboxDraft(f),state=canonical(f.store.state()),head=f.store.head().hash;armed=true;assert.throws(()=>f.store.sendMailbox(f.a,input),/Synthetic free mailbox interruption/);armed=false;assert.equal(canonical(f.store.state()),state);assert.equal(f.store.head().hash,head);assert.equal(f.store.db.prepare('SELECT count(*) n FROM objects').get().n,0);assert(f.store.verify().ok);
});

test('MAILBOX-FREE-07 free admission still binds assigned sender and raw MIME to authenticated content',t=>{
 const f=fixture(t),input=mailboxDraft(f),message={message_id:'a'.repeat(32),from:input.sender_address,to:input.to,subject:input.subject,body:input.body,attachments:[],raw:null},raw=toEml(message);const sent=f.store.sendMailbox(f.a,{...input,raw});assert.equal(sent.cost,0);assert.equal(f.store.message(f.u,f.store.list(f.u)[0].id).raw,raw);
 code(()=>f.store.sendMailbox(f.a,{...mailboxDraft(f),sender_address:f.store.me(f.u).assigned_address}),'SENDER');code(()=>f.store.sendMailbox(f.a,{...mailboxDraft(f),raw,body:'Different authenticated content'}),'RAW_BINDING');code(()=>f.store.sendMailbox(f.a,{...mailboxDraft(f),stamp:{}}),'MAILBOX_STAMP');assert(f.store.verify().ok);
});
