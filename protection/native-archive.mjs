/** Explicit native ZIP codec. No live-store export, extraction or format fallback. */
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
export const ENGINE_SHA256='17004f15b0689090169593ee0fc7268457a918c7c259483f0a7713d46d0ea5fe';
export const TUPLE_SHA256='4b0ff9c6d460d1dc8485015d38d95c03bf92cbad2666b771791a13dfb33de688';
export const MAX_ARCHIVE_BYTES=256*1024*1024;
export const MAX_PROTECT_INPUT_BYTES=MAX_ARCHIVE_BYTES-4194304;
export const MAX_ADAPTER_OUTPUT_BYTES=8192;
const nativeRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../native');
const vettedRuntimes=new WeakSet();
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
function demand(value){if(!value)throw Error('Native archive protocol refused')}
function ownKeys(record,expected){return record&&Object.getPrototypeOf(record)===Object.prototype&&Object.keys(record).sort().join(',')===expected.sort().join(',')}

export function checkedNativePath(file,isDirectory=false){
 demand(typeof file==='string'&&/^[A-Za-z]:\\/.test(file)&&file.length<=259&&!/[\/\0-\x1f\x7f\uD800-\uDFFF]/.test(file)&&!file.slice(2).includes(':'));
 const absolute=path.resolve(file);demand(absolute.toLowerCase()===file.toLowerCase());
 let cursor=path.parse(absolute).root;const remainder=absolute.slice(cursor.length),parts=remainder?remainder.split(path.sep):[];demand(parts.length<=64);
 for(const part of parts){
  demand(part&&part!=='.'&&part!=='..'&&!/[<>:"|?*]|[. ]$/.test(part)&&!/^(?:CON|PRN|AUX|NUL|CONIN\$|CONOUT\$|COM[0-9\u00b9\u00b2\u00b3]|LPT[0-9\u00b9\u00b2\u00b3])(?:\.|$)/i.test(part));
  const parent=fs.lstatSync(cursor);demand(parent.isDirectory()&&!parent.isSymbolicLink());
  // Streaming actual-name enumeration rejects short-name aliases without a
  // realpath handle call that AppContainer can forbid. Never fall back to an
  // unchecked path on permission, ambiguity, listing or reparse failure.
  const listing=fs.opendirSync(cursor);let match,count=0;
  try{let entry;while((entry=listing.readSync())!==null){demand(++count<=16384);if(entry.name.toLowerCase()===part.toLowerCase()){demand(match===undefined);match=entry.name}}}finally{listing.closeSync()}
  demand(match!==undefined);cursor=path.join(cursor,match);demand(!fs.lstatSync(cursor).isSymbolicLink());
 }
 const stat=fs.lstatSync(cursor);demand(isDirectory?stat.isDirectory():stat.isFile());return{path:cursor,stat};
}
function readPinned(file,digest,bytes){const checked=checkedNativePath(file);demand(checked.stat.size===bytes&&sha(fs.readFileSync(checked.path))===digest);return checked.path}

/** Called before reading recovery input. Pin record is itself part of the
 * integrated launch manifest, checked by the utility before importing code. */
export function preflightNativeRuntime(root=nativeRoot){
 const directory=checkedNativePath(root,true).path,pinPath=path.join(directory,'NATIVE_ADAPTER_BUILD.json'),stat=fs.lstatSync(pinPath);demand(stat.isFile()&&!stat.isSymbolicLink()&&stat.size<8192);
 const record=JSON.parse(fs.readFileSync(pinPath,'utf8').replace(/^\uFEFF/,''));
 demand(ownKeys(record,['schema','adapter','source','engine','tuple','architecture','framework'])&&record.schema==='WORKSPACE-NATIVE-ADAPTER/1'&&record.architecture==='x64'&&record.framework==='NET_FRAMEWORK_4_8');
 for(const [field,file]of[['adapter','NativeCipherAdapter.exe'],['source','NativeCipherAdapter.cs'],['engine','engine/portal-cypher-windows-amd64.exe'],['tuple','engine/r12_tuple.json']]){
  demand(ownKeys(record[field],['path','sha256','bytes'])&&record[field].path===file&&/^[a-f0-9]{64}$/.test(record[field].sha256)&&Number.isSafeInteger(record[field].bytes)&&record[field].bytes>0&&record[field].bytes<4*1024*1024);
  readPinned(path.join(directory,...file.split('/')),record[field].sha256,record[field].bytes);
 }
 demand(record.engine.sha256===ENGINE_SHA256&&record.engine.bytes===2542080&&record.tuple.sha256===TUPLE_SHA256&&record.tuple.bytes===284);
 const runtime=Object.freeze({adapter:path.join(directory,'NativeCipherAdapter.exe'),assets:path.join(directory,'engine'),record});vettedRuntimes.add(runtime);return runtime;
}

export function parseNativeCompletion(text,action,output){
 demand(typeof text==='string'&&Buffer.byteLength(text)<=MAX_ADAPTER_OUTPUT_BYTES&&['protect','open'].includes(action));
 const record=JSON.parse(text);demand(ownKeys(record,['event','protocol','action','output','bytes','sha256','inputSha256','nativeEngineSha256'])&&record.event==='complete'&&record.protocol===1&&record.action===action&&typeof record.output==='string'&&record.output.toLowerCase()===output.toLowerCase()&&Number.isSafeInteger(record.bytes)&&record.bytes>0&&record.bytes<=(action==='protect'?MAX_ARCHIVE_BYTES:MAX_ARCHIVE_BYTES+4194304)&&/^[a-f0-9]{64}$/.test(record.sha256)&&/^[a-f0-9]{64}$/.test(record.inputSha256)&&record.nativeEngineSha256===ENGINE_SHA256);return record;
}

/** Bounded adapter protocol; native diagnostics remain inside the adapter. */
export function collectAdapter(child,action,output,timeout=115000){
 demand(Number.isSafeInteger(timeout)&&timeout>0&&timeout<=120000);
 return new Promise((resolve,reject)=>{
  let total=0,stdout=[],failure,closed=false,settled=false,cleanupTimer;
  function release(){clearTimeout(timer);clearTimeout(cleanupTimer);process.removeListener('exit',exitCleanup);for(const bytes of stdout)bytes.fill(0);stdout=[]}
  function fail(){if(!failure)failure=Error('Native archive operation failed');try{child.kill()}catch{};if(!cleanupTimer){cleanupTimer=setTimeout(()=>{if(!settled){settled=true;release();reject(Error('Native archive operation failed'))}},2000);cleanupTimer.unref?.()}}
  const timer=setTimeout(fail,timeout);timer.unref?.();
  const exitCleanup=()=>{if(!closed)try{child.kill()}catch{}};process.once('exit',exitCleanup);
  for(const [stream,retain]of[[child.stdout,true],[child.stderr,false]])stream.on('data',chunk=>{total+=chunk.length;if(total>MAX_ADAPTER_OUTPUT_BYTES){fail();return}if(retain)stdout.push(Buffer.from(chunk))});
  child.on('error',fail);child.stdin.on('error',fail);
  child.on('close',(code,signal)=>{
   closed=true;if(settled)return;settled=true;
   try{demand(!failure&&code===0&&!signal);const record=parseNativeCompletion(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(stdout)),action,output);resolve(record)}catch{reject(Error('Native archive operation failed'))}finally{release()}
  });
 });
}

export async function operateNativeArchive(action,input,output,key,runtime=preflightNativeRuntime()){
 demand(process.platform==='win32'&&vettedRuntimes.has(runtime)&&['protect','open'].includes(action)&&Buffer.isBuffer(key)&&key.length===32&&key.some(b=>b!==0));
 const checked=checkedNativePath(input);demand(checked.stat.size>0&&checked.stat.size<=(action==='protect'?MAX_PROTECT_INPUT_BYTES:MAX_ARCHIVE_BYTES)&&path.extname(checked.path).toLowerCase()===(action==='protect'?'.zip':'.ja21pkg'));
 demand(typeof output==='string'&&path.isAbsolute(output)&&!output.startsWith('\\\\')&&!/[\0-\x1f\x7f]/.test(output));
 const parent=checkedNativePath(path.dirname(output),true).path,destination=path.join(parent,path.basename(output));demand(!fs.existsSync(destination)&&path.extname(destination).toLowerCase()===(action==='protect'?'.ja21pkg':'.zip'));
 const systemRoot=process.env.SystemRoot;demand(typeof systemRoot==='string'&&path.isAbsolute(systemRoot));
 const env={SystemRoot:systemRoot,WINDIR:systemRoot,PATH:path.join(systemRoot,'System32'),TEMP:parent,TMP:parent};
 const child=spawn(runtime.adapter,[action,checked.path,destination,runtime.assets,'110000'],{shell:false,windowsHide:true,cwd:parent,env,stdio:['pipe','pipe','pipe']});
 const completion=collectAdapter(child,action,destination);child.stdin.end(key);const record=await completion;
 const result=checkedNativePath(destination);demand(result.stat.size===record.bytes);
 const resultHash=createHash('sha256');let read=0;for await(const chunk of fs.createReadStream(destination,{highWaterMark:65536})){read+=chunk.length;demand(read<=MAX_ARCHIVE_BYTES+4194304);resultHash.update(chunk)}demand(read===record.bytes&&resultHash.digest('hex')===record.sha256);return record;
}
