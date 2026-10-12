/** Real protected Stores and peer listeners; the SOCKS network is deliberately
 * synthetic and never connects to Tor, DNS, an Internet host or real email. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import {randomBytes,createHash} from 'node:crypto';
import {Store} from '../src/store.mjs';
import {canonical,signature} from '../src/crypto.mjs';
import {createTorusMail,TORUS_DOMAINS,torusEnvelopeDigest,torusRoute} from '../src/torus-mail.mjs';
import {createTorusPeer} from '../src/torus-peer.mjs';
import {createMailRouter} from '../src/mail-routing.mjs';

function onion(){const publicBytes=randomBytes(32),version=Buffer.from([3]),checksum=createHash('sha3-256').update(Buffer.concat([Buffer.from('.onion checksum'),publicBytes,version])).digest().subarray(0,2),bytes=Buffer.concat([publicBytes,checksum,version]);let accumulator=0,bits=0,text='';for(const byte of bytes){accumulator=(accumulator<<8)|byte;bits+=8;while(bits>=5){bits-=5;text+='abcdefghijklmnopqrstuvwxyz234567'[(accumulator>>>bits)&31];}}return text+'.onion';}
async function createProxy(t,targets){
 const sockets=new Set(),visits=[],packets=[];let discardReply=false;
 const server=net.createServer(socket=>{sockets.add(socket);socket.on('error',()=>{});socket.on('close',()=>sockets.delete(socket));let buffer=Buffer.alloc(0),stage=0,upstream;
  const read=chunk=>{buffer=Buffer.concat([buffer,chunk]);if(stage===0){if(buffer.length<3)return;assert.deepEqual([...buffer.subarray(0,3)],[5,1,0]);buffer=buffer.subarray(3);stage=1;socket.write(Buffer.from([5,0]));}
   if(stage===1){if(buffer.length<5)return;assert.equal(buffer[3],3);const count=buffer[4];if(buffer.length<count+7)return;const host=buffer.subarray(5,count+5).toString('ascii');assert.equal(buffer.readUInt16BE(count+5),80);buffer=buffer.subarray(count+7);visits.push(host);assert(targets.has(host));stage=2;upstream=net.connect({host:'127.0.0.1',port:targets.get(host)});sockets.add(upstream);upstream.on('error',()=>socket.destroy());upstream.on('close',()=>sockets.delete(upstream));socket.on('close',()=>upstream.destroy());upstream.once('connect',()=>{socket.write(Buffer.from([5,0,0,1,0,0,0,0,0,0]));socket.removeListener('data',read);socket.on('data',bytes=>packets.push(Buffer.from(bytes)));if(buffer.length)upstream.write(buffer);socket.pipe(upstream);
     if(discardReply){upstream.on('data',()=>{socket.destroy();upstream.destroy();});}else upstream.pipe(socket);
    });
   }
  };socket.on('data',read);
 });await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(async()=>{for(const socket of sockets)socket.destroy();await new Promise(resolve=>server.close(resolve));});return {port:server.address().port,visits,packets,dropReplies(value){discardReply=value;}};
}
async function fixture(t){
 const scratch=path.resolve(import.meta.dirname,'../../work');fs.mkdirSync(scratch,{recursive:true});const root=fs.mkdtempSync(path.join(scratch,'torus-integration-')),nodes=[],targets=new Map(),proxy=await createProxy(t,targets);
 const open=index=>{const prior=nodes[index],key=prior?.key??randomBytes(32),host=prior?.onion??onion(),nodeRoot=path.join(root,String(index)),store=new Store(nodeRoot,{vaultKey:key}),credentials=store.credentials(),node={root:nodeRoot,key,onion:host,store,credentials,operator:credentials['postmaster@local.test'],user:credentials['user@local.test'],peer:null};
  node.mail=createTorusMail(store,{localOnion:host,peerPort:80,socksPort:proxy.port,transport:{deliver:(...args)=>node.peer.deliver(...args),checkReceipt:(...args)=>node.peer.checkReceipt(...args),close:()=>node.peer?.close()}});node.router=createMailRouter(store,null,node.mail);nodes[index]=node;return node;};
 for(let index=0;index<3;index++){const node=open(index);node.store.login(node.operator);node.store.login(node.user);}
 const coordinator=nodes[0];coordinator.mail.createNetwork(coordinator.operator);
 for(const [index,slot]of [[1,'n01'],[2,'n11']]){const invitation=coordinator.mail.invitation(coordinator.operator,slot).invitation,card=nodes[index].mail.join(nodes[index].operator,invitation).card;coordinator.mail.admitPeer(coordinator.operator,card);}
 const directory=coordinator.mail.exportDirectory(coordinator.operator);for(const node of nodes.slice(1))node.mail.importDirectory(node.operator,directory);
 const start=async index=>{const node=nodes[index];node.peer=createTorusPeer({currentNetwork:()=>node.mail.context(),receive:envelope=>node.mail.receive(envelope),lookupReceipt:query=>node.mail.lookupReceipt(query),socksPort:proxy.port,timeoutMs:3000});await node.peer.start();targets.set(node.onion,node.peer.port);};
 for(let index=0;index<nodes.length;index++){nodes[index].assigned=nodes[index].mail.login(nodes[index].user).assigned_address;await start(index);}
 t.after(async()=>{for(const node of nodes){await node.mail.close();node.store.close();node.key.fill(0);}assert.equal(path.dirname(root),scratch);fs.rmSync(root,{recursive:true,force:true});});
 return {nodes,proxy,async reopen(index){const old=nodes[index],assigned=old.assigned;await old.mail.close();old.store.close();open(index).assigned=assigned;await start(index);return nodes[index];}};
}
const draft=(recipient,id,body='Private synthetic content unique to the receiving account')=>({to:[recipient],subject:'Private integration test',body,attachments:[],request_id:id});
async function send(node,message){const quote=node.router.quote(node.user,message);assert.equal(quote.route,'peer');return node.router.send(node.user,{...message,expected_route:'peer',confirmed_from:quote.from});}

test('TORUS-INTEGRATION signed network joins retain legacy aliases and use distinct protected account identities',{timeout:180000},async t=>{
 const {nodes}=await fixture(t);assert.equal(nodes[0].assigned,'mail@127.0.0.3');assert.equal(nodes[1].assigned,'mail@127.0.1.2');assert.equal(nodes[2].assigned,'mail@127.1.1.2');
 for(const node of nodes){const state=node.store.state();assert.equal(state.mailAssignments.items.find(item=>item.owner==='user@local.test').address,'mail@127.0.0.3');assert.equal(node.store.me(node.user).assigned_address,node.assigned);assert(node.store.verify().ok);const exported=JSON.stringify(node.mail.exportDirectory(node.operator));assert(!exported.includes('PRIVATE KEY'));assert(!exported.includes(node.user));assert(!exported.includes(node.key.toString('hex')));}
 assert(!nodes[0].key.equals(nodes[1].key));assert(!nodes[1].key.equals(nodes[2].key));
});
test('TORUS-INTEGRATION real encrypted stores deliver via an opaque intermediate, own Inbox/Sent, proofs and durable replay',{timeout:180000},async t=>{
 const f=await fixture(t),[source,middle,destination]=f.nodes,message=draft(destination.assigned,'private-store-send-001'),before=source.store.me(source.user).balance;
 const sent=await send(source,message);assert.equal(sent.message.status,'DELIVERED');assert.deepEqual(sent.message.route,['n00','n01','n11']);assert.equal(source.store.me(source.user).balance,before);
 const inbox=destination.store.list(destination.user);assert.equal(inbox.length,1);assert.equal(destination.store.message(destination.user,inbox[0].id).body,message.body);assert.equal(destination.store.message(destination.user,inbox[0].id).from,source.assigned);assert.equal(destination.store.list(destination.user,'Sent').length,0);assert.equal(destination.store.list(destination.operator).length,0);assert.throws(()=>destination.store.message(destination.operator,inbox[0].id));assert(destination.store.proof(destination.user,inbox[0].id).verified);
 assert.equal(source.store.list(source.user,'Sent').length,1);assert.equal(source.store.list(source.operator,'Sent').length,0);assert.equal(middle.store.list(middle.user).length,0);assert.equal(middle.store.list(middle.user,'Sent').length,0);assert.equal(middle.store.state().torusMail.receipts.length,0);
 assert(!Buffer.concat(f.proxy.packets).includes(Buffer.from(message.body)));for(const node of f.nodes){assert(!fs.readFileSync(path.join(node.root,'mail.sqlite')).includes(Buffer.from(message.body)));assert(node.store.verify().ok);}
 const visits=f.proxy.visits.length,replayed=await send(source,message);assert(replayed.replayed);assert.equal(f.proxy.visits.length,visits,'confirmed retry never transmits another message');assert.equal(destination.store.list(destination.user).length,1);await assert.rejects(()=>send(source,{...message,body:'Changed immutable content'}),error=>error.code==='REPLAY_CONFLICT');
 const reopened=await f.reopen(2);assert.equal(reopened.store.list(reopened.user).length,1);const envelope=source.store.state().torusMail.outbox[0].envelope;assert.equal((await source.peer.checkReceipt(envelope,source.mail.context())).status,'DELIVERED');assert(reopened.store.verify().ok);
});
test('TORUS-INTEGRATION lost acknowledgment remains UNKNOWN and lookup recovers without redelivery',{timeout:180000},async t=>{
 const f=await fixture(t),[source,,destination]=f.nodes,message=draft(destination.assigned,'private-store-unknown-001');f.proxy.dropReplies(true);const result=await send(source,message);assert.equal(result.message.status,'UNKNOWN');assert.equal(destination.store.list(destination.user).length,1);assert.equal(destination.store.state().torusMail.receipts.length,1);
 f.proxy.dropReplies(false);const envelope=source.store.state().torusMail.outbox[0].envelope;assert.equal((await source.peer.checkReceipt(envelope,source.mail.context())).status,'DELIVERED');assert.equal(destination.store.list(destination.user).length,1);assert.equal(source.store.list(source.user,'Sent').length,1);assert(source.store.verify().ok);assert(destination.store.verify().ok);
});
test('TORUS-INTEGRATION inbound replay identity is scoped to the authenticated sending node',{timeout:180000},async t=>{
 const f=await fixture(t),[source,middle,destination]=f.nodes,sharedId='e'.repeat(32);
 for(const sender of [source,middle]){const ctx=sender.mail.context(),recipient=destination.mail.context().local.node_id,value={version:1,network_id:ctx.directory.network_id,id:sharedId,from:sender.assigned,to:destination.assigned,subject:'Distinct signed sending peer',body:sender.assigned,attachments:[],sender_node:ctx.local.node_id,recipient_node:recipient,route:torusRoute(ctx.directory,ctx.local.node_id,recipient),created_at:Date.now()},unsigned={...value,digest:torusEnvelopeDigest(value)},envelope={...unsigned,signature:signature(TORUS_DOMAINS.envelope,unsigned,ctx.local.sign_private)};assert.equal((await sender.peer.deliver(envelope,ctx)).status,'DELIVERED');}
 assert.equal(destination.store.list(destination.user).length,2);assert.equal(destination.store.state().torusMail.receipts.length,2);assert(destination.store.verify().ok);
});
