// Evaluates the exact product's read-only readiness expression with inert DOM doubles.
// No browser, WPF window, native presenter, network request or application key is used.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const root=path.resolve(process.argv[2]??path.join(import.meta.dirname,'..'));
const evidence=path.resolve(process.argv[3]??path.join(root,'..','..','verification','console-readiness-verification.json'));
const bridgePath=path.join(root,'host','LiveWebBridge.cs');
const bridge=fs.readFileSync(bridgePath,'utf8');
const expression=/const string rendered = "([^"]+)";/.exec(bridge)?.[1];
assert.ok(expression,'Exact product readiness expression must exist');
const script=new vm.Script(expression,{filename:'actual-console-readiness-expression.js'});
const checks=[];
const hash=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const sourcePins=[{path:'host/LiveWebBridge.cs',sha256:hash(bridgePath)},{path:'tools/Test-ConsoleReadiness.mjs',sha256:hash(import.meta.filename)}];
const element=(name='DIV',options={})=>({nodeType:1,nodeName:name,hidden:!!options.hidden,classList:{contains:value=>options.className===value},closest:()=>options.excluded?{}:null,getClientRects:()=>options.visible===false?[]:[{}],visibility:options.visibility??'visible'});
const text=(value='Ready',parent=element())=>({nodeType:3,nodeValue:value,parentElement:parent});
function evaluate(options={}){
 const mailbox=['/mail/','/internet/'].includes(options.route);
 const ids={root:{firstElementChild:element('MAIN',{className:'desk-shell'})},...(mailbox?{'login-form':{onsubmit:()=>{}},login:element(),shell:element('DIV',{hidden:true})}:{}),...options.ids};
 let visits=0;
 const nodes=options.nodes??[text()];
 const context={window:{workspaceAccess:()=>{},...options.window},location:{pathname:options.route??'/'},NodeFilter:{SHOW_ALL:0xFFFFFFFF},getComputedStyle:e=>({visibility:e.visibility}),document:{readyState:options.state??'complete',body:options.body===false?null:element(),getElementById:id=>ids[id]??null,createTreeWalker:(surface,filter)=>{assert.ok(surface);assert.equal(filter,0xFFFFFFFF);let index=0;return {nextNode(){visits++;return nodes[index++]??null}}}}};
 const ready=script.runInNewContext(context,{timeout:1000});
 return {ready,visits};
}
function check(name,action){try{action();checks.push({name,passed:true})}catch(error){checks.push({name,passed:false,reason:error.message})}}
check('Loading document is not presentation readiness',()=>assert.equal(evaluate({state:'loading'}).ready,false));
check('Protected bootstrap must expose the actual workspace interface',()=>assert.equal(evaluate({window:{workspaceAccess:undefined}}).ready,false));
check('Visible error text without mounted application remains unavailable',()=>assert.equal(evaluate({ids:{root:null},nodes:[text('500 server error')]}).ready,false));
check('Unhydrated empty root remains unavailable',()=>assert.equal(evaluate({ids:{root:{firstElementChild:null}}}).ready,false));
check('A placeholder element is not the mounted desk',()=>assert.equal(evaluate({ids:{root:{firstElementChild:element()}}}).ready,false));
check('Mounted protected desk with rendered text is available',()=>assert.equal(evaluate().ready,true));
check('Actual desk index route uses the same mount contract',()=>assert.equal(evaluate({route:'/desk/index.html'}).ready,true));
check('Unified root mailbox login with an installed handler is available',()=>assert.equal(evaluate({ids:{root:null,'login-form':{onsubmit:()=>{}},login:element(),shell:element('DIV',{hidden:true})}}).ready,true));
check('Unified root cannot bypass a missing mailbox handler through a legacy desk mount',()=>assert.equal(evaluate({ids:{'login-form':{onsubmit:null},login:element(),shell:element('DIV',{hidden:true})}}).ready,false));
check('Unified authenticated root mailbox shell remains available',()=>assert.equal(evaluate({ids:{root:null,'login-form':{onsubmit:()=>{}},login:element('DIV',{hidden:true}),shell:element()}}).ready,true));
check('Unified root with both mailbox surfaces hidden remains unavailable',()=>assert.equal(evaluate({ids:{'login-form':{onsubmit:()=>{}},login:element('DIV',{hidden:true}),shell:element('DIV',{hidden:true})}}).ready,false));
check('Saved desk URL opens the unified mailbox login',()=>assert.equal(evaluate({route:'/desk/index.html',ids:{root:null,'login-form':{onsubmit:()=>{}},login:element(),shell:element('DIV',{hidden:true})}}).ready,true));
check('Saved desk URL authenticated unified mailbox shell remains ready',()=>assert.equal(evaluate({route:'/desk/index.html',ids:{root:null,'login-form':{onsubmit:()=>{}},login:element('DIV',{hidden:true}),shell:element()}}).ready,true));
check('Saved desk URL cannot bypass an uninitialized mailbox handler',()=>assert.equal(evaluate({route:'/desk/index.html',ids:{'login-form':{onsubmit:null},login:element(),shell:element('DIV',{hidden:true})}}).ready,false));
check('Static mailbox login HTML without installed JS handler is unavailable',()=>assert.equal(evaluate({route:'/mail/',ids:{'login-form':{onsubmit:null}}}).ready,false));
check('Mounted mailbox login with handler is available',()=>assert.equal(evaluate({route:'/mail/'}).ready,true));
check('Authenticated mailbox shell remains available when login is hidden',()=>assert.equal(evaluate({route:'/mail/',ids:{login:element('DIV',{hidden:true}),shell:element()}}).ready,true));
check('Hidden mailbox shell and login are not ready',()=>assert.equal(evaluate({route:'/mail/',ids:{login:element('DIV',{hidden:true}),shell:element('DIV',{hidden:true})}}).ready,false));
check('Internet compatibility route uses the unified mailbox readiness contract',()=>assert.equal(evaluate({route:'/internet/'}).ready,true));
check('Unlock or error text alone cannot substitute for the app mount',()=>assert.equal(evaluate({ids:{root:null},nodes:[text('Unlock this workspace')]}).ready,false));
check('Every visited DOM node counts toward the512node cap',()=>{const result=evaluate({nodes:[...Array.from({length:512},()=>element()),text('Must not be reached')]});assert.equal(result.ready,false);assert.equal(result.visits,512)});
check('Script/noscript/hidden text does not count as visible application content',()=>assert.equal(evaluate({nodes:[text('Enable JavaScript',element('NOSCRIPT',{excluded:true}))]}).ready,false));
check('Invisible nodes do not count as visible application content',()=>assert.equal(evaluate({nodes:[text('Ready',element('DIV',{visible:false})),text('Ready',element('DIV',{visibility:'hidden'}))]}).ready,false));
check('Visible control can establish mounted-interface availability',()=>assert.equal(evaluate({nodes:[element('INPUT')]}).ready,true));
check('Only128control candidates are considered',()=>{const result=evaluate({nodes:[...Array.from({length:128},()=>element('INPUT',{visible:false})),element('BUTTON')]});assert.equal(result.ready,false)});
check('Text sample examines at most128characters per node',()=>assert.equal(evaluate({nodes:[text(' '.repeat(128)+'Must not be sampled')]}).ready,false));
check('Unsupported document routes cannot masquerade as workspace readiness',()=>assert.equal(evaluate({route:'/health'}).ready,false));
check('Pure probe evaluations do not mutate product sources',()=>{for(const pin of sourcePins)assert.equal(hash(path.join(root,pin.path)),pin.sha256)});
const failed=checks.filter(c=>!c.passed).length;
const record={schema:'CONSOLE-READINESS-TESTS/1',console_version:'1.0.2',createdUtc:new Date().toISOString(),status:failed?'FAIL':'PASS',scope:'EXACT_PRODUCT_JAVASCRIPT_WITH_INERT_DOM_DOUBLES_ONLY',total:checks.length,passed:checks.length-failed,failed,GUI_started:false,native_presenter_run:false,webview_constructed:false,backend_started:false,network_requests:false,live_render_acceptance:false,sourcePins,checks};
fs.writeFileSync(evidence,JSON.stringify(record,null,2)+'\n');
console.log(JSON.stringify({status:record.status,total:record.total,passed:record.passed,failed:record.failed,scope:record.scope}));
if(failed){for(const item of checks.filter(c=>!c.passed))console.error(item.name+': '+item.reason);process.exitCode=1}
