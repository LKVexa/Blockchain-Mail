import {createSolver} from './solver.ts';
import {dealGivens,PLAYED,eventPolicy,PREPARATION,spendWork,type DealBudget,analyzeSolutions} from './rules.ts';
/** Preparation can score hidden runs for selection, but returns givens and metrics, NEVER a solution/trace. */
export function prepareBoard(g:number,seed:number,shared?:DealBudget){
 const start=Date.now(),budget=shared??{deadline:start+PREPARATION.wallMs,nodeLimit:PREPARATION.nodeLimit,nodes:0},policy=eventPolicy(g);
 let refused=0;
 for(let attempt=0;attempt<PREPARATION.attempts;attempt++){
  spendWork(budget);let givens:number[];
  try{givens=dealGivens(g,(seed+attempt*97)>>>0,PLAYED,budget);}catch(e){if((e as Error).message==='PREPARATION_BUDGET_EXCEEDED')throw e;refused++;continue;}
  const solver=createSolver(givens,PLAYED);let events=0,guesses=0,retractions=0,solved=false;
  while(events<policy.cap){spendWork(budget);const ev=solver.step();if(!ev)break;events++;if(ev.type==='GUESS')guesses++;if(ev.type==='RETRACT')retractions++;if(ev.type==='SEARCH_SOLVED'){solved=true;break;}if(ev.type==='SEARCH_EXHAUSTED')break;}
  if(solved&&guesses>=policy.minGuesses&&retractions>=policy.minRetractions){
   const unique=analyzeSolutions(givens,PLAYED,{nodeLimit:PREPARATION.uniquenessNodes,deadline:budget.deadline,consume:n=>spendWork(budget,n)});
   if(unique.status!=='COMPLETE_ONE'){refused++;continue;}
   return {givens,selection:{events,guesses,retractions,attempts:attempt+1,refused,preparation_ms:Date.now()-start,work_nodes:budget.nodes},uniqueness:unique};
  }
  refused++;
 }
 throw new Error('PREPARATION_NO_ELIGIBLE_BOARD');
}
export function dealPlayable(g:number,seed:number):number[]{return prepareBoard(g,seed).givens;}
