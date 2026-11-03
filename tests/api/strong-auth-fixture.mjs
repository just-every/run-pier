import { createHmac } from 'node:crypto';
// Independent authenticator implementation for public-door factor journeys.
export function authenticatorCode(secret, now = Date.now()) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'; let value=0,bits=0; const bytes=[];
  for(const character of secret){value=(value<<5)|alphabet.indexOf(character);bits+=5;if(bits>=8){bits-=8;bytes.push((value>>>bits)&255);}}
  const counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(Math.floor(now/30000)));
  const digest=createHmac('sha1',Buffer.from(bytes)).update(counter).digest(), offset=digest[digest.length-1]&15;
  return String((digest.readUInt32BE(offset)&0x7fffffff)%1000000).padStart(6,'0');
}
