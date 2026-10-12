import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {THEME_KEY,savedTheme,preferredTheme,persistTheme,adjacentCell,DeskSession,canAcknowledgeFrame} from '../desk/modules/lib/glyphoku/client.js';
import {glyphText,glyphKind} from '../desk/modules/lib/glyphoku/glyphs.js';
import {eventPolicy,boxOf} from '../desk/modules/lib/glyphoku/rules.js';
import {freezeDraft,normalizeLabel} from '../desk/modules/lib/glyphoku/registry.js';

// Render the actual packaged component with inert hooks. This checks its element
// contracts, not browser paints, CSS layout or the live observation protocol.
function renderStudio(state=null,{denied=false,darkSystem=false,mail=[]}={}){
 const values=new Map(),writes=[],storage={getItem:key=>values.get(key)??null,setItem:(key,value)=>{writes.push(key);values.set(key,value);}},document={documentElement:{dataset:{}}};let slot=0;
 const window={matchMedia:()=>({matches:darkSystem})};Object.defineProperty(window,'localStorage',{get(){if(denied)throw Error('denied');return storage;}});
 const context=vm.createContext({window,document,console,React:{Fragment:'fragment',createElement:(type,props,...children)=>({type,props:props??{},children:children.flat(Infinity).filter(x=>x!==null&&x!==undefined&&x!==false)})},
  useState:initial=>{const current=slot++;return [current===1?!!state:current===2?state:current===20?mail:typeof initial==='function'?initial():initial,()=>{}];},useEffect:()=>{},useLayoutEffect:()=>{},useRef:initial=>({current:initial}),
  preferredTheme,savedTheme,persistTheme,adjacentCell,DeskSession,canAcknowledgeFrame,glyphText,glyphKind,eventPolicy,boxOf,freezeDraft,normalizeLabel,downloadJson:()=>{}});
 const source=fs.readFileSync(new URL('../desk/modules/components/glyphoku/studio.js',import.meta.url),'utf8').replace(/^import[^\n]*\n/gm,'').replace('export function GlyphokuStudio','function GlyphokuStudio');
 const tree=vm.runInContext(source+'\nGlyphokuStudio();',context),nodes=[];
 function visit(node){if(!node||typeof node!=='object')return;nodes.push(node);for(const child of node.children??[])visit(child);}visit(tree);
 return {nodes,writes,values,document};
}

test('WORKSPACE-01 shared appearance preference follows the system until an explicit valid choice',()=>{
 const values=new Map([['glyphoku-local-127','preserved legacy bytes']]),writes=[];
 const storage={getItem:key=>values.get(key)??null,setItem:(key,value)=>{writes.push(key);values.set(key,value);}};
 assert.equal(THEME_KEY,'workspace-theme');assert.equal(preferredTheme(storage,false),'light');assert.equal(preferredTheme(storage,true),'dark');
 assert(persistTheme(storage,'light'));assert.equal(preferredTheme(storage,true),'light');assert(persistTheme(storage,'dark'));assert.equal(preferredTheme(storage,false),'dark');
 assert.equal(persistTheme(storage,'invalid'),false);assert.equal(values.get('workspace-theme'),'dark');assert.equal(values.get('glyphoku-local-127'),'preserved legacy bytes');assert.deepEqual(writes,['workspace-theme','workspace-theme']);
 values.set('workspace-theme','unrecognized');assert.equal(savedTheme(storage),null);assert.equal(preferredTheme(storage,true),'dark');
});
test('WORKSPACE-02 denied or unavailable storage cannot prevent choosing an appearance',()=>{
 const denied={getItem(){throw Error('denied');},setItem(){throw Error('denied');}};
 assert.equal(savedTheme(denied),null);assert.equal(preferredTheme(denied,false),'light');assert.equal(preferredTheme(denied,true),'dark');assert.equal(persistTheme(denied,'dark'),false);assert.equal(persistTheme(undefined,'light'),false);
});
test('WORKSPACE-03 board keyboard navigation keeps the same column at vertical edges and supports row or board endpoints',()=>{
 assert.equal(adjacentCell(7,'ArrowUp'),7);assert.equal(adjacentCell(247,'ArrowDown'),247);assert.equal(adjacentCell(35,'ArrowUp'),19);assert.equal(adjacentCell(35,'ArrowDown'),51);
 assert.equal(adjacentCell(16,'ArrowLeft'),16);assert.equal(adjacentCell(31,'ArrowRight'),31);assert.equal(adjacentCell(20,'ArrowLeft'),19);assert.equal(adjacentCell(20,'ArrowRight'),21);
 assert.equal(adjacentCell(35,'Home'),32);assert.equal(adjacentCell(35,'End'),47);assert.equal(adjacentCell(35,'Home',true),0);assert.equal(adjacentCell(35,'End',true),255);assert.equal(adjacentCell(256,'Home'),null);assert.equal(adjacentCell(12,'Tab'),null);
});
test('WORKSPACE-04 neutral desk keeps visibility, lifecycle and accessible theme/board contracts',()=>{
 const source=fs.readFileSync(new URL('../src/components/glyphoku/studio.tsx',import.meta.url),'utf8'),css=fs.readFileSync(new URL('../desk/styles.css',import.meta.url),'utf8'),html=fs.readFileSync(new URL('../desk/index.html',import.meta.url),'utf8');
 assert.match(html,/<title>Local workspace<\/title>/);assert(!/Glyphoku|Vexa|Post Office/.test(html));assert(!/Georgia|font-serif|cipher-strip/.test(css));assert.equal(css,fs.readFileSync(new URL('../src/styles.css',import.meta.url),'utf8'));
 assert.match(source,/aria-pressed=\{theme==='dark'\}/);assert.match(source,/Switch to \$\{theme==='dark'\?'light':'dark'\} theme/);assert.match(source,/intersectionRatio>=0\.8/);assert.match(source,/canAcknowledgeFrame/);assert.match(source,/tabIndex=\{\(selected\?\?0\)===i\?0:-1\}/);assert.match(css,/calc\(100dvh - 180px\)/);
 for(const id of ['operator-token','connect','board','phase','create-domain','freeze','create-envelope','send-locally','permit-status','notice','inbox'])assert(source.includes('data-testid="'+id+'"'),id);
});
test('WORKSPACE-05 actual packaged login renders an explicit accessible theme control even when storage is denied',()=>{
 for(const denied of [false,true]){const f=renderStudio(null,{denied}),theme=f.nodes.find(n=>n.props['data-testid']==='theme-toggle');assert(theme);assert.equal(theme.type,'button');assert.equal(theme.props['aria-pressed'],false);assert.equal(theme.props['aria-label'],'Switch to dark theme');theme.props.onClick();assert.equal(f.document.documentElement.dataset.theme,'dark');assert.deepEqual(f.writes,denied?[]:['workspace-theme']);assert(f.nodes.some(n=>n.props['data-testid']==='operator-token'));}
});
test('WORKSPACE-06 actual packaged board has 256 cells, 16 semantic rows and one keyboard tab stop; send waits for preparation',()=>{
 const state={revision:0,instance_id:'a'.repeat(32),head:{header:{height:0}},instance:{g:1,mailboxes:[],permits:[]},operations:[],active:null},f=renderStudio(state);
 const cells=f.nodes.filter(n=>n.props.role==='gridcell');assert.equal(cells.length,256);assert.equal(f.nodes.filter(n=>n.props.role==='row').length,16);assert.equal(cells.filter(n=>n.props.tabIndex===0).length,1);assert.equal(cells[255].props['aria-rowindex'],16);assert.equal(cells[255].props['aria-colindex'],16);
 assert.equal(f.nodes.filter(n=>n.props['data-testid']==='send-locally').length,0);assert(f.nodes.some(n=>n.props['data-testid']==='create-domain'&&!n.props.disabled));
 const owner='owner@synthetic.glyphoku.localhost',draft={from:owner,to:[owner],bcc:[],subject:'Synthetic',body:'Fixture only.',digest:'b'.repeat(64)};
 state.instance={g:3,mailboxes:[{address:owner}],permits:[{state:'READY',draft}]};const ready=renderStudio(state);assert.equal(ready.nodes.find(n=>n.props['data-testid']==='permit-status').children[0],'Prepared, not sent');assert.equal(ready.nodes.filter(n=>n.props['data-testid']==='send-locally').length,1);assert.equal(ready.nodes.filter(n=>n.props['data-testid']==='create-domain').length,0);
});
test('WORKSPACE-07 Inbox navigation stays in the console and displays received messages without duplicate Sent rows',()=>{
 const owner='owner@127.0.0.2',state={revision:1,instance_id:'a'.repeat(32),head:{header:{height:1}},instance:{g:2,mailboxes:[{address:owner}],permits:[]},operations:[],active:null};
 const message={from:owner,to:[owner],subject:'Received note',body:'Synthetic only',message_id:'c'.repeat(32)},f=renderStudio(state,{mail:[{...message,id:'in',folder:'INBOX'},{...message,id:'sent',folder:'Sent',subject:'Sent copy'}]});
 const link=f.nodes.find(n=>n.props['data-testid']==='inbox-link');assert.equal(link.props.href,'#inbox');assert.equal(link.props.target,undefined);
 assert.equal(f.nodes.filter(n=>n.props.id==='inbox').length,1);assert.equal(f.nodes.find(n=>n.props['data-testid']==='mail-ledger-link').props.target,undefined);
 const articles=f.nodes.filter(n=>n.type==='article'&&n.props.className==='message');assert.equal(articles.length,1);assert.equal(articles[0].props.key,'in');
});
