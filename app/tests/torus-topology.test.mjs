import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {TORUS_TOPOLOGY,TORUS_EXPANDED_CAPACITY,nodeCoordinates,expandedNodeCoordinates,torusNeighbors,torusDirectoryNeighbors,parseTorusTopology} from '../src/torus-topology.mjs';
const lctlc=fs.readFileSync(new URL('../provenance/torus-ramws/torus.lctlc',import.meta.url),'utf8'),jasp=fs.readFileSync(new URL('../provenance/torus-ramws/torus_ramws.jasp',import.meta.url),'utf8');
test('TORUS-TOPOLOGY supplied source yields nine disjoint prefixes and 36 directed wrap links',()=>{
 assert.equal(TORUS_TOPOLOGY.node_count,9);assert.equal(TORUS_TOPOLOGY.directed_links,36);assert.equal(new Set(Object.values(TORUS_TOPOLOGY.nodes).map(node=>node.prefix)).size,9);
 assert.deepEqual(nodeCoordinates('n22'),{node_id:'n22',x:2,y:2,prefix:'127.2.2.'});assert.deepEqual(torusNeighbors('n00'),['n01','n02','n10','n20']);assert.deepEqual(torusNeighbors('n22'),['n02','n12','n20','n21']);
 const neighbors=torusNeighbors('n00');neighbors.length=0;assert.equal(torusNeighbors('n00').length,4);assert.throws(()=>nodeCoordinates('n33'));
});
test('TORUS-TOPOLOGY duplicate and altered link descriptors cannot silently change network routing',()=>{
 const duplicate=lctlc.replace('src=n00;dst=n20;','src=n00;dst=n10;');assert.throws(()=>parseTorusTopology(duplicate,jasp));const wrong=lctlc.replace('src=n00;dst=n20;','src=n00;dst=n22;');assert.throws(()=>parseTorusTopology(wrong,jasp));
});
test('TORUS-TOPOLOGY original local JA policy is validated as reference without claiming remote execution',()=>{
 assert.equal(TORUS_TOPOLOGY.source_assertions_executed,false);assert.equal(TORUS_TOPOLOGY.general_compiler_executed,false);assert.equal(TORUS_TOPOLOGY.authored_messages_executed,false);
 assert.throws(()=>parseTorusTopology(lctlc,jasp.replace('transport ramws local','transport ramws remote')));assert.throws(()=>parseTorusTopology(lctlc,jasp.replace('policy no_network','policy allow_network')));
});

test('TORUS-TOPOLOGY expanded stable grid and coordinator backbone retain links when more computers join',()=>{
 const card=node_id=>({...expandedNodeCoordinates(node_id),version:2}),root=card('n00'),left=card('v001fff'),right=card('v001000'),far=card('vffffff'),first={nodes:[root,left,right]},later={nodes:[root,left,right,far]};
 assert.equal(TORUS_EXPANDED_CAPACITY.host_count,16777216);assert.equal(TORUS_EXPANDED_CAPACITY.identifier_digits,32);assert.equal(TORUS_EXPANDED_CAPACITY.computers,256);assert.equal(expandedNodeCoordinates('vffffff').prefix,'127.255.255.255:');assert.equal(expandedNodeCoordinates('v000000').prefix,'127.0.0.0:');assert.throws(()=>expandedNodeCoordinates('v000001'));
 assert.deepEqual(torusDirectoryNeighbors(first,left.node_id),['n00','v001000']);assert.deepEqual(torusDirectoryNeighbors(later,left.node_id),['n00','v001000']);assert(torusDirectoryNeighbors(later,root.node_id).includes(far.node_id));assert(torusDirectoryNeighbors(later,far.node_id).includes('n00'));
 const mixed={nodes:[root,{...nodeCoordinates('n01'),version:1},{...nodeCoordinates('n11'),version:1},far]};assert.deepEqual(torusDirectoryNeighbors(mixed,'n00'),['n01','vffffff']);assert.deepEqual(torusDirectoryNeighbors(mixed,'n11'),['n01']);
});
