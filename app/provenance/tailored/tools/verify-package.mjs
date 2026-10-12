#!/usr/bin/env node
/** Validate this immutable prompt package and, optionally, its original target.
 * No installs, subprocesses, network requests, source edits or mail actions occur.
 * Run from any working directory: node path/to/tools/verify-package.mjs
 */
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = realpathSync(resolve(dirname(fileURLToPath(import.meta.url)), '..'));
const report = { schema:'GLYPHOKU_PACKAGE_VALIDATION/1', node:process.version, package_valid:false, target_checked:false, target_valid:null, candidate_archive_checked:false, candidate_archive_valid:null, errors:[], checks:{} };
const fail = (text) => report.errors.push(text);
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
function safePath(base, name) {
  if (typeof name !== 'string' || !name || isAbsolute(name) || name.includes('\\') || name.includes(':') || name.split('/').some(x => !x || x === '.' || x === '..')) throw new Error(`Unsafe relative path: ${String(name)}`);
  const p=resolve(base,...name.split('/'));
  const r=relative(base,p);
  if (r==='..' || r.startsWith(`..${sep}`) || isAbsolute(r)) throw new Error(`Escaping path: ${name}`);
  // Reject a symlink in any existing path component, including parent directories.
  let cur=base;
  for (const part of name.split('/')) { cur=resolve(cur,part); if (existsSync(cur) && lstatSync(cur).isSymbolicLink()) throw new Error(`Symlink path: ${name}`); }
  return p;
}
function json(name) { return JSON.parse(readFileSync(safePath(root,name),'utf8')); }
function list(base, prefix='') {
  const out=[];
  for (const d of readdirSync(base,{withFileTypes:true})) {
    const name=prefix?`${prefix}/${d.name}`:d.name;
    if(d.isSymbolicLink()) { fail(`Unexpected symlink: ${name}`); continue; }
    if(d.isDirectory()) out.push(...list(resolve(base,d.name),name));
    else if(d.isFile()) out.push(name);
    else fail(`Unexpected nonregular member: ${name}`);
  }
  return out;
}
const args=process.argv.slice(2); let target=null,archive=null;
for(let i=0;i<args.length;i++) {
  if(args[i]==='--target' && args[i+1]) { target=args[++i]; }
  else if(args[i]==='--candidate-archive' && args[i+1]) { archive=args[++i]; }
  else { fail(`Unknown or incomplete argument: ${args[i]}`); }
}
try {
  const manifest=json('FILE_MANIFEST.json');
  if(manifest.schema!=='GLYPHOKU_PACKAGE_MANIFEST/1' || !Array.isArray(manifest.files)) throw new Error('Invalid package manifest');
  const names=new Set(), folded=new Set();
  for(const entry of manifest.files) {
    const p=safePath(root,entry.path);
    if(names.has(entry.path) || folded.has(entry.path.toLowerCase())) fail(`Duplicate/colliding manifest path: ${entry.path}`);
    names.add(entry.path); folded.add(entry.path.toLowerCase());
    if(!existsSync(p) || !lstatSync(p).isFile()) { fail(`Missing regular file: ${entry.path}`); continue; }
    const bytes=readFileSync(p);
    if(bytes.length!==entry.bytes) fail(`Size mismatch: ${entry.path}`);
    if(hash(bytes)!==entry.sha256) fail(`Hash mismatch: ${entry.path}`);
  }
  const actual=list(root);
  const exempt=new Set(['FILE_MANIFEST.json','SHA256SUMS.txt']);
  for(const name of actual) if(!names.has(name) && !exempt.has(name)) fail(`Unlisted payload: ${name}`);
  const sums=readFileSync(safePath(root,'SHA256SUMS.txt'),'utf8').trim().split(/\r?\n/);
  const sumNames=new Set();
  for(const line of sums) {
    const m=line.match(/^([a-f0-9]{64})  (.+)$/);
    if(!m) { fail('Malformed SHA256SUMS line'); continue; }
    if(sumNames.has(m[2])) fail(`Duplicate checksum entry: ${m[2]}`); sumNames.add(m[2]);
    if(hash(readFileSync(safePath(root,m[2])))!==m[1]) fail(`Checksum-list mismatch: ${m[2]}`);
  }
  for(const name of [...names,'FILE_MANIFEST.json']) if(!sumNames.has(name)) fail(`Missing checksum-list entry: ${name}`);
  if(sumNames.size!==names.size+1) fail('Unexpected checksum-list coverage');
  let links=0;
  for(const name of actual.filter(x=>x.endsWith('.md'))) {
    const text=readFileSync(safePath(root,name),'utf8').replace(/```[\s\S]*?```/g,'').replace(/`[^`]*`/g,'');
    const pattern=/\[[^\]]*\]\(([^\s)]+)(?:\s+"[^"]*")?\)/g;
    for(const match of text.matchAll(pattern)) {
      let dest=match[1]; if(/^(?:[a-z][a-z0-9+.-]*:|#)/i.test(dest)) continue;
      dest=decodeURIComponent(dest.split('#')[0]); if(!dest) continue;
      const resolved=resolve(dirname(safePath(root,name)),dest);
      const rel=relative(root,resolved).split(sep).join('/');
      try { const safe=safePath(root,rel); if(!existsSync(safe)) fail(`Broken local link in ${name}: ${dest}`); } catch(e) { fail(e.message); }
      links++;
    }
  }
  const cases=json('registers/ACCEPTANCE_CASES.json');
  const workflows=json('registers/WORKFLOW_STATES.json');
  const findings=json('registers/FINDINGS.json');
  const summary=json('PACKAGE_SUMMARY.json');
  const binding=json('TARGET_BINDING.json');
  if(cases.length!==72 || new Set(cases.map(x=>x.id)).size!==72) fail('Acceptance-case count/identity mismatch');
  if(workflows.length!==9 || findings.length!==15) fail('Workflow/finding count mismatch');
  for(const w of workflows) {
    if(cases.filter(x=>x.workflow===w.id).length!==8) fail(`Case coverage mismatch: ${w.id}`);
    if(w.workflow_status!=='NOT_STARTED' || w.assessment!=='NOT_ASSESSED') fail(`Planning baseline state changed: ${w.id}`);
    const text=readFileSync(safePath(root,w.file),'utf8');
    for(const heading of ['## Master prompt for this workflow','## Do','## Pass','## Fail','## Evidence','## Stop, rollback and checkpoint']) if(!text.includes(heading)) fail(`Missing dossier section: ${w.id} ${heading}`);
    for(const c of cases.filter(x=>x.workflow===w.id)) if(!text.includes(c.id)) fail(`Dossier case reference absent: ${c.id}`);
  }
  for(const c of cases) if(c.status!=='NOT_RUN' || c.source_control_credit!==false) fail(`Acceptance plan presented as executed/source-certified: ${c.id}`);
  if(summary.source_controls_assessed!==0 || summary.candidate_application_modified!==false || summary.revised_workflows_executed!==0) fail('Scope/status boundary changed');
  const source=json('evidence/series_archive_manifest.json').members.filter(x=>!x.directory);
  for(const s of source) {
    const name=`source-series/${s.path.split('/').at(-1)}`;
    if(hash(readFileSync(safePath(root,name)))!==s.sha256) fail(`Original source copy changed: ${name}`);
  }
  if(source.length!==12) fail('Original source-series count mismatch');
  report.checks={payload_files:manifest.files.length,markdown_files:actual.filter(x=>x.endsWith('.md')).length,local_links:links,workflow_dossiers:workflows.length,acceptance_cases:cases.length,findings:findings.length,original_source_files:source.length};
  report.package_valid=report.errors.length===0;
  if(target) {
    report.target_checked=true; const before=report.errors.length;
    const base=realpathSync(resolve(target));
    if(!lstatSync(base).isDirectory()) throw new Error('Target is not a directory');
    for(const e of binding.target_files) {
      const p=safePath(base,e.path);
      if(!existsSync(p) || !lstatSync(p).isFile()) {fail(`Target missing: ${e.path}`);continue;}
      if(hash(readFileSync(p))!==e.sha256) fail(`Target differs from bound baseline: ${e.path}`);
    }
    report.target_valid=report.errors.length===before;
    report.checks.target_files=binding.target_files.length;
  }
  if(archive) {
    report.candidate_archive_checked=true;
    report.candidate_archive_valid=hash(readFileSync(resolve(archive)))===binding.candidate.sha256;
    if(!report.candidate_archive_valid) fail('Candidate archive SHA-256 differs from binding');
  }
} catch(error) { fail(error instanceof Error?error.message:String(error)); }
console.log(JSON.stringify(report,null,2));
process.exitCode=report.errors.length?1:0;
