import { type Context, type Row } from '../model';
import { amount, money } from '../money';
import { sha256 } from '../import-kit';
import { planBooks, dollars } from './planning';
import type { BookDocument } from './adapters/types';

export const qboReference = (key: string) => `P-${sha256(key).slice(0, 19)}`;

/** Only explicitly mapped USD documents cross the ledger boundary. */
export function planQboBooks(c: Context) {
  const connection = c.s.bookConnections.find(r => r.enabled && r.provider === 'qbo');
  if (!connection) return;
  planBooks(c);
  c.s.bookJobs=c.s.bookJobs.filter(j=>!(j.sourceKind==='return'&&j.kind==='credit'&&!j.attempted&&c.s.returns.some(r=>r.id===j.sourceId&&c.s.shipments.some(sh=>sh.id===r.shipmentId&&c.s.invoices.some(i=>i.orderId===sh.orderId)))));
  for (const job of c.s.bookJobs.filter(job => !job.attempted && ['invoice', 'credit'].includes(job.kind) && ['order', 'return'].includes(job.sourceKind))) {
    if (job.document) job.version++;
    job.document = null; job.status = 'review';
    job.reason = 'Authorize the native customer invoice or linked credit before posting to QuickBooks.';
    job.fix = 'Review and authorize the customer document in Sales. Shipping alone never authorizes an accounting invoice.';
  }

  const add = (key: string, kind: string, source: Row, sourceKind: string, build: () => BookDocument) => {
    const old = c.s.bookJobs.find(r => r.key === key);
    if (old?.attempted || old?.status === 'skipped') return;
    let document: BookDocument | null = null, reason = '';
    try { document = build(); } catch (error) { reason = error instanceof Error ? error.message : 'Review this source.'; }
    const fields = { kind, sourceKind, sourceId: source.id, connectionId: connection.id, reference: qboReference(key), document, total: kind==='payment'?document?.payment?.amount ?? null:document?.total ?? null, currency: 'USD', status: reason ? 'review' : 'pending', reason, fix: 'Review the source and explicit QuickBooks mappings in Books settings, then retry.' };
    if (old) { if (JSON.stringify(old.document) !== JSON.stringify(document) || old.reason !== reason) Object.assign(old, fields, { version: old.version + 1 }); }
    else c.s.bookJobs.push({ id: crypto.randomUUID(), key, version: 1, createdAt: c.now, attempted: false, ...fields });
  };
  const invoiceDocument = (invoice: Row, key: string, kind: 'invoice' | 'credit' = 'invoice'): BookDocument => {
    if (invoice.currency !== 'USD') throw new Error('QuickBooks posting currently requires a reviewed USD invoice. Foreign currency mapping remains pending.');
    if (amount(invoice.tax?.amount ?? '0') !== 0n) throw new Error('QuickBooks taxable invoice mapping is not configured. This document remains unposted for accountant review.');
    const lines = [...invoice.lines, ...(invoice.charges ?? [])].map((line: Row) => {
      const value = dollars(line.amount);
      if (amount(value) < 0n) throw new Error('QuickBooks discount mapping requires accountant review.');
      return { itemId: line.itemId, description: line.description, quantity: '1', unitPrice: value, amount: value, account: connection.revenueAccountId };
    });
    return { key, kind, date: invoice.date, reference: qboReference(key), dueDate: invoice.dueDate, party: { id: invoice.customerId, name: invoice.customer?.name ?? c.s.parties.find(r => r.id === invoice.customerId)?.name ?? '', kind: 'customer' }, lines, total: dollars(invoice.total) };
  };
  for (const invoice of c.s.invoices.filter(r => ['authorized', 'voided'].includes(r.status))) {
    if (invoice.date < connection.cutoverDate) continue;
    const key = `nativeInvoice:${invoice.id}`;
    if (invoice.status === 'authorized' || c.s.bookJobs.some(j => j.key === key && j.attempted)) add(key, 'invoice', invoice, 'nativeInvoice', () => invoiceDocument(invoice, key));
    for (const payment of c.s.invoicePayments.filter(p => p.invoiceId === invoice.id && p.status === 'succeeded' && p.provider !== 'qbo')) {
      const paymentKey = `invoicePayment:${payment.id}`;
      add(paymentKey, 'payment', payment, 'invoicePayment', () => {
        if (!connection.clearingAccountId) throw new Error('Choose the QuickBooks clearing account before posting captured payments.');
        return { ...invoiceDocument(invoice, key), payment: { reference: qboReference(paymentKey), sourceReference: qboReference(paymentKey), amount: dollars(payment.amount), date: payment.createdAt.slice(0, 10), bankAccountId: connection.clearingAccountId } };
      });
    }
  }
  for (const credit of c.s.invoiceCredits.filter(r => r.status === 'authorized' && r.date >= connection.cutoverDate)) {
    const key = `nativeCredit:${credit.id}`;
    add(key, 'credit', credit, 'invoiceCredit', () => ({ ...invoiceDocument(credit, key, 'credit'), creditForReference: qboReference(`nativeInvoice:${credit.invoiceId}`) }));
  }
  // Valuation is compared with the mapped ledger account, not encoded as an item.
  c.s.bookJobs = c.s.bookJobs.filter(j => !(j.kind === 'valuation' && !j.attempted));
  for (const job of c.s.bookJobs.filter(j => j.connectionId === connection.id && !j.attempted && j.document)) {
    const doc: BookDocument = structuredClone(job.document);
    try {
      if (doc.date < connection.cutoverDate) throw new Error('Source predates the approved QuickBooks cutover. Review opening balances before posting history.');
      doc.reference = job.sourceKind === 'invoicePayment' ? qboReference(`nativeInvoice:${c.s.invoicePayments.find(p => p.id === job.sourceId)?.invoiceId}`) : qboReference(job.key);
      if (doc.creditForReference && !doc.creditForReference.startsWith('P-')) {
        const invoice = c.s.bookJobs.find(j => j.reference === doc.creditForReference);
        if (!invoice) throw new Error('Map the original invoice before its credit.');
        doc.creditForReference = qboReference(invoice.key);
      }
      if (doc.party) {
        const mapping = connection.partyMappings.find((m: Row) => m.sourceId === doc.party!.id);
        if (!mapping) throw new Error('Map this customer or supplier to a QuickBooks record in Books settings.');
        doc.party.id = mapping.remoteId;
      }
      for (const line of doc.lines) {
        if (job.kind === 'item' || ['invoice', 'credit'].includes(doc.kind)) {
          const mapping = connection.itemMappings.find((m: Row) => m.sourceId === line.itemId);
          line.itemId = mapping?.remoteId ?? (!line.itemId ? connection.chargeItemId : null);
          if (!line.itemId) throw new Error('Map every invoice item and charge item in Books settings.');
          line.account = connection.revenueAccountId;
        }
      }
      if (job.kind === 'item') {
        // Definitions are read from existing mapped QBO objects; never duplicate them.
        const item = c.s.items.find(r => r.id === job.sourceId)!;
        doc.reference = item.sku; doc.remoteId = doc.lines[0].itemId;
      }
      job.document = doc; job.reference = doc.reference;
    } catch (error) { job.document = null; job.status = 'review'; job.reason = error instanceof Error ? error.message : 'Review the QuickBooks mapping.'; }
  }
}
