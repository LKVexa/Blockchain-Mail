/** Controlled 2.0.0 -> 2.1.0 state compatibility exercise. Never uses live mail. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {Store,restoreNew,VERSION} from '../src/store.mjs';
import {canonical,hash} from '../src/crypto.mjs';
const project=path.resolve(import.meta.dirname,'..');
const baseline=process.argv[2];
if(!baseline)throw Error('Supply the extracted preserved 2.0.0 source root. This tool creates only synthetic temporary state.');
const old=path.resolve(baseline,'src/store.mjs');
if(!fs.existsSync(old))throw Error('Baseline src/store.mjs not found');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'vexa127-upgrade-'));
const state=path.join(temp,'state'),oldURL=pathToFileURL(old).href;
const output=path.join(project,'evidence/runs','upgrade-'+new Date().toISOString().replace(/[:.]/g,'-'));
fs.mkdirSync(output,{recursive:true});
const observations=[];let s;
try{
 const script=`import fs from 'node:fs';import {Store,VERSION} from ${JSON.stringify(oldURL)};import {canonical,hash} from ${JSON.stringify(pathToFileURL(path.resolve(baseline,'src/crypto.mjs')).href)};
 const root=process.argv[1],s=new Store(root),c=JSON.parse(fs.readFileSync(root+'/credentials.secret.json')),a=c['postmaster@local.test'],u=c['user@local.test'];
 s.preferences(a,{daily:100});s.alias(a,{alias:'team@local.test',targets:['user@local.test']});
 const drafts=[];for(let i=0;i<8;i++){const d={to:['team@local.test'],subject:'Upgrade fixture '+i,body:'Preserve UTF-8 雪 '+i,attachments:i%2?[{name:'fixture.bin',data:'AP8='}]:[],request_id:'upgrade-message-'+i,max_cost:1};s.send(a,d);drafts.push(d)}
 const pending={to:['user@local.test'],subject:'Reserved before upgrade',body:'single use',request_id:'upgrade-reserve-1',max_cost:1},reservation=s.issue(a,pending);
 const result={baseline_version:VERSION,checkpoint:s.checkpoint(),mailbox_hash:hash(canonical(s.exportMailbox(u).messages)),ids:s.exportMailbox(u).messages.map(m=>m.id),balance:s.me(a).balance,burned:s.state().burned,drafts,pending,stamp:reservation.stamp};
 fs.writeFileSync(root+'/fixture.json',JSON.stringify(result));s.close();console.log(JSON.stringify({seeded:8,version:VERSION}));`;
 const r=spawnSync(process.execPath,['--input-type=module','-e',script,state],{encoding:'utf8',timeout:20000});
 assert.equal(r.status,0,r.stderr);const seeded=JSON.parse(r.stdout);assert.equal(seeded.version,'2.0.0-local.1');
 const f=JSON.parse(fs.readFileSync(path.join(state,'fixture.json'))),c=JSON.parse(fs.readFileSync(path.join(state,'credentials.secret.json'))),a=c['postmaster@local.test'],u=c['user@local.test'];
 const dbBefore=hash(fs.readFileSync(path.join(state,'mail.sqlite')));
 s=new Store(state);assert(s.verify(f.checkpoint).ok);observations.push({check:'old pinned checkpoint preserved',outcome:'PASS'});
 assert.equal(hash(canonical(s.exportMailbox(u).messages)),f.mailbox_hash);observations.push({check:'eight delivery records, content and attachment bytes preserved',outcome:'PASS'});
 assert.equal(s.me(a).balance,f.balance);assert.equal(s.state().burned,f.burned);observations.push({check:'balances and consumed counters preserved',outcome:'PASS'});
 const replay=s.send(a,f.drafts[0]);assert(replay.replayed);assert.equal(s.me(a).balance,f.balance);observations.push({check:'old request retry returns prior receipt without charging',outcome:'PASS'});
 const used=s.send(a,{...f.pending,stamp:f.stamp,request_id:'upgrade-consume-reservation'});assert.equal(used.status,'COMMITTED');assert.equal(s.me(a).balance,f.balance);observations.push({check:'old signed reservation consumed exactly once without new debit',outcome:'PASS'});
 assert.throws(()=>s.send(a,{...f.pending,stamp:f.stamp,request_id:'upgrade-reuse-reservation'}),e=>e.code==='STAMP_USED');observations.push({check:'reservation second use rejected',outcome:'PASS'});
 assert.equal(s.page(u,{limit:100}).total,9);const backup=s.backup(a);s.close();s=null;
 const restored=restoreNew(backup.backup,path.join(temp,'restored'));assert(restored.ok);s=new Store(path.join(temp,'restored'));assert.equal(s.page(u,{limit:100}).total,9);assert(s.verify(f.checkpoint).ok);observations.push({check:'upgraded backup restore retains nine deliveries and original checkpoint',outcome:'PASS'});
 const result={kind:'EXECUTED_SYNTHETIC_UPGRADE',status:'PASS',from:seeded.version,to:VERSION,environment:{node:process.version,platform:process.platform,arch:process.arch},baseline_store_sha256:hash(fs.readFileSync(old)),target_store_sha256:hash(fs.readFileSync(path.join(project,'src/store.mjs'))),fixture_database_before_sha256:dbBefore,observations,scope:'Vexa127 2.0.0 state compatibility only. Not import of the original Grok catalogue, independent review, Windows acceptance, or general migration proof.'};
 fs.writeFileSync(path.join(output,'SUMMARY.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));console.log('Evidence: '+output);
}finally{try{s?.close()}finally{fs.rmSync(temp,{recursive:true,force:true})}}
