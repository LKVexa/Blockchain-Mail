import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {childIsRunning,childExitStatus,serveArguments} from '../tools/launch.mjs';

const project=path.resolve(import.meta.dirname,'..');
function command(root,args){
 const env={...process.env,VEXA127_OPEN_BROWSER:'0'};
 for(const key of Object.keys(env))if(key.toUpperCase()==='PATH')delete env[key];
 env.PATH=path.dirname(process.execPath)+path.delimiter+(process.env.PATH??'');
 // All command/script names and arguments below are fixed test literals.
 return spawnSync(process.env.ComSpec??'cmd.exe',['/d','/c','tools\\dispatch.cmd',...args],{cwd:root,env,encoding:'utf8',timeout:10000});
}

test('LAUNCH-HARDEN-01 batch fallthrough preserves an invalid command failure', {skip:process.platform!=='win32'},()=>{
 const result=command(project,['definitely-invalid']);assert.equal(result.status,1,result.error?.message??result.stderr);assert.match(result.stderr,/FAILED \[ARGS\]/);
});

test('LAUNCH-HARDEN-02 serve launcher forwards options and preserves invalid port failure', {skip:process.platform!=='win32'},()=>{
 const result=command(project,['serve','--legacy-plain','1','--http-port','definitely-invalid']);assert.equal(result.status,1,result.error?.message??result.stderr);assert.match(result.stderr,/FAILED \[PORT\]/);
});

test('LAUNCH-HARDEN-03 each dispatcher branch preserves the selected child exit status', {skip:process.platform!=='win32'},t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'vexa-launcher-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 fs.mkdirSync(path.join(root,'tools'));fs.mkdirSync(path.join(root,'src'));fs.copyFileSync(path.join(project,'tools/dispatch.cmd'),path.join(root,'tools/dispatch.cmd'));
 fs.writeFileSync(path.join(root,'tools/preflight.mjs'),'process.exitCode=0;');
 for(const file of ['tools/launch.mjs','tools/run-tests.mjs','tools/demo.mjs','tools/backtest.mjs','tools/glyphoku-check.mjs','tools/check-package.mjs','src/main.mjs'])fs.writeFileSync(path.join(root,file),'process.exitCode=7;');
 for(const action of ['serve','test','demo','backtest','glyphoku','check','definitely-invalid']){const result=command(root,[action]);assert.equal(result.status,7,action+': '+(result.error?.message??result.stderr));}
 fs.writeFileSync(path.join(root,'tools/launch.mjs'),'process.exitCode=0;');assert.equal(command(root,['serve']).status,0);
 fs.writeFileSync(path.join(root,'tools/preflight.mjs'),'process.exitCode=7;');assert.equal(command(root,['serve']).status,2);
});

test('LAUNCH-HARDEN-04 signal exits stay unsuccessful and an exited child is never signalled again',()=>{
 assert(childIsRunning({exitCode:null,signalCode:null}));assert.equal(childIsRunning({exitCode:null,signalCode:'SIGTERM'}),false);assert.equal(childIsRunning({exitCode:0,signalCode:null}),false);
 assert.equal(childExitStatus(0,null),0);assert.equal(childExitStatus(7,null),7);assert.equal(childExitStatus(null,'SIGINT'),130);assert.equal(childExitStatus(null,'SIGTERM'),143);assert.notEqual(childExitStatus(null,'UNKNOWN_SIGNAL'),0);
});

test('LAUNCH-HARDEN-05 dispatch marker removal preserves direct and batch serve arguments',()=>{
 assert.deepEqual(serveArguments(['serve','--http-port','8788']),['--http-port','8788']);assert.deepEqual(serveArguments(['SERVE','--state','synthetic state']),['--state','synthetic state']);assert.deepEqual(serveArguments(['--http-port','8788']),['--http-port','8788']);
});
