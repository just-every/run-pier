import type { Bindings } from '../../auth.server';
import { fail } from '../model';
const bytes = (value: string) => Uint8Array.from(atob(value), c => c.charCodeAt(0));
const base64 = (value: Uint8Array) => btoa(String.fromCharCode(...value));
async function key(env: Bindings) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(env.SESSION_SECRET));
  return crypto.subtle.importKey('raw', hash, 'AES-GCM', false, ['encrypt', 'decrypt']);
}
export async function seal(env: Bindings, channelId: string, credentials: unknown) {
  if (!credentials || typeof credentials !== 'object' || Array.isArray(credentials) || Object.values(credentials).some(v => typeof v !== 'string')) fail('CREDENTIALS', 'Supply the connection credentials as string fields.');
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(channelId) }, await key(env), new TextEncoder().encode(JSON.stringify(credentials)));
  return `${base64(iv)}.${base64(new Uint8Array(encrypted))}`;
}
export async function credentials(env: Bindings, channelId: string): Promise<Record<string, string>> {
  const stored = await env.DB.prepare('SELECT secret FROM pier_channel_secrets WHERE channel_id=?').bind(channelId).first<{ secret: string }>();
  if (!stored) return fail('CREDENTIALS', 'Reconnect this channel with its account credentials.');
  const [iv, encrypted] = stored.secret.split('.');
  try {
    return JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes(iv), additionalData: new TextEncoder().encode(channelId) }, await key(env), bytes(encrypted))));
  } catch { return fail('CREDENTIALS', 'Reconnect this channel after the installation secret changed.'); }
}
