import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import {Store,restoreNew} from '../src/store.mjs';
import {DEFAULTS} from '../src/policy.mjs';
import {canonical} from '../src/crypto.mjs';
import {createMailRouter} from '../src/mail-routing.mjs';
import {createTorusMail,TORUS_MAIL_LIMITS} from '../src/torus-mail.mjs';

const OLD_QUOTA=8*1024*1024;
function fixture(t){
 const work=path.resolve(import.meta.dirname,'../../work');fs.mkdirSync(work,{recursive:true});const root=fs.mkdtempSync(path.join(work,'mailbox-storage-')),key=randomBytes(32),store=new Store(root,{vaultKey:key}),credentials=store.credentials(),a=credentials['postmaster@local.test'],u=credentials['user@local.test'];store.login(a);store.login(u);
 t.after(async()=>{await store.attachments.close();try{store.close()}catch{}key.fill(0);assert.equal(path.dirname(root),work);fs.rmSync(root,{recursive:true,force:true});});return {root,key,store,a,u,router:createMailRouter(store,null)};
}
const draft=(to,index,body)=>({to:[to],subject:'Synthetic storage delivery '+index,body,attachments:[],request_id:'no-mailbox-quota-'+index});
function legacyQuotas(store,operator){store.mutate(operator,(s,actor,now,events)=>{s.accounts['postmaster@local.test'].quota=OLD_QUOTA;s.accounts['user@local.test'].quota=0;events.push({type:'SYNTHETIC_PRESERVED_QUOTA_FIELDS'});return{};},{admin:true});}

test('MAILBOX-STORAGE cumulative ordinary Inbox and Sent exceed 8 MiB, preserve old quota fields and survive restore',{timeout:180000},async t=>{
 const f=fixture(t);legacyQuotas(f.store,f.a);const prefix=f.store.db.prepare('SELECT height,hash,json FROM blocks ORDER BY height').all(),body='x'.repeat(DEFAULTS.max_body_bytes),to=f.store.me(f.u).assigned_address;
 for(let index=0;index<65;index++){const message=draft(to,index,body),quote=f.router.quote(f.a,message);assert.equal(quote.route,'local');assert.equal((await f.router.send(f.a,{...message,expected_route:'local'})).status,'COMMITTED');}
 for(const token of [f.a,f.u]){const me=f.store.me(token);assert(me.used_bytes>OLD_QUOTA);assert.equal(me.quota,null);assert.equal(me.storage_limit,'available-disk');assert.equal(JSON.parse(JSON.stringify(me)).quota,null);}
 assert.equal(f.store.state().accounts['postmaster@local.test'].quota,OLD_QUOTA);assert.equal(f.store.state().accounts['user@local.test'].quota,0);assert.equal(f.store.list(f.u).length,65);assert.equal(f.store.list(f.a,'Sent').length,65);assert.equal(f.store.list(f.a).length,0);assert.equal(f.store.list(f.u,'Sent').length,0);assert.deepEqual(f.store.db.prepare('SELECT height,hash,json FROM blocks WHERE height<=? ORDER BY height').all(prefix.at(-1).height),prefix);assert(f.store.verify().ok);
 const backup=f.store.backup(f.a),restoredRoot=path.join(f.root,'restored');assert(restoreNew(backup.backup,restoredRoot,{vaultKey:f.key}).ok);const restored=new Store(restoredRoot,{vaultKey:f.key});try{assert.equal(restored.list(f.u).length,65);assert.equal(restored.list(f.a,'Sent').length,65);assert(restored.me(f.u).used_bytes>OLD_QUOTA);assert.equal(restored.me(f.u).quota,null);assert.equal(restored.state().accounts['user@local.test'].quota,0);assert.equal(restored.message(f.u,restored.list(f.u)[0].id).body,body);assert(restored.verify(backup.checkpoint).ok);}finally{await restored.attachments.close();restored.close();}
});

test('MAILBOX-STORAGE Torus delivers beyond the former 2 MiB outbox cap with zero historical recipient quota',{timeout:180000},async t=>{
 const work=path.resolve(import.meta.dirname,'../../work');fs.mkdirSync(work,{recursive:true});const root=fs.mkdtempSync(path.join(work,'peer-storage-')),nodes=[];
 for(let index=0;index<2;index++){const key=randomBytes(32),store=new Store(path.join(root,String(index)),{vaultKey:key}),credentials=store.credentials(),node={root:store.root,key,store,operator:credentials['postmaster@local.test'],user:credentials['user@local.test']};node.service=createTorusMail(store,{localOnion:(index?'b':'a').repeat(56)+'.onion',transport:{async deliver(envelope){const destination=nodes.find(other=>other.service.context()?.local.node_id===envelope.recipient_node);return destination.service.receive(envelope);},async close(){}}});nodes.push(node);}
 t.after(async()=>{for(const node of nodes){await node.service.close();await node.store.attachments.close();try{node.store.close()}catch{}node.key.fill(0);}assert.equal(path.dirname(root),work);fs.rmSync(root,{recursive:true,force:true});});
 const [source,destination]=nodes;source.service.createNetwork(source.operator);const invitation=source.service.invitation(source.operator,'n01').invitation,card=destination.service.join(destination.operator,invitation).card,directory=source.service.admitPeer(source.operator,card).directory;destination.service.importDirectory(destination.operator,directory);source.service.login(source.user);const to=destination.service.login(destination.user).assigned_address;for(const node of nodes)legacyQuotas(node.store,node.operator);
 const body='z'.repeat(DEFAULTS.max_body_bytes);for(let index=0;index<17;index++){const result=await source.service.send(source.user,draft(to,'peer-'+index,body));assert.equal(result.message.status,'DELIVERED',result.message.detail);}
 assert.equal(TORUS_MAIL_LIMITS.total_bytes,null);assert.equal(TORUS_MAIL_LIMITS.messages,100);assert(source.store.state().torusMail.outbox.reduce((sum,item)=>sum+Buffer.byteLength(canonical(item.envelope)),0)>2*1024*1024);assert.equal(source.store.list(source.user,'Sent').length,17);assert.equal(destination.store.list(destination.user).length,17);assert.equal(destination.store.state().accounts['user@local.test'].quota,0);assert.equal(destination.store.me(destination.user).quota,null);assert.equal(destination.store.list(destination.operator).length,0);assert(source.store.verify().ok);assert(destination.store.verify().ok);
 const backup=source.store.backup(source.operator),restoredRoot=path.join(root,'restored-outbox');assert(restoreNew(backup.backup,restoredRoot,{vaultKey:source.key}).ok);const restored=new Store(restoredRoot,{vaultKey:source.key});try{assert.equal(restored.state().torusMail.outbox.length,17);assert.equal(restored.list(source.user,'Sent').length,17);assert.equal(restored.me(source.user).quota,null);assert(restored.verify(backup.checkpoint).ok);}finally{await restored.attachments.close();restored.close();}
});

test('MAILBOX-STORAGE full disks and stalled attachment writes never commit an incomplete file',async t=>{
 const f=fixture(t),bytes=Buffer.from('Retry only after storage is available.'),upload=f.store.attachments.create(f.a,{name:'disk-error.txt',size:bytes.length}),write=fs.writeSync;
 const failure=Object.assign(Error('Synthetic disk full'),{code:'ENOSPC'});t.mock.method(fs,'writeSync',()=>{throw failure;});assert.throws(()=>f.store.attachments.put(f.a,{attachment_id:upload.attachment_id,index:0,data:bytes.toString('base64')}),error=>error.code==='ATTACHMENT_STORAGE'&&error.http===507);t.mock.restoreAll();assert.equal(fs.writeSync,write);assert.equal(f.store.state().torusAttachments.files[0].status,'UPLOADING');await assert.rejects(f.store.attachments.finish(f.a,{attachment_id:upload.attachment_id}),error=>error.code==='ATTACHMENT_INCOMPLETE');assert.equal(f.store.list(f.a,'Sent').length,0);
 t.mock.method(fs,'writeSync',()=>0);assert.throws(()=>f.store.attachments.put(f.a,{attachment_id:upload.attachment_id,index:0,data:bytes.toString('base64')}),error=>error.code==='ATTACHMENT_STORAGE'&&error.http===507);t.mock.restoreAll();f.store.attachments.put(f.a,{attachment_id:upload.attachment_id,index:0,data:bytes.toString('base64')});const descriptor=await f.store.attachments.finish(f.a,{attachment_id:upload.attachment_id});assert.equal(descriptor.size,bytes.length);assert.deepEqual(f.store.attachments.readChunk(f.a,descriptor.attachment_id,0),bytes);assert(f.store.verify().ok);
});

test('MAILBOX-STORAGE attachment creation reports real storage failure without a committed file',async t=>{
 const f=fixture(t);t.mock.method(fs,'writeSync',()=>{throw Object.assign(Error('Synthetic full disk at file creation'),{code:'ENOSPC'});});assert.throws(()=>f.store.attachments.create(f.a,{name:'creation-error.bin',size:1}),error=>error.code==='ATTACHMENT_STORAGE'&&error.http===507);t.mock.restoreAll();assert.equal(f.store.state().torusAttachments.files.length,1);assert.equal(f.store.state().torusAttachments.files[0].status,'UPLOADING');assert.equal(f.store.attachments.discardUnfinished(f.a).discarded,1);assert(f.store.verify().ok);
});
