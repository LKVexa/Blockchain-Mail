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
export function signature(domain,value,key){return sign(null,Buffer.from(domain+'\n'+canonical(value)),createPrivateKey(key)).toString('base64')}
export function verifySignature(domain,value,sig,key){try{return verify(null,Buffer.from(domain+'\n'+canonical(value)),createPublicKey(key),Buffer.from(sig,'base64'))}catch{return false}}
export function seal(value,key,context,nonce=randomBytes(12)){
 const c=createCipheriv('chacha20-poly1305',Buffer.from(key,'hex'),nonce,{authTagLength:16});c.setAAD(Buffer.from(context));
 const ciphertext=Buffer.concat([c.update(Buffer.from(canonical(value))),c.final()]);
 return {version:1,algorithm:'CHACHA20-POLY1305',nonce:nonce.toString('hex'),ciphertext:ciphertext.toString('base64'),tag:c.getAuthTag().toString('hex')};
}
export function unseal(blob,key,context){
 if(blob.version!==1||blob.algorithm!=='CHACHA20-POLY1305'||!/^[0-9a-f]{24}$/.test(blob.nonce)||!/^[0-9a-f]{32}$/.test(blob.tag))throw new Error('Invalid encrypted object');
 const d=createDecipheriv('chacha20-poly1305',Buffer.from(key,'hex'),Buffer.from(blob.nonce,'hex'),{authTagLength:16});d.setAAD(Buffer.from(context));d.setAuthTag(Buffer.from(blob.tag,'hex'));
 return JSON.parse(Buffer.concat([d.update(Buffer.from(blob.ciphertext,'base64')),d.final()]).toString('utf8'));
}
export function merkle(events){let a=events.map(e=>hash('BVE-EVENT/1\n'+canonical(e)));if(!a.length)return hash('BVE-EMPTY/1');while(a.length>1){const b=[];for(let i=0;i<a.length;i+=2)b.push(hash('BVE-NODE/1\n'+a[i]+a[i+1===a.length?i:i+1]));a=b}return a[0]}
