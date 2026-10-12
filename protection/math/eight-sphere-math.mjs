// Attachment-defined 8S formula reference only. No cipher, entropy source,
// native engine replacement, complete classifier, ODE or fixed-point solver.
export const PROFILE=Object.freeze({
 id:'8S-ATTACHMENT-FORMULA-REFERENCE/1',
 sourceFramework:'Smithson 8S Coupled Mechanics v1.0',
 status:'PARTIAL_REFERENCE_COMPUTATION',
 fullLaw:'UNRESOLVED',nativeEngineMath:'UNRESOLVED',cryptographicUse:false,
 precision:'Exact BigInt lattice/count arithmetic; IEEE754 binary64 formula evaluation',
 maxSites:64,maxLatticePoints:4096,maxEnumerationM:32,maxShellM:1000000,
 // Engineering rejection bound only; every call still supplies its tolerance.
 // This is not an attachment-defined coefficient or an admission threshold.
 maxValidationTolerance:1e-8,
 missing:Object.freeze(['model parameters and units','b(c) and v(omega)','semantic objects and d_J','R(c,tau) interpolation','rHat projection rule','complete Classify predicates and uncertainty/provenance semantics','M7/M8, Score and held-out comparison data','ODE/fixed-point solver and initial/boundary conditions','native engine source and law-to-engine binding'])
});
const N=PROFILE.maxSites;
function fail(message){throw new TypeError('8S reference: '+message)}
function fields(value,names){
 if(!value||Object.getPrototypeOf(value)!==Object.prototype||Reflect.ownKeys(value).length!==names.length||Object.keys(value).sort().join(',')!==[...names].sort().join(','))fail('explicit fields required: '+names.join(','));
 for(const key of names){const d=Object.getOwnPropertyDescriptor(value,key);if(!d||!('value'in d))fail('data fields required')}
 return value;
}
function number(x,name){if(typeof x!=='number'||!Number.isFinite(x))fail('finite '+name+' required');return x===0?0:x}
function result(x){return number(x,'result')}
function integer(x,name,max){number(x,name);if(!Number.isInteger(x)||x<0||x>max)fail(name+' outside integer resource bound');return x}
function positive(x,name){number(x,name);if(x<=0)fail('positive '+name+' required');return x}
function nonnegative(x,name){number(x,name);if(x<0)fail('nonnegative '+name+' required');return x}
function unitInterval(x,name){number(x,name);if(x<0||x>1)fail(name+' outside [0,1]');return x}
function validationTolerance(x,name){nonnegative(x,name);if(x>PROFILE.maxValidationTolerance)fail(name+' exceeds reference validation cap');return x}
function dataArray(x,length,name){if(!Array.isArray(x)||Object.getPrototypeOf(x)!==Array.prototype||x.length!==length||Reflect.ownKeys(x).length!==length+1)fail(name+' shape/data array');for(let i=0;i<length;i++){const d=Object.getOwnPropertyDescriptor(x,String(i));if(!d||!('value'in d))fail(name+' data array required')}return x}
function vector(x,length,name){dataArray(x,length,name);for(let i=0;i<length;i++)number(x[i],name);return x}
function matrix(x,rows,cols,name){dataArray(x,rows,name);for(let i=0;i<rows;i++)vector(x[i],cols,name);return x}
function center(x,name){vector(x,5,name);if(x.some(v=>v < -1||v>1))fail(name+' outside base cube');return x}
function boundedSize(x){if(!Array.isArray(x)||x.length<1||x.length>N)fail('site array resource bound');return x.length}
function dot(a,b){let sum=0;for(let i=0;i<a.length;i++)sum=result(sum+result(a[i]*b[i]));return sum}
function matVec(a,b){return a.map(row=>dot(row,b))}
function mul(a,b){const rows=a.length,cols=b[0].length,inner=b.length;return Array.from({length:rows},(_,i)=>Array.from({length:cols},(_,j)=>{let s=0;for(let k=0;k<inner;k++)s=result(s+result(a[i][k]*b[k][j]));return s}))}
function near(a,b,tol){return a.every((row,i)=>row.every((value,j)=>Math.abs(value-b[i][j])<=tol))}
function symmetric(a,tol){return a.every((row,i)=>row.every((value,j)=>Math.abs(value-a[j][i])<=tol))}
function metric(ci,cj,G5){
 center(ci,'ci');center(cj,'cj');matrix(G5,5,5,'G5');
 if(!symmetric(G5,0))fail('G5 must be symmetric');
 // A strict positive-definite reference profile ensures a norm. This is an
 // engineering precondition, not a supplied default or a full model definition.
 const L=Array.from({length:5},()=>Array(5).fill(0));
 for(let i=0;i<5;i++)for(let j=0;j<=i;j++){
  let value=G5[i][j];for(let k=0;k<j;k++)value=result(value-result(L[i][k]*L[j][k]));
  if(i===j){positive(value,'G5 Cholesky pivot');L[i][j]=Math.sqrt(value)}
  else L[i][j]=result(value/L[j][j]);
 }
 const d=ci.map((v,i)=>result(v-cj[i]));const squared=result(dot(d,matVec(G5,d)));nonnegative(squared,'quadratic distance');return squared;
}
function couplingInputs(p,W,H){
 const n=boundedSize(p);vector(p,n,'p');p.forEach(x=>unitInterval(x,'p'));
 vector(W,n,'Wrow');matrix(H,n,n,'Hslice');return n;
}
function rational(value,name){
 fields(value,['numerator','denominator']);
 const parse=x=>{if(typeof x==='number'){if(!Number.isSafeInteger(x))fail(name+' integer precision');return BigInt(x)}
  if(typeof x!=='string'||x.length>79||!/^[-]?(?:0|[1-9][0-9]*)$/.test(x))fail(name+' integer representation');return BigInt(x)};
 let a=parse(value.numerator),b=parse(value.denominator);
 if(b<=0n||a<=0n||a>b)fail(name+' must be a rational in (0,1]');
 if(a.toString(2).length>256||b.toString(2).length>256)fail(name+' rational resource bound');
 const gcd=(x,y)=>{while(y){const r=x%y;x=y;y=r}return x};const g=gcd(a,b);return {numerator:a/g,denominator:b/g};
}
function choose(n,k){if(k<0||BigInt(k)>n)return 0n;let v=1n;for(let i=1;i<=k;i++)v=v*(n-BigInt(i)+1n)/BigInt(i);return v}
function signedFraction(n,ell){
 let a=BigInt(n)*ell.numerator,b=ell.denominator;
 let x=a<0n?-a:a,y=b;while(y){const r=x%y;x=y;y=r}const g=x||b;return Object.freeze({numerator:a/g,denominator:b/g});
}
export function shellMultiplicity(m){
 integer(m,'m',PROFILE.maxShellM);if(m===0)return 1n;
 let value=0n;for(let j=1;j<=Math.min(5,m);j++)value+=(2n**BigInt(j))*choose(5n,j)*choose(BigInt(m-1),j-1);return value;
}
export function latticeBallCount(M){
 integer(M,'M',PROFILE.maxShellM);
 // Hockey-stick summation of the attached shell formula, including origin.
 let value=1n;for(let j=1;j<=Math.min(5,M);j++)value+=(2n**BigInt(j))*choose(5n,j)*choose(BigInt(M),j);return value;
}
export function latticeSite(input){
 const {n,ell,M}=fields(input,['n','ell','M']);integer(M,'M',PROFILE.maxEnumerationM);vector(n,5,'n');
 if(!n.every(Number.isSafeInteger)||n.reduce((sum,v)=>sum+Math.abs(v),0)>M)fail('n must be an admitted L1 lattice index');
 const scale=rational(ell,'ell');
 if(n.some(v=>BigInt(Math.abs(v))*scale.numerator>scale.denominator))fail('center outside [-1,1]^5');
 return Object.freeze({n:Object.freeze(n.map(v=>v===0?0:v)),c:Object.freeze(n.map(v=>signedFraction(v,scale)))});
}
export function latticeSites(input){
 const {ell,M}=fields(input,['ell','M']);integer(M,'M',PROFILE.maxEnumerationM);const scale=rational(ell,'ell');
 const allowed=scale.denominator/scale.numerator,bound=allowed>BigInt(M)?M:Number(allowed),sites=[];
 function visit(n,left){
  if(n.length===5){if(sites.length>=PROFILE.maxLatticePoints)fail('lattice enumeration resource bound');sites.push(latticeSite({n,ell,M}));return}
  const edge=Math.min(left,bound);for(let value=-edge;value<=edge;value++)visit([...n,value],left-Math.abs(value));
 }
 visit([],M);return Object.freeze(sites);
}
export function periodicDriver(input){
 const {tau,T}=fields(input,['tau','T']);number(tau,'tau');positive(T,'T');const angle=result(Math.PI*result(tau/T));return result(Math.sin(angle)**2);
}
export function coordinateExtension(input){
 const {C4,e}=fields(input,['C4','e']);const n=boundedSize(e);vector(e,n,'e');matrix(C4,n,4,'C4');
 return Object.freeze(C4.map((row,i)=>Object.freeze([...row,e[i]])));
}
export function independenceScore(input){
 const {C4,C4plus,e,epsilon,pseudoinverseTolerance}=fields(input,['C4','C4plus','e','epsilon','pseudoinverseTolerance']);
 const n=boundedSize(e);vector(e,n,'e');matrix(C4,n,4,'C4');matrix(C4plus,4,n,'C4plus');
 nonnegative(epsilon,'epsilon');validationTolerance(pseudoinverseTolerance,'pseudoinverseTolerance');
 const P=mul(C4,C4plus),Q=mul(C4plus,C4);
 // Caller supplies the pseudoinverse and explicit validation tolerance.
 // Verify all four Moore-Penrose identities; do not choose/implement a solver.
 if(!near(mul(P,C4),C4,pseudoinverseTolerance)||!near(mul(Q,C4plus),C4plus,pseudoinverseTolerance)||!symmetric(P,pseudoinverseTolerance)||!symmetric(Q,pseudoinverseTolerance))fail('provided pseudoinverse fails explicit tolerance');
 const projection=matVec(C4,matVec(C4plus,e)),residual=e.map((v,i)=>result(v-projection[i]));
 const denominator=result(dot(e,e)+epsilon);positive(denominator,'independence denominator');
 return Object.freeze({residual:Object.freeze(residual),eta:result(dot(residual,residual)/denominator),pseudoinverse:'CALLER_PROVIDED_AND_IDENTITIES_CHECKED'});
}
export function couplingWeight(input){
 const {Aij,ci,cj,G5,sigmaC,dJ,sigmaJ}=fields(input,['Aij','ci','cj','G5','sigmaC','dJ','sigmaJ']);
 number(Aij,'Aij');positive(sigmaC,'sigmaC');nonnegative(dJ,'dJ');positive(sigmaJ,'sigmaJ');
 const exponent=result(-metric(ci,cj,G5)/result(2*sigmaC*sigmaC)-result(dJ*dJ)/result(2*sigmaJ*sigmaJ));return result(Aij*Math.exp(exponent));
}
export function phaseDerivative(input){
 const {i,theta,omega,Wrow,Hslice,K2,K3}=fields(input,['i','theta','omega','Wrow','Hslice','K2','K3']);
 const n=boundedSize(theta);vector(theta,n,'theta');integer(i,'i',n-1);vector(Wrow,n,'Wrow');matrix(Hslice,n,n,'Hslice');number(omega,'omega');number(K2,'K2');number(K3,'K3');
 let pair=0,triad=0;
 for(let j=0;j<n;j++){pair=result(pair+result(Wrow[j]*Math.sin(result(theta[j]-theta[i]))));for(let k=0;k<n;k++)triad=result(triad+result(Hslice[j][k]*Math.sin(result(theta[j]+theta[k]-2*theta[i]))))}
 return result(omega+result(K2*pair)+result(K3*triad));
}
export function activationScore(input){
 const names=['M','q','beta','d','E','u','chi','zeta','aE','au','aChi','aZeta','J2','J3','p','Wrow','Hslice'];
 const v=fields(input,names);for(const name of names.slice(0,14))number(v[name],name);integer(v.M,'M',PROFILE.maxShellM);unitInterval(v.q,'q');unitInterval(v.chi,'chi');unitInterval(v.zeta,'zeta');
 const n=couplingInputs(v.p,v.Wrow,v.Hslice);let pair=0,triad=0;
 for(let j=0;j<n;j++){pair=result(pair+result(v.Wrow[j]*result(2*v.p[j]-1)));for(let k=0;k<n;k++)triad=result(triad+result(v.Hslice[j][k]*result(2*v.p[j]-1)*result(2*v.p[k]-1)))}
 return result(v.beta*result(v.M*v.q+0.5-v.d)+v.aE*v.E+v.au*v.u-v.aChi*v.chi-v.aZeta*v.zeta+v.J2*pair+v.J3*triad);
}
export function logistic(input){
 const {h}=fields(input,['h']);number(h,'h');return result(h>=0?1/(1+Math.exp(-h)):Math.exp(h)/(1+Math.exp(h)));
}
export function boundaryProduct(input){
 const {b4to8}=fields(input,['b4to8']);vector(b4to8,5,'b4to8');b4to8.forEach(v=>nonnegative(v,'b value'));let value=1;for(const v of b4to8)value=result(value*v);return value;
}
export function effectiveSupport(input){
 const {p,kappa,chi,zeta,vOmega}=fields(input,['p','kappa','chi','zeta','vOmega']);
 unitInterval(p,'p');nonnegative(kappa,'kappa');unitInterval(chi,'chi');unitInterval(zeta,'zeta');nonnegative(vOmega,'vOmega');
 return result(p*kappa*(1-chi)*(1-zeta)*vOmega);
}
export function radius(input){
 const {rMax,B5,alpha,s}=fields(input,['rMax','B5','alpha','s']);nonnegative(rMax,'rMax');nonnegative(B5,'B5');number(alpha,'alpha');nonnegative(s,'s');
 if(B5===0&&alpha<=0)fail('undefined zero boundary power');
 return result(rMax*result(B5**alpha)*Math.cbrt(s));
}
export function fiberVolume(input){
 const {r}=fields(input,['r']);nonnegative(r,'r');return result(2*Math.PI**2*r**3);
}
export function fiberPoint(input){
 const {c,r,u,unitTolerance}=fields(input,['c','r','u','unitTolerance']);center(c,'c');nonnegative(r,'r');vector(u,4,'u');validationTolerance(unitTolerance,'unitTolerance');
 const unitNorm=Math.sqrt(dot(u,u));positive(unitNorm,'unit vector norm');
 if(Math.abs(unitNorm-1)>unitTolerance)fail('u outside caller-declared unit tolerance');
 return Object.freeze([...c,...u.map(v=>result(r*v))]);
}
export function fullProjection(input){
 const {Pi5,Psi4,c,r,u,unitTolerance}=fields(input,['Pi5','Psi4','c','r','u','unitTolerance']);matrix(Pi5,3,5,'Pi5');matrix(Psi4,3,4,'Psi4');
 const z=fiberPoint({c,r,u,unitTolerance});return Object.freeze(Pi5.map((row,i)=>result(dot(row,z.slice(0,5))+dot(Psi4[i],z.slice(5)))));
}
export function latentGap(input){
 const {ci,cj,G5,lambdaI,lambdaJ}=fields(input,['ci','cj','G5','lambdaI','lambdaJ']);nonnegative(lambdaI,'lambdaI');nonnegative(lambdaJ,'lambdaJ');
 return result(Math.sqrt(metric(ci,cj,G5))-result(lambdaI+lambdaJ));
}
export function productStateSeparation(input){
 const {ci,cj,G5,rI,rJ}=fields(input,['ci','cj','G5','rI','rJ']);nonnegative(rI,'rI');nonnegative(rJ,'rJ');
 return result(Math.sqrt(result(metric(ci,cj,G5)+result((rI-rJ)**2))));
}
export function projectedGap(input){
 const {ci,cj,Pi5,rHatI,rHatJ}=fields(input,['ci','cj','Pi5','rHatI','rHatJ']);center(ci,'ci');center(cj,'cj');matrix(Pi5,3,5,'Pi5');nonnegative(rHatI,'rHatI');nonnegative(rHatJ,'rHatJ');
 const delta=matVec(Pi5,ci.map((v,i)=>result(v-cj[i])));return result(Math.sqrt(dot(delta,delta))-result(rHatI+rHatJ));
}
export function semanticGap(input){
 const {dJ,thetaJ}=fields(input,['dJ','thetaJ']);nonnegative(dJ,'dJ');number(thetaJ,'thetaJ');return result(dJ-thetaJ);
}
export function efficacyGain(input){
 const {score8,score7}=fields(input,['score8','score7']);number(score8,'score8');number(score7,'score7');return result(score8-score7);
}
export function admissionPredicate(input){
 const {eta,epsilonInd,delta,epsilonGain}=fields(input,['eta','epsilonInd','delta','epsilonGain']);
 nonnegative(eta,'eta');nonnegative(epsilonInd,'epsilonInd');number(delta,'delta');number(epsilonGain,'epsilonGain');
 return eta>=epsilonInd&&delta>epsilonGain;
}
export function classificationReadiness(){
 return Object.freeze({status:'UNRESOLVED',classification:null,reason:'Full Classify predicates, required evidence, uncertainty/phase/triadic/provenance definitions and thresholds must be supplied.'});
}
export function completeLawReadiness(){
 return Object.freeze({profile:PROFILE.id,status:'UNRESOLVED',admitted:null,nativeEngineModified:false,cryptographicUse:false,missing:PROFILE.missing});
}

