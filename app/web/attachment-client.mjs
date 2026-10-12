const CHUNK_BYTES=262144;
const delay=milliseconds=>new Promise(resolve=>setTimeout(resolve,milliseconds));
async function fileCall(api,path,body,check,pause){while(true){check();try{return await api(path,body);}catch(error){if(error.code!=='PROTECTED_BUSY')throw error;await pause(10000);check();}}}
function base64(bytes){let text='';for(let index=0;index<bytes.length;index+=8192)text+=String.fromCharCode(...bytes.subarray(index,index+8192));return btoa(text);}
function decode(value){if(typeof value!=='string'||value.length>Math.ceil(CHUNK_BYTES/3)*4||! /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value))throw Error('Attachment chunk is invalid.');const text=atob(value);return Uint8Array.from(text,character=>character.charCodeAt(0));}
export function createAttachmentUploads(){
 let cache=new WeakMap();
 return {
  clear(){cache=new WeakMap();},
  async prepare(file,{api,check=()=>{},progress=()=>{},pause=delay}){
   check();const uploadCache=cache;if(uploadCache.has(file))return uploadCache.get(file);
   const upload=(async()=>{
    const uploadCall=(path,body)=>fileCall(api,path,body,check,pause);
    if(!Number.isSafeInteger(file.size)||file.size<0||typeof file.slice!=='function')throw Error('Choose a readable attachment file.');
    const created=await uploadCall('/api/attachments/create',{name:file.name,size:file.size});check();
    if(typeof created.attachment_id!=='string'||!/^[a-f0-9]{32}$/.test(created.attachment_id)||created.chunk_size!==CHUNK_BYTES||created.chunk_count!==Math.ceil(file.size/CHUNK_BYTES))throw Error('Attachment upload could not be verified.');
    for(let index=0;index<created.chunk_count;index++){
     check();const start=index*CHUNK_BYTES,chunk=new Uint8Array(await file.slice(start,Math.min(file.size,start+CHUNK_BYTES)).arrayBuffer());check();
     if(chunk.length!==Math.min(CHUNK_BYTES,file.size-start))throw Error('The attachment changed while it was being read.');
     await uploadCall('/api/attachments/chunk',{attachment_id:created.attachment_id,index,data:base64(chunk)});check();progress(Math.min(file.size,start+chunk.length),file.size);
    }
    const descriptor=await uploadCall('/api/attachments/commit',{attachment_id:created.attachment_id});check();
    if(descriptor.attachment_id!==created.attachment_id||descriptor.size!==file.size||descriptor.name!==file.name||!/^[a-f0-9]{64}$/.test(descriptor.sha256))throw Error('The attachment manifest changed.');
    return descriptor;
   })();uploadCache.set(file,upload);
   try{return await upload;}catch(error){uploadCache.delete(file);throw error;}
  }
 };
}
export async function saveChunkedAttachment(route,descriptor,{api,check=()=>{},picker=globalThis.showSaveFilePicker,download,progress=()=>{},pause=delay}){
 // Open the picker in the original click's activation before awaiting a request.
 if(typeof picker!=='function')throw Error('This browser cannot stream a file to disk. Open the workspace in a browser with Save File support to download this attachment.');
 const selection=Promise.resolve(picker.call(globalThis,{suggestedName:descriptor.name})).then(handle=>({handle}),error=>({error}));
 const manifest=await fileCall(api,route+'/manifest',undefined,check,pause);check();
 for(const key of ['attachment_id','name','size','sha256','chunk_size','chunk_count'])if(manifest[key]!==descriptor[key])throw Error('The attachment manifest changed.');
 if(manifest.chunk_size!==CHUNK_BYTES||!Number.isSafeInteger(manifest.size)||manifest.size<0||manifest.chunk_count!==Math.ceil(manifest.size/CHUNK_BYTES))throw Error('The attachment size is invalid.');
 let writable=null;
 try{
  const selected=await selection;check();if(selected.error)throw selected.error;writable=await selected.handle.createWritable();check();
  for(let index=0;index<manifest.chunk_count;index++){
   const result=await fileCall(api,route+'/chunk?index='+index,undefined,check,pause);check();const bytes=decode(result.data);
   if(result.attachment_id!==manifest.attachment_id||result.index!==index||bytes.length!==Math.min(CHUNK_BYTES,manifest.size-index*CHUNK_BYTES))throw Error('Attachment chunk does not match this file.');
   await writable.write(bytes);check();progress(Math.min(manifest.size,(index+1)*CHUNK_BYTES),manifest.size);
  }
  await writable.close();writable=null;
 }catch(error){if(writable)try{await writable.abort();}catch{}throw error;}
}
