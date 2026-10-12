/** Synthetic preserved-Vexa127-2.1.0 -> VexaGlyph127-3.0.0 compatibility exercise.
 * No live state, public network, human observation or downgrade claim. */
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {spawnSync} from 'node:child_process';import {pathToFileURL} from 'node:url';import assert from 'node:assert/strict';
import {Store,restoreNew,VERSION} from '../src/store.mjs';import {hash,canonical} from '../src/crypto.mjs';import {GlyphokuService} from '../src/glyphoku-service.mjs';import {prepare,drive,binding} from '../tests/glyphoku-helper.mjs';
const root=path.resolve(import.meta.dirname,'..'),old=path.join(root,'provenance/vexa-source'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'glyphoku-upgrade-')),state=path.join(temp,'state'),out=path.join(root,'evidence/runs','glyphoku-upgrade-'+Date.now());fs.mkdirSync(out,{recursive:true});
const observations=[];let s,g;const check=(name,f)=>{f();observations.push({check:name,outcome:'PASS'});};
const summary={kind:'EXECUTED_SYNTHETIC_UPGRADE',from:'2.1.0-local.1',to:VERSION,status:'RUNNING',environment:{node:process.version,platform:process.platform,arch:process.arch},observations,source_store_sha256:hash(fs.readFileSync(path.join(old,'store.mjs'))),target_store_sha256:hash(fs.readFileSync(path.join(root,'src/store.mjs'))),scope:'Eight synthetic legacy messages plus a reserved stamp, then new game-domain issuance and backup/restore. API observer only; no browser delivery, Windows execution, power-loss guarantee or downgrade compatibility.'};
try{
 const script=`import fs from 'node:fs';import {Store,VERSION} from ${JSON.stringify(pathToFileURL(path.join(old,'store.mjs')).href)};import {canonical,hash} from ${JSON.stringify(pathToFileURL(path.join(old,'crypto.mjs')).href)};
 const dir=process.argv[1],s=new Store(dir),c=JSON.parse(fs.readFileSync(dir+'/credentials.secret.json')),a=c['postmaster@local.test'],u=c['user@local.test'];s.preferences(a,{daily:100});s.alias(a,{alias:'team@local.test',targets:['user@local.test']});
 const drafts=[];for(let i=0;i<8;i++){const d={to:['team@local.test'],subject:'Compatibility fixture '+i,body:'Synthetic UTF-8 雪 '+i,attachments:i%2?[{name:'fixture.bin',data:'AP8='}]:[],request_id:'upgrade-message-'+i,max_cost:1};s.send(a,d);drafts.push(d);}
 const pending={to:['user@local.test'],subject:'Old reserved stamp',body:'One use',request_id:'upgrade-reserved-01',max_cost:1},reserved=s.issue(a,pending);
 fs.writeFileSync(dir+'/fixture.json',JSON.stringify({version:VERSION,chain_id:s.state().chain_id,drafts,pending,stamp:reserved.stamp,checkpoint:s.checkpoint(),mail_hash:hash(canonical(s.exportMailbox(u).messages)),balance:s.me(a).balance,burned:s.state().burned,issued:s.state().issued}));s.close();console.log('Synthetic baseline seeded.');`;
 const seeded=spawnSync(process.execPath,['--input-type=module','-e',script,state],{encoding:'utf8',timeout:20000});assert.equal(seeded.status,0,seeded.stderr);fs.writeFileSync(path.join(out,'BASELINE.log'),seeded.stdout+seeded.stderr);
 const f=JSON.parse(fs.readFileSync(path.join(state,'fixture.json'))),creds=JSON.parse(fs.readFileSync(path.join(state,'credentials.secret.json'))),a=creds['postmaster@local.test'],u=creds['user@local.test'];assert.equal(f.version,'2.1.0-local.1');s=new Store(state);
 check('Pinned old checkpoint verifies after opening the new server',()=>assert(s.verify(f.checkpoint).ok));
 check('Eight messages and attachment bytes remain identical',()=>assert.equal(hash(canonical(s.exportMailbox(u).messages)),f.mail_hash));
 check('Issued, burned and owner credit balances are preserved',()=>{assert.equal(s.state().issued,f.issued);assert.equal(s.state().burned,f.burned);assert.equal(s.me(a).balance,f.balance);});
 check('Old request retry adds no cost or copy',()=>{assert(s.send(a,f.drafts[0]).replayed);assert.equal(s.me(a).balance,f.balance);assert.equal(s.page(u).total,8);});
 check('Old reservation is consumed once without another debit',()=>{assert.equal(s.send(a,{...f.pending,stamp:f.stamp,request_id:'upgrade-consume-02'}).status,'COMMITTED');assert.equal(s.me(a).balance,f.balance);assert.throws(()=>s.send(a,{...f.pending,stamp:f.stamp,request_id:'upgrade-reuse-03'}),e=>e.code==='STAMP_USED');});
 g=new GlyphokuService(s,{seedFactory:()=>54});const {h,ref}=await prepare(g,a,binding(g,a,'domain',{label:'upgrade'},'upgrade-domain-04'));drive(g,a,ref);g.commit(a,{...ref,operation_id:h.operation_id});
 check('New game domain joins the same chain without changing old mail',()=>{assert.equal(g.view(a).instance.g,2);assert.equal(s.page(u).total,9);assert.equal(s.state().chain_id,f.chain_id);assert(s.verify(f.checkpoint).ok);});
 const backup=s.backup(a),dest=path.join(temp,'restored');restoreNew(backup.backup,dest);const restored=new Store(dest),rg=new GlyphokuService(restored);try{
 check('Combined backup restores nine legacy messages and the game domain',()=>{assert.equal(restored.page(u).total,9);assert.equal(rg.view(a).instance.mailboxes[0].address,'owner@127.0.0.2');assert(restored.verify(f.checkpoint).ok);});
 check('Incomplete pre-restart run capability is not revived',()=>assert.throws(()=>rg.poll(a,ref),e=>e.code==='STALE_RUN'));
 }finally{rg.close();restored.close();}
 summary.status='PASS';
}catch(e){summary.status='FAIL';summary.failure={name:e.name,message:e.message,stack:e.stack};process.exitCode=1;}
finally{g?.close();s?.close();fs.rmSync(temp,{recursive:true,force:true});summary.finished_at=new Date().toISOString();fs.writeFileSync(path.join(out,'SUMMARY.json'),JSON.stringify(summary,null,2));console.log(JSON.stringify(summary,null,2));console.log('Evidence: '+out);}
