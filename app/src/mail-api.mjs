import {MailError,demand} from './policy.mjs';
import {toEml} from './mime.mjs';

const messageRoute=/^\/api\/messages\/([a-f0-9]{32})(?:\/(eml|proof|attachment\/([0-9])(?:\/(manifest|chunk))?))?$/;
const gets=new Set(['/api/me','/api/mailbox-page','/api/messages','/api/internet/status','/api/internet/outbox']);
const posts=new Set(['/api/mail/quote','/api/mail/send']);
export function mailApiHandles(method,path){
 if(typeof path!=='string'||!path.startsWith('/api/')||path.length>4096||/[#\\\x00-\x20\x7f]/.test(path))return false;
 let url;try{url=new URL(path,'http://127.0.0.1');}catch{return false;}
 return method==='GET'?(gets.has(url.pathname)||messageRoute.test(url.pathname)):method==='POST'&&!url.search&&posts.has(url.pathname);
}

/** One narrow mailbox dispatcher for protected HTTP and the virtual mail socket.
 * The socket never exposes vault bootstrap, operator tools or terminal commands. */
export function createMailApi(store,router,internetMail,{beforeMail=null,accountView=null}={}){
 return async function dispatch(value){
  demand(value&&mailApiHandles(value.method,value.path),'NOT_FOUND','No such mailbox endpoint',404);
  const bearer=value.headers?.authorization;
  demand(typeof bearer==='string'&&bearer.startsWith('Bearer '),'AUTH','Bearer token required',401);
  const tok=bearer.slice(7);store.authenticate(tok);
  const url=new URL(value.path,'http://127.0.0.1'),route=url.pathname;
  const response=(data,type='application/json',headers={})=>({status:200,data,type,headers});
  if(route.startsWith('/api/internet/'))demand(internetMail,'INTERNET_PROTECTED_REQUIRED','Internet email requires the protected workspace launcher',503);
  if(value.method==='GET'){
   if(route==='/api/me')return response(accountView?accountView(tok):store.me(tok));
   if(route==='/api/mailbox-page')return response(store.page(tok,{folder:url.searchParams.get('folder')??'INBOX',limit:url.searchParams.has('limit')?Number(url.searchParams.get('limit')):25,before:url.searchParams.get('before'),head:url.searchParams.get('head')}));
   if(route==='/api/messages')return response(store.list(tok,url.searchParams.get('folder')??'INBOX'));
   if(route==='/api/internet/status')return response(internetMail.status(tok));
   if(route==='/api/internet/outbox')return response(internetMail.list(tok));
   const match=messageRoute.exec(route),message=store.message(tok,match[1]);
   if(match[2]==='proof')return response(store.proof(tok,match[1]));
   if(match[2]==='eml')return response(toEml(message),'application/octet-stream',{'Content-Disposition':'attachment; filename="'+message.message_id+'.eml"'});
   if(match[2]?.startsWith('attachment/')){
    const attachment=message.attachments[Number(match[3])];demand(attachment,'NOT_FOUND','Attachment not found',404);
    if(match[4]==='manifest')return response(store.attachments.manifestForMessage(tok,match[1],Number(match[3])));
    if(match[4]==='chunk'){const index=Number(url.searchParams.get('index'));demand(url.searchParams.has('index')&&Number.isSafeInteger(index)&&index>=0,'ATTACHMENT_INDEX','Provide a chunk index');const bytes=store.attachments.readForMessage(tok,match[1],Number(match[3]),index);try{return response({attachment_id:attachment.attachment_id,index,data:bytes.toString('base64')})}finally{bytes.fill(0)}}
    demand(typeof attachment.data==='string','ATTACHMENT_CHUNKED','Save this attachment through its chunked download',409);
    return response(Buffer.from(attachment.data,'base64'),'application/octet-stream',{'Content-Disposition':"attachment; filename*=UTF-8''"+encodeURIComponent(attachment.name)});
   }
   return response(message);
  }
  demand((value.headers['content-type']??'').split(';')[0]==='application/json'&&value.headers['x-bve-request']==='1','CONTENT_TYPE','JSON and X-BVE-Request: 1 are required',415);
  let input;try{input=JSON.parse(value.body);}catch{throw new MailError('JSON','Malformed mailbox JSON');}
  demand(input&&typeof input==='object'&&!Array.isArray(input),'JSON','Expected a JSON object');
  if(beforeMail)await beforeMail(tok,input);
  if(route==='/api/mail/quote')return response(router.quote(tok,input));
  return response(await router.send(tok,input));
 };
}
