import type { Bindings } from '../../auth.server';
import { execute } from '../api';
import { activeAutomationActors, load } from '../storage';
import { providerOperation, type ProviderAudit } from '../provider-audit';
import { valuationLedger } from '../valuation-ledger';
import { money } from '../money';
import type { Row, State } from '../model';
import { applyQboCredit } from './qbo-credit-application';
import { qboPayments } from './qbo-payments';
import { createQboAdapter, voidQboInvoice } from './adapters/qbo';
import { BooksProviderError, cents, usd, type BookDocument } from './adapters/types';
import { qboSession, qboClient } from './qbo-session';

/** Same installation-wide lease as Pantry; durable intent precedes every write. */
export async function syncQboBooks(env: Bindings) {
  const token = crypto.randomUUID(), start = Date.now();
  const lease = await env.DB.prepare('INSERT INTO pier_book_locks(id,token,expires_at) VALUES(1,?,?) ON CONFLICT(id) DO UPDATE SET token=excluded.token,expires_at=excluded.expires_at WHERE expires_at<?').bind(token, start + 60000, start).run();
  if (!lease.meta.changes) return { busy: true };
  let processed = 0;
  try {
    const initial = await load(env.DB), connection = initial.bookConnections.find(r => r.enabled && r.provider === 'qbo');
    if (!connection || (await activeAutomationActors(env.DB))[connection.approvedBy] !== 'owner') return { processed };
    const op = await env.DB.prepare('SELECT version,display_name FROM oa_operators WHERE id=?').bind(connection.approvedBy).first<any>();
    const actor = { id: connection.approvedBy, role: 'owner', name: op.display_name, operatorVersion: op.version, sessionId: 'books-policy' };
    const policy = { collection: 'bookConnections' as const, id: connection.id, version: connection.version };
    const record = (type: string, payload: object) => execute(env, actor, `book-${crypto.randomUUID()}`, type, payload, undefined, policy);
    const transport = (state: State, job?: Row): typeof fetch => async (input, init) => {
      const source: ProviderAudit = { actor, policy, commandId: crypto.randomUUID(), connectorId: 'qbo', operation: 'book.qboRequest', direction: (init?.method ?? 'GET') === 'GET' ? 'inbound' : 'outbound', state,
        sources: [{ collection: 'bookConnections', row: connection }, ...(job ? [{ collection: 'bookJobs' as const, row: job }] : [])], requestId: job?.key, externalIds: job?.remoteId ? [job.remoteId] : [] };
      return providerOperation(env.DB, source, () => fetch(input, init), response => ({ outcome: response.ok ? 'accepted' : response.status < 500 ? 'refused' : 'uncertain' }));
    };
    let secret: Record<string, string>;
    try {
      secret = await qboSession(env, transport(initial));
      const company = (await qboClient(connection.baseUrl, secret, transport(initial)).request(`companyinfo/${encodeURIComponent(connection.realmId)}`)).CompanyInfo;
      if (company?.Country !== 'US') throw new Error('The authorized QuickBooks company must be a US company.');
    } catch {
      await record('book.checked', { problem: 'QuickBooks authorization or US company verification failed. Reconnect the authorized company; nothing was posted.' });
      return { processed };
    }
    await record('book.plan', {});
    const snapshots = (await load(env.DB)).bookJobs.filter(j => j.connectionId === connection.id && j.document && j.status !== 'skipped').sort((a, b) => Number(a.kind === 'credit') - Number(b.kind === 'credit'));
    for (const snapshot of snapshots) {
      if (Date.now() - start > 20000) break;
      let state = await load(env.DB), job = state.bookJobs.find(r => r.id === snapshot.id)!;
      const current = state.bookConnections[0];
      if (!current?.enabled || current.version !== connection.version) break;
      let creating = false;
      const doc = { ...job.document, ...(job.remoteId ? { remoteId: job.remoteId } : {}) } as BookDocument;
      try {
        let remote = createQboAdapter({ baseUrl: connection.baseUrl, credentials: secret, fetch: transport(state, job) });
        const nativeInvoice=job.sourceKind==='nativeInvoice'?state.invoices.find(r=>r.id===job.sourceId):null;
        if(nativeInvoice?.status==='voided'){
          const begun=await record('book.begin',{jobId:job.id});state=await load(env.DB);job=begun.result as Row;creating=true;
          const result=await voidQboInvoice({baseUrl:connection.baseUrl,credentials:secret,fetch:transport(state,job)},doc);
          await record('book.record',{jobId:job.id,result:{remoteId:result.id,status:'reconciled',paid:'0.00',open:'0.00',reason:'QuickBooks confirmed the unpaid invoice void.',fix:''}});processed++;continue;
        }
        let result = await remote.read(doc);
        if (!result && job.attempted && !job.resend) {
          await record('book.record', { jobId: job.id, result: { status: 'uncertain', reason: 'QuickBooks has no matching record for this attempted posting. The owner must retry after checking the company.', fix: 'Check QuickBooks, then choose Retry. Pier keeps the original request identity.' } }); continue;
        }
        if (!result || doc.payment && !result.paymentCurrent) {
          if (job.kind === 'item') throw new Error('The mapped QuickBooks item is missing. Restore or remap it before posting.');
          const begun = await record('book.begin', { jobId: job.id });
          state = await load(env.DB); job = begun.result as Row; creating = true;
          remote = createQboAdapter({ baseUrl: connection.baseUrl, credentials: secret, fetch: transport(state, job) });
          result = await remote.post({ ...doc, ...(result ? { remoteId: result.id } : {}) });
        }
        if (!['active', 'open', 'partial', 'paid', 'posted', 'attached'].includes(result.status)) throw new Error('QuickBooks record is inactive or unsupported.');
        if(job.sourceKind==='invoiceCredit'){
          const begun=await record('book.begin',{jobId:job.id});state=await load(env.DB);job=begun.result as Row;creating=true;
          await applyQboCredit({baseUrl:connection.baseUrl,credentials:secret,fetch:transport(state,job)},doc,result.id);
        }
        const creditIds=state.bookJobs.filter(j=>j.sourceKind==='invoiceCredit'&&state.invoiceCredits.some(cr=>cr.id===j.sourceId&&cr.invoiceId===job.sourceId)).map(j=>j.remoteId).filter(Boolean);
        const payments=job.sourceKind==='nativeInvoice'?await qboPayments(qboClient(connection.baseUrl,secret,transport(state,job)),doc,result.id,creditIds):undefined;
        await record('book.record', { jobId: job.id, result: { ...(payments?{payments}:{}),remoteId: result.id, status: result.status === 'paid' || result.open === '0.00' ? 'reconciled' : 'posted', paid: result.paid ?? null, open: result.open ?? null, reason: '', fix: '' } });
        processed++;
      } catch (error) {
        const status = creating || job.attempted ? 'uncertain' : 'review';
        const refused = error instanceof BooksProviderError && error.status >= 400 && error.status < 500;
        await record('book.record', { jobId: job.id, result: { status: refused ? 'review' : status,
          reason: error instanceof BooksProviderError ? `QuickBooks refused this request (HTTP ${error.status}). Check authorization, mapping and closed periods.` : error instanceof Error ? error.message : 'QuickBooks did not confirm this request.',
          fix: 'The owner must reconcile the current QuickBooks record and source. Pier never overwrites external changes or silently repeats an unknown posting.' } });
        if (error instanceof BooksProviderError && error.status === 401) {
          await record('book.checked', { problem: 'QuickBooks authorization expired or was revoked. Reconnect before syncing.' }); return { processed };
        }
      }
    }
    const state = await load(env.DB), layers = valuationLedger(state, new Date().toISOString()).positions.flatMap(p => p.layers).filter(l => l.quantity > 0n);
    const expected = layers.some(l => l.value === null) ? null : money(layers.reduce((n, l) => n + l.value!, 0n));
    try {
      const account = (await qboClient(connection.baseUrl, secret, transport(state)).request(`account/${encodeURIComponent(connection.inventoryAccountId)}`)).Account;
      if (!account?.Active || account.AccountType !== 'Other Current Asset' || account.CurrentBalance === undefined) throw new Error('Review the mapped active QuickBooks inventory asset account.');
      await record('book.reconcile', { actual: usd(cents(account.CurrentBalance)), expected, through: new Date().toISOString().slice(0, 10) });
      await record('book.checked', { problem: null });
    } catch {
      await record('book.reconcile', { actual: null, expected, problem: 'QuickBooks inventory value could not be verified. Review its mapped asset account and authorization.' });
      await record('book.checked', { problem: 'QuickBooks inventory comparison needs owner review.' });
    }
    return { processed };
  } finally { await env.DB.prepare('DELETE FROM pier_book_locks WHERE id=1 AND token=?').bind(token).run(); }
}
