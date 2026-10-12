/** Locked Glyphoku 16x16 policy. Search uncertainty is never unique-completion evidence. */
export type Topology = {order:number;boxRows:number;boxCols:number};
export const PLAYED:Readonly<Topology> = Object.freeze({order:16,boxRows:4,boxCols:4});
export const HORIZON_G=2;
export const PREPARATION=Object.freeze({wallMs:45000,nodeLimit:25000000,attempts:64,uniquenessNodes:250000,fillNodes:100000});
export function topologyFor(_g:number):Topology{return PLAYED;}
export function cellCount(t:Topology):number{return t.order*t.order;}
export function exactTopology(t:Topology):boolean{return !!t&&t.order===16&&t.boxRows===4&&t.boxCols===4;}
export function puzzlesRequired(g:number):number{if(!Number.isInteger(g)||g<1||g>12)throw new Error('INVALID_ORDINAL');return 2**(g-1);}
export function issuanceAllowed(g:number):{ok:true;puzzles:number}|{ok:false;code:string;reason:string}{
 if(!Number.isInteger(g)||g<1)return {ok:false,code:'INVALID_ORDINAL',reason:'Ordinal must be a positive integer.'};
 if(g>HORIZON_G)return {ok:false,code:'ISSUANCE_PAUSED',reason:`Issuance is paused at g=${g}. Existing permits and mail remain usable; this profile stops after g=2.`};
 return {ok:true,puzzles:puzzlesRequired(g)};
}
export function scoreBand(g:number){if(g===1)return {low:124,high:132};if(g===2)return {low:133,high:140};throw new Error('ISSUANCE_PAUSED');}
export function eventPolicy(g:number){scoreBand(g);return {cap:g===1?12000:18000,minGuesses:g===1?8:12,minRetractions:g===1?0:1};}
export function boxOf(i:number,t:Topology=PLAYED){return Math.floor(Math.floor(i/t.order)/t.boxRows)*(t.order/t.boxCols)+Math.floor((i%t.order)/t.boxCols);}
export function validateGivens(g:readonly number[],t:Topology=PLAYED):{ok:true}|{ok:false;code:string;reason:string}{
 if(!exactTopology(t))return {ok:false,code:'INVALID_TOPOLOGY',reason:'Only the 16x16, 4x4-box profile is admitted.'};
 if(!Array.isArray(g)||g.length!==256)return {ok:false,code:'INVALID_GIVEN',reason:'Exactly 256 givens are required.'};
 const rows=new Uint32Array(16),cols=new Uint32Array(16),boxes=new Uint32Array(16);
 for(let i=0;i<256;i++){const v=g[i];if(!Number.isInteger(v)||v!<0||v!>16)return {ok:false,code:'INVALID_GIVEN',reason:'Given values must be integer indexes 0..16.'};if(!v)continue;
 const r=i>>4,c=i%16,b=boxOf(i),bit=1<<(v-1);if((rows[r]!|cols[c]!|boxes[b]!)&bit)return {ok:false,code:'INVALID_GIVEN',reason:'A given repeats in a row, column or box.'};rows[r]!|=bit;cols[c]!|=bit;boxes[b]!|=bit;}
 return {ok:true};
}
export function inBand(g:number,givens:readonly number[],t:Topology=PLAYED):boolean{if(!validateGivens(givens,t).ok)return false;const b=scoreBand(g),n=givens.filter(x=>x===0).length;return n>=b.low&&n<=b.high;}
export function verifyCandidate(givens:readonly number[],candidate:readonly number[],t:Topology=PLAYED):{ok:true}|{ok:false;code:string;reason:string}{
 const input=validateGivens(givens,t);if(!input.ok)return input;
 if(!Array.isArray(candidate)||candidate.length!==256)return {ok:false,code:'INVALID_CANDIDATE',reason:'Exactly 256 candidate cells are required.'};
 for(let i=0;i<256;i++){if(!Number.isInteger(candidate[i])||candidate[i]!<1||candidate[i]!>16)return {ok:false,code:'INVALID_CANDIDATE',reason:'Candidate values must be integer indexes 1..16.'};if(givens[i]!==0&&candidate[i]!==givens[i])return {ok:false,code:'GIVEN_CHANGED',reason:'A given was changed.'};}
 const check=validateGivens(candidate,t);return check.ok?check:{ok:false,code:'INVALID_CANDIDATE',reason:check.reason};
}
export function popcount(x:number){x>>>=0;x-=x>>>1&0x55555555;x=(x&0x33333333)+(x>>>2&0x33333333);return (((x+(x>>>4))&0x0f0f0f0f)*0x01010101)>>>24;}
export type SearchResult={status:'COMPLETE_ZERO'|'COMPLETE_ONE'|'AT_LEAST_TWO'|'INVALID_INPUT'|'BUDGET_EXHAUSTED';found:number;nodes:number;complete:boolean;reason?:string};
export type SearchBudget={nodeLimit?:number;deadline?:number;consume?:(n:number)=>void};
export function analyzeSolutions(givens:readonly number[],t:Topology=PLAYED,budget:SearchBudget={}):SearchResult{
 const valid=validateGivens(givens,t);if(!valid.ok)return {status:'INVALID_INPUT',found:0,nodes:0,complete:false,reason:valid.reason};
 const nodeLimit=budget.nodeLimit??250000,deadline=budget.deadline??Infinity;
 if(!Number.isSafeInteger(nodeLimit)||nodeLimit<0)return {status:'INVALID_INPUT',found:0,nodes:0,complete:false,reason:'Invalid node limit'};
 const rows=new Uint32Array(16),cols=new Uint32Array(16),boxes=new Uint32Array(16),empties:number[]=[];
 for(let i=0;i<256;i++){const v=givens[i]!;if(!v)empties.push(i);else{const bit=1<<(v-1);rows[i>>4]!|=bit;cols[i%16]!|=bit;boxes[boxOf(i)]!|=bit;}}
 let found=0,nodes=0,exhausted=false;
 function walk(cursor:number):void{
  if(exhausted||found>=2)return;
  if(nodes>=nodeLimit||Date.now()>deadline){exhausted=true;return;}nodes++;budget.consume?.(1);
  if(cursor===empties.length){found++;return;}
  let best=cursor,bestCount=17;
  for(let j=cursor;j<empties.length;j++){const i=empties[j]!,count=popcount(65535&~(rows[i>>4]!|cols[i%16]!|boxes[boxOf(i)]!));if(count<bestCount){best=j;bestCount=count;if(count<=1)break;}}
  if(bestCount===0)return;
  [empties[cursor],empties[best]]=[empties[best]!,empties[cursor]!];
  const i=empties[cursor]!,r=i>>4,c=i%16,b=boxOf(i);let mask=65535&~(rows[r]!|cols[c]!|boxes[b]!);
  while(mask&&!exhausted&&found<2){const bit=mask&-mask;mask^=bit;rows[r]!|=bit;cols[c]!|=bit;boxes[b]!|=bit;walk(cursor+1);rows[r]!^=bit;cols[c]!^=bit;boxes[b]!^=bit;}
  [empties[cursor],empties[best]]=[empties[best]!,empties[cursor]!];
 }
 walk(0);return {status:found>=2?'AT_LEAST_TWO':exhausted?'BUDGET_EXHAUSTED':found===1?'COMPLETE_ONE':'COMPLETE_ZERO',found,nodes,complete:!exhausted&&found<2};
}
/** Compatibility helper. Unknown/invalid is deliberately non-unique. */
export function countSolutions(g:readonly number[],t:Topology=PLAYED,_limit=2):number{const r=analyzeSolutions(g,t);return r.status==='COMPLETE_ONE'?1:r.status==='COMPLETE_ZERO'?0:2;}
export function seededRandom(seed:number){let s=seed>>>0||1;return()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s/4294967296;};}
export function shuffled<T>(a:readonly T[],rng:()=>number):T[]{const out=[...a];for(let i=out.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[out[i],out[j]]=[out[j]!,out[i]!];}return out;}
export type DealBudget={deadline:number;nodeLimit:number;nodes:number};
export function spendWork(b:DealBudget,n=1){b.nodes+=n;if(b.nodes>b.nodeLimit||Date.now()>b.deadline)throw new Error('PREPARATION_BUDGET_EXCEEDED');}
/** Randomized MRV full-grid construction; recursion and wall time are explicitly bounded. */
function fill(rng:()=>number,budget:DealBudget):number[]{
 const board=Array(256).fill(0),rows=new Uint32Array(16),cols=new Uint32Array(16),boxes=new Uint32Array(16);
 let fillNodes=0;function walk(left:number):boolean{spendWork(budget);if(++fillNodes>PREPARATION.fillNodes)throw new Error('PREPARATION_FILL_LIMIT');if(!left)return true;let best=-1,mask=0,min=17;
  for(let i=0;i<256;i++)if(!board[i]){const m=65535&~(rows[i>>4]!|cols[i%16]!|boxes[boxOf(i)]!),c=popcount(m);if(c<min){min=c;mask=m;best=i;if(c<=1)break;}}
  if(!min||best<0)return false;const bits:number[]=[];while(mask){const bit=mask&-mask;mask^=bit;bits.push(bit);}const r=best>>4,c=best%16,b=boxOf(best);
  for(const bit of shuffled(bits,rng)){board[best]=32-Math.clz32(bit);rows[r]!|=bit;cols[c]!|=bit;boxes[b]!|=bit;if(walk(left-1))return true;board[best]=0;rows[r]!^=bit;cols[c]!^=bit;boxes[b]!^=bit;}return false;
 }
 if(!walk(256))throw new Error('PREPARATION_NO_FILL');return board;
}
export function dealGivens(g:number,seed:number,t:Topology=PLAYED,shared?:DealBudget):number[]{
 if(!exactTopology(t))throw new Error('INVALID_TOPOLOGY');const band=scoreBand(g),rng=seededRandom(seed),budget=shared??{deadline:Date.now()+PREPARATION.wallMs,nodeLimit:PREPARATION.nodeLimit,nodes:0};
 const givens=fill(rng,budget);let empty=0;
 for(const i of shuffled(Array.from({length:256},(_,i)=>i),rng)){spendWork(budget);if(empty>=band.high)break;const v=givens[i]!;givens[i]=0;const r=analyzeSolutions(givens,PLAYED,{nodeLimit:PREPARATION.uniquenessNodes,deadline:budget.deadline,consume:n=>spendWork(budget,n)});if(r.status==='COMPLETE_ONE')empty++;else givens[i]=v;}
 if(empty<band.low)throw new Error('PREPARATION_NO_BAND');return givens;
}
