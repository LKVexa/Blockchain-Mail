// The socket carries the same authenticated encrypted frames as protected HTTP.
// Tickets and bearer access never appear in the WebSocket URL.
export const MAIL_SOCKET_PROTOCOL='workspace.mail.v1';
export const MAIL_SOCKET_LIMITS=Object.freeze({pending:4,requestBytes:1700000,responseBytes:16100000,requestMs:120000,admissionMs:10000});
const SOCKET_PATH='/api/mail/socket',encoder=new TextEncoder();

export function supportsMailSocket(path,method='GET'){
  if(typeof path!=='string'||path.length>4096||/[#\\\x00-\x20\x7f]/.test(path))return false;
  const [pathname]=path.split('?');
  if(method==='POST')return path===pathname&&['/api/mail/quote','/api/mail/send'].includes(pathname);
  if(method!=='GET')return false;
  if(['/api/me','/api/mailbox-page','/api/messages','/api/internet/status','/api/internet/outbox'].includes(pathname))return true;
  return /^\/api\/messages\/[a-f0-9]{32}(?:\/(?:eml|proof)|\/attachment\/[0-9])?$/.test(pathname);
}

function error(code,message,safeToFallback=false,name='MailSocketError'){
  const value=new Error(message);value.name=name;value.code=code;value.safeToFallback=safeToFallback;return value;
}
function cancelled(){return error('MAIL_SOCKET_ABORTED','The mail request was cancelled.',false,'AbortError');}
function validFrame(frame){
  return frame&&typeof frame==='object'&&!Array.isArray(frame)&&Object.keys(frame).sort().join(',')==='data,id,issued,nonce,runId,v'&&frame.v===1&&
    typeof frame.id==='string'&&/^[a-f0-9]{32}$/.test(frame.id)&&typeof frame.runId==='string'&&/^[a-f0-9]{32}$/.test(frame.runId)&&
    Number.isSafeInteger(frame.issued)&&typeof frame.nonce==='string'&&/^[A-Za-z0-9+/]{16}$/.test(frame.nonce)&&
    typeof frame.data==='string'&&frame.data.length>=24&&frame.data.length%4===0&&/^[A-Za-z0-9+/]*={0,2}$/.test(frame.data);
}
function socketUrl(origin){
  const url=new URL(origin);
  if(url.protocol!=='http:'||url.hostname!=='127.0.0.1'||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw new TypeError('Mail sockets require the existing local HTTP origin.');
  url.protocol='ws:';url.pathname=SOCKET_PATH;return url.href;
}

export function createMailSocket({origin,protocol=MAIL_SOCKET_PROTOCOL,acquireTicket,WebSocketCtor=globalThis.WebSocket,requestTimeoutMs=MAIL_SOCKET_LIMITS.requestMs,admissionTimeoutMs=MAIL_SOCKET_LIMITS.admissionMs}={}){
  if(protocol!==MAIL_SOCKET_PROTOCOL||typeof acquireTicket!=='function')throw new TypeError('Invalid local mail socket configuration.');
  for(const timeout of [requestTimeoutMs,admissionTimeoutMs])if(!Number.isSafeInteger(timeout)||timeout<1||timeout>MAIL_SOCKET_LIMITS.requestMs)throw new TypeError('Invalid local mail socket timeout.');
  const url=socketUrl(origin);let current=null;

  function finish(connection,entry,failure,response){
    if(entry.finished)return;
    entry.finished=true;connection.pending.delete(entry.frame.id);clearTimeout(entry.timer);entry.signal?.removeEventListener('abort',entry.onAbort);
    if(failure)entry.reject(failure);else entry.resolve(response);
  }
  function stop(connection,code,message,allowFallback=true,name='MailSocketError'){
    if(connection.status==='failed')return;
    connection.status='failed';connection.failure={code,message};clearTimeout(connection.admissionTimer);
    for(const [event,handler]of connection.handlers)try{connection.socket?.removeEventListener(event,handler);}catch{}
    connection.handlers=[];
    try{connection.socket?.close();}catch{}
    connection.rejectReady(error(code,message,allowFallback,name));
    for(const entry of [...connection.pending.values()])finish(connection,entry,error(code,message,allowFallback&&!entry.sent,name));
  }
  function close(){
    const connection=current;current=null;
    if(connection)stop(connection,'MAIL_SOCKET_SESSION','The mail session changed.',false);
  }
  function begin(connection){
    if(connection.started)return;
    connection.started=true;
    connection.admissionTimer=setTimeout(()=>stop(connection,'MAIL_SOCKET_ADMISSION_TIMEOUT','The local mail connection could not become ready.'),admissionTimeoutMs);
    Promise.resolve().then(async()=>{
      let admission;
      try{admission=await acquireTicket(connection.authorization);}catch{stop(connection,'MAIL_SOCKET_TICKET','Local mail access could not be opened.');return;}
      if(connection.status==='failed'||current!==connection)return;
      try{
        if(!admission||typeof admission!=='object'||Array.isArray(admission)||admission.path!==SOCKET_PATH||admission.protocol!==protocol||
          typeof admission.ticket!=='string'||admission.ticket.length<16||admission.ticket.length>512||/[^\x21-\x7e]/.test(admission.ticket)||encoder.encode(JSON.stringify(admission)).length>4096)throw Error();
        if(typeof WebSocketCtor!=='function')throw Error();
        connection.socket=new WebSocketCtor(url,protocol);
        if(['addEventListener','removeEventListener','send','close'].some(method=>typeof connection.socket[method]!=='function'))throw Error();
      }catch{stop(connection,'MAIL_SOCKET_ADMISSION','The local mail connection could not be opened.');return;}
      const socket=connection.socket;
      const onOpen=()=>{
        if(connection.status==='failed'||current!==connection)return;
        if(socket.protocol!==protocol){stop(connection,'MAIL_SOCKET_PROTOCOL','The local mail connection uses an unsupported protocol.');return;}
        try{socket.send(JSON.stringify({ticket:admission.ticket}));}catch{stop(connection,'MAIL_SOCKET_ADMISSION','The local mail connection could not be opened.');}
      };
      const onMessage=event=>{
        if(connection.status==='failed'||current!==connection)return;
        let value;
        try{
          if(typeof event.data!=='string'||event.data.length>MAIL_SOCKET_LIMITS.responseBytes||encoder.encode(event.data).length>MAIL_SOCKET_LIMITS.responseBytes)throw Error();
          value=JSON.parse(event.data);
        }catch{stop(connection,'MAIL_SOCKET_RESPONSE','The local mail connection returned an invalid response.');return;}
        if(connection.status==='opening'){
          if(!value||Object.keys(value).sort().join(',')!=='protocol,ready'||value.ready!==true||value.protocol!==protocol){stop(connection,'MAIL_SOCKET_ADMISSION','The local mail connection refused access.');return;}
          connection.status='ready';clearTimeout(connection.admissionTimer);connection.resolveReady();return;
        }
        const entry=connection.pending.get(value?.id);
        if(!entry||!entry.sent||!validFrame(value)||value.runId!==entry.frame.runId||value.issued!==entry.frame.issued){stop(connection,'MAIL_SOCKET_RESPONSE','The local mail response does not match its request.');return;}
        finish(connection,entry,null,value);
      };
      const onError=()=>stop(connection,'MAIL_SOCKET_CONNECTION','The local mail connection was interrupted.');
      const onClose=()=>stop(connection,'MAIL_SOCKET_CONNECTION','The local mail connection ended. Check saved send results before sending again.');
      connection.handlers=[['open',onOpen],['message',onMessage],['error',onError],['close',onClose]];
      for(const [event,handler]of connection.handlers)socket.addEventListener(event,handler);
    }).catch(()=>stop(connection,'MAIL_SOCKET_CONNECTION','The local mail connection could not be opened.'));
  }
  function connectionFor(authorization){
    if(current&&current.authorization!==authorization)close();
    if(!current){
      let resolveReady,rejectReady;
      const ready=new Promise((resolve,reject)=>{resolveReady=resolve;rejectReady=reject;});ready.catch(()=>{});
      current={authorization,status:'opening',socket:null,pending:new Map(),handlers:[],ready,resolveReady,rejectReady,started:false};
    }
    return current;
  }
  function request(frame,{authorization,signal}={}){
    let text;
    try{
      frame={...frame};
      if(!validFrame(frame)||typeof authorization!=='string'||!authorization||authorization.length>4096||/[\r\n\0]/.test(authorization))throw Error();
      text=JSON.stringify(frame);
      if(encoder.encode(text).length>MAIL_SOCKET_LIMITS.requestBytes)throw Error();
    }catch{return Promise.reject(error('MAIL_SOCKET_FRAME','Invalid or oversized encrypted mail request.'));}
    if(signal?.aborted){close();return Promise.reject(cancelled());}
    const connection=connectionFor(authorization);
    if(connection.status==='failed')return Promise.reject(error(connection.failure.code,connection.failure.message,true));
    if(connection.pending.size>=MAIL_SOCKET_LIMITS.pending)return Promise.reject(error('MAIL_SOCKET_BUSY','The local mail request limit was reached.'));
    if(connection.pending.has(frame.id))return Promise.reject(error('MAIL_SOCKET_DUPLICATE','This encrypted mail request is already pending.'));
    return new Promise((resolve,reject)=>{
      const entry={frame,resolve,reject,signal,sent:false,finished:false};
      entry.onAbort=()=>stop(connection,'MAIL_SOCKET_ABORTED','The mail request was cancelled.',false,'AbortError');
      entry.timer=setTimeout(()=>stop(connection,'MAIL_SOCKET_TIMEOUT','The local mail request timed out. Check saved send results before sending again.'),requestTimeoutMs);
      connection.pending.set(frame.id,entry);signal?.addEventListener('abort',entry.onAbort,{once:true});
      if(signal?.aborted){entry.onAbort();return;}
      begin(connection);
      connection.ready.then(()=>{
        if(entry.finished||current!==connection||connection.status!=='ready')return;
        if(connection.socket.readyState!==1){stop(connection,'MAIL_SOCKET_CONNECTION','The local mail connection ended.');return;}
        if(connection.socket.bufferedAmount+encoder.encode(text).length>MAIL_SOCKET_LIMITS.requestBytes*MAIL_SOCKET_LIMITS.pending){finish(connection,entry,error('MAIL_SOCKET_BUSY','The local mail request buffer limit was reached.'));return;}
        // Calling send is the irreversible submission boundary. A throw or lost
        // reply after this point cannot authorize an automatic HTTP resubmit.
        entry.sent=true;
        try{connection.socket.send(text);}catch{stop(connection,'MAIL_SOCKET_CONNECTION','The local mail connection ended after submission. Check saved send results.');}
      }).catch(()=>{});
    });
  }
  return {request,close,supports:supportsMailSocket};
}
