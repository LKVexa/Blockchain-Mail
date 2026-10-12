import test from 'node:test';
import assert from 'node:assert/strict';
import * as m from './eight-sphere-math.mjs';

const I5=Array.from({length:5},(_,i)=>Array.from({length:5},(_,j)=>+(i===j)));
const C4=I5.map(row=>row.slice(0,4)), C4plus=I5.slice(0,4);
const zero=[0,0,0,0,0], oneAxis=[1,0,0,0,0];
const Pi5=[[1,0,0,0,0],[0,1,0,0,0],[0,0,1,0,0]];
const Psi4=[[1,0,0,0],[0,1,0,0],[0,0,1,0]];
const copy=v=>structuredClone(v);
const near=(actual,expected,tol=1e-12)=>assert.ok(Math.abs(actual-expected)<=tol,`${actual} vs ${expected}`);
const throws=f=>assert.throws(f,/8S reference:/);
const phase=()=>({i:0,theta:[0,Math.PI/2],omega:3,Wrow:[0,2],Hslice:[[0,0],[0,0]],K2:4,K3:5});
const activation=()=>({M:2,q:0.5,beta:2,d:0.25,E:3,u:4,chi:0.25,zeta:0.5,aE:2,au:0.5,aChi:4,aZeta:6,J2:2,J3:3,p:[0,1],Wrow:[2,3],Hslice:[[1,2],[3,4]]});

test('8S01 exact attached shell KATs include origin and dimensions 1..5',()=>{
 assert.deepEqual([0,1,2,3,4,5].map(m.shellMultiplicity),[1n,10n,50n,170n,450n,1002n]);
 assert.deepEqual([0,1,2,3,4,5].map(m.latticeBallCount),[1n,11n,61n,231n,681n,1683n]);
});
test('8S02 shell and ball formula match independent small integer enumeration',()=>{
 for(let M=0;M<=4;M++){
  let ball=0n,shell=0n;
  for(let a=-M;a<=M;a++)for(let b=-M;b<=M;b++)for(let c=-M;c<=M;c++)for(let d=-M;d<=M;d++)for(let e=-M;e<=M;e++){
   const l1=Math.abs(a)+Math.abs(b)+Math.abs(c)+Math.abs(d)+Math.abs(e);
   if(l1<=M)ball++;if(l1===M)shell++;
  }
  assert.equal(m.shellMultiplicity(M),shell);assert.equal(m.latticeBallCount(M),ball);
 }
});
test('8S03 large shell counts retain exact BigInt arithmetic',()=>{
 const M=1000000,ball=m.latticeBallCount(M);
 assert.ok(ball>BigInt(Number.MAX_SAFE_INTEGER));
 assert.equal(ball-m.latticeBallCount(M-1),m.shellMultiplicity(M));
});
test('8S04 shell resource and integer domains fail closed',()=>{
 for(const v of [-1,1.5,1000001,Infinity,NaN,'2'])throws(()=>m.shellMultiplicity(v));
});
test('8S05 rational lattice site preserves reduced exact signed centers',()=>{
 assert.deepEqual(m.latticeSite({n:[-1,1,0,0,0],ell:{numerator:'2',denominator:'6'},M:2}),{
  n:[-1,1,0,0,0],c:[{numerator:-1n,denominator:3n},{numerator:1n,denominator:3n},...Array.from({length:3},()=>({numerator:0n,denominator:1n}))]
 });
});
test('8S06 L1 admission and cube clipping are independent domain checks',()=>{
 throws(()=>m.latticeSite({n:[1,1,1,0,0],ell:{numerator:1,denominator:2},M:2}));
 throws(()=>m.latticeSite({n:[2,0,0,0,0],ell:{numerator:1,denominator:1},M:2}));
 throws(()=>m.latticeSite({n:[0.5,0,0,0,0],ell:{numerator:1,denominator:2},M:2}));
});
test('8S07 lattice enumeration order and cube clipping use no float centers',()=>{
 const uncut=m.latticeSites({ell:{numerator:1,denominator:2},M:2});
 const cut=m.latticeSites({ell:{numerator:1,denominator:1},M:2});
 assert.equal(uncut.length,61);assert.equal(cut.length,51);
 assert.deepEqual(uncut[0].n,[-2,0,0,0,0]);assert.deepEqual(uncut.at(-1).n,[2,0,0,0,0]);
 assert.equal(new Set(uncut.map(x=>x.n.join(','))).size,uncut.length);
 assert.ok(Object.isFrozen(uncut)&&Object.isFrozen(uncut[0].c[0]));
 assert.ok(uncut.every(site=>site.n.every(value=>!Object.is(value,-0))));
});
test('8S08 enumeration and rational parsing bound memory and exactness',()=>{
 throws(()=>m.latticeSites({ell:{numerator:1,denominator:32},M:32}));
 throws(()=>m.latticeSites({ell:{numerator:1,denominator:2},M:33}));
 for(const ell of [{numerator:0,denominator:1},{numerator:1,denominator:0},{numerator:2,denominator:1},{numerator:'01',denominator:'2'},{numerator:1.5,denominator:2},{numerator:'1',denominator:'1'+'0'.repeat(79)}])
  throws(()=>m.latticeSites({ell,M:0}));
});
test('8S09 driver has supplied half-period, full-period and negative-time values',()=>{
 near(m.periodicDriver({tau:0,T:2}),0);near(m.periodicDriver({tau:1,T:2}),1);
 near(m.periodicDriver({tau:2,T:2}),0);near(m.periodicDriver({tau:-1,T:2}),1);
 throws(()=>m.periodicDriver({tau:1,T:0}));throws(()=>m.periodicDriver({tau:1e308,T:1e-308}));
});
test('8S10 C5 appends the explicit fifth column without mutation',()=>{
 const before=JSON.stringify(C4),out=m.coordinateExtension({C4,e:[1,2,3,4,5]});
 assert.deepEqual(out[4],[0,0,0,0,5]);assert.equal(JSON.stringify(C4),before);
 assert.ok(Object.isFrozen(out)&&Object.isFrozen(out[0]));
});
test('8S11 independent residual and regularized eta have analytic known answers',()=>{
 const outside=m.independenceScore({C4,C4plus,e:[0,0,0,0,2],epsilon:4,pseudoinverseTolerance:0});
 assert.deepEqual(outside.residual,[0,0,0,0,2]);assert.equal(outside.eta,0.5);
 assert.equal(m.independenceScore({C4,C4plus,e:[2,0,0,0,0],epsilon:0,pseudoinverseTolerance:0}).eta,0);
});
test('8S12 supplied pseudoinverse accepts rank deficiency but checks identities',()=>{
 const z4=Array.from({length:5},()=>[0,0,0,0]),zp=Array.from({length:4},()=>[0,0,0,0,0]);
 assert.equal(m.independenceScore({C4:z4,C4plus:zp,e:oneAxis,epsilon:0,pseudoinverseTolerance:0}).eta,1);
 const wrong=copy(C4plus);wrong[0][0]=2;
 throws(()=>m.independenceScore({C4,C4plus:wrong,e:oneAxis,epsilon:1,pseudoinverseTolerance:0}));
 throws(()=>m.independenceScore({C4,C4plus,e:zero,epsilon:0,pseudoinverseTolerance:0}));
});
test('8S13 pairwise Gaussian weight respects geometry and semantic exponent',()=>{
 near(m.couplingWeight({Aij:2,ci:zero,cj:oneAxis,G5:I5,sigmaC:1,dJ:1,sigmaJ:1}),2/Math.E);
 assert.equal(m.couplingWeight({Aij:3,ci:zero,cj:zero,G5:I5,sigmaC:1,dJ:0,sigmaJ:1}),3);
 assert.equal(m.couplingWeight({Aij:0,ci:zero,cj:oneAxis,G5:I5,sigmaC:1,dJ:1,sigmaJ:1}),0);
});
test('8S14 metric/width/base domains refuse invalid Gaussian inputs',()=>{
 const base={Aij:1,ci:zero,cj:oneAxis,G5:I5,sigmaC:1,dJ:0,sigmaJ:1};
 throws(()=>m.couplingWeight({...base,sigmaC:0}));throws(()=>m.couplingWeight({...base,dJ:-1}));
 const asymmetric=copy(I5);asymmetric[0][1]=1;throws(()=>m.couplingWeight({...base,G5:asymmetric}));
 const indefinite=copy(I5);indefinite[4][4]=-1;throws(()=>m.couplingWeight({...base,G5:indefinite}));
 throws(()=>m.couplingWeight({...base,ci:[2,0,0,0,0]}));
});
test('8S15 phase derivative keeps distinct pair and triadic terms',()=>{
 assert.equal(m.phaseDerivative(phase()),11);
 const p=phase();p.K2=0;p.Hslice=[[0,2],[0,0]];assert.equal(m.phaseDerivative(p),13);
 const shifted=phase();shifted.theta=shifted.theta.map(x=>x+0.25);near(m.phaseDerivative(shifted),11);
});
test('8S16 activation known answer includes signs and triadic cross terms',()=>{
 // field=2.5+6+2-1-3=6.5; pair=2; triad=1-2-3+4=0.
 assert.equal(m.activationScore(activation()),8.5);
 const a=activation();a.Hslice=[[0,0],[0,2]];assert.equal(m.activationScore(a),14.5);
 throws(()=>m.activationScore({...activation(),M:0.5}));
 throws(()=>m.activationScore({...activation(),p:[-0.1,1]}));
});
test('8S17 logistic is stable at extreme finite arguments and monotone',()=>{
 assert.equal(m.logistic({h:0}),0.5);assert.equal(m.logistic({h:1000}),1);assert.equal(m.logistic({h:-1000}),0);
 assert.ok(m.logistic({h:-1})<0.5&&m.logistic({h:1})>0.5);throws(()=>m.logistic({h:Infinity}));
});
test('8S18 boundary product is exactly five ordered labels four through eight',()=>{
 assert.equal(m.boundaryProduct({b4to8:[1,2,3,4,5]}),120);
 assert.equal(m.boundaryProduct({b4to8:[1,2,0,4,5]}),0);
 throws(()=>m.boundaryProduct({b4to8:[1,2,3,4]}));throws(()=>m.boundaryProduct({b4to8:[1,2,3,4,5,6,7,8]}));
 throws(()=>m.boundaryProduct({b4to8:[1,2,3,4,-1]}));
});
test('8S19 support, radius and S3 measure match supplied algebra',()=>{
 const s=m.effectiveSupport({p:0.5,kappa:2,chi:0.25,zeta:0.5,vOmega:4});assert.equal(s,1.5);
 const r=m.radius({rMax:2,B5:0.25,alpha:0.5,s:8});assert.equal(r,2);
 near(m.fiberVolume({r}),16*Math.PI**2);
 near(m.fiberVolume({r}),2*Math.PI**2*2**3*0.25**1.5*8);
});
test('8S20 zero collapse is allowed while ambiguous powers and negative radii fail',()=>{
 assert.equal(m.radius({rMax:2,B5:0,alpha:1,s:2}),0);assert.equal(m.fiberVolume({r:0}),0);
 throws(()=>m.radius({rMax:2,B5:0,alpha:0,s:2}));throws(()=>m.radius({rMax:2,B5:0,alpha:-1,s:2}));
 throws(()=>m.radius({rMax:2,B5:1,alpha:1,s:-1}));throws(()=>m.fiberVolume({r:-1}));
});
test('8S21 full point and projection retain the separate four-dimensional fiber',()=>{
 const p=m.fiberPoint({c:[1,0,0,0,0],r:2,u:[0,1,0,0],unitTolerance:0});
 assert.deepEqual(p,[1,0,0,0,0,0,2,0,0]);
 assert.deepEqual(m.fullProjection({Pi5,Psi4,c:[1,0,0,0,0],r:2,u:[0,1,0,0],unitTolerance:0}),[1,2,0]);
 throws(()=>m.fiberPoint({c:zero,r:2,u:[1,1,0,0],unitTolerance:1e-12}));
});
test('8S22 latent gap subtracts support outside the square root',()=>{
 assert.equal(m.latentGap({ci:zero,cj:oneAxis,G5:I5,lambdaI:0.2,lambdaJ:0.3}),0.5);
 near(m.productStateSeparation({ci:zero,cj:oneAxis,G5:I5,rI:2,rJ:0}),Math.sqrt(5));
});
test('8S23 descriptor separation does not pretend to compare fiber orientation',()=>{
 assert.equal(m.productStateSeparation({ci:zero,cj:zero,G5:I5,rI:1,rJ:1}),0);
 const a=m.fiberPoint({c:zero,r:1,u:[1,0,0,0],unitTolerance:0}),b=m.fiberPoint({c:zero,r:1,u:[-1,0,0,0],unitTolerance:0});
 assert.equal(Math.hypot(...a.map((v,i)=>v-b[i])),2);
});
test('8S24 center-only projected and semantic gaps require explicit radii/metric result',()=>{
 assert.equal(m.projectedGap({ci:zero,cj:oneAxis,Pi5,rHatI:0.1,rHatJ:0.4}),0.5);
 assert.equal(m.semanticGap({dJ:2,thetaJ:3}),-1);
 throws(()=>m.projectedGap({ci:zero,cj:oneAxis,Pi5,rHatI:0.1}));throws(()=>m.semanticGap({dJ:-1,thetaJ:3}));
});
test('8S25 efficacy and admission preserve inclusive independence and strict gain',()=>{
 assert.equal(m.efficacyGain({score8:10,score7:8}),2);
 assert.equal(m.admissionPredicate({eta:0.2,epsilonInd:0.2,delta:2,epsilonGain:1}),true);
 assert.equal(m.admissionPredicate({eta:0.2,epsilonInd:0.2,delta:1,epsilonGain:1}),false);
 assert.equal(m.admissionPredicate({eta:0.19,epsilonInd:0.2,delta:2,epsilonGain:1}),false);
});
test('8S26 missing/extra/nonfinite fields are rejected without parameter defaults',()=>{
 throws(()=>m.periodicDriver({tau:1}));throws(()=>m.periodicDriver({tau:1,T:2,extra:1}));
 throws(()=>m.semanticGap({dJ:NaN,thetaJ:0}));throws(()=>m.efficacyGain({score8:Infinity,score7:0}));
 throws(()=>m.fullProjection({Pi5:[[1,0],[0,1]],Psi4,c:zero,r:1,u:[1,0,0,0],unitTolerance:0}));
});
test('8S27 data-only objects and arrays reject accessors and sparse/extra properties',()=>{
 let getterRan=false;const obj={T:1};Object.defineProperty(obj,'tau',{enumerable:true,get(){getterRan=true;return 1}});
 throws(()=>m.periodicDriver(obj));
 const hidden={tau:1,T:2};Object.defineProperty(hidden,'extra',{value:1});throws(()=>m.periodicDriver(hidden));
 const symbol={tau:1,T:2};symbol[Symbol('extra')]=1;throws(()=>m.periodicDriver(symbol));
 const rows=copy(I5);Object.defineProperty(rows,'0',{get(){getterRan=true;return I5[0]}});
 throws(()=>m.latentGap({ci:zero,cj:oneAxis,G5:rows,lambdaI:0,lambdaJ:0}));
 assert.equal(getterRan,false);
 const sparse=Array(5);throws(()=>m.latticeSite({n:sparse,ell:{numerator:1,denominator:1},M:1}));
 const extra=copy(oneAxis);extra.map=()=>zero;throws(()=>m.latticeSite({n:extra,ell:{numerator:1,denominator:1},M:1}));
});
test('8S28 site/resource limits bound dense local reference evaluation',()=>{
 throws(()=>m.phaseDerivative({...phase(),theta:Array(65).fill(0)}));
 throws(()=>m.phaseDerivative({...phase(),i:2}));
 throws(()=>m.activationScore({...activation(),Hslice:[[1]]}));
 throws(()=>m.independenceScore({C4:[],C4plus:[],e:[],epsilon:1,pseudoinverseTolerance:0}));
});
test('8S29 arithmetic overflow returns failure, not usable infinity',()=>{
 throws(()=>m.boundaryProduct({b4to8:[1e308,1e308,1,1,1]}));
 throws(()=>m.fiberVolume({r:1e308}));
 throws(()=>m.efficacyGain({score8:1e308,score7:-1e308}));
 throws(()=>m.phaseDerivative({...phase(),omega:1e308,K2:1e308}));
});
test('8S30 readiness refuses full classifier/model/native/cryptographic claims',()=>{
 assert.equal(m.classificationReadiness().status,'UNRESOLVED');assert.equal(m.classificationReadiness().classification,null);
 const r=m.completeLawReadiness();assert.equal(r.status,'UNRESOLVED');assert.equal(r.admitted,null);
 assert.equal(r.nativeEngineModified,false);assert.equal(r.cryptographicUse,false);assert.ok(r.missing.length>0);
 assert.ok(Object.isFrozen(m.PROFILE)&&Object.isFrozen(r.missing));
 assert.equal(m.PROFILE.status,'PARTIAL_REFERENCE_COMPUTATION');
});
test('8S31 explicit tolerance rejection cap prevents degenerate unit/inverse acceptance',()=>{
 for(const unitTolerance of [1e-8+1e-12,1,1e308,Infinity])
  throws(()=>m.fiberPoint({c:zero,r:1,u:[0,0,0,0],unitTolerance}));
 throws(()=>m.fiberPoint({c:zero,r:1,u:[0,0,0,0],unitTolerance:1e-8}));
 const wrong=copy(C4plus);wrong[0][0]=2;
 for(const pseudoinverseTolerance of [1e-8+1e-12,1,1e308,Infinity])
  throws(()=>m.independenceScore({C4,C4plus:wrong,e:oneAxis,epsilon:1,pseudoinverseTolerance}));
 assert.equal(m.independenceScore({C4,C4plus,e:oneAxis,epsilon:1,pseudoinverseTolerance:1e-8}).eta,0);
 assert.deepEqual(m.fiberPoint({c:zero,r:1,u:[1,0,0,0],unitTolerance:1e-8}),[0,0,0,0,0,1,0,0,0]);
});

