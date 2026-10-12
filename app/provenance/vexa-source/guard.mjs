/** Defense in depth for this application's JS runtime, not an OS firewall or hostile-code sandbox. */
import net from 'node:net';import dns from 'node:dns';import dgram from 'node:dgram';import cp from 'node:child_process';import {syncBuiltinESMExports} from 'node:module';
export const networkPolicy={profile:'IPV4_LOOPBACK_ONLY',outbound_attempts_blocked:0,dns_attempts_blocked:0};let installed=false;
function denied(kind){networkPolicy.outbound_attempts_blocked++;const e=new Error('LOCAL127 denies '+kind);e.code='ELOCAL127';return e}
export function installGuard(){if(installed)return;installed=true;
 const connect=net.Socket.prototype.connect;
 net.Socket.prototype.connect=function(...args){let a=args[0];if(Array.isArray(a))a=a[0];let host;
  if(a&&typeof a==='object'){if(a.path)throw denied('IPC/pipe connection');host=a.host??'127.0.0.1'}else if(typeof a==='number'){host=typeof args[1]==='string'?args[1]:'127.0.0.1'}else throw denied('ambiguous connection');
  if(host!=='127.0.0.1')throw denied('nonloopback connection');return connect.apply(this,args)};
 const listen=net.Server.prototype.listen;
 net.Server.prototype.listen=function(...args){const a=args[0];const host=typeof a==='object'?a?.host:args[1];if(host!=='127.0.0.1')throw denied('nonloopback or unspecified listener');return listen.apply(this,args)};
 for(const name of Object.keys(dns)){if(name==='lookup'||name==='lookupService'||name==='reverse'||name.startsWith('resolve')){if(typeof dns[name]==='function')dns[name]=()=>{networkPolicy.dns_attempts_blocked++;throw denied('DNS')}}}
 for(const name of Object.keys(dns.promises)){if(name==='lookup'||name==='lookupService'||name==='reverse'||name.startsWith('resolve')){if(typeof dns.promises[name]==='function')dns.promises[name]=async()=>{networkPolicy.dns_attempts_blocked++;throw denied('DNS')}}}
 for(const obj of [dns.Resolver?.prototype,dns.promises.Resolver?.prototype])if(obj)for(const name of Object.getOwnPropertyNames(obj)){if((name.startsWith('resolve')||name==='reverse')&&typeof obj[name]==='function')obj[name]=()=>{networkPolicy.dns_attempts_blocked++;throw denied('resolver')}}
 // Node's listen() uses lookup even for numeric addresses. Resolve the literal
 // internally, without invoking the original lookup function or any resolver.
 dns.lookup=function(host,options,callback){if(host!=='127.0.0.1'){networkPolicy.dns_attempts_blocked++;throw denied('DNS hostname lookup')}
  const cb=typeof options==='function'?options:callback;if(typeof cb!=='function')throw new TypeError('lookup callback required');
  process.nextTick(()=>options&&typeof options==='object'&&options.all?cb(null,[{address:'127.0.0.1',family:4}]):cb(null,'127.0.0.1',4));};
 dns.promises.lookup=async function(host,options){if(host!=='127.0.0.1'){networkPolicy.dns_attempts_blocked++;throw denied('DNS hostname lookup')}return options?.all?[{address:'127.0.0.1',family:4}]:{address:'127.0.0.1',family:4}};
 dgram.createSocket=()=>{throw denied('UDP')};
 for(const name of ['spawn','spawnSync','exec','execSync','execFile','execFileSync','fork'])cp[name]=()=>{throw denied('child-process execution from server')};
 syncBuiltinESMExports();
}
