export type Claims = { sub: string; room: string; iat: number; exp: number; iss: 'emberfall-admin'; aud: 'emberfall-authority' };
const encoder=new TextEncoder();
const encode=(bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
const decode=(value: string) => {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('Invalid token');
  return Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
};
const header=encode(encoder.encode(JSON.stringify({alg:'HS256',typ:'JWT'})));
async function key(secret: string, usage: ('sign'|'verify')[]) {
  if (encoder.encode(secret).length<32) throw new Error('Signing secret must contain at least 32 bytes');
  return crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,usage);
}
export async function issueSession(secret: string, actor: string, room: string, now=Math.floor(Date.now()/1000), ttl=900): Promise<string> {
  if (!/^[a-zA-Z0-9_-]{8,80}$/.test(actor) || !/^[a-zA-Z0-9_-]{1,64}$/.test(room) || !Number.isInteger(ttl) || ttl<1 || ttl>3600) throw new Error('Invalid session scope or lifetime');
  const claims: Claims={sub:actor,room,iat:now,exp:now+ttl,iss:'emberfall-admin',aud:'emberfall-authority'};
  const payload=header+'.'+encode(encoder.encode(JSON.stringify(claims)));
  return payload+'.'+encode(new Uint8Array(await crypto.subtle.sign('HMAC',await key(secret,['sign']),encoder.encode(payload))));
}
export async function verifySession(token: string, secret: string, room: string, now=Math.floor(Date.now()/1000)): Promise<Claims> {
  if (token.length>2048) throw new Error('Invalid token');
  const parts=token.split('.');
  if (parts.length!==3 || parts[0]!==header || !(await crypto.subtle.verify('HMAC',await key(secret,['verify']),decode(parts[2]),encoder.encode(parts[0]+'.'+parts[1])))) throw new Error('Invalid signature');
  const c=JSON.parse(new TextDecoder().decode(decode(parts[1]))) as Claims;
  if (!c || typeof c.sub!=='string' || !/^[a-zA-Z0-9_-]{8,80}$/.test(c.sub) || c.room!==room || c.iss!=='emberfall-admin' || c.aud!=='emberfall-authority' || !Number.isSafeInteger(c.iat) || !Number.isSafeInteger(c.exp) || c.iat>now || c.exp<=now || c.exp<=c.iat || c.exp-c.iat>3600) throw new Error('Invalid claims');
  return c;
}
