import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {checkPackage} from '../tools/check-package.mjs';

const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
function fixture(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'vexa-package-'));
 const write=(relative,bytes)=>{const target=path.join(root,relative);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,bytes);};
 write('src/app.mjs','export const answer=42;\n');write('README.md','Synthetic fixture only.\n');
 const manifest=['README.md','src/app.mjs'].map(relative=>digest(fs.readFileSync(path.join(root,relative)))+'  '+relative).join('\n')+'\n';write('SHA256SUMS.txt',manifest);
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));return {root,write,manifest};
}
function failed(report,pattern){assert.equal(report.package_integrity,'FAIL');assert(report.errors.some(error=>pattern.test(error)),JSON.stringify(report.errors));}

test('PACKAGE-01 exact synthetic inventory passes and generated directories are explicitly outside the claim',t=>{
 const f=fixture(t);f.write('runtime/win-x64/node.exe','synthetic runtime');f.write('state/credentials.secret.json','synthetic state');f.write('evidence/runs/current/tests.tap','synthetic run');
 const report=checkPackage(f.root);assert.equal(report.package_integrity,'PASS');assert.equal(report.checked,2);assert.equal(report.inventory_files,2);assert.deepEqual(report.ignored_paths,['runtime/','state/','evidence/runs/']);
});
test('PACKAGE-02 changed and missing packaged files fail verification',t=>{
 const f=fixture(t);f.write('src/app.mjs','changed');failed(checkPackage(f.root),/^Changed: src\/app\.mjs$/);
 fs.unlinkSync(path.join(f.root,'src/app.mjs'));failed(checkPackage(f.root),/^Missing: src\/app\.mjs$/);
});
test('PACKAGE-03 arbitrary extra source, log and pid files cannot hide behind suffix exemptions',t=>{
 const f=fixture(t);for(const relative of ['src/injected.mjs','unlisted.log','unlisted.pid','secret.secret.json'])f.write(relative,'unlisted');
 const report=checkPackage(f.root);for(const relative of ['src/injected.mjs','unlisted.log','unlisted.pid','secret.secret.json'])assert(report.errors.includes('Unlisted: '+relative));assert.equal(report.package_integrity,'FAIL');
});
test('PACKAGE-04 traversal, absolute, Windows alternate streams and noncanonical names are refused',t=>{
 const f=fixture(t),hash=digest('synthetic');
 for(const relative of ['../outside','/absolute','C:/absolute','src/../README.md','src//app.mjs','src\\app.mjs','README.md:stream','README.md.','./README.md','NUL.txt','state/hidden']){
  f.write('SHA256SUMS.txt',f.manifest+hash+'  '+relative+'\n');failed(checkPackage(f.root),/^Unsafe or excluded manifest path:/);
 }
});
test('PACKAGE-05 duplicate and Windows case-colliding manifest paths are refused',t=>{
 const f=fixture(t),first=f.manifest.split('\n')[0];f.write('SHA256SUMS.txt',f.manifest+first+'\n');failed(checkPackage(f.root),/^Duplicate checksum path:/);
 f.write('SHA256SUMS.txt',f.manifest+first.replace('README.md','readme.md')+'\n');failed(checkPackage(f.root),/^Duplicate checksum path:/);
});
test('PACKAGE-06 missing or malformed manifests fail without import-time CLI side effects',t=>{
 const f=fixture(t);f.write('SHA256SUMS.txt','not a checksum\n');failed(checkPackage(f.root),/^Malformed checksum entry$/);
 fs.unlinkSync(path.join(f.root,'SHA256SUMS.txt'));failed(checkPackage(f.root),/^Package checksum manifest missing or unreadable$/);
});
test('PACKAGE-07 symlinked directories are rejected rather than followed or exempted',t=>{
 const f=fixture(t),outside=fs.mkdtempSync(path.join(os.tmpdir(),'vexa-package-outside-'));t.after(()=>fs.rmSync(outside,{recursive:true,force:true}));
 fs.writeFileSync(path.join(outside,'private.txt'),'never read');
 try{fs.symlinkSync(outside,path.join(f.root,'linked'),process.platform==='win32'?'junction':'dir');}
 catch(error){if(error.code==='EPERM'||error.code==='EACCES'){t.skip('Symlink creation is unavailable in this environment');return;}throw error;}
 failed(checkPackage(f.root),/^Symlink refused: linked$/);
 fs.renameSync(path.join(f.root,'linked'),path.join(f.root,'runtime'));failed(checkPackage(f.root),/^Symlink refused: runtime$/);
});
