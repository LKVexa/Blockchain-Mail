import path from 'node:path';
import {deriveWordKey} from '../app/src/vault.mjs';
import {preflightNativeRuntime,operateNativeArchive}from './native-archive.mjs';
async function main(){
 const[action,input,output,...extra]=process.argv.slice(2);if(extra.length||!['native-protect','native-open'].includes(action)||!input||!output)throw Error('Choose explicit native archive action and filenames');
 const runtime=preflightNativeRuntime(); // before recovery input is consumed
 let parts=[],bytes=0,key;
 const timer=setTimeout(()=>process.stdin.destroy(Error('Recovery input deadline')),10000);timer.unref();
 try{
  for await(const chunk of process.stdin){bytes+=chunk.length;if(bytes>4096)throw Error('Recovery input refused');parts.push(chunk)}
  clearTimeout(timer);if(!bytes)throw Error('Recovery input refused');
  const raw=Buffer.concat(parts,bytes);let record;
  try{record=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw))}finally{raw.fill(0);for(const part of parts)part.fill(0);parts=[]}
  if(!record||Object.getPrototypeOf(record)!==Object.prototype||record.version!==1||Object.keys(record).sort().join(',')!=='recovery,version')throw Error('Invalid recovery input');
  key=deriveWordKey(record.recovery);record=null;
  await operateNativeArchive(action==='native-protect'?'protect':'open',input,output,key,runtime);
  console.log(JSON.stringify({event:'complete',action,output:path.resolve(output)}));
 }finally{clearTimeout(timer);key?.fill(0);for(const part of parts)part.fill(0);process.stdin.destroy()}
}
main().catch(()=>{console.error('Native archive operation failed. Check the four words, selected native format and new output filename. No success claimed.');process.exitCode=1});
