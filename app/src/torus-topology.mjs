/** Validated topology from the supplied TORUS authoring inputs.
 * Their local demo policy stays a reference; authenticated network mail is a
 * separate, explicit adapter, not execution of the original demo or JA compiler.
 */
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {hash} from './crypto.mjs';
import {demand} from './policy.mjs';

const ROOT=path.resolve(import.meta.dirname,'../provenance/torus-ramws');
const PINNED=Object.freeze({
 'lctlc-reader.cjs':'e758e84c917d2781031031759e8f32e23cc16c7ce10360314b958449b9a6eb87',
 'jasp-reader.cjs':'08996981c124e04e2b55aefde6baaf15ce932184e266c113dfc2a6afd359bffa',
 'torus.lctlc':'f12b430232624da7193041ad9e6116d913b32e0c50bb92d4a200c97bfcf4a6a8',
 'torus_ramws.jasp':'53df3519bb52b26ddf14b4e1766d269694bce35b154549691281f79b69076452'
});
const texts={};
for(const [name,digest] of Object.entries(PINNED)){
 const file=path.join(ROOT,name),info=fs.lstatSync(file);demand(info.isFile()&&!info.isSymbolicLink()&&info.size<=16_384,'TORUS_SOURCE','Private topology reference is unavailable or oversized',503);
 const bytes=fs.readFileSync(file);demand(hash(bytes)===digest,'TORUS_SOURCE','Private topology reference differs from the supplied source',503);texts[name]=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
}
// Verify both standalone reader bytes before loading their code. Their only
// dependencies are Node builtins; neither imports a worker or network runtime.
const require=createRequire(import.meta.url),{parseLctlc}=require(path.join(ROOT,'lctlc-reader.cjs')),{parseJasp}=require(path.join(ROOT,'jasp-reader.cjs'));
export function parseTorusTopology(lctlc,jasp){
 demand(typeof lctlc==='string'&&Buffer.byteLength(lctlc)<=16_384&&typeof jasp==='string'&&Buffer.byteLength(jasp)<=16_384,'TORUS_SOURCE','Topology authoring inputs exceed the bounded source profile');
 const program=parseLctlc(lctlc),service=parseJasp(jasp);
 demand(program.nodes.length===9&&program.links.length===36&&service.service==='TorusRAMWS'&&service.transport==='ramws'&&service.scope==='local'&&service.assertions_executed===false,'TORUS_TOPOLOGY','The source must describe the supplied nine-node local reference torus');
 const nodes=Object.create(null),adjacency=Object.create(null),links=new Set();
 for(const node of program.nodes){demand(node.id==='n'+node.x+node.y&&node.x>=0&&node.x<3&&node.y>=0&&node.y<3&&node.class==='emulated_cpu'&&!nodes[node.id],'TORUS_TOPOLOGY','Invalid or duplicate torus node');nodes[node.id]=Object.freeze({node_id:node.id,x:node.x,y:node.y,prefix:'127.'+node.x+'.'+node.y+'.'});adjacency[node.id]=[];}
 for(const link of program.links){const edge=link.src+'>'+link.dst;demand(nodes[link.src]&&nodes[link.dst]&&link.src!==link.dst&&!links.has(edge)&&link.type==='classical'&&link.latency===0&&link.bandwidth===1_000_000,'TORUS_TOPOLOGY','Invalid or duplicate declared torus link');links.add(edge);adjacency[link.src].push(link.dst);}
 for(const node of Object.values(nodes)){
  const {x,y}=node,expected=['n'+((x+1)%3)+y,'n'+((x+2)%3)+y,'n'+x+((y+1)%3),'n'+x+((y+2)%3)].sort(),actual=adjacency[node.node_id].sort();
  demand(actual.length===4&&actual.join(',')===expected.join(','),'TORUS_TOPOLOGY','Declared links do not match the complete three-by-three wrap torus');Object.freeze(actual);
 }
 return Object.freeze({nodes:Object.freeze(nodes),adjacency:Object.freeze(adjacency),node_count:9,directed_links:36,
  lctlc_sha256:program.source_sha256,jasp_sha256:service.source_sha256,
  scope:'Supplied NODE/LINK topology and local JA reference ABI; network mail uses its separate authenticated adapter.',
  source_assertions_executed:false,general_compiler_executed:false,authored_messages_executed:false});
}
export const TORUS_TOPOLOGY=parseTorusTopology(texts['torus.lctlc'],texts['torus_ramws.jasp']);
export function nodeCoordinates(nodeId){const node=TORUS_TOPOLOGY.nodes[nodeId];demand(node,'TORUS_COORDINATE','Choose a computer slot declared by the private topology');return {...node};}
export function torusNeighbors(nodeId){nodeCoordinates(nodeId);return [...TORUS_TOPOLOGY.adjacency[nodeId]];}

// The original nine slots remain immutable. Expanded computers use a 4096 by
// 4096 wrap grid, encoding all 24 host bits without requiring 16 million live
// directory records. Coordinator links keep sparse registrations connected.
// Neither these virtual coordinates nor mailbox identifiers bind an IP socket.
export const TORUS_EXPANDED_CAPACITY=Object.freeze({host_count:256**3,identifier_digits:32,identifiers_per_host:(10n**32n-1n).toString(),domain_count:(BigInt(256**3)*(10n**32n-1n)).toString(),computers:256,grid_width:4096});
export function expandedNodeCoordinates(value){
 if(value==='n00')return {node_id:'n00',x:0,y:0,prefix:'127.0.0.1:'};
 let index;if(Number.isInteger(value))index=value;else if(typeof value==='string'&&/^v[a-f0-9]{6}$/.test(value))index=parseInt(value.slice(1),16);
 demand(Number.isInteger(index)&&index>=0&&index<256**3&&index!==1,'TORUS_COORDINATE','Choose an available virtual computer address');
 const node_id='v'+index.toString(16).padStart(6,'0'),host='127.'+[(index>>>16)&255,(index>>>8)&255,index&255].join('.');
 return {node_id,x:Math.floor(index/4096),y:index%4096,prefix:host+':'};
}
export function torusDirectoryNeighbors(directory,nodeId){
 const card=directory.nodes.find(node=>node.node_id===nodeId);demand(card,'TORUS_COORDINATE','Computer is not admitted to the signed directory');
 const expanded=node=>node.version===2;
 const adjacent=other=>{
  if(other.node_id===nodeId)return false;
  if(!expanded(card)&&!expanded(other))return TORUS_TOPOLOGY.adjacency[nodeId]?.includes(other.node_id)??false;
  if(card.node_id==='n00'||other.node_id==='n00'){const peer=card.node_id==='n00'?other:card;return expanded(peer)||TORUS_TOPOLOGY.adjacency.n00.includes(peer.node_id);}
  if(!expanded(card)||!expanded(other))return false;
  return card.x===other.x&&((card.y+1)%4096===other.y||(card.y+4095)%4096===other.y)||card.y===other.y&&((card.x+1)%4096===other.x||(card.x+4095)%4096===other.x);
 };
 return directory.nodes.filter(adjacent).map(node=>node.node_id).toSorted();
}
