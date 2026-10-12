import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import net from 'node:net';
import dns from 'node:dns';
import tls from 'node:tls';
import {installGuard} from '../src/guard.mjs';
import {createMxTransport} from '../src/mx-transport.mjs';

const dnsFailure=code=>Object.assign(new Error('untrusted error text\r\nsecret'),{code});
const draft=extra=>({from:'postmaster@local.test',to:'recipient@example.org',subject:'A Unicode subject 📫 café',body:'Hello café\n.line\n.\nGoodbye',message_id:'<0123456789abcdef0123456789abcdef@local.test>',created_at:'2026-10-12T08:00:00.000Z',helo:'[127.0.0.1]',...extra});

class FakeSocket extends EventEmitter {
  constructor(fixture,phase){super();this.fixture=fixture;this.phase=phase;this.destroyed=false;this.authorized=true;this.protocol='TLSv1.3';}
  getProtocol(){return this.protocol;}
  destroy(){if(!this.destroyed){this.destroyed=true;setImmediate(()=>this.emit('close'));}return this;}
  reply(text,{close=false}={}){
    setImmediate(()=>{
      if(this.destroyed)return;
      const bytes=Buffer.from(text);
      if(this.plan?.fragment){for(let start=0;start<bytes.length;start+=this.plan.fragment)this.emit('data',bytes.subarray(start,start+this.plan.fragment));}
      else this.emit('data',bytes);
      if(close)this.destroy();
    });
  }
  write(text){
    if(this.destroyed)throw dnsFailure('EPIPE');
    this.fixture.writes.push({phase:this.phase,text,host:this.plan.host});
    const key=text.startsWith('EHLO ')?'ehlo':text.startsWith('STARTTLS')?'starttls':text.startsWith('MAIL FROM:')?'mail':text.startsWith('RCPT TO:')?'rcpt':text==='DATA\r\n'?'data':'body';
    if(this.phase==='plain')assert.ok(['ehlo','starttls'].includes(key),'Plaintext must never contain envelope or message bytes');
    if(this.plan.hang===key)return true;
    if(this.plan.disconnect===key){this.destroy();return true;}
    if(this.plan.throwWrite===key)throw dnsFailure('EPIPE');
    if(this.phase==='plain'&&key==='ehlo')this.reply(this.plan.hello??'250-mx.example.net\r\n250 STARTTLS\r\n');
    else if(key==='starttls')this.reply(this.plan.starttls??'220 Begin TLS\r\n');
    else if(key==='ehlo')this.reply(this.plan.secureHello??'250-mx.example.net\r\n250 SIZE 262144\r\n');
    else if(key==='mail')this.reply(this.plan.mail??'250 Sender accepted\r\n');
    else if(key==='rcpt')this.reply(this.plan.rcpt??'250 Recipient accepted\r\n');
    else if(key==='data')this.reply(this.plan.data??'354 Send message\r\n');
    else this.reply(this.plan.final??'250 Message accepted\r\n',{close:this.plan.closeAfterFinal});
    return true;
  }
}
function fixture(t,options={}){
  const f={writes:[],connects:[],tls:[],queries:[],sockets:[],plans:options.plans??[{}],cancelled:0};
  const resolver={
    async resolveMx(host){f.queries.push(['mx',host]);if(options.mxError)throw dnsFailure(options.mxError);return options.mx??[{priority:10,exchange:'mx.example.net'}];},
    async resolve4(host){f.queries.push(['a',host]);if(options.resolve4)return options.resolve4(host);return options.addresses??['93.184.216.34'];},
    async resolve6(host){f.queries.push(['aaaa',host]);if(options.resolve6)return options.resolve6(host);throw dnsFailure('ENODATA');},
    cancel(){f.cancelled++;}
  };
  const dependencies={resolver,
    makeSocket(){const socket=new FakeSocket(f,'plain');f.sockets.push(socket);return socket;},
    connectSocket(socket,pinned){
      const plan=f.plans[f.connects.length]??f.plans.at(-1)??{};socket.plan={...plan,host:pinned.host};f.connects.push(pinned);
      assert.equal(pinned.port,25);assert.equal(net.isIP(pinned.host),pinned.family);assert.equal(pinned.autoSelectFamily,false);
      pinned.lookup(pinned.host,{},(error,address,family)=>{assert.equal(error,null);assert.equal(address,pinned.host);assert.equal(family,pinned.family);});
      pinned.lookup('unexpected.example.net',{},error=>assert.ok(error));
      if(plan.throwConnect)throw dnsFailure(plan.throwConnect);
      if(plan.connectError)setImmediate(()=>socket.emit('error',dnsFailure(plan.connectError)));
      else {
        const greeting=()=>socket.reply(plan.greeting??'220 mx.example.net ESMTP\r\n');
        if(plan.greetingBeforeConnect)greeting();
        if(!plan.hangConnect)setTimeout(()=>{
          if(socket.destroyed)return;
          socket.emit('connect');
          if(!plan.hangGreeting&&!plan.greetingBeforeConnect){if(plan.greetingDelay)setTimeout(greeting,plan.greetingDelay);else greeting();}
        },plan.connectDelay??0);
      }
    },
    startTls(settings){
      f.tls.push(settings);assert.equal(settings.rejectUnauthorized,true);assert.equal(settings.minVersion,'TLSv1.2');assert.equal(typeof settings.checkServerIdentity,'function');
      const socket=new FakeSocket(f,'secure');socket.plan=settings.socket.plan;socket.authorized=socket.plan.authorized??true;socket.protocol=socket.plan.protocol??'TLSv1.3';f.sockets.push(socket);
      if(socket.plan.tlsError)setImmediate(()=>socket.emit('error',dnsFailure(socket.plan.tlsError)));
      else if(!socket.plan.hangTls)setImmediate(()=>socket.emit('secureConnect'));
      return socket;
    }
  };
  f.transport=createMxTransport({dependencies,limits:options.limits});t.after(()=>f.transport.close());
  return f;
}
function checkClosed(f){assert.ok(f.sockets.every(socket=>socket.destroyed),'Every attempted socket must be destroyed');}

test('MX-01 direct delivery uses pinned port 25 and verified STARTTLS before the envelope',async t=>{
  const f=fixture(t,{plans:[{fragment:3,closeAfterFinal:true}]});
  const delivered=await f.transport.deliver(draft());
  assert.deepEqual(delivered,{status:'ACCEPTED',mx:'mx.example.net',code:250,detail:'The recipient mail server accepted the message; inbox delivery is not confirmed.'});
  assert.equal(f.connects.length,1);assert.equal(f.tls[0].servername,'mx.example.net');
  assert.deepEqual(f.writes.map(write=>write.phase),['plain','plain','secure','secure','secure','secure','secure']);
  assert.match(f.writes[2].text,/^EHLO \[127\.0\.0\.1\]/);
  const data=f.writes.at(-1).text;
  assert.match(data,/^From: postmaster@local\.test\r\nTo: recipient@example\.org\r\n/);
  assert.match(data,/Message-ID: <0123456789abcdef0123456789abcdef@local\.test>\r\n/);
  assert.match(data,/Content-Type: text\/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n/);
  assert.equal(Buffer.from(data.split('\r\n\r\n')[1].slice(0,-5).replaceAll('\r\n',''),'base64').toString('utf8'),draft().body);
  assert.ok(data.endsWith('\r\n.\r\n'));assert.equal(data.split('\r\n').filter(line=>line==='.').length,1);
  const encoded=[...data.matchAll(/=\?UTF-8\?B\?([^?]*)\?=/g)];
  assert.equal(encoded.map(match=>Buffer.from(match[1],'base64').toString()).join(''),draft().subject);
  checkClosed(f);
});

test('MX-02 priority order and transient pre-DATA failover preserve a single DATA transmission',async t=>{
  const f=fixture(t,{mx:[{priority:30,exchange:'last.example.net'},{priority:10,exchange:'first.example.net'},{priority:20,exchange:'second.example.net'}],
    resolve4:host=>Promise.resolve([host==='first.example.net'?'8.8.8.8':host==='second.example.net'?'1.1.1.1':'9.9.9.9']),
    plans:[{connectError:'ECONNREFUSED'},{rcpt:'450 Temporary recipient error\r\n'},{}]});
  const delivered=await f.transport.deliver(draft());
  assert.equal(delivered.status,'ACCEPTED');assert.equal(delivered.mx,'last.example.net');
  assert.deepEqual(f.connects.map(connection=>connection.host),['8.8.8.8','1.1.1.1','9.9.9.9']);
  assert.equal(f.writes.filter(write=>write.text.startsWith('From: ')).length,1);checkClosed(f);
});

test('MX-03 transient connection failure tries the next public address on the same MX',async t=>{
  const f=fixture(t,{addresses:['8.8.8.8','1.1.1.1'],plans:[{connectError:'ENETUNREACH'},{}]});
  assert.equal((await f.transport.deliver(draft())).status,'ACCEPTED');assert.equal(f.connects.length,2);checkClosed(f);
});

test('MX-04 null MX, including malformed mixed null MX, never falls back or connects',async t=>{
  for(const mx of [[{priority:0,exchange:'.'}],[{priority:0,exchange:''}],[{priority:0,exchange:'.'},{priority:10,exchange:'mx.example.net'}]]){
    const f=fixture(t,{mx}),delivered=await f.transport.deliver(draft());
    assert.equal(delivered.status,'FAILED');assert.match(delivered.detail,/explicitly does not accept email/);assert.equal(delivered.code,null);assert.equal(f.connects.length,0);assert.deepEqual(f.queries,[['mx','example.org']]);
  }
});

test('MX-05 only absent MX records permit implicit MX; NXDOMAIN and temporary DNS failures do not',async t=>{
  for(const options of [{mxError:'ENODATA'},{mx:[]}]){
    const f=fixture(t,options),delivered=await f.transport.deliver(draft());
    assert.equal(delivered.status,'ACCEPTED');assert.equal(delivered.mx,'example.org');assert.equal(f.tls[0].servername,'example.org');
    assert.ok(f.queries.some(([type,host])=>type==='a'&&host==='example.org'));
  }
  for(const mxError of ['ENOTFOUND','ESERVFAIL','ETIMEOUT']){
    const f=fixture(t,{mxError}),delivered=await f.transport.deliver(draft());
    assert.equal(delivered.status,'FAILED');assert.equal(delivered.code,null);assert.equal(f.connects.length,0);assert.deepEqual(f.queries,[['mx','example.org']]);assert.ok(!delivered.detail.includes('untrusted'));
  }
});

test('MX-06 nonpublic IPv4 and IPv6 answers are rejected before any socket is created',async t=>{
  const forbidden4=['0.0.0.0','10.0.0.1','100.64.1.1','127.0.0.1','169.254.169.254','172.16.1.1','192.0.0.1','192.0.2.1','192.88.99.1','192.168.1.1','198.18.0.1','198.51.100.1','203.0.113.1','224.0.0.1','240.0.0.1','255.255.255.255'];
  const forbidden6=['::','::1','::ffff:127.0.0.1','::ffff:8.8.8.8','fc00::1','fd12::1','fe80::1','fe80::1%eth0','ff02::1','64:ff9b::a00:1','2001::a00:1','2001:2::1','2001:db8::1','2001:10::1','2002:a00:1::','3ffe::1','3fff::1'];
  for(const address of forbidden4){const f=fixture(t,{addresses:[address]}),delivered=await f.transport.deliver(draft());assert.equal(delivered.status,'FAILED',address);assert.match(delivered.detail,/nonpublic or reserved/);assert.equal(f.sockets.length,0);}
  for(const address of forbidden6){const f=fixture(t,{addresses:[],resolve6:()=>Promise.resolve([address])}),delivered=await f.transport.deliver(draft());assert.equal(delivered.status,'FAILED',address);assert.match(delivered.detail,/nonpublic or reserved/);assert.equal(f.sockets.length,0);}
  const mixed=fixture(t,{addresses:['8.8.8.8','127.0.0.1']});assert.equal((await mixed.transport.deliver(draft())).status,'FAILED');assert.equal(mixed.sockets.length,0);
});

test('MX-07 public IPv6 is pinned numerically without hostname lookup at connect time',async t=>{
  const f=fixture(t,{addresses:[],resolve6:()=>Promise.resolve(['2001:4860:4860::8888'])});
  assert.equal((await f.transport.deliver(draft())).status,'ACCEPTED');assert.equal(f.connects[0].family,6);assert.equal(f.connects[0].host,'2001:4860:4860::8888');checkClosed(f);
});

test('MX-08 recipient, HELO and header injection attempts cannot initiate DNS or socket work',async t=>{
  const invalid=[{to:'recipient@localhost'},{to:'recipient@local.test'},{to:'recipient@127.0.0.1'},{to:'recipient@[8.8.8.8]'},{to:'recipient@example.org\r\nRCPT TO:<other@example.net>'},{to:'a@example.org,b@example.net'},{to:'ü@example.org'},{from:'a@example.org\r\nBcc: victim@example.net'},{helo:'mx.example.org\r\nMAIL FROM:<evil@example.net>'},{helo:'localhost'},{subject:'Hi\r\nBcc: victim@example.org'},{subject:'NUL\0'},{message_id:'<ok@example.org>\r\nBcc: victim@example.net'},{message_id:'<bad id@example.org>'},{created_at:'Thu, 1 Jan 1970\r\nBcc: victim@example.net'},{body:'bad\0body'},{body:'x'.repeat(128*1024+1)}];
  for(const input of invalid){const f=fixture(t),delivered=await f.transport.deliver(draft(input));assert.equal(delivered.status,'FAILED',JSON.stringify(input).slice(0,100));assert.equal(delivered.code,null);assert.equal(f.queries.length,0);assert.equal(f.sockets.length,0);}
});

test('MX-09 a canonical local 127 sender is preserved without resolving sender or HELO',async t=>{
  const f=fixture(t),delivered=await f.transport.deliver(draft({from:'user@127.0.0.2',message_id:'<0123456789abcdef@127.0.0.2>'}));
  assert.equal(delivered.status,'ACCEPTED');assert.match(f.writes.at(-1).text,/^From: user@127\.0\.0\.2\r\n/);assert.ok(f.queries.every(([,host])=>!host.startsWith('127.')&&host!=='local.test'));
});

test('MX-10 no STARTTLS, certificate errors, unauthorized sockets or old TLS never send envelope data',async t=>{
  for(const plan of [{hello:'250 mx.example.net\r\n'},{hello:'250 STARTTLS\r\n'},{tlsError:'CERT_HAS_EXPIRED'},{tlsError:'ERR_TLS_CERT_ALTNAME_INVALID'},{authorized:false},{protocol:'TLSv1.1'}]){
    const f=fixture(t,{addresses:['8.8.8.8','1.1.1.1'],plans:[plan,{}]}),delivered=await f.transport.deliver(draft());
    assert.equal(delivered.status,'FAILED');assert.equal(delivered.code,null);assert.equal(f.connects.length,1);assert.ok(!f.writes.some(write=>write.text.startsWith('MAIL FROM:')||write.text.startsWith('From: ')));checkClosed(f);
  }
});

test('MX-11 hard recipient rejection ends delivery without failover and omits untrusted reply text',async t=>{
  const f=fixture(t,{addresses:['8.8.8.8','1.1.1.1'],plans:[{rcpt:'550 Rejected untrusted-secret@example.org\r\n'},{}]});
  const delivered=await f.transport.deliver(draft());assert.equal(delivered.status,'FAILED');assert.equal(delivered.code,550);assert.equal(f.connects.length,1);assert.ok(!delivered.detail.includes('untrusted-secret'));assert.ok(!f.writes.some(write=>write.text==='DATA\r\n'));checkClosed(f);
});

test('MX-12 explicit rejection after DATA is failed and never retried, including 4xx',async t=>{
  for(const final of ['451 Try later\r\n','550 Body rejected\r\n']){
    const f=fixture(t,{addresses:['8.8.8.8','1.1.1.1'],plans:[{final},{}]}),delivered=await f.transport.deliver(draft());
    assert.equal(delivered.status,'FAILED');assert.equal(delivered.code,Number(final.slice(0,3)));assert.equal(f.connects.length,1);assert.equal(f.writes.filter(write=>write.text.startsWith('From: ')).length,1);checkClosed(f);
  }
});

test('MX-13 disconnects, write errors, malformed acknowledgements and timeouts after DATA are unknown without retry',async t=>{
  for(const plan of [{disconnect:'body'},{throwWrite:'body'},{final:'250-First\r\n550 Last\r\n'},{hang:'body'}]){
    const f=fixture(t,{addresses:['8.8.8.8','1.1.1.1'],plans:[plan,{}],limits:{stepMs:40,totalMs:250}}),delivered=await f.transport.deliver(draft());
    assert.equal(delivered.status,'UNKNOWN');assert.equal(delivered.code,null);assert.match(delivered.detail,/Do not automatically resend/);assert.equal(f.connects.length,1);checkClosed(f);
  }
});

test('MX-14 reply parser rejects code mismatch, missing CRLF, surplus replies and line/response limits',async t=>{
  for(const greeting of ['220-Welcome\r\n250 Inconsistent\r\n','220 Bare LF\n','220 Ready\r\n250 Pre-supplied\r\n','220 '+'x'.repeat(509)+'\r\n','220-'+('x'.repeat(490)+'\r\n220-').repeat(40)+'end\r\n']){
    const f=fixture(t,{plans:[{greeting}],limits:{stepMs:40,totalMs:250}}),delivered=await f.transport.deliver(draft());
    assert.equal(delivered.status,'FAILED');assert.equal(delivered.code,null);assert.match(delivered.detail,/reply|limit/);assert.equal(f.connects.length,1);checkClosed(f);
  }
  const f=fixture(t,{plans:[{greeting:'220\r\n',final:'250\r\n'}]});assert.equal((await f.transport.deliver(draft())).status,'ACCEPTED');
});

test('MX-15 maximum attempts, concurrent calls and total time are bounded; close cancels active work',async t=>{
  const attempts=fixture(t,{addresses:['8.8.8.8','1.1.1.1','9.9.9.9'],plans:[{connectError:'ECONNREFUSED'}],limits:{maxAttempts:2}});
  assert.match((await attempts.transport.deliver(draft())).detail,/attempt limit/);assert.equal(attempts.connects.length,2);checkClosed(attempts);
  const busy=fixture(t,{plans:[{hangGreeting:true}],limits:{maxConcurrent:1,stepMs:200,totalMs:250}});
  const first=busy.transport.deliver(draft());await new Promise(resolve=>setImmediate(resolve));
  assert.match((await busy.transport.deliver(draft())).detail,/connection limit/);busy.transport.close();assert.equal((await first).status,'FAILED');assert.ok(busy.cancelled>0);checkClosed(busy);assert.match((await busy.transport.deliver(draft())).detail,/closed/);
  const deadline=fixture(t,{plans:[{hangGreeting:true}],limits:{stepMs:200,totalMs:30}});assert.equal((await deadline.transport.deliver(draft())).status,'FAILED');checkClosed(deadline);
  const dnsHang=fixture(t,{resolve4:()=>new Promise(()=>{}),limits:{dnsMs:30,totalMs:50}});assert.equal((await dnsHang.transport.deliver(draft())).status,'FAILED');assert.equal(dnsHang.sockets.length,0);
});

test('MX-16 Unicode subjects fold into independent RFC 2047 words and base64 lines remain bounded',async t=>{
  const subject='📫'.repeat(110),body='body 😀\n'.repeat(2000),f=fixture(t);
  assert.equal((await f.transport.deliver(draft({subject,body}))).status,'ACCEPTED');
  const data=f.writes.at(-1).text,words=[...data.matchAll(/=\?UTF-8\?B\?([^?]*)\?=/g)];
  assert.equal(words.map(match=>Buffer.from(match[1],'base64').toString()).join(''),subject);assert.ok(words.every(match=>match[0].length<=75));
  assert.ok(data.split('\r\n\r\n')[1].slice(0,-5).split('\r\n').every(line=>line.length<=76));assert.ok(data.split('\r\n').every(line=>Buffer.byteLength(line)<998));
});

test('MX-17 malformed MX hostname and excessive DNS answers are rejected without connecting',async t=>{
  for(const options of [{mx:[{priority:0,exchange:'127.0.0.1'}]},{mx:[{priority:0,exchange:'localhost'}]},{mx:[{priority:0,exchange:'mx.example.org\r\nMAIL FROM:x'}]},{mx:[{priority:-1,exchange:'mx.example.org'}]},{mx:Array(33).fill({priority:0,exchange:'mx.example.org'})},{addresses:Array(33).fill('8.8.8.8')}]){
    const f=fixture(t,options);assert.equal((await f.transport.deliver(draft())).status,'FAILED');assert.equal(f.sockets.length,0);
  }
});

test('MX-18 enabling the narrow transport does not relax ordinary DNS, TCP or listener guards',async t=>{
  // Capture deterministic implementations in a fresh instance of the real
  // module before the guard replaces public APIs. Production code then runs
  // with NO constructor dependencies, proving the capture boundary itself.
  const f={writes:[],connects:[],tls:[],queries:[],sockets:[],cancelled:0};
  const prototype=dns.promises.Resolver.prototype;
  const saved={resolveMx:prototype.resolveMx,resolve4:prototype.resolve4,resolve6:prototype.resolve6,cancel:prototype.cancel,connect:net.Socket.prototype.connect,tls:tls.connect};
  let capability;
  try{
    prototype.resolveMx=async function(host){f.queries.push(['mx',host]);return [{priority:0,exchange:'mx.example.net'}];};
    prototype.resolve4=async function(host){f.queries.push(['a',host]);return ['8.8.8.8'];};
    prototype.resolve6=async function(host){f.queries.push(['aaaa',host]);throw dnsFailure('ENODATA');};
    prototype.cancel=function(){f.cancelled++;};
    net.Socket.prototype.connect=function(pinned){
      assert.equal(pinned.host,'8.8.8.8');assert.equal(pinned.port,25);f.connects.push(pinned);f.sockets.push(this);
      this.fixture=f;this.phase='plain';this.plan={host:pinned.host};this.reply=FakeSocket.prototype.reply.bind(this);this.write=FakeSocket.prototype.write.bind(this);setImmediate(()=>{this.emit('connect');this.reply('220 mx.example.net ESMTP\r\n');});return this;
    };
    tls.connect=settings=>{f.tls.push(settings);const socket=new FakeSocket(f,'secure');socket.plan=settings.socket.plan;f.sockets.push(socket);setImmediate(()=>socket.emit('secureConnect'));return socket;};
    capability=await import('../src/mx-transport.mjs?captured-before-guard');
  }finally{
    for(const key of ['resolveMx','resolve4','resolve6','cancel'])prototype[key]=saved[key];
    net.Socket.prototype.connect=saved.connect;tls.connect=saved.tls;
  }
  installGuard();
  assert.throws(()=>net.connect({host:'8.8.8.8',port:25}),error=>error.code==='ELOCAL127');
  assert.throws(()=>dns.resolveMx('example.org',()=>{}),error=>error.code==='ELOCAL127');
  await assert.rejects(dns.promises.resolveMx('example.org'),error=>error.code==='ELOCAL127');
  const server=net.createServer();assert.throws(()=>server.listen({host:'0.0.0.0',port:0}),error=>error.code==='ELOCAL127');
  const transport=capability.createMxTransport();t.after(()=>transport.close());
  assert.equal((await transport.deliver(draft())).status,'ACCEPTED');
  assert.deepEqual(f.queries,[['mx','example.org'],['a','mx.example.net'],['aaaa','mx.example.net']]);assert.equal(f.connects.length,1);assert.equal(f.tls[0].servername,'mx.example.net');assert.equal(f.tls[0].rejectUnauthorized,true);assert.equal(f.tls[0].minVersion,'TLSv1.2');checkClosed(f);
  assert.throws(()=>net.connect({host:'8.8.8.8',port:25}),error=>error.code==='ELOCAL127');
});

test('MX-19 a server without valid TLS can fail over to another MX without any plaintext envelope',async t=>{
  for(const first of [{hello:'250 mx.example.net\r\n'},{tlsError:'CERT_HAS_EXPIRED'},{authorized:false}]){
    const f=fixture(t,{mx:[{priority:10,exchange:'insecure.example.net'},{priority:20,exchange:'secure.example.net'}],addresses:['8.8.8.8','1.1.1.1'],plans:[first,{}]});
    const delivered=await f.transport.deliver(draft());assert.equal(delivered.status,'ACCEPTED');assert.equal(delivered.mx,'secure.example.net');assert.equal(f.connects.length,2);
    assert.ok(!f.writes.some(write=>write.host==='8.8.8.8'&&write.phase==='plain'&&write.text.startsWith('MAIL FROM:')));assert.equal(f.writes.filter(write=>write.text.startsWith('From: ')).length,1);checkClosed(f);
  }
});

test('MX-20 HELO address literals match the service contract without authorizing any recipient address',async t=>{
  for(const helo of ['[127.0.0.2]','[93.184.216.34]','[IPv6:::1]','[IPv6:2001:4860:4860::8888]']){
    const f=fixture(t);assert.equal((await f.transport.deliver(draft({helo}))).status,'ACCEPTED');assert.equal(f.writes[0].text,'EHLO '+helo+'\r\n');assert.equal(f.queries[0][1],'example.org');
  }
  for(const helo of ['[127.00.0.1]','[999.0.0.1]','[IPv6:bad]','[IPv6:fe80::1%eth0]']){
    const f=fixture(t);assert.equal((await f.transport.deliver(draft({helo}))).status,'FAILED');assert.equal(f.queries.length,0);
  }
});

test('MX-21 an MX without address records can fail over to the next published MX',async t=>{
  const f=fixture(t,{mx:[{priority:10,exchange:'absent.example.net'},{priority:20,exchange:'usable.example.net'}],resolve4:host=>host==='absent.example.net'?Promise.reject(dnsFailure('ENODATA')):Promise.resolve(['8.8.8.8'])});
  const delivered=await f.transport.deliver(draft());assert.equal(delivered.status,'ACCEPTED');assert.equal(delivered.mx,'usable.example.net');assert.equal(f.connects.length,1);
});

test('MX-22 a temporary lookup failure in either IP family preserves validated public answers in the other',async t=>{
  const ipv4=fixture(t,{addresses:['8.8.8.8'],resolve6:()=>Promise.reject(dnsFailure('ETIMEOUT'))});
  assert.equal((await ipv4.transport.deliver(draft())).status,'ACCEPTED');assert.equal(ipv4.connects[0].family,4);checkClosed(ipv4);
  const ipv6=fixture(t,{resolve4:()=>Promise.reject(dnsFailure('ESERVFAIL')),resolve6:()=>Promise.resolve(['2001:4860:4860::8888'])});
  assert.equal((await ipv6.transport.deliver(draft())).status,'ACCEPTED');assert.equal(ipv6.connects[0].family,6);checkClosed(ipv6);
  const dnsTimeout=fixture(t,{addresses:['8.8.8.8'],resolve6:()=>new Promise(()=>{}),limits:{dnsMs:30,totalMs:500}});
  assert.equal((await dnsTimeout.transport.deliver(draft())).status,'ACCEPTED');assert.equal(dnsTimeout.connects[0].family,4);checkClosed(dnsTimeout);
  for(const options of [
    {addresses:['127.0.0.1'],resolve6:()=>Promise.reject(dnsFailure('ETIMEOUT'))},
    {resolve4:()=>Promise.reject(dnsFailure('ESERVFAIL')),resolve6:()=>Promise.resolve(['::1'])},
    {resolve4:()=>Promise.reject(dnsFailure('ESERVFAIL')),resolve6:()=>Promise.resolve(['not-an-ip'])}
  ]){
    const f=fixture(t,options),delivered=await f.transport.deliver(draft());assert.equal(delivered.status,'FAILED');assert.match(delivered.detail,/nonpublic or reserved/);assert.equal(f.sockets.length,0);
  }
  const both=fixture(t,{resolve4:()=>Promise.reject(dnsFailure('ESERVFAIL')),resolve6:()=>Promise.reject(dnsFailure('ETIMEOUT'))});
  assert.equal((await both.transport.deliver(draft())).status,'FAILED');assert.equal(both.sockets.length,0);
});

test('MX-23 a stalled IPv4 connection cannot starve a usable IPv6 address behind other IPv4 answers',async t=>{
  const f=fixture(t,{addresses:['8.8.8.8','1.1.1.1','9.9.9.9'],resolve6:()=>Promise.resolve(['2001:4860:4860::8888']),plans:[{hangConnect:true},{}],limits:{connectMs:30,stepMs:200,totalMs:500}});
  const delivered=await f.transport.deliver(draft());assert.equal(delivered.status,'ACCEPTED');
  assert.deepEqual(f.connects.map(connection=>connection.family),[4,6]);assert.equal(f.connects[1].host,'2001:4860:4860::8888');
  assert.equal(f.writes.filter(write=>write.text.startsWith('From: ')).length,1);checkClosed(f);
});

test('MX-24 TCP connection and server greeting have separate deadlines and a reply cannot fake a connection',async t=>{
  const separate=fixture(t,{plans:[{connectDelay:60,greetingDelay:60}],limits:{connectMs:100,stepMs:100,totalMs:500}});
  assert.equal((await separate.transport.deliver(draft())).status,'ACCEPTED');checkClosed(separate);
  for(const plan of [{hangConnect:true},{hangConnect:true,greetingBeforeConnect:true},{connectError:'ECONNREFUSED'},{connectError:'EACCES'}]){
    const f=fixture(t,{plans:[plan],limits:{connectMs:25,stepMs:100,totalMs:200}}),delivered=await f.transport.deliver(draft());
    assert.equal(delivered.status,'FAILED');assert.match(delivered.detail,/Cannot connect.*SMTP port 25.*network settings/);assert.ok(delivered.detail.length<=128);assert.equal(f.writes.length,0);checkClosed(f);
  }
  const noGreeting=fixture(t,{plans:[{hangGreeting:true}],limits:{connectMs:25,stepMs:30,totalMs:200}}),delivered=await noGreeting.transport.deliver(draft());
  assert.equal(delivered.status,'FAILED');assert.match(delivered.detail,/Connected to SMTP port 25.*greeting/);assert.equal(noGreeting.writes.length,0);checkClosed(noGreeting);
  const syncFailure=fixture(t,{addresses:['8.8.8.8','1.1.1.1'],plans:[{throwConnect:'EACCES'},{}]}),failed=await syncFailure.transport.deliver(draft());
  assert.equal(failed.status,'FAILED');assert.match(failed.detail,/Cannot connect.*SMTP port 25/);assert.equal(syncFailure.connects.length,1);assert.equal(syncFailure.writes.length,0);checkClosed(syncFailure);
});

test('MX-25 overall timeout identifies the active phase and never marks a post-DATA timeout failed',async t=>{
  // Leave time for fake SMTP/TLS stages to settle before the deliberately hung
  // phase reaches the overall deadline, even alongside the full test suite.
  for(const [plan,detail]of [[{hangConnect:true},/Cannot connect.*SMTP port 25/],[{hangGreeting:true},/Connected to SMTP port 25.*greeting/],[{hangTls:true},/secure connection/],[{hang:'rcpt'},/recipient request/]]){
    const f=fixture(t,{plans:[plan],limits:{connectMs:1500,stepMs:1500,totalMs:300}}),delivered=await f.transport.deliver(draft());
    assert.equal(delivered.status,'FAILED');assert.match(delivered.detail,detail);assert.ok(delivered.detail.length<=128);assert.ok(!f.writes.some(write=>write.text.startsWith('From: ')));checkClosed(f);
  }
  const afterData=fixture(t,{addresses:['8.8.8.8','1.1.1.1'],plans:[{hang:'body'},{}],limits:{connectMs:1500,stepMs:1500,totalMs:300}}),delivered=await afterData.transport.deliver(draft());
  assert.equal(delivered.status,'UNKNOWN');assert.match(delivered.detail,/Do not automatically resend/);assert.equal(afterData.connects.length,1);assert.equal(afterData.writes.filter(write=>write.text.startsWith('From: ')).length,1);checkClosed(afterData);
});
