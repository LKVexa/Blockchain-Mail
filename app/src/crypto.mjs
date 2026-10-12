import {createHash,randomBytes,generateKeyPairSync,createPrivateKey,createPublicKey,sign,verify,createCipheriv,createDecipheriv,timingSafeEqual} from 'node:crypto';
export function canonical(x) {
  if(x===null||typeof x==='boolean'||typeof x==='string') return JSON.stringify(x);
  if(typeof x==='number'&&Number.isSafeInteger(x)) return String(x);
  if(Array.isArray(x))return '['+x.map(canonical).join(',')+']';
  if(typeof x==='object'&&Object.getPrototypeOf(x)===Object.prototype) return '{'+Object.keys(x).sort().map(k=>JSON.stringify(k)+':'+canonical(x[k])).join(',')+'}';
  throw new Error('Noncanonical value');
}
export const hash=x=>createHash('sha256').update(x).digest('hex');
export const id=()=>randomBytes(16).toString('hex');
export const token=()=>randomBytes(32).toString('base64url');
export function equal(a,b){const x=Buffer.from(a);const y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y)}
export function keys(){const k=generateKeyPairSync('ed25519');return {version:1,sealKey:randomBytes(32).toString('hex'),privateKey:k.privateKey.export({type:'pkcs8',format:'pem'}),publicKey:k.publicKey.export({type:'spki',format:'pem'})}}
export function signature(domain,value,key){const privateKey=createPrivateKey(key);if(privateKey.asymmetricKeyType!=='ed25519')throw new Error('Only Ed25519 authority keys are supported');return sign(null,Buffer.from(domain+'\n'+canonical(value)),privateKey).toString('base64')}
export function verifySignature(domain,value,sig,key){try{if(typeof sig!=='string')return false;const bytes=Buffer.from(sig,'base64'),publicKey=createPublicKey(key);if(bytes.length!==64||bytes.toString('base64')!==sig||publicKey.asymmetricKeyType!=='ed25519')return false;return verify(null,Buffer.from(domain+'\n'+canonical(value)),publicKey,bytes)}catch{return false}}
export function seal(value,key,context,nonce=randomBytes(12)){
 if(typeof key!=='string'||!/^[0-9a-f]{64}$/.test(key)||!ArrayBuffer.isView(nonce)||nonce.BYTES_PER_ELEMENT!==1||nonce.byteLength!==12)throw new Error('Invalid encryption key or nonce');const iv=Buffer.from(nonce);
 const c=createCipheriv('chacha20-poly1305',Buffer.from(key,'hex'),iv,{authTagLength:16});c.setAAD(Buffer.from(context));
 const ciphertext=Buffer.concat([c.update(Buffer.from(canonical(value))),c.final()]);
 return {version:1,algorithm:'CHACHA20-POLY1305',nonce:iv.toString('hex'),ciphertext:ciphertext.toString('base64'),tag:c.getAuthTag().toString('hex')};
}
export function unseal(blob,key,context){
 if(!blob||typeof key!=='string'||!/^[0-9a-f]{64}$/.test(key)||blob.version!==1||blob.algorithm!=='CHACHA20-POLY1305'||!/^[0-9a-f]{24}$/.test(blob.nonce)||!/^[0-9a-f]{32}$/.test(blob.tag)||typeof blob.ciphertext!=='string'||Buffer.from(blob.ciphertext,'base64').toString('base64')!==blob.ciphertext)throw new Error('Invalid encrypted object');
 const d=createDecipheriv('chacha20-poly1305',Buffer.from(key,'hex'),Buffer.from(blob.nonce,'hex'),{authTagLength:16});d.setAAD(Buffer.from(context));d.setAuthTag(Buffer.from(blob.tag,'hex'));
 return JSON.parse(Buffer.concat([d.update(Buffer.from(blob.ciphertext,'base64')),d.final()]).toString('utf8'));
}
export function eventsDigest(events){return hash('VEXA127-EVENTS/2\n'+canonical(events))}
export function merkle(events){let a=events.map(e=>hash('BVE-EVENT/1\n'+canonical(e)));if(!a.length)return hash('BVE-EMPTY/1');while(a.length>1){const b=[];for(let i=0;i<a.length;i+=2)b.push(hash('BVE-NODE/1\n'+a[i]+a[i+1===a.length?i:i+1]));a=b}return a[0]}
export function inclusionProof(events,index){if(!Number.isInteger(index)||index<0||index>=events.length)throw Error('Event is not in this block');let level=events.map(e=>hash('BVE-EVENT/1\n'+canonical(e))),idx=index;const steps=[];while(level.length>1){const next=[];for(let i=0;i<level.length;i+=2){const left=level[i],right=level[i+1]??left,duplicated=i+1>=level.length;if(i===idx||(!duplicated&&i+1===idx)){if(duplicated)steps.push({position:'duplicate'});else steps.push({position:i===idx?'right':'left',sibling:i===idx?right:left})}next.push(hash('BVE-NODE/1\n'+left+right))}idx=idx>>1;level=next}return {index,steps,root:level[0]??hash('BVE-EMPTY/1')}}
export function verifyInclusion(event,proof,root){if(!proof||!Array.isArray(proof.steps))return false;let acc=hash('BVE-EVENT/1\n'+canonical(event));for(const step of proof.steps){if(step.position==='duplicate')acc=hash('BVE-NODE/1\n'+acc+acc);else if(step.position==='right'&&typeof step.sibling==='string')acc=hash('BVE-NODE/1\n'+acc+step.sibling);else if(step.position==='left'&&typeof step.sibling==='string')acc=hash('BVE-NODE/1\n'+step.sibling+acc);else return false}return acc===root}
