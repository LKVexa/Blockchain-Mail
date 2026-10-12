import {PLAYED,validateGivens,verifyCandidate,inBand,eventPolicy,type Topology} from './rules.ts';
import {replayBoard,createSolver,type SolveEvent} from './solver.ts';
import {hexDigest,requireRule,stableObject} from './registry.ts';
export function validateEventBudget(g:number,count:number){const cap=eventPolicy(g).cap;requireRule(Number.isSafeInteger(count)&&count>0&&count<=cap,'EVENT_BUDGET_EXCEEDED','INIT and terminal events both count toward the inclusive cap.');}
export function verifyLiveTrace(g:number,givens:number[],candidate:number[],events:SolveEvent[],t:Topology=PLAYED){
 const v=verifyCandidate(givens,candidate,t);requireRule(v.ok,v.ok?'':v.code,v.ok?'':v.reason);requireRule(inBand(g,givens,t),'OUT_OF_BAND','Wrong empty-cell band.');validateEventBudget(g,events.length);
 requireRule(events[0]?.type==='INIT'&&events.at(-1)?.type==='SEARCH_SOLVED','TRACE_TERMINAL','Trace must begin with INIT and end with SEARCH_SOLVED.');
 const expected=createSolver(givens,PLAYED);for(let i=0;i<events.length;i++){const e=events[i]!;requireRule(e.seq===i+1,'TRACE_SEQUENCE','Trace sequence gap or duplicate.');requireRule(stableObject(expected.step())===stableObject(e),'TRACE_MUTATION','Event does not match deterministic live solver semantics.');if(e.cell!==null)requireRule(givens[e.cell]===0,'GIVEN_CHANGED','Trace touched a given.');}
 requireRule(expected.step()===null,'TRACE_TERMINAL','Trace ended before the solver.');requireRule(JSON.stringify(replayBoard(givens,events))===JSON.stringify(candidate),'TRACE_CANDIDATE','Trace and candidate differ.');
 const guesses=events.filter(e=>e.type==='GUESS').length,retractions=events.filter(e=>e.type==='RETRACT').length,p=eventPolicy(g);requireRule(guesses>=p.minGuesses&&retractions>=p.minRetractions,'TRACE_POLICY','Required search/retraction characteristics not met.');
 return {event_count:events.length,guesses,retractions,traceDigest:hexDigest(stableObject(events)),candidateDigest:hexDigest(JSON.stringify(candidate))};
}
