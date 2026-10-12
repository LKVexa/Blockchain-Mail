import test from 'node:test';
import assert from 'node:assert/strict';
import {renderTorusSettings} from '../web/torus-settings.mjs';

function dom(){
 const createElement=tag=>({tag,children:[],attributes:{},textContent:'',value:'',hidden:false,disabled:false,selected:false,focused:false,append(...children){this.children.push(...children);},setAttribute(key,value){this.attributes[key]=value;},focus(){this.focused=true;},select(){this.selected=true;}});
 const container=createElement('section');
 const walk=(root=container)=>[root,...root.children.flatMap(child=>walk(child))];
 return {container,document:{createElement},all:()=>walk(),text:()=>walk().map(element=>element.textContent).join('\n'),button:label=>walk().find(element=>element.tag==='button'&&element.textContent===label),form:()=>walk().find(element=>element.tag==='form')};
}
function globals(view,clipboard){
 const oldDocument=Object.getOwnPropertyDescriptor(globalThis,'document'),oldNavigator=Object.getOwnPropertyDescriptor(globalThis,'navigator');
 Object.defineProperty(globalThis,'document',{configurable:true,value:view.document});Object.defineProperty(globalThis,'navigator',{configurable:true,value:{clipboard}});
 return ()=>{if(oldDocument)Object.defineProperty(globalThis,'document',oldDocument);else delete globalThis.document;if(oldNavigator)Object.defineProperty(globalThis,'navigator',oldNavigator);else delete globalThis.navigator;};
}
const rootStatus={configured:true,active:true,node_id:'n00',prefix:'127.0.0.',peers:[{node_id:'n00'}]};
const childStatus={...rootStatus,node_id:'n01',prefix:'127.0.1.',peers:[{node_id:'n00'},{node_id:'n01'}]};
const tick=()=>new Promise(resolve=>setImmediate(resolve));

test('TORUS-SETTINGS one-time computer connection uses a code without registration files or a mail mode selector',async()=>{
 const view=dom(),copied=[],restore=globals(view,{async writeText(value){copied.push(value);}}),requests=[],errors=[];let changes=0;
 try{
  await renderTorusSettings(view.container,{api:async(route,payload)=>{requests.push({route,payload});if(route==='/api/torus/status')return rootStatus;if(route==='/api/torus/connection-code')return {code:'workspace391:synthetic-private-connection'};throw Error('Unexpected route '+route);},me:{role:'operator'},isCurrent:()=>true,onChange:async()=>{changes++;},onError:error=>errors.push(error)});
  assert.match(view.text(),/Private mail is ready/);assert.match(view.text(),/Your mail stays in your own account/);assert.equal(view.all().some(element=>element.tag==='input'&&element.type==='file'),false);assert.equal(view.all().some(element=>element.tag==='select'),false);assert.doesNotMatch(view.text(),/JSON|Import|Export|Approve a computer|card/i);
  const share=view.button('Connect another computer');assert(share);await share.onclick();const shared=view.all().find(element=>element.tag==='textarea'&&element.readOnly);assert.equal(shared.value,'workspace391:synthetic-private-connection');assert.equal(shared.focused,true);assert.equal(changes,0,'making a code must not rerender and erase it');await view.button('Copy connection code').onclick();assert.deepEqual(copied,[shared.value]);assert.equal(changes,0);assert.equal(errors.length,0);assert.deepEqual(requests.map(request=>request.route),['/api/torus/status','/api/torus/connection-code']);
 }finally{restore();}
});

test('TORUS-SETTINGS pasted code connects once, trims whitespace and fences repeat submissions',async()=>{
 const view=dom(),restore=globals(view),requests=[],errors=[];let finish,changes=0;
 try{
  await renderTorusSettings(view.container,{api:async(route,payload)=>{requests.push({route,payload});if(route==='/api/torus/status')return rootStatus;if(route==='/api/torus/connect')return new Promise(resolve=>{finish=resolve;});throw Error('Unexpected route '+route);},me:{role:'operator'},isCurrent:()=>true,onChange:async()=>{changes++;},onError:error=>errors.push(error)});
  const form=view.form(),field=form.children.find(element=>element.tag==='textarea');assert.equal(field.maxLength,8192);field.value='  workspace391:synthetic-private-connection\n';const first=form.onsubmit({preventDefault(){}});await tick();assert.equal(field.disabled,true);await form.onsubmit({preventDefault(){}});assert.equal(requests.filter(request=>request.route==='/api/torus/connect').length,1);assert.deepEqual(requests.at(-1).payload,{code:'workspace391:synthetic-private-connection'});finish({active:true});await first;assert.equal(changes,1);assert.equal(field.value,'');assert.equal(field.disabled,false);assert.equal(errors.length,0);
 }finally{restore();}
});

test('TORUS-SETTINGS joined operator automatically refreshes the signed directory without another setup action',async()=>{
 const view=dom(),restore=globals(view),requests=[];let reads=0;
 try{
  await renderTorusSettings(view.container,{api:async route=>{requests.push(route);if(route==='/api/torus/status')return reads++?{...childStatus,peers:[...childStatus.peers,{node_id:'n02'}]}:childStatus;if(route==='/api/torus/sync')return {active:true};throw Error('Unexpected route '+route);},me:{role:'operator'},isCurrent:()=>true,onChange:async()=>{throw Error('Automatic refresh must not rerender the settings recursively');},onError:()=>{throw Error('Unexpected user-facing error');}});
  assert.deepEqual(requests,['/api/torus/status','/api/torus/sync','/api/torus/status']);assert.match(view.text(),/3 connected computers/);assert.equal(view.button('Connect another computer'),undefined);assert(view.button('Connect this computer'));
 }finally{restore();}
});

test('TORUS-SETTINGS directory refresh preserves saved connections while first computer is offline',async()=>{
 const view=dom(),restore=globals(view);
 try{
  await renderTorusSettings(view.container,{api:async route=>{if(route==='/api/torus/status')return childStatus;if(route==='/api/torus/sync')throw Error('Synthetic unavailable first computer');throw Error('Unexpected route');},me:{role:'operator'},isCurrent:()=>true,onChange:async()=>{},onError:()=>{throw Error('Background refresh must not trigger an error toast');}});
  assert.match(view.text(),/2 connected computers/);assert.match(view.text(),/saved connections are still available/);assert.match(view.text(),/Private mail is ready/);
 }finally{restore();}
});

test('TORUS-SETTINGS ordinary account sees only status and account-owned mailbox explanation',async()=>{
 const view=dom(),restore=globals(view),requests=[];
 try{
  await renderTorusSettings(view.container,{api:async route=>{requests.push(route);return childStatus;},me:{role:'user'},isCurrent:()=>true,onChange:async()=>{},onError:()=>{throw Error('Unexpected error');}});
  assert.deepEqual(requests,['/api/torus/status']);assert.match(view.text(),/Your Inbox and Sent history belong to your account/);assert.equal(view.all().some(element=>['form','button','textarea'].includes(element.tag)),false);
 }finally{restore();}
});

test('TORUS-SETTINGS late connection-code result cannot expose a code to a changed session',async()=>{
 const view=dom(),restore=globals(view);let current=true,finish,changes=0;
 try{
  await renderTorusSettings(view.container,{api:async route=>{if(route==='/api/torus/status')return rootStatus;if(route==='/api/torus/connection-code')return new Promise(resolve=>{finish=resolve;});throw Error('Unexpected route');},me:{role:'operator'},isCurrent:()=>current,onChange:async()=>{changes++;},onError:()=>{throw Error('Stale sessions must not report errors');}});
  const pending=view.button('Connect another computer').onclick();await tick();current=false;finish({code:'workspace391:late-session-code'});await pending;assert.equal(view.all().find(element=>element.tag==='textarea'&&element.readOnly).value,'');assert.equal(changes,0);
 }finally{restore();}
});

test('TORUS-SETTINGS clipboard refusal selects the code for manual copy without abandoning pairing',async()=>{
 const view=dom(),restore=globals(view,{async writeText(){throw Error('Clipboard unavailable');}});
 try{
  await renderTorusSettings(view.container,{api:async route=>route==='/api/torus/status'?rootStatus:{code:'workspace391:copy-with-keyboard'},me:{role:'operator'},isCurrent:()=>true,onChange:async()=>{throw Error('Copy must not erase the code');},onError:()=>{throw Error('Clipboard fallback must not report a pairing error');}});
  await view.button('Connect another computer').onclick();await view.button('Copy connection code').onclick();assert.equal(view.all().find(element=>element.tag==='textarea'&&element.readOnly).selected,true);assert.match(view.text(),/Copy the selected connection code/);
 }finally{restore();}
});
