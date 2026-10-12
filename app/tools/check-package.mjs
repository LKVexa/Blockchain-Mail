import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';

const MANIFEST='SHA256SUMS.txt';
const GENERATED=Object.freeze(['runtime','state','evidence/runs']);
const ignored=relative=>GENERATED.some(dir=>relative===dir||relative.startsWith(dir+'/'));
const portableKey=relative=>relative.toLowerCase();
function canonicalPath(relative){
 if(typeof relative!=='string'||relative.includes('\\')||/[\x00-\x1f\x7f<>:"|?*]/.test(relative))return false;
 const parts=relative.split('/');
 return parts.every(part=>part!==''&&part!=='.'&&part!=='..'&&part===part.trim()&&!/[. ]$/.test(part)&&! /^(?:con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(part));
}

/** Verify an exact portable file inventory. Generated runtime/state/evidence trees
 * are outside this package claim; arbitrary log, pid or secret suffixes are not exemptions. */
export function checkPackage(directory){
 const root=path.resolve(directory),errors=[],files=new Map(),names=new Map();let checked=0;
 const result=()=>({package_integrity:errors.length?'FAIL':'PASS',checked,inventory_files:files.size,errors,ignored_paths:GENERATED.map(dir=>dir+'/'),scope:'Exact packaged file inventory and SHA-256 integrity only. Generated trees are excluded. Checksums are not a publisher signature or a system-control approval.'});
 try{const stat=fs.lstatSync(root);if(stat.isSymbolicLink()||!stat.isDirectory()){errors.push('Package root must be a real directory');return result();}}
 catch{errors.push('Package directory missing or unreadable');return result();}
 function inventory(folder,relative=''){
  let entries;try{entries=fs.readdirSync(folder).sort();}catch{errors.push('Unreadable directory: '+(relative||'.'));return;}
  for(const name of entries){const rel=relative?relative+'/'+name:name,absolute=path.join(folder,name);let stat;
   if(!canonicalPath(rel)){errors.push('Unsafe inventory path: '+rel);continue;}
   try{stat=fs.lstatSync(absolute);}catch{errors.push('Unreadable inventory path: '+rel);continue;}
   if(stat.isSymbolicLink()){errors.push('Symlink refused: '+rel);continue;}
   if(ignored(rel)){if(!stat.isDirectory())errors.push('Generated path must be a directory: '+rel);continue;}
   if(stat.isDirectory()){inventory(absolute,rel);continue;}
   if(!stat.isFile()){errors.push('Nonregular file refused: '+rel);continue;}
   if(rel===MANIFEST)continue;
   const key=portableKey(rel);if(names.has(key)){errors.push('Ambiguous file paths: '+names.get(key)+' and '+rel);continue;}
   names.set(key,rel);files.set(rel,absolute);
  }
 }
 inventory(root);
 const manifest=path.join(root,MANIFEST);let text;
 try{const stat=fs.lstatSync(manifest);if(stat.isSymbolicLink()||!stat.isFile()){errors.push('Checksum manifest must be a regular file');return result();}text=fs.readFileSync(manifest,'utf8');}
 catch{errors.push('Package checksum manifest missing or unreadable');return result();}
 const lines=text.split(/\r?\n/);if(lines.at(-1)==='')lines.pop();
 if(!lines.length)errors.push('Empty checksum manifest');
 const listed=new Set(),listedNames=new Set();
 for(const line of lines){const entry=/^([a-f0-9]{64})  (.+)$/.exec(line);
  if(!entry){errors.push('Malformed checksum entry');continue;}
  const [,expected,relative]=entry;
  if(!canonicalPath(relative)||relative===MANIFEST||ignored(relative)){errors.push('Unsafe or excluded manifest path: '+relative);continue;}
  const key=portableKey(relative);if(listedNames.has(key)){errors.push('Duplicate checksum path: '+relative);continue;}listedNames.add(key);listed.add(relative);
  const absolute=files.get(relative);if(!absolute){errors.push('Missing: '+relative);continue;}
  let descriptor;
  try{
   const before=fs.lstatSync(absolute);if(before.isSymbolicLink()||!before.isFile())throw Error('Not a regular file');
   descriptor=fs.openSync(absolute,fs.constants.O_RDONLY|(fs.constants.O_NOFOLLOW??0));
   const opened=fs.fstatSync(descriptor);if(!opened.isFile()||opened.dev!==before.dev||opened.ino!==before.ino)throw Error('File changed while opening');
   const actual=createHash('sha256').update(fs.readFileSync(descriptor)).digest('hex');checked++;
   if(actual!==expected)errors.push('Changed: '+relative);
  }catch{errors.push('Unreadable or changed file: '+relative);}
  finally{if(descriptor!==undefined)fs.closeSync(descriptor);}
 }
 for(const relative of files.keys())if(!listed.has(relative))errors.push('Unlisted: '+relative);
 return result();
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const report=checkPackage(path.resolve(import.meta.dirname,'..'));
 console.log(JSON.stringify(report,null,2));process.exitCode=report.package_integrity==='PASS'?0:1;
}
