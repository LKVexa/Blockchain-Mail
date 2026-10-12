import {deriveTransport,encodeFrame,decodeFrame,base64} from '../web/protected-wire.mjs';
import {demand} from './policy.mjs';
export async function createProtectedApi(vaultKey,runId){
 const session=await deriveTransport(vaultKey,runId),seen=new Map();
 return {runId,async open(frame){
  demand(frame&&Number.isSafeInteger(frame.issued)&&Math.abs(Date.now()-frame.issued)<=120000,'PROTECTED_AUTH','Protected request refused',401);
  let value;try{value=await decodeFrame(session,'request',frame)}catch{demand(false,'PROTECTED_AUTH','Protected request refused',401)}
  const now=Date.now();for(const [key,expiry] of seen)if(expiry<now)seen.delete(key);
  demand(!seen.has('i:'+frame.id)&&!seen.has('n:'+frame.nonce),'PROTECTED_REPLAY','Protected request already used',409);
  demand(seen.size<20000,'PROTECTED_BUSY','Protected request capacity reached',429);
  seen.set('i:'+frame.id,now+300000);seen.set('n:'+frame.nonce,now+300000);
  demand(value&&Object.keys(value).sort().join(',')==='body,headers,method,path','PROTECTED_REQUEST','Invalid protected request');
  demand(['GET','POST'].includes(value.method)&&typeof value.path==='string'&&value.path.length<=4096&&/^\/api\/[a-z0-9/_?-][^#]*$/.test(value.path)&&!value.path.startsWith('/api/protected'),'PROTECTED_REQUEST','Invalid protected endpoint');
  demand(value.headers&&typeof value.headers==='object'&&!Array.isArray(value.headers)&&Object.keys(value.headers).every(h=>['authorization','content-type','x-bve-request'].includes(h))&&Object.values(value.headers).every(v=>typeof v==='string'&&v.length<=4096),'PROTECTED_REQUEST','Invalid protected headers');
  demand(value.method==='GET'?value.body===null:typeof value.body==='string','PROTECTED_REQUEST','Invalid protected body');
  if(value.body!==null)demand(Buffer.byteLength(value.body)<=1200000,'SIZE','Request too large',413);
  return {frame,value};
 },async response(request,status,data,type,extraHeaders={}){
  const bytes=type==='application/json'?Buffer.from(JSON.stringify(data)):Buffer.from(data);
  // Responses may include full mailbox exports. Keep them explicitly bounded.
  demand(bytes.length<=8000000,'SIZE','Protected response too large',413);
  // encodeFrame has the request-size bound, so use bounded chunks for responses.
  const chunks=[];for(let i=0;i<bytes.length;i+=500000)chunks.push(base64(bytes.subarray(i,i+500000)));
  return encodeFrame(session,'response',{status,headers:{'content-type':type,...extraHeaders},chunks},request.frame);
 }};
}
