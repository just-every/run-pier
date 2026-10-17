import type { Bindings } from '../../auth.server';
import { fail } from '../model';
import { credentials } from '../channels/secrets';
import { pantryClient, PantryRefusal, PANTRY_CREDENTIAL } from './adapters/pantry-client';

/** The Pantry origin an owner typed: public HTTPS, or loopback HTTP from a local Pier only. */
export function pantryOrigin(value: unknown, env: Bindings): string {
  let url: URL;
  try { url = new URL(String(value ?? '').trim()); } catch { return fail('BOOK_URL', 'Enter Pantry\'s address, for example https://books.example.com or, on this computer, http://localhost:8790.'); }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || url.hostname.endsWith('.localhost');
  if (url.username || url.password || url.pathname !== '/' || url.search || url.hash || (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) || (local && env.AUTH_LOCAL !== 'true'))
    fail('BOOK_URL', 'Use Pantry\'s address only (no path), on HTTPS. A http://localhost address works only when Pier also runs on this computer.');
  return url.origin;
}

// Each record type Pier reads or writes, checked with an exact lookup that matches nothing.
const PROBES: [string, string][] = [
  ['contacts?name=pier-permission-check', 'Contacts'],
  ['bills?reference=pier-permission-check', 'Bills'],
  ['invoices?number=pier-permission-check', 'Invoices'],
  ['journals?memo=pier-permission-check', 'Journals'],
  ['documents?name=pier-permission-check', 'Documents'],
  ['payments?billId=pier-permission-check', 'Payments readback'],
  ['reports/trial-balance', 'Reports'],
];

/** Read Pantry's chart with a credential, saying in plain words what is missing. */
export async function pantryAccounts(env: Bindings, payload: any, connected?: { [key: string]: any }) {
  const typed = String(payload.integrationToken ?? '').trim();
  const baseUrl = payload.baseUrl ? pantryOrigin(payload.baseUrl, env) : connected?.baseUrl ?? pantryOrigin('', env);
  let integrationToken = typed;
  if (!typed) {
    if (!connected || connected.baseUrl !== baseUrl) fail('BOOK_CREDENTIAL', 'Paste the Pantry integration credential you created for Pier.');
    integrationToken = (await credentials(env, 'books:pantry').catch(() => ({} as Record<string, string>))).integrationToken ?? '';
  }
  if (!PANTRY_CREDENTIAL.test(integrationToken)) fail('BOOK_CREDENTIAL', 'A Pantry integration credential starts with pantry_integration_. Copy it from Pantry when you create it (it is shown once).');
  const client = pantryClient({ baseUrl, credentials: { integrationToken } });
  const refused = (error: unknown) => {
    if (!(error instanceof PantryRefusal)) fail('BOOK_UNREACHABLE', `Pier could not reach Pantry at ${baseUrl}. Check that Pantry is running and the address matches Pantry's browser tab.`);
    if ((error as PantryRefusal).status === 401) fail('BOOK_CREDENTIAL', 'Pantry did not accept this credential. It may be mistyped, revoked or from another Pantry. Create a new one in Pantry and paste it here.');
    throw error;
  };
  let state: any;
  try { state = await client.request('state'); } catch (error) { refused(error); }
  const missing: string[] = [];
  for (const [path, scope] of PROBES) {
    try { await client.request(path); } catch (error) { if (error instanceof PantryRefusal && error.status === 403) missing.push(scope); else refused(error); }
  }
  if (missing.length) fail('BOOK_SCOPES', `This credential is missing: ${missing.join(', ')}. In Pantry, revoke it and create a new one with every permission Pier lists.`);
  if (!Array.isArray(state?.accounts)) fail('BOOK_UNREACHABLE', 'Pantry did not return its chart of accounts. Check that the address is a Pantry installation.');
  return {
    baseUrl,
    accounts: state.accounts.filter((a: any) => a.active === 1 || a.active === true)
      .map((a: any) => ({ id: String(a.id), code: String(a.code), name: String(a.name), type: String(a.type), subtype: String(a.subtype ?? 'other') })),
  };
}
