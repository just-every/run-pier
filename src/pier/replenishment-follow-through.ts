import { decimal, format, type Context, type Row } from './model';
import { amount, money } from './money';
import { sellThrough } from './replenishment-demand';
import { receiptBookViews } from './books/receipt-closure';

/** Historical forecasts stay immutable; current receipts and ledger states do not. */
export function replenishmentFollowThrough(c: Context, po: Row) {
  const plan = po.replenishment;
  if (!plan) return null;
  const receipts = c.s.receipts.filter(r => r.poId === po.id && r.status === 'posted');
  const closures = receiptBookViews(c.s, c.s.bookConnections.some(connection => connection.enabled && !connection.problem)).filter(r => r.poId === po.id && r.status !== 'reversed');
  const reconciliation = c.s.bookJobs.find(j => j.key === 'inventory-reconciliation');
  const remaining = po.lines.reduce((n: bigint, l: any) => n + decimal(l.quantity) - decimal(l.received), 0n);
  const actualCost = receipts.reduce((n, r) => n + amount(r.landedCost.total) + (r.lateBills ?? []).reduce((sum: bigint, bill: any) => sum + bill.shares.reduce((v: bigint, share: any) => v + amount(share.amount), 0n), 0n), 0n);
  const elapsed = Math.max(0, Date.parse(c.now) - Date.parse(plan.plannedAt));
  const lines = plan.evidence.map((e: any) => {
    const predicted = decimal(e.forecast?.expected ?? e.observedSold) * BigInt(elapsed) / BigInt(e.windowDays * 86_400_000);
    // The public capture clock and source identities define actual demand, never provider timestamps.
    const days = Math.max(1, Math.ceil(elapsed / 86_400_000));
    const windows = (e.demandWarehouses ?? [e.warehouse]).map((warehouse: string) => sellThrough(c, e.itemId, warehouse, days, plan.plannedAt).find(w => w.days === days)!);
    const actual = { sold: format(windows.reduce((n: bigint, window: any) => n + decimal(window.sold), 0n)),
      channelOrderIds: [...new Set(windows.flatMap((window: any) => window.channelOrderIds))],
      shipmentIds: [...new Set(windows.flatMap((window: any) => window.shipmentIds))], through: c.now };
    return { itemId: e.itemId, warehouse: e.warehouse, forecast: e.forecast ?? null, predicted: format(predicted), actual: actual.sold,
      difference: format(decimal(actual.sold) - predicted), channelOrderIds: actual.channelOrderIds, shipmentIds: actual.shipmentIds,
      received: format(receipts.flatMap(r => r.lines).filter((l: any) => l.itemId === e.itemId).reduce((n: bigint, l: any) => n + decimal(l.quantity), 0n)),
      actualsThrough: actual.through };
  });
  const closed = remaining === 0n && receipts.length > 0 && closures.length === receipts.length && closures.every(r => r.status === 'closed') && reconciliation?.status === 'reconciled';
  return { poId: po.id, plannedAt: plan.plannedAt, checkedAt: c.now, status: closed ? 'closed' : 'open', remaining: format(remaining),
    expectedLandedCost: plan.expectedLandedCost, actualLandedCost: money(actualCost), landedCostDifference: money(actualCost - amount(plan.expectedLandedCost)),
    receiptIds: receipts.map(r => r.id), receiptClosures: closures, inventoryReconciliation: reconciliation ? { id: reconciliation.id, status: reconciliation.status, checkedAt: reconciliation.checkedAt } : null,
    lines, explanation: 'Forecast is the retained planning scenario prorated over elapsed time. Actuals are later native demand captures, posted physical receipts and actual landed charges. Closure requires all goods, paid receipt obligations and the current reconciled inventory ledger; a draft, acknowledgment or posted unpaid bill cannot close this work.' };
}
