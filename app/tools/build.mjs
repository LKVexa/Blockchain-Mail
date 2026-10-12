import fs from 'node:fs';import path from 'node:path';import {createRequire} from 'node:module';
const ROOT=path.resolve(import.meta.dirname,'..'),require=createRequire(import.meta.url);
let ts;for(const p of [process.env.TYPESCRIPT_PATH,'typescript',path.resolve(path.dirname(process.execPath),'../lib/node_modules/typescript')].filter(Boolean)){try{ts=require(p);break}catch{}}
if(!ts)throw new Error('An existing TypeScript compiler is required for rebuilding. Packaged JavaScript runs without it; no automatic download.');
const files=[];for(const sub of ['src/lib/glyphoku','src/components/glyphoku']){for(const f of fs.readdirSync(path.join(ROOT,sub)))if(/\.tsx?$/.test(f)&&!f.endsWith('.test.ts'))files.push(sub+'/'+f);}
files.push('src/lib/sha256.ts');if(fs.existsSync(path.join(ROOT,'src/local.tsx')))files.push('src/local.tsx');
for(const f of files){const dst=f.replace(/^src\//,'desk/modules/').replace(/\.tsx?$/,'.js');let code=fs.readFileSync(path.join(ROOT,f),'utf8');
 code=code.replace(/from\s+(["'])([^"']+)\1/g,(_,q,spec)=>{let target=spec;if(spec==='react'||spec==='react-dom/client')target=path.relative(path.dirname(dst),'desk/vendor/react-runtime.js').replaceAll('\\','/');else if(spec.startsWith('@/'))target=path.relative(path.dirname(f),'src/'+spec.slice(2)).replaceAll('\\','/');if(!target.startsWith('.')&&!spec.startsWith('node:'))target='./'+target;if(!spec.startsWith('node:')&&spec!=='react'&&spec!=='react-dom/client')target=target.replace(/\.tsx?$/,'.js')+( /\.[a-z]+$/.test(target)?'':'.js');return `from ${q}${target}${q}`;});
 const result=ts.transpileModule(code,{fileName:f,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022,jsx:ts.JsxEmit.React,esModuleInterop:true,isolatedModules:true},reportDiagnostics:true});
 const errors=(result.diagnostics??[]).filter(d=>d.category===ts.DiagnosticCategory.Error);if(errors.length)throw new Error(ts.formatDiagnosticsWithColorAndContext(errors,{getCurrentDirectory:()=>ROOT,getCanonicalFileName:x=>x,getNewLine:()=> '\n'}));
 fs.mkdirSync(path.dirname(path.join(ROOT,dst)),{recursive:true});fs.writeFileSync(path.join(ROOT,dst),result.outputText);
}
console.log(JSON.stringify({compiler:ts.version,files:files.length,status:'TRANSPILED',scope:'Selected local entry and Glyphoku modules; not a hosted app build or a complete typecheck.'}));
