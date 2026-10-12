import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import {Store,restoreNew} from '../src/store.mjs';
import {Vault,createVaultMetadata,VAULT_PREFIX,isProtectedText,deriveWordKey,canonicalWordKeyLine,generateVertexWords,normalizeRecoveryWords} from '../src/vault.mjs';
import {canonical,hash,verifyInclusion} from '../src/crypto.mjs';
import {GlyphokuService} from '../src/glyphoku-service.mjs';
import {readGlyphoku} from '../src/glyphoku-persistence.mjs';
import {run} from './glyphoku-helper.mjs';
import {freezeDraft} from '../desk/modules/lib/glyphoku/registry.js';

function temp(t,{cleanup=true}={}){const root=fs.mkdtempSync(path.join(os.tmpdir(),'vexa-vault-'));if(cleanup)t.after(()=>fs.rmSync(root,{recursive:true,force:true}));return root}
function fixture(t,options={}){const root=temp(t,{cleanup:false}),key=randomBytes(32),s=new Store(root,{vaultKey:key,...options}),creds=s.credentials();t.after(()=>{try{s.close()}catch{}key.fill(0);fs.rmSync(root,{recursive:true,force:true})});return {root,key,s,creds,a:creds['postmaster@local.test'],u:creds['user@local.test']}}
const code=(fn,expected)=>assert.throws(fn,error=>error.code===expected);
const message={to:['user@local.test'],subject:'Synthetic vault letter',body:'Private synthetic π雪 payload',request_id:'vault-letter-01',max_cost:1};
function changed(text){const bytes=Buffer.from(text.slice(VAULT_PREFIX.length),'base64');bytes[bytes.length-1]^=1;return VAULT_PREFIX+bytes.toString('base64')}

test('VAULT-01 ordered JA21 source KAT and legacy recovery are preserved',()=>{
 const words=['babebibo','bubybwbx','bqbzbbbc','bdbfbgbh'];
 assert.equal(deriveWordKey(words).toString('hex'),'82d73d2763def8edd38d4afe312c2e49e3b6ddcb39afd44fe60dc75dbe179510');
 assert.equal(deriveWordKey(['clftqso','abcdefgh','vertex','recovery']).toString('hex'),'e0633e0e24e6f156dccf9a7753c0b873e12d782333ce3f528d5ff96a76f87d8e');
 assert.deepEqual(normalizeRecoveryWords([' A ','b'.repeat(64),'Vertex','RECOVERY']),['a','b'.repeat(64),'vertex','recovery']);
 assert.notDeepEqual(deriveWordKey([words[1],words[0],...words.slice(2)]),deriveWordKey(words));
 code(()=>canonicalWordKeyLine(['a|V2=b','c','d','e']),'VAULT_WORDS');code(()=>deriveWordKey(['K','b','c','d']),'VAULT_WORDS');
 const fresh=generateVertexWords();assert.equal(fresh.length,4);assert(fresh.every(word=>/^(?:[bcdfghjklmnprstv][aeiouywxqzbcdfgh]){4}$/.test(word)));
});

test('VAULT-02 independent AEAD authenticates row, use, metadata and wrong key',()=>{
 const key=randomBytes(32),metadata=createVaultMetadata(),v=new Vault(key,metadata),wrong=new Vault(randomBytes(32),metadata),other=new Vault(key,createVaultMetadata());
 try{const text=canonical({private:'synthetic'}),wrapped=v.seal(text,'table:state','1');assert.equal(v.open(wrapped,'table:state','1'),text);assert.notEqual(v.seal(text,'table:state','1'),wrapped);
  code(()=>v.open(changed(wrapped),'table:state','1'),'VAULT_AUTHENTICATION');code(()=>v.open(wrapped,'table:blocks','1'),'VAULT_AUTHENTICATION');code(()=>v.open(wrapped,'table:state','2'),'VAULT_AUTHENTICATION');code(()=>wrong.open(wrapped,'table:state','1'),'VAULT_AUTHENTICATION');code(()=>other.open(wrapped,'table:state','1'),'VAULT_AUTHENTICATION');
 }finally{v.destroy();wrong.destroy();other.destroy();key.fill(0)}
});

test('VAULT-03 malformed and plaintext envelopes fail closed',()=>{
 const v=new Vault(randomBytes(32),createVaultMetadata());try{
  code(()=>v.open('{}','table:state','1'),'VAULT_UNPROTECTED');
  for(const bad of [VAULT_PREFIX,VAULT_PREFIX+'!',VAULT_PREFIX+'YQ==',VAULT_PREFIX+'AAAA='])code(()=>v.open(bad,'table:state','1'),'VAULT_ENVELOPE');
  v.destroy();code(()=>v.seal('{}','table:state','1'),'VAULT_CLOSED');
 }finally{v.destroy()}
});

test('VAULT-04 authority, credentials, current state and every block/object are opaque on disk',t=>{
 const {root,key,s,creds,a}=fixture(t);s.send(a,message);assert(s.vaultProtected);
 for(const file of ['node.secret.json','credentials.secret.json']){const bytes=fs.readFileSync(path.join(root,file),'utf8');assert(isProtectedText(bytes));assert(!bytes.includes(creds['postmaster@local.test']));assert(!bytes.includes('PRIVATE KEY'));assert.throws(()=>JSON.parse(bytes));}
 for(const table of ['state','blocks','objects'])for(const row of s.db.prepare('SELECT json FROM '+table).all()){assert(isProtectedText(row.json));assert(!row.json.includes('postmaster@local.test'));assert(!row.json.includes(message.body));}
 const names=fs.readdirSync(root);assert(!names.some(name=>/master|word|recovery|vault.key/.test(name)));assert(!fs.readFileSync(path.join(root,'vault.meta.json')).includes(key));assert(s.verify().ok);
});

test('VAULT-05 restart preserves receipts, logical ciphertext blob IDs, proofs and checkpoint',t=>{
 const {root,key,s,a,u}=fixture(t);const receipt=s.send(a,message),row=s.list(u)[0],proof=s.proof(u,row.id),checkpoint=s.checkpoint(),state=canonical(s.state()),logical=s.decodeStoredJSON('objects',row.blob_id,s.db.prepare('SELECT json FROM objects WHERE id=?').get(row.blob_id).json);
 assert.equal(hash(logical),row.blob_id);assert(verifyInclusion(proof.event,{steps:proof.steps},proof.header.events_root));s.close();
 const reopened=new Store(root,{vaultKey:key});try{assert.equal(canonical(reopened.state()),state);assert.deepEqual(reopened.checkpoint(),checkpoint);assert.deepEqual(reopened.proof(u,row.id),proof);assert.equal(reopened.message(u,row.id).body,message.body);const retry=reopened.send(a,message);assert(retry.replayed);assert.equal(retry.block_hash,receipt.block_hash);assert(reopened.verify(checkpoint).ok)}finally{reopened.close()}
});

test('VAULT-06 missing or wrong external key cannot open protected state',t=>{
 const {root,s}=fixture(t);s.close();code(()=>new Store(root),'VAULT_KEY');code(()=>new Store(root,{vaultKey:randomBytes(32)}),'VAULT_AUTHENTICATION');
});

test('VAULT-07 corrupt authority and credential envelopes are rejected before secret JSON parsing',t=>{
 for(const filename of ['node.secret.json','credentials.secret.json']){const {root,key,s}=fixture(t);s.close();const file=path.join(root,filename);fs.writeFileSync(file,changed(fs.readFileSync(file,'utf8')));code(()=>new Store(root,{vaultKey:key}),'VAULT_AUTHENTICATION')}
});

test('VAULT-08 missing and modified metadata fail closed',t=>{
 const f=fixture(t);f.s.close();const file=path.join(f.root,'vault.meta.json'),original=fs.readFileSync(file);fs.rmSync(file);code(()=>new Store(f.root),'VAULT_REQUIRED');fs.writeFileSync(file,original);const metadata=JSON.parse(original);metadata.vault_id='f'.repeat(32);fs.writeFileSync(file,JSON.stringify(metadata));code(()=>new Store(f.root,{vaultKey:f.key}),'VAULT_AUTHENTICATION');
});

test('VAULT-09 protected tables refuse corruption and plaintext downgrades',t=>{
 for(const table of ['state','blocks','objects'])for(const downgrade of [false,true]){const {root,key,s,a}=fixture(t);s.send(a,message);const column=table==='state'?'singleton':table==='blocks'?'height':'id',row=s.db.prepare('SELECT '+column+' AS row_id,json FROM '+table+' LIMIT 1').get(),logical=s.decodeStoredJSON(table,row.row_id,row.json);
  s.db.prepare('UPDATE '+table+' SET json=? WHERE '+column+'=?').run(downgrade?logical:changed(row.json),row.row_id);s.close();code(()=>new Store(root,{vaultKey:key}),'INTEGRITY');
 }
});

test('VAULT-10 swapping valid block/object envelopes between row contexts is rejected',t=>{
 const {root,key,s,a}=fixture(t);s.send(a,message);s.send(a,{...message,request_id:'vault-letter-02'});
 const blocks=s.db.prepare('SELECT height,json FROM blocks ORDER BY height').all();s.db.prepare('UPDATE blocks SET json=? WHERE height=?').run(blocks[1].json,blocks[0].height);assert.equal(s.verify().ok,false);s.db.prepare('UPDATE blocks SET json=? WHERE height=?').run(blocks[0].json,blocks[0].height);
 const objects=s.db.prepare('SELECT id,json FROM objects').all();s.db.prepare('UPDATE objects SET json=? WHERE id=?').run(objects[1].json,objects[0].id);assert.equal(s.verify().ok,false);s.close();code(()=>new Store(root,{vaultKey:key}),'INTEGRITY');
});

test('VAULT-11 protected backup preserves metadata and requires its key before restore creates a directory',t=>{
 const {root,key,s,a,u}=fixture(t);s.send(a,message);const row=s.list(u)[0],proof=s.proof(u,row.id),backup=s.backup(a),destination=path.join(root,'restored');
 assert(backup.protected);assert(isProtectedText(fs.readFileSync(path.join(backup.backup,'manifest.json'),'utf8')));assert.deepEqual(fs.readFileSync(path.join(backup.backup,'vault.meta.json')),fs.readFileSync(path.join(root,'vault.meta.json')));
 code(()=>restoreNew(backup.backup,destination),'VAULT_KEY');assert(!fs.existsSync(destination));code(()=>restoreNew(backup.backup,destination,{vaultKey:randomBytes(32)}),'VAULT_AUTHENTICATION');assert(!fs.existsSync(destination));
 assert(restoreNew(backup.backup,destination,{vaultKey:key}).ok);const restored=new Store(destination,{vaultKey:key,readOnly:true});try{assert(restored.vaultProtected);assert.deepEqual(restored.proof(u,row.id),proof);assert.equal(restored.message(u,row.id).body,message.body);assert.deepEqual(restored.checkpoint(),backup.checkpoint)}finally{restored.close()}
});

test('VAULT-12 protected backup manifest tampering is rejected before copying data',t=>{
 const {root,key,s,a}=fixture(t),backup=s.backup(a),manifest=path.join(backup.backup,'manifest.json'),dest=path.join(root,'bad-restore');fs.writeFileSync(manifest,changed(fs.readFileSync(manifest,'utf8')));code(()=>restoreNew(backup.backup,dest,{vaultKey:key}),'VAULT_AUTHENTICATION');assert(!fs.existsSync(dest));
});

test('VAULT-13 existing plaintext state cannot silently claim vault migration',t=>{
 const root=temp(t),s=new Store(root),before=fs.readFileSync(path.join(root,'node.secret.json'));s.close();code(()=>new Store(root,{vaultKey:randomBytes(32)}),'VAULT_MIGRATION_REQUIRED');assert(!fs.existsSync(path.join(root,'vault.meta.json')));assert.deepEqual(fs.readFileSync(path.join(root,'node.secret.json')),before);const legacy=new Store(root);try{assert(!legacy.vaultProtected);assert(legacy.verify().ok)}finally{legacy.close()}
});

test('VAULT-14 invalid external key is refused before fresh state creation',t=>{
 const root=path.join(temp(t),'fresh');for(const key of [Buffer.alloc(31),Buffer.alloc(33),new Uint8Array(32),'x'.repeat(32)]){code(()=>new Store(root,{vaultKey:key}),'VAULT_KEY');assert(!fs.existsSync(root))}
});

test('VAULT-15 transaction failure cannot commit wrapped objects or consume credit',t=>{
 let fail=true;const {s,a}=fixture(t,{fault:phase=>{if(fail&&phase==='before-commit')throw Error('synthetic failure')}}),head=s.head().hash;assert.throws(()=>s.send(a,message),/synthetic failure/);assert.equal(s.head().hash,head);assert.equal(s.db.prepare('SELECT COUNT(*) AS n FROM objects').get().n,0);assert.equal(s.me(a).balance,100);assert(s.verify().ok);fail=false;assert.equal(s.send(a,message).status,'COMMITTED');assert(s.verify().ok);
});

test('VAULT-16 protected Glyphoku registry keeps logical IDs through restart and encrypted backup',async t=>{
 const {root,key,s,a}=fixture(t),g=new GlyphokuService(s,{seedFactory:()=>54});t.after(()=>g.close());await run(g,a,'domain',{label:'vaultdomain'},'vault-domain-01');const before=g.view(a),pointer=s.state().glyphoku.blob_id,row=s.db.prepare('SELECT json FROM objects WHERE id=?').get(pointer);
 assert(isProtectedText(row.json));assert.equal(hash(s.decodeStoredJSON('objects',pointer,row.json)),pointer);assert.equal(readGlyphoku(s,s.state()).registry.instance.domains[0].label,'vaultdomain');const backup=s.backup(a),dest=path.join(root,'game-restored');assert(restoreNew(backup.backup,dest,{vaultKey:key}).ok);g.close();s.close();
 for(const directory of [root,dest]){const opened=new Store(directory,{vaultKey:key}),game=new GlyphokuService(opened);try{assert.equal(game.view(a).revision,before.revision);assert.equal(opened.state().glyphoku.blob_id,pointer);assert(opened.verify(backup.checkpoint).ok)}finally{game.close();opened.close()}}
});

test('VAULT-17 protected game permit, delivery, replay and inclusion proof survive restart',async t=>{
 const {root,key,s,a}=fixture(t),g=new GlyphokuService(s,{seedFactory:g=>g===1?54:107});t.after(()=>g.close());
 await run(g,a,'domain',{label:'vaultpermit'},'vault-permit-domain-01');const view=g.view(a),mailbox=view.instance.mailboxes[0].address,draft=freezeDraft({from:mailbox,to:mailbox,bcc:'',subject:'Protected game note',body:'Synthetic private game body π雪'},view.instance).draft;
 await run(g,a,'envelope',{draft},'vault-permit-envelope-02');const next=g.view(a),request={permit_id:'env-1',draft,expected_revision:next.revision,instance_id:next.instance_id,operation_id:'vault-permit-send-03'},credential=g.credential(a),backup=s.backup(a),destination=path.join(root,'ready-restored');
 assert(restoreNew(backup.backup,destination,{vaultKey:key}).ok);const restored=new Store(destination,{vaultKey:key}),rg=new GlyphokuService(restored);try{assert.equal(rg.view(a).instance.permits[0].state,'READY');assert.equal(rg.send(a,request).result.status,'DELIVERED_LOCAL');assert(restored.verify(backup.checkpoint).ok)}finally{rg.close();restored.close()}
 assert.equal(g.send(a,request).result.status,'DELIVERED_LOCAL');const delivery=s.list(credential.token)[0],proof=s.proof(credential.token,delivery.id),head=s.head().hash;assert.equal(s.message(credential.token,delivery.id).body,draft.body);assert(g.send(a,request).replayed);assert.equal(s.head().hash,head);assert(verifyInclusion(proof.event,{steps:proof.steps},proof.header.events_root));
 g.close();s.close();const reopened=new Store(root,{vaultKey:key}),game=new GlyphokuService(reopened);try{assert(game.send(a,request).replayed);assert.deepEqual(reopened.proof(credential.token,delivery.id),proof);assert.equal(game.view(a).instance.permits[0].state,'DELIVERED_LOCAL');assert(reopened.verify().ok)}finally{game.close();reopened.close()}
});

test('VAULT-18 bootstrap credentials track rotation and new accounts atomically through backup/restart',t=>{
 const {root,key,s,a,u}=fixture(t),initialFile=fs.readFileSync(path.join(root,'credentials.secret.json')),rotated=s.rotateToken(a).token,created=s.createAccount(rotated,{address:'vaultnew@local.test',credits:0}),next=s.rotateToken(created.token).token;
 code(()=>s.authenticate(a),'AUTH');code(()=>s.authenticate(created.token),'AUTH');assert.equal(s.credentials()['postmaster@local.test'],rotated);assert.equal(s.credentials()[created.address],next);assert.equal(s.credentials()['user@local.test'],u);assert.deepEqual(fs.readFileSync(path.join(root,'credentials.secret.json')),initialFile);
 assert.equal(s.state().recoveryCredentials[created.address],next);for(const row of s.db.prepare('SELECT json FROM state UNION ALL SELECT json FROM blocks').all())assert(!row.json.includes(next));assert(s.verify().ok);
 const backup=s.backup(rotated),dest=path.join(root,'credentials-restored');assert(restoreNew(backup.backup,dest,{vaultKey:key}).ok);s.close();
 for(const directory of [root,dest]){const opened=new Store(directory,{vaultKey:key});try{const credentials=opened.credentials();assert.equal(credentials['postmaster@local.test'],rotated);assert.equal(credentials[created.address],next);assert.equal(opened.authenticate(rotated),'postmaster@local.test');assert.equal(opened.authenticate(next),created.address);assert(opened.verify().ok)}finally{opened.close()}}
});

test('VAULT-19 recovery credentials roll back with failed mutations and recover lost acknowledgments',t=>{
 let armed=null;const {s,a}=fixture(t,{fault:p=>{if(p===armed)throw Error('synthetic credential fault')}}),head=s.head().hash;
 armed='before-commit';assert.throws(()=>s.rotateToken(a),/synthetic credential fault/);assert.equal(s.credentials()['postmaster@local.test'],a);assert.equal(s.head().hash,head);assert.throws(()=>s.createAccount(a,{address:'uncommitted@local.test'}),/synthetic credential fault/);assert(!s.credentials()['uncommitted@local.test']);assert(!s.state().accounts['uncommitted@local.test']);
 armed='after-commit';assert.throws(()=>s.rotateToken(a),/synthetic credential fault/);armed=null;const recovered=s.credentials()['postmaster@local.test'];assert.notEqual(recovered,a);assert.equal(s.authenticate(recovered),'postmaster@local.test');code(()=>s.authenticate(a),'AUTH');assert(s.verify().ok);
 code(()=>s.mutate(recovered,(state,actor,now,events)=>{state.recoveryCredentials['missing@local.test']='synthetic-unbound-token';events.push({type:'SYNTHETIC'})}),'RECOVERY_CREDENTIALS');assert(s.verify().ok);
});

test('VAULT-20 larger authenticated values retain canonical base64 and exact Unicode bytes',()=>{
 const key=randomBytes(32),v=new Vault(key,createVaultMetadata());try{const text=canonical({body:'π雪'.repeat(200000)}),wrapped=v.seal(text,'table:objects','a'.repeat(64));assert.equal(v.open(wrapped,'table:objects','a'.repeat(64)),text)}finally{v.destroy();key.fill(0)}
});

test('VAULT-21 missing or changed encrypted secret files cannot produce a usable protected backup',t=>{
 const {root,key,s,a}=fixture(t),file=path.join(root,'credentials.secret.json'),original=fs.readFileSync(file);fs.rmSync(file);code(()=>s.backup(a),'INCOMPLETE_STATE');assert(!fs.existsSync(path.join(root,'backups')));s.close();code(()=>new Store(root,{vaultKey:key}),'INCOMPLETE_STATE');
 fs.writeFileSync(file,original);const opened=new Store(root,{vaultKey:key});try{fs.writeFileSync(file,changed(original.toString('utf8')));code(()=>opened.backup(a),'VAULT_AUTHENTICATION');assert(!fs.existsSync(path.join(root,'backups')))}finally{opened.close()}
});

test('VAULT-22 protected backup refuses missing or changed active metadata before creating a backup',t=>{
 for(const missing of [false,true]){const {root,key,s,a}=fixture(t),file=path.join(root,'vault.meta.json'),original=fs.readFileSync(file);if(missing)fs.rmSync(file);else{const altered=JSON.parse(original);altered.salt='f'.repeat(64);fs.writeFileSync(file,JSON.stringify(altered))}code(()=>s.backup(a),'VAULT_METADATA');assert(!fs.existsSync(path.join(root,'backups')));fs.writeFileSync(file,original);const backup=s.backup(a),destination=path.join(root,'metadata-restored');assert.deepEqual(fs.readFileSync(path.join(backup.backup,'vault.meta.json')),original);assert(restoreNew(backup.backup,destination,{vaultKey:key}).ok)}
});

test('VAULT-23 remaining protected artifacts cannot silently create a replacement authority or chain',t=>{
 const {root,key,s}=fixture(t),metadata=fs.readFileSync(path.join(root,'vault.meta.json')),credentials=fs.readFileSync(path.join(root,'credentials.secret.json'));s.close();fs.rmSync(path.join(root,'mail.sqlite'));fs.rmSync(path.join(root,'node.secret.json'));code(()=>new Store(root,{vaultKey:key}),'INCOMPLETE_STATE');code(()=>new Store(root),'INCOMPLETE_STATE');assert(!fs.existsSync(path.join(root,'mail.sqlite')));assert(!fs.existsSync(path.join(root,'node.secret.json')));assert.deepEqual(fs.readFileSync(path.join(root,'vault.meta.json')),metadata);assert.deepEqual(fs.readFileSync(path.join(root,'credentials.secret.json')),credentials);
 const plainRoot=temp(t),plainCredentials=Buffer.from('{"postmaster@local.test":"synthetic-bootstrap-token-only"}\n');fs.writeFileSync(path.join(plainRoot,'credentials.secret.json'),plainCredentials);code(()=>new Store(plainRoot,{vaultKey:key}),'VAULT_MIGRATION_REQUIRED');assert(!fs.existsSync(path.join(plainRoot,'vault.meta.json')));assert.deepEqual(fs.readFileSync(path.join(plainRoot,'credentials.secret.json')),plainCredentials);
});
