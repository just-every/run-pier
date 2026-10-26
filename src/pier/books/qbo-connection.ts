import type { Bindings } from '../../auth.server';
import { fail, text, type Context } from '../model';
import { cents } from './adapters/types';
import { isoDay } from '../sales-quotes';
import { seal } from '../channels/secrets';
import { QBO_SECRET, qboOrigin } from './qbo-session';

const mappings = (value: any, label: string) => {
  if (!Array.isArray(value) || value.length > 10000) return fail('BOOK_MAPPING', `Supply explicit ${label} mappings.`);
  const seen = new Set<string>();
  return value.map((entry: any) => {
    const sourceId = text(entry.sourceId, 'Pier record'), remoteId = text(entry.remoteId, 'QuickBooks record');
    if (!/^\d+$/.test(remoteId) || seen.has(sourceId)) fail('BOOK_MAPPING', 'Map each Pier record once to a QuickBooks numeric ID.');
    seen.add(sourceId); return { sourceId, remoteId };
  });
};

export async function connectQbo(c: Context, p: any, env: Bindings) {
  if (p.consent !== true) fail('BOOK_CONSENT', 'Explicitly authorize Pier to send supported accounting documents to this QuickBooks company.');
  if (typeof p.sandbox !== 'boolean') fail('BOOK_COMPANY', 'Choose sandbox or production explicitly.');
  const old = c.s.bookConnections[0], realmId = text(p.realmId, 'QuickBooks company ID');
  if (!/^\d+$/.test(realmId)) fail('BOOK_COMPANY', 'Use the company ID from Intuit authorization.');
  const baseUrl = qboOrigin(p.sandbox);
  if (old && c.s.bookJobs.some(j => j.attempted) && (old.provider !== 'qbo' || old.realmId !== realmId || old.baseUrl !== baseUrl)) fail('BOOK_DESTINATION', 'Reconcile existing postings before changing ledger or company.');
  const account = (name: string) => { const value = text(p[name], name); if (!/^\d+$/.test(value)) fail('BOOK_MAPPING', 'Choose a numeric QuickBooks account ID.'); return value; };
  const itemMappings = mappings(p.itemMappings, 'item'), partyMappings = mappings(p.partyMappings, 'customer and supplier');
  for (const m of itemMappings) if (!c.s.items.some(r => r.id === m.sourceId)) fail('BOOK_MAPPING', 'An item mapping names an unknown Pier item.');
  for (const m of partyMappings) if (!c.s.parties.some(r => r.id === m.sourceId)) fail('BOOK_MAPPING', 'A party mapping names an unknown Pier party.');
  for(const value of [p.openingInventoryValue,p.cogsOpeningBalance])if(typeof value!=='string'||!/^(-?)(0|[1-9]\d*)\.\d{2}$/.test(value))fail('BOOK_CUTOVER','Review each opening balance in USD with two decimal places.');
  if(cents(p.openingInventoryValue)<0n)fail('BOOK_CUTOVER','Opening inventory value cannot be negative.');
  const connection = { id: 'qbo', version: (old?.version ?? 0) + 1, provider: 'qbo', baseUrl, realmId, sandbox: p.sandbox, enabled: true,
    approvedBy: c.actor.id, createdAt: old?.createdAt ?? c.now, approvedAt: c.now, problem: null, lastSync: old?.lastSync ?? null,
    inventoryAccountId: account('inventoryAccountId'), cogsAccountId: account('cogsAccountId'), revenueAccountId: account('revenueAccountId'),
    landedCostAccountId: p.landedCostAccountId ? account('landedCostAccountId') : null, purchaseTaxAccountId: p.purchaseTaxAccountId ? account('purchaseTaxAccountId') : null,
    chargeItemId: p.chargeItemId ? account('chargeItemId') : null, clearingAccountId: p.clearingAccountId ? account('clearingAccountId') : null,
    itemMappings, partyMappings, openingInventoryValue:p.openingInventoryValue,cogsOpeningBalance:p.cogsOpeningBalance,taxCode: 'exempt', cutoverDate: isoDay(p.cutoverDate, 'Cutover date') };
  if (new Set([connection.inventoryAccountId, connection.cogsAccountId, connection.revenueAccountId]).size !== 3) fail('BOOK_MAPPING', 'Choose separate inventory, cost of goods and revenue accounts.');
  const keep = old?.provider === 'qbo' && old.enabled && old.realmId === realmId && old.baseUrl === baseUrl && !p.refreshToken;
  if (!keep) c.channelSecrets = [{ channelId: QBO_SECRET, secret: await seal(env, QBO_SECRET, { clientId: text(p.clientId, 'Intuit client ID'), clientSecret: text(p.clientSecret, 'Intuit client secret'), refreshToken: text(p.refreshToken, 'Authorized refresh token'), realmId }) }];
  if(old&&old.provider!=='qbo')c.s.bookJobs=c.s.bookJobs.filter(j=>j.attempted);
  c.s.bookConnections = [connection];
  return connection;
}
