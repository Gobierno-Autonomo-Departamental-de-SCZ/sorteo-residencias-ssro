// The public URL is explicit: do not trust arbitrary forwarded headers.
export function isAllowedOrigin(origin:string|undefined,protocol:string,host:string|undefined,publicOrigin:string|undefined):boolean {
 if(!origin||origin==='null')return true; // The session CSRF token remains required.
 try{
  const parsed=new URL(origin);
  if(!['http:','https:'].includes(parsed.protocol)||parsed.origin!==origin)return false;
  const allowed=[protocol+'://'+host];
  if(publicOrigin)allowed.push(new URL(publicOrigin).origin);
  return allowed.includes(parsed.origin);
 }catch{return false;}
}
