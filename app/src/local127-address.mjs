// Literal logical mailbox hosts only; this never resolves or binds an address.
export function canonical127Host(host){
 if(typeof host!=='string'||!/^127\.(?:0|[1-9][0-9]{0,2})\.(?:0|[1-9][0-9]{0,2})\.(?:0|[1-9][0-9]{0,2})$/.test(host))return false;
 return host.split('.').every(x=>Number(x)<=255);
}
// The suffix is a private identifier. It is never used as a TCP port and stays
// a decimal string, including values larger than JavaScript's integer precision.
export const MAX_LOCAL127_IDENTIFIER_DIGITS=32;
export function local127DomainParts(domain){
 if(typeof domain!=='string')return null;const parts=domain.split(':');if(parts.length>2||!canonical127Host(parts[0]))return null;
 if(parts.length===2&&!/^[1-9][0-9]{0,31}$/.test(parts[1]))return null;
 return {host:parts[0],identifier:parts.length===2?parts[1]:null};
}
export function canonical127Domain(domain){return local127DomainParts(domain)!==null;}
export function local127Host(address){
 if(typeof address!=='string'||! /^[a-z0-9][a-z0-9._+-]{0,63}@/.test(address))return null;
 const host=address.slice(address.indexOf('@')+1);return canonical127Domain(host)?host:null;
}
