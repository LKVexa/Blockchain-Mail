import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {randomBytes,createHash} from 'node:crypto';
import {Vault,createVaultMetadata} from '../src/vault.mjs';
import {MailError} from '../src/policy.mjs';
import {createTorusAttachments,ATTACHMENT_CHUNK_SIZE,validateTorusAttachmentState,validateAttachmentReference,validateDeliveryAttachmentReferences} from '../src/torus-attachments.mjs';

function fixture(t,node_id='n00'){
 const work=path.resolve(import.meta.dirname,'../../work');fs.mkdirSync(work,{recursive:true});const root=fs.mkdtempSync(path.join(work,'attachment-storage-test-')),key=randomBytes(32),vault=new Vault(key,createVaultMetadata()),messages=new Map();let state={accounts:{'alice@local.test':{accept:true,blocked:[]},'bob@local.test':{accept:true,blocked:[]},'postmaster@local.test':{accept:true,blocked:[]}},aliases:{'rmail@127.0.0.2':['alice@local.test'],'rmail@127.0.1.2':['bob@local.test']},mailAssignments:{items:[{owner:'alice@local.test',address:'rmail@127.0.0.2'}]},torusMail:{network:{status:'ACTIVE',node_id,network_id:'1'.repeat(32)},assignments:[{owner:'bob@local.test',address:'rmail@127.0.1.2'}]}};let mutations=0;
 state.torusMail.network.prefix='127.'+node_id[1]+'.'+node_id[2]+'.';state.torusMail.network.directory={nodes:[{node_id:'n00',prefix:'127.0.0.'},{node_id:'n01',prefix:'127.0.1.'}]};const tokens={alice:'alice@local.test',bob:'bob@local.test',operator:'postmaster@local.test'},store={root,vault,clock:()=>Date.now(),state:()=>structuredClone(state),integrityHead(){},authenticate(tok,s=state){const owner=tokens[tok];if(!owner||!s.accounts[owner])throw new MailError('AUTH','Authentication required',401);return owner;},credentials:()=>({'postmaster@local.test':'operator'}),mutate(tok,op,{admin=false}={}){const owner=this.authenticate(tok);if(admin&&owner!=='postmaster@local.test')throw new MailError('ROLE','Operator required',403);const next=structuredClone(state),events=[],result=op(next,owner,Date.now(),events);if(events.length){validateTorusAttachmentState(this,next);state=next;mutations++;}return result;},message(tok,id){const message=messages.get(id);if(!message||message.mailbox!==this.authenticate(tok))throw new MailError('NOT_FOUND','Message not found',404);return message;}};
 state.torusMail.network.card={version:1,node_id,prefix:state.torusMail.network.prefix};
 const service=createTorusAttachments(store);t.after(async()=>{await service.close();vault.destroy();key.fill(0);fs.rmSync(root,{recursive:true,force:true});});return {store,service,messages,mutations:()=>mutations};
}
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
async function upload(ctx,bytes,name='large.dat'){
 const created=ctx.service.create('alice',{name,size:bytes.length});for(let index=0;index<created.chunk_count;index++)ctx.service.put('alice',{attachment_id:created.attachment_id,index,data:bytes.subarray(index*created.chunk_size,(index+1)*created.chunk_size).toString('base64')});return await ctx.service.finish('alice',{attachment_id:created.attachment_id});
}

test('ATTACHMENT-STORAGE streams files above the legacy limit, stores ciphertext and commits only fixed metadata',async t=>{
 const ctx=fixture(t),bytes=Buffer.alloc(ATTACHMENT_CHUNK_SIZE*3+57,0x5a),marker=Buffer.from('Private attachment plaintext marker');marker.copy(bytes,100);const ref=await upload(ctx,bytes);
 assert.equal(ref.size,bytes.length);assert.equal(ref.sha256,digest(bytes));assert.equal(ref.chunk_count,4);validateAttachmentReference(ref);assert.equal(ctx.mutations(),2,'chunks do not consume one signed ledger block each');
 const row=ctx.store.state().torusAttachments.files[0],file=fs.readFileSync(path.join(ctx.store.root,'attachments',row.storage_id+'.chunks'));assert(!file.includes(marker));assert.equal(file.length,8+bytes.length+28*4);
 for(let index=0;index<ref.chunk_count;index++)assert.deepEqual(ctx.service.readChunk('alice',ref.attachment_id,index),bytes.subarray(index*ref.chunk_size,(index+1)*ref.chunk_size));
 assert.throws(()=>ctx.service.readChunk('bob',ref.attachment_id,0),error=>error.code==='NOT_FOUND');assert.equal((await ctx.service.verifyFiles()).files_checked,1);assert(ctx.store.state().torusAttachments.files[0].sha256);
});

test('ATTACHMENT-STORAGE rejects gaps, conflicting chunk retries, incomplete commits and authenticated ciphertext corruption',async t=>{
 const ctx=fixture(t),bytes=Buffer.alloc(ATTACHMENT_CHUNK_SIZE+1,0x41),created=ctx.service.create('alice',{name:'retry.dat',size:bytes.length});
 assert.throws(()=>ctx.service.put('alice',{upload_id:created.upload_id,index:1,data:'QQ=='}),error=>error.code==='ATTACHMENT_ORDER');const first={upload_id:created.upload_id,index:0,data:bytes.subarray(0,ATTACHMENT_CHUNK_SIZE).toString('base64')};ctx.service.put('alice',first);assert.equal(ctx.service.put('alice',first).replayed,true);assert.throws(()=>ctx.service.put('alice',{...first,data:Buffer.alloc(ATTACHMENT_CHUNK_SIZE,0x42).toString('base64')}),error=>error.code==='ATTACHMENT_CONFLICT');await assert.rejects(ctx.service.finish('alice',{upload_id:created.upload_id}),error=>error.code==='ATTACHMENT_INCOMPLETE');ctx.service.put('alice',{upload_id:created.upload_id,index:1,data:'QQ=='});const ref=await ctx.service.finish('alice',{upload_id:created.upload_id});
 const file=path.join(ctx.store.root,'attachments',created.upload_id+'.chunks'),fd=fs.openSync(file,'r+'),byte=Buffer.alloc(1);fs.readSync(fd,byte,0,1,40);byte[0]^=1;fs.writeSync(fd,byte,0,1,40);fs.closeSync(fd);assert.throws(()=>ctx.service.readChunk('alice',ref.attachment_id,0),error=>error.code==='ATTACHMENT_AUTHENTICATION');await assert.rejects(ctx.service.verifyFiles(),error=>error.code==='ATTACHMENT_AUTHENTICATION');
});

test('ATTACHMENT-STORAGE own message access allows a local recipient to read the sender-owned referenced file',async t=>{
 const ctx=fixture(t),bytes=Buffer.from('Local recipient can read this exact private message attachment'),ref=await upload(ctx,bytes);ctx.messages.set('bob-delivery',{mailbox:'bob@local.test',from:'rmail@127.0.0.2',attachments:[ref]});
 assert.deepEqual(ctx.service.manifestForMessage('bob','bob-delivery',0),ref);assert.deepEqual(ctx.service.readForMessage('bob','bob-delivery',0,0),bytes);assert.throws(()=>ctx.service.readForMessage('alice','bob-delivery',0,0),error=>error.code==='NOT_FOUND');assert.throws(()=>ctx.service.manifest('bob',ref.attachment_id),error=>error.code==='NOT_FOUND');
 ctx.messages.set('forged-bob-delivery',{mailbox:'bob@local.test',from:'bob@local.test',attachments:[ref]});assert.throws(()=>ctx.service.readForMessage('bob','forged-bob-delivery',0,0),error=>error.http===403||error.http===503,'an owned message cannot grant access to another creator’s file by copying its descriptor');
});

test('ATTACHMENT-STORAGE private ingress binds file identity to network, sender, message and content before delivery',async t=>{
 const source=fixture(t),target=fixture(t,'n01'),bytes=Buffer.alloc(ATTACHMENT_CHUNK_SIZE*2+29,0x33),ref=await upload(source,bytes),envelope={network_id:'1'.repeat(32),id:'2'.repeat(32),digest:'3'.repeat(64),sender_node:'n00',recipient_node:'n01',from:'rmail@127.0.0.2',to:'rmail@127.0.1.2',attachments:[ref]};
 await target.service.stageAttachmentChunk({...envelope,descriptor:ref,index:-1,data:Buffer.alloc(0)});await assert.rejects(target.service.verifyIncoming(envelope),error=>error.code==='ATTACHMENT_INCOMPLETE');
 for await(const {index,data} of source.service.readAttachmentChunks(envelope,ref))await target.service.stageAttachmentChunk({...envelope,descriptor:ref,index,data});await target.service.verifyIncoming(envelope);validateDeliveryAttachmentReferences(target.store,target.store.state(),'bob@local.test',envelope);
 const receipt={network_id:envelope.network_id,id:envelope.id,sender_node:envelope.sender_node,digest:envelope.digest,delivery_id:'bob-peer-delivery'};target.store.mutate('operator',(s,a,n,events)=>{s.torusMail.receipts=[receipt];events.push({type:'SYNTHETIC_RECEIPT'});});target.messages.set(receipt.delivery_id,{mailbox:'bob@local.test',attachments:[ref]});assert.deepEqual(target.service.readForMessage('bob',receipt.delivery_id,0,1),bytes.subarray(ATTACHMENT_CHUNK_SIZE,2*ATTACHMENT_CHUNK_SIZE));
 const changed={...envelope,digest:'4'.repeat(64)};await assert.rejects(target.service.stageAttachmentChunk({...changed,descriptor:ref,index:-1,data:Buffer.alloc(0)}),error=>error.code==='ATTACHMENT_CONFLICT');assert.throws(()=>validateDeliveryAttachmentReferences(target.store,target.store.state(),'alice@local.test',envelope),error=>error.code==='ATTACHMENT_REFERENCE');
});

test('ATTACHMENT-STORAGE no artificial file-byte ceiling, zero-byte files and strict declared digest verification',async t=>{
 const ctx=fixture(t),large=ctx.service.create('alice',{name:'declared-terabyte.bin',size:2**40});assert.equal(large.chunk_count,2**40/ATTACHMENT_CHUNK_SIZE,'declaring a large file is permitted without allocating it in RAM or sparse disk');assert.equal(fs.statSync(path.join(ctx.store.root,'attachments',large.upload_id+'.chunks')).size,8);
 const empty=await upload(ctx,Buffer.alloc(0),'empty.txt');assert.equal(empty.size,0);assert.equal(empty.chunk_count,0);assert.equal(empty.sha256,digest(Buffer.alloc(0)));
 const bad=ctx.service.create('alice',{name:'wrong-hash.txt',size:1,sha256:'0'.repeat(64)});ctx.service.put('alice',{upload_id:bad.upload_id,index:0,data:'QQ=='});await assert.rejects(ctx.service.finish('alice',{upload_id:bad.upload_id}),error=>error.code==='ATTACHMENT_DIGEST');assert.throws(()=>ctx.service.create('alice',{name:'../escape',size:1}),error=>error.code==='ATTACHMENT_NAME');
});

test('ATTACHMENT-STORAGE explicit cleanup removes only the caller’s unfinished files and preserves committed message attachments',async t=>{
 const ctx=fixture(t),bytes=Buffer.from('Keep this committed private file'),ref=await upload(ctx,bytes),alice=ctx.service.create('alice',{name:'aborted-alice.bin',size:5}),bob=ctx.service.create('bob',{name:'unfinished-bob.bin',size:5});ctx.messages.set('committed-local-delivery',{mailbox:'bob@local.test',from:'rmail@127.0.0.2',attachments:[ref]});
 const result=ctx.service.discardUnfinished('alice');assert.equal(result.removed,1);assert.equal(result.bytes_removed,8);assert.equal(fs.existsSync(path.join(ctx.store.root,'attachments',alice.upload_id+'.chunks')),false);assert.equal(fs.existsSync(path.join(ctx.store.root,'attachments',bob.upload_id+'.chunks')),true);assert.equal(ctx.store.state().torusAttachments.files.length,2);assert.deepEqual(ctx.service.readForMessage('bob','committed-local-delivery',0,0),bytes);assert.equal(ctx.service.discardUnfinished('alice').removed,0);assert.throws(()=>ctx.service.put('alice',{attachment_id:alice.attachment_id,index:0,data:Buffer.from('Hello').toString('base64')}),error=>error.code==='NOT_FOUND');assert.equal(ctx.service.discardUnfinished('operator').removed,0,'operator cleanup also stays scoped to its own files');
});
