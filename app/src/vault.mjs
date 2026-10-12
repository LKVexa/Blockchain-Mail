/** Independent outer storage protection. Not the native JA21 package codec. */
import {createHash,randomBytes,hkdfSync,createCipheriv,createDecipheriv} from 'node:crypto';
import {canonical} from './crypto.mjs';
import {demand,MailError} from './policy.mjs';

export const VAULT_FORMAT='VEXA127-VAULT/1';
export const VAULT_PREFIX=VAULT_FORMAT+':';
export const WORD_KEY_DOMAIN='JA21/CYPHER/VERTEX-WORD-KEY/v1';
export const MAX_VAULT_PLAINTEXT=32*1024*1024;
const ONSETS='bcdfghjklmnprstv',RIMES='aeiouywxqzbcdfgh';
const META_FIELDS=['algorithm','format','kdf','salt','vault_id'];

export function normalizeRecoveryWords(words){
 demand(Array.isArray(words)&&words.length===4,'VAULT_WORDS','Exactly four ordered recovery words are required');
 const out=[];
 for(let i=0;i<4;i++){
  demand(typeof words[i]==='string','VAULT_WORDS','Invalid recovery word');
  const word=words[i].trim();
  demand(/^[A-Za-z]{1,64}$/.test(word),'VAULT_WORDS','Recovery words require 1–64 ASCII letters');
  out.push(word.toLowerCase());
 }
 return out;
}
export function canonicalWordKeyLine(words){const w=normalizeRecoveryWords(words);return WORD_KEY_DOMAIN+w.map((word,i)=>`|V${i+1}=${word}`).join('')}
export function deriveWordKey(words){return createHash('sha256').update(canonicalWordKeyLine(words),'utf8').digest()}
export function generateVertexWords(){
 const raw=randomBytes(16),words=[];
 try{for(let v=0;v<4;v++){let word='';for(let i=0;i<4;i++){const x=raw[v*4+i];word+=ONSETS[x>>>4]+RIMES[x&15]}words.push(word)}return words}finally{raw.fill(0)}
}
export function validateVaultKey(key){demand(Buffer.isBuffer(key)&&key.length===32,'VAULT_KEY','A 32-byte external vault key is required',503);return key}
export function createVaultMetadata(){return {format:VAULT_FORMAT,algorithm:'AES-256-GCM',kdf:'HKDF-SHA-256',vault_id:randomBytes(16).toString('hex'),salt:randomBytes(32).toString('hex')}}
export function validateVaultMetadata(metadata){
 demand(metadata&&Object.getPrototypeOf(metadata)===Object.prototype&&Object.keys(metadata).sort().join(',')===META_FIELDS.join(',')&&metadata.format===VAULT_FORMAT&&metadata.algorithm==='AES-256-GCM'&&metadata.kdf==='HKDF-SHA-256'&&/^[0-9a-f]{32}$/.test(metadata.vault_id)&&/^[0-9a-f]{64}$/.test(metadata.salt),'VAULT_METADATA','Invalid vault metadata',503);
 return {...metadata};
}
export function isProtectedText(text){return typeof text==='string'&&text.startsWith(VAULT_PREFIX)}

export class Vault{
 constructor(key,metadata){
  validateVaultKey(key);this.metadata=Object.freeze(validateVaultMetadata(metadata));this.master=Buffer.from(key);
  this.metadataText=canonical(this.metadata);this.keys=new Map();this.nonces=new Set();this.closed=false;
 }
 usageKey(use){
  demand(!this.closed,'VAULT_CLOSED','Vault is closed',503);
  demand(typeof use==='string'&&/^(table:(state|blocks|objects)|file:(authority|credentials)|backup:manifest)$/.test(use),'VAULT_CONTEXT','Unsupported vault use',503);
  if(!this.keys.has(use))this.keys.set(use,Buffer.from(hkdfSync('sha256',this.master,Buffer.from(this.metadata.salt,'hex'),Buffer.from(canonical({domain:'VEXA127-VAULT-SUBKEY/1',vault_id:this.metadata.vault_id,use})),32)));
  return this.keys.get(use);
 }
 aad(use,rowId){demand(typeof rowId==='string'&&rowId.length>=1&&rowId.length<=256,'VAULT_CONTEXT','Invalid vault row context',503);return Buffer.from(this.metadataText+'\n'+canonical({domain:VAULT_FORMAT,use,row_id:rowId}),'utf8')}
 seal(text,use,rowId){
  demand(typeof text==='string'&&Buffer.byteLength(text,'utf8')<=MAX_VAULT_PLAINTEXT,'VAULT_SIZE','Vault value exceeds its storage bound',503);
  const key=this.usageKey(use),aad=this.aad(use,rowId),nonce=randomBytes(12),nonceId=use+'|'+nonce.toString('hex');
  demand(!this.nonces.has(nonceId),'VAULT_NONCE','Repeated outer vault nonce refused',503);this.nonces.add(nonceId);
  const cipher=createCipheriv('aes-256-gcm',key,nonce,{authTagLength:16});cipher.setAAD(aad);
  const plaintext=Buffer.from(text,'utf8');
  try{const ciphertext=Buffer.concat([cipher.update(plaintext),cipher.final()]);return VAULT_PREFIX+Buffer.concat([nonce,cipher.getAuthTag(),ciphertext]).toString('base64')}finally{plaintext.fill(0)}
 }
 open(text,use,rowId){
  const key=this.usageKey(use),aad=this.aad(use,rowId);
  demand(isProtectedText(text),'VAULT_UNPROTECTED','Protected vault refuses an unprotected value',503);
  const encoded=text.slice(VAULT_PREFIX.length);
  demand(encoded.length<=Math.ceil((MAX_VAULT_PLAINTEXT+28)/3)*4&&/^[A-Za-z0-9+/]*={0,2}$/.test(encoded),'VAULT_ENVELOPE','Invalid vault envelope',503);
  const bytes=Buffer.from(encoded,'base64');
  demand(bytes.length>=28&&bytes.length<=MAX_VAULT_PLAINTEXT+28&&bytes.toString('base64')===encoded,'VAULT_ENVELOPE','Invalid vault envelope',503);
  let plaintext,chunk;
  try{
   const cipher=createDecipheriv('aes-256-gcm',key,bytes.subarray(0,12),{authTagLength:16});cipher.setAAD(aad);cipher.setAuthTag(bytes.subarray(12,28));
   chunk=cipher.update(bytes.subarray(28));plaintext=Buffer.concat([chunk,cipher.final()]);
   return new TextDecoder('utf-8',{fatal:true}).decode(plaintext);
  }catch{throw new MailError('VAULT_AUTHENTICATION','Outer vault authentication failed',503)}finally{chunk?.fill(0);plaintext?.fill(0)}
 }
 destroy(){if(this.closed)return;this.closed=true;this.master.fill(0);for(const key of this.keys.values())key.fill(0);this.keys.clear();this.nonces.clear()}
}
