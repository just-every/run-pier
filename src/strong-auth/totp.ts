import type { Bindings } from '../auth.server';
const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const encoder = new TextEncoder();
export function newSecret() {
  const bytes = crypto.getRandomValues(new Uint8Array(20));
  let bits = 0, value = 0, result = '';
  for (const byte of bytes) { value = (value << 8) | byte; bits += 8; while (bits >= 5) { bits -= 5; result += alphabet[(value >>> bits) & 31]; } }
  return result;
}
function decode(secret: string) {
  let bits = 0, value = 0; const bytes: number[] = [];
  for (const character of secret) { const index = alphabet.indexOf(character); if (index < 0) throw new Error('Invalid factor'); value = (value << 5) | index; bits += 5; if (bits >= 8) { bits -= 8; bytes.push((value >>> bits) & 255); } }
  return new Uint8Array(bytes);
}
export async function matchingStep(secret: string, code: string, now: number) {
  if (!/^\d{6}$/.test(code)) return null;
  const key = await crypto.subtle.importKey('raw', decode(secret), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  const current = Math.floor(now / 30000);
  for (const step of [current, current - 1, current + 1]) {
    const message = new Uint8Array(8); new DataView(message.buffer).setBigUint64(0, BigInt(step));
    const digest = new Uint8Array(await crypto.subtle.sign('HMAC', key, message));
    const offset = digest[digest.length - 1] & 15;
    const number = ((digest[offset] & 127) * 16777216 + digest[offset + 1] * 65536 + digest[offset + 2] * 256 + digest[offset + 3]) % 1000000;
    const expected = number.toString().padStart(6, '0'); let difference = 0;
    for (let index = 0; index < 6; index++) difference |= expected.charCodeAt(index) ^ code.charCodeAt(index);
    if (!difference) return step;
  }
  return null;
}
async function encryptionKey(env: Bindings) {
  if (!env.INSTALLATION_KEY) throw new Error('Installation encryption key is required');
  const material = await crypto.subtle.digest('SHA-256', encoder.encode('pier-native-factor:' + env.INSTALLATION_KEY));
  return crypto.subtle.importKey('raw', material, 'AES-GCM', false, ['encrypt', 'decrypt']);
}
const base64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const bytes = (text: string) => Uint8Array.from(atob(text), value => value.charCodeAt(0));
export async function seal(env: Bindings, id: string, secret: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: encoder.encode(id) }, await encryptionKey(env), encoder.encode(secret));
  return base64(iv) + '.' + base64(new Uint8Array(encrypted));
}
export async function open(env: Bindings, id: string, sealed: string) {
  const [iv, ciphertext] = sealed.split('.');
  return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes(iv), additionalData: encoder.encode(id) }, await encryptionKey(env), bytes(ciphertext)));
}
