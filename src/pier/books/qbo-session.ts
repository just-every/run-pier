import type { Bindings } from '../../auth.server';
import { credentials, seal } from '../channels/secrets';
import { BooksProviderError } from './adapters/types';

export const qboOrigin = (sandbox: boolean) => sandbox ? 'https://sandbox-quickbooks.api.intuit.com' : 'https://quickbooks.api.intuit.com';
export const QBO_SECRET = 'books:qbo';

/** Called only while the books lease is held. Persist rotation before using access. */
export async function qboSession(env: Bindings, transport: typeof fetch = fetch) {
  const stored = await env.DB.prepare('SELECT secret FROM pier_channel_secrets WHERE channel_id=?').bind(QBO_SECRET).first<{secret:string}>();
  const saved = await credentials(env, QBO_SECRET);
  if (saved.accessToken && Number(saved.expiresAt) > Date.now() + 60000) return saved;
  if (!saved.clientId || !saved.clientSecret || !saved.refreshToken || !saved.realmId) throw new Error('Reconnect QuickBooks with current company authorization. Restored archives carry no credentials.');
  const response = await transport('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', {
    method: 'POST', redirect: 'manual', headers: { Authorization: `Basic ${btoa(`${saved.clientId}:${saved.clientSecret}`)}`, 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: saved.refreshToken }).toString(),
  });
  if (!response.ok) throw new BooksProviderError('QuickBooks authorization', response.status);
  const body: any = await response.json();
  if (typeof body.refresh_token !== 'string' || !body.refresh_token || typeof body.access_token !== 'string' || !body.access_token || !Number.isFinite(body.expires_in) || body.expires_in <= 0) throw new Error('QuickBooks returned incomplete authorization. Reconnect before posting.');
  const next = { ...saved, refreshToken: body.refresh_token, accessToken: body.access_token, expiresAt: String(Date.now() + body.expires_in * 1000) };
  const updated = await env.DB.prepare('UPDATE pier_channel_secrets SET secret=? WHERE channel_id=? AND secret=?').bind(await seal(env, QBO_SECRET, next), QBO_SECRET, stored?.secret ?? '').run();
  if(!updated.meta.changes)throw new Error('QuickBooks authority changed while renewing authorization. Reconnect explicitly.');
  return next;
}

export function qboClient(baseUrl: string, secret: Record<string, string>, transport: typeof fetch = fetch) {
  const root = `${baseUrl}/v3/company/${encodeURIComponent(secret.realmId)}/`;
  const request = async (path: string) => {
    const response = await transport(new URL(path, root), { redirect: 'manual', headers: { Authorization: `Bearer ${secret.accessToken}`, Accept: 'application/json' } });
    if (!response.ok) throw new BooksProviderError('QuickBooks', response.status);
    const body: any = await response.json();
    if (!body || body.Fault) throw new Error('QuickBooks refused the accounting request. Review its source and period.');
    return body;
  };
  const query = async (sql: string, entity: string): Promise<any[]> => {
    const body = await request('query?' + new URLSearchParams({ query: sql }));
    if (!body.QueryResponse || typeof body.QueryResponse !== 'object') throw new Error('QuickBooks returned an invalid query result.');
    const rows = body.QueryResponse[entity] ?? [];
    if (!Array.isArray(rows)) throw new Error('QuickBooks returned an invalid collection.');
    return rows;
  };
  return { request, query };
}
