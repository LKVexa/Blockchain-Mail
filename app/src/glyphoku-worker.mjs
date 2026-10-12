import {parentPort,workerData} from 'node:worker_threads';
import {installGuard} from './guard.mjs';
import {prepareBoard} from '../desk/modules/lib/glyphoku/deal.js';
import {PREPARATION,puzzlesRequired} from '../desk/modules/lib/glyphoku/rules.js';
import {hexDigest} from '../desk/modules/lib/glyphoku/registry.js';
installGuard();
try{
 const {g,seed,runId}=workerData,start=Date.now(),budget={deadline:start+PREPARATION.wallMs,nodeLimit:PREPARATION.nodeLimit,nodes:0},boards=[],seen=new Set();
 for(let n=0;n<puzzlesRequired(g);n++){
  let found=false;for(let retry=0;retry<8;retry++){const b=prepareBoard(g,(seed+n*104729+retry*7349)>>>0,budget),fingerprint=hexDigest(JSON.stringify(b.givens));if(seen.has(fingerprint))continue;seen.add(fingerprint);boards.push({...b,fingerprint});found=true;break;}
  if(!found)throw new Error('DUPLICATE_CHALLENGE');
 }
 parentPort.postMessage({ok:true,runId,boards,preparation_ms:Date.now()-start,work_nodes:budget.nodes});
}catch(e){parentPort.postMessage({ok:false,runId:workerData.runId,code:e.message,message:'Preparation refused; no easier board or raised cap was substituted.'});}
