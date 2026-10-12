// Build-time verification only. No network access or Tor executable runs here.
import fs from 'node:fs';
import crypto from 'node:crypto';
import {pathToFileURL,fileURLToPath} from 'node:url';
const FINGERPRINT='EF6E286DDA85EA2A4BA7DE684E2C6E8793298290';
const MODULE_SHA256='4ccebb735be5fc2efb47d2f1fdce0d622db555aeeea4b24857d80e842118123d';
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function read(path,max){const info=fs.lstatSync(path);if(!info.isFile()||info.isSymbolicLink()||info.size<1||info.size>max)throw Error('Invalid Tor verification input.');return fs.readFileSync(path);}
export async function verifyTorBundle({bundlePath,signaturePath,keyringPath}){
  const moduleUrl=new URL('./vendor/openpgp.min.mjs',import.meta.url),moduleBytes=read(fileURLToPath(moduleUrl),1000000);
  if(hash(moduleBytes)!==MODULE_SHA256)throw Error('The OpenPGP verification tool failed its pinned integrity check.');
  const pgp=await import(moduleUrl),bundle=read(bundlePath,100*1024*1024),signatureBytes=read(signaturePath,64*1024),keyBytes=read(keyringPath,1024*1024);
  const text=keyBytes.toString('utf8'),key=await pgp.readKey(text.startsWith('-----BEGIN PGP PUBLIC KEY BLOCK-----')?{armoredKey:text}:{binaryKey:keyBytes});
  if(key.getFingerprint().toUpperCase()!==FINGERPRINT)throw Error('The key does not match the published Tor Browser Developers fingerprint.');
  const signature=await pgp.readSignature({armoredSignature:signatureBytes.toString('ascii')}),message=await pgp.createMessage({binary:bundle});
  // Keep strict default checks, including key bindings, revocation, signature
  // creation time and signing-key validity. No clock or key-reformat bypasses.
  const result=await pgp.verify({message,signature,verificationKeys:key,expectSigned:true});
  if(result.signatures.length!==1)throw Error('Expected exactly one valid detached Tor signature.');
  await result.signatures[0].verified;
  return {version:1,signature_verified:true,signature_primary_fingerprint:FINGERPRINT,signing_subkey_id:result.signatures[0].keyID.toHex(),verification_tool:'OpenPGP.js 6.3.2',verification_module_sha256:MODULE_SHA256,bundle_sha256:hash(bundle),signature_sha256:hash(signatureBytes),keyring_sha256:hash(keyBytes),verified_utc:new Date().toISOString()};
}
if(process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url){
  const [bundlePath,signaturePath,keyringPath]=process.argv.slice(2);
  try{console.log(JSON.stringify(await verifyTorBundle({bundlePath,signaturePath,keyringPath})));}
  catch(error){console.error('Tor signature verification failed: '+error.message);process.exitCode=1;}
}
