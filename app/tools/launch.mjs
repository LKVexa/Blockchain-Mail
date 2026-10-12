import {spawn} from 'node:child_process';
import path from 'node:path';
import {constants as osConstants} from 'node:os';
import {fileURLToPath} from 'node:url';

const root=path.resolve(import.meta.dirname,'..');
export function childIsRunning(child){return !!child&&child.exitCode===null&&child.signalCode===null}
export function childExitStatus(code,signal){return signal?128+(osConstants.signals[signal]??1):(code??1)}
export function serveArguments(args){return args[0]?.toLowerCase()==='serve'?args.slice(1):args}

export function launch(args=process.argv.slice(2)){
 const child=spawn(process.execPath,[path.join(root,'src/main.mjs'),'serve',...serveArguments(args)],{cwd:root,stdio:['inherit','pipe','inherit'],windowsHide:true});
 let opened=false,buffer='';
 child.stdout.on('data',bytes=>{
  process.stdout.write(bytes);buffer=(buffer+bytes.toString()).slice(-12000);
  const match=/Web: (http:\/\/127\.0\.0\.1:\d+)/.exec(buffer);
  if(match&&!opened){
   opened=true;
   if(process.platform==='win32'&&process.env.VEXA127_OPEN_BROWSER!=='0'){
    const browser=spawn('rundll32.exe',['url.dll,FileProtocolHandler',match[1]],{windowsHide:true,stdio:'ignore'});
    browser.on('error',()=>console.error('Browser could not be opened automatically. Open the printed local URL manually.'));
   }
  }
 });
 const handlers=new Map();
 for(const signal of ['SIGINT','SIGTERM']){const handler=()=>{if(childIsRunning(child))child.kill(signal)};handlers.set(signal,handler);process.once(signal,handler)}
 const cleanup=()=>{for(const [signal,handler] of handlers)process.removeListener(signal,handler)};
 child.once('error',error=>{cleanup();console.error(error.message);process.exitCode=1});
 child.once('exit',(code,signal)=>{cleanup();process.exitCode=childExitStatus(code,signal)});
 return child;
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))launch();
