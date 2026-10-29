import { decimal, type Context, type Row, type State } from '../model';
import { amount, money } from '../money';
import { valuationLedger } from '../valuation-ledger';
import type { BookDocument } from './adapters/types';

type Add = (key: string, kind: string, source: Row, sourceKind: string, reference: string, build: () => BookDocument) => void;
const ref = (prefix: string, id: string) => `PIER-${prefix}-${id.replaceAll('-', '').slice(0, 24)}`;

export function planSupplierReturns(c: Context, connection: Row, add: Add, dollars: (value: string) => string) {
  if (!c.s.supplierReturns.some(r => r.dispatch)) return;
  const ledger = valuationLedger(c.s, c.now);
  for (const returned of c.s.supplierReturns.filter(r => r.dispatch)) {
    add(`supplier-return:${returned.id}`, 'journal', returned, 'supplierReturn', ref('SR', returned.id), () => {
      const layers = ledger.supplierReturnLayers.get(returned.id);
      if (!layers?.length || layers.some(layer => layer.value === null)) throw new Error('Review the dispatched supplier return valuation before posting.');
      const total = dollars(money(layers.reduce((n, layer) => n + layer.value!, 0n)));
      if (!amount(total)) throw new Error('A zero-cost supplier return needs accountant review.');
      return { key: `supplier-return:${returned.id}`, kind: 'journal', date: returned.dispatch.at.slice(0, 10), reference: ref('SR', returned.id), total, lines: [{ description: `Supplier return ${returned.reference} awaiting credit or replacement`, quantity: '1', amount: total, account: connection.cogsAccountId, debit: total }, { description: 'Dispatched supplier return inventory', quantity: '1', amount: total, account: connection.inventoryAccountId, credit: total }] };
    });
    for (const resolution of returned.resolutions) {
      if (resolution.kind === 'supplierReturn.credit' && resolution.postingAuthorizedAt) add(`supplier-credit:${resolution.id}`, 'credit', resolution, 'supplierCredit', ref('SC', resolution.id), () => {
        const bill = c.s.supplierBills.find(b => b.id === resolution.supplierBillId)!;
        const total = dollars(money(decimal(resolution.amount) * 1000000n));
        return { key: `supplier-credit:${resolution.id}`, kind: 'credit', date: resolution.at.slice(0, 10), reference: ref('SC', resolution.id), vendorCreditForReference: ref('SB', bill.id), party: { id: returned.supplierId, name: resolution.supplierName, kind: 'supplier' }, total, lines: [{ description: `${resolution.reference} · ${resolution.evidence}`, quantity: '1', amount: total, account: connection.cogsAccountId }] };
      });
      if (resolution.kind === 'supplierReturn.replace') {
        const receipt = c.s.receipts.find(r => r.id === resolution.receiptId)!;
        add(`supplier-replacement:${receipt.id}`, 'journal', receipt, 'supplierReplacement', ref('SREPL', receipt.id), () => {
          const total = dollars(receipt.landedCost.total);
          if (!amount(total)) throw new Error('A zero-cost supplier replacement needs accountant review.');
          return { key: `supplier-replacement:${receipt.id}`, kind: 'journal', date: receipt.createdAt.slice(0, 10), reference: ref('SREPL', receipt.id), total, lines: [{ description: `Replacement at retained original receipt cost ${receipt.originalReceiptId}`, quantity: '1', amount: total, account: connection.inventoryAccountId, debit: total }, { description: 'Supplier return resolved by replacement', quantity: '1', amount: total, account: connection.cogsAccountId, credit: total }] };
        });
      }
    }
  }
}

/** Retained ledger sources explain clearing without treating credit evidence as money. */
export function supplierReturnViews(s: State) {
  return s.supplierReturns.map(returned => {
    if (!returned.dispatch) return returned;
    const source = (key: string, sourceId: string) => {
      const job = s.bookJobs.find(job => job.key === key);
      return { sourceId, jobId: job?.id ?? null, jobVersion: job?.version ?? null, reference: job?.reference ?? null, remoteId: job?.remoteId ?? null, status: job?.status ?? 'pending', amount: job?.document?.total ?? null, reason: job?.reason ?? '' };
    };
    const dispatch = source(`supplier-return:${returned.id}`, returned.id);
    const replacements = returned.resolutions.filter((r: Row) => r.kind === 'supplierReturn.replace').map((r: Row) => source(`supplier-replacement:${r.receiptId}`, r.receiptId));
    const credits = returned.resolutions.filter((r: Row) => r.kind === 'supplierReturn.credit').map((r: Row) => ({ ...source(`supplier-credit:${r.id}`, r.id), reference: r.reference, supplierBillId: r.supplierBillId ?? null }));
    const posted = (entry: typeof dispatch) => entry.status === 'posted' && !!entry.remoteId && entry.amount !== null;
    const dispatched = posted(dispatch) ? amount(dispatch.amount!) : null;
    const replaced = replacements.filter(posted).reduce((n: bigint, entry: typeof dispatch) => n + amount(entry.amount!), 0n);
    const credited = credits.filter(posted).reduce((n: bigint, entry: typeof dispatch) => n + amount(entry.amount!), 0n);
    const remaining = dispatched === null ? null : dispatched - replaced - credited;
    const settled = returned.status === 'reconciled' && [dispatch, ...replacements, ...credits].every(posted) && remaining !== null && remaining >= 0n;
    return { ...returned, clearing: { currency: 'USD', receiptId: returned.receiptId, dispatch, replacements, credits,
      dispatched: dispatched === null ? null : money(dispatched), replaced: money(replaced), credited: money(credited), remaining: remaining === null ? null : money(remaining),
      status: settled ? 'settled' : 'review', nonCreditedCost: settled ? money(remaining!) : null } };
  });
}
