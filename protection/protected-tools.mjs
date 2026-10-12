import fs from 'node:fs';import path from 'node:path';
import {deriveWordKey}from '../app/src/vault.mjs';
import {protectArchiveFile,openArchiveFile}from './archive.mjs';
import {openExport}from '../app/web/protected-export.mjs';
async function main(){
 const [action,input,output,...extra]=process.argv.slice(2);if(extra.length||!['archive-protect','archive-open','export-open'].includes(action)||!input||!output)throw Error('Choose an action, input file and a new output file');
 let parts=[],bytes=0,key;
 try{for await(const chunk of process.stdin){bytes+=chunk.length;if(bytes>4096)throw Error('Recovery input refused');parts.push(chunk)}if(!bytes)throw Error('Recovery input refused');const record=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(parts,bytes)));parts=[];if(record.version!==1||Object.keys(record).sort().join(',')!=='recovery,version')throw Error('Invalid recovery input');key=deriveWordKey(record.recovery);
  if(action==='archive-protect')await protectArchiveFile(input,output,key);
  else if(action==='archive-open')await openArchiveFile(input,output,key);
  else{
   const stat=fs.lstatSync(input);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>48*1024*1024)throw Error('Invalid export file');
   const master=await crypto.subtle.importKey('raw',key,'HKDF',false,['deriveKey']),opened=await openExport(master,JSON.parse(fs.readFileSync(input,'utf8')));
   fs.writeFileSync(output,opened.bytes,{flag:'wx',mode:0o600});opened.bytes.fill(0);
  }
  console.log(JSON.stringify({event:'complete',action,output:path.resolve(output)}));
 }finally{key?.fill(0);for(const part of parts)part.fill(0);process.stdin.destroy()}
}
main().catch(()=>{console.error('Protection operation failed. Check the recovery key, input file and new output path. No success claimed.');process.exitCode=1});
