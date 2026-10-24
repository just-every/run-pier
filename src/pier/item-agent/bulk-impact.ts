import { backorderDates } from '../backorders';
import { decimal, format, type Context } from '../model';
import { amount, money } from '../money';
import { expectedLandedCost } from '../purchasing-workflow';

/** Impacts use the same isolated ordinary-command state as the exact row preview. */
export function bulkImpact(beforeContext: Context, afterContext: Context, entry: any, before: any, after: any) {
  const previousPlans = backorderDates(beforeContext), nextPlans = backorderDates(afterContext);
  const itemIds = new Set<string>([...before.lines, ...after.lines].map((line: any) => line.itemId));
  const affectedPromises = nextPlans.flatMap(plan => {
    if (entry.type === 'order.repromise' && plan.orderId !== after.id) return [];
    const previous = previousPlans.find(row => row.orderId === plan.orderId);
    const order = afterContext.s.orders.find(row => row.id === plan.orderId)!;
    const lines = plan.lines.filter((line: any) => itemIds.has(line.itemId) && decimal(line.backorder) > 0n).map((line: any) => ({
      orderLineId: line.orderLineId, itemId: line.itemId, quantity: line.backorder,
      before: previous?.lines.find((old: any) => old.orderLineId === line.orderLineId)?.promiseDate ?? null,
      after: line.promiseDate, expectedDate: line.expectedDate, estimated: line.estimated, sources: line.sources,
    }));
    return lines.length ? [{ orderId: order.id, reference: order.reference, lines }] : [];
  });
  const cashBefore = entry.type === 'po.revise' ? expectedLandedCost(before) : null;
  const cashAfter = entry.type === 'po.revise' ? expectedLandedCost(after) : null;
  const quantities = new Map<string, bigint>();
  for (const line of affectedPromises.flatMap(p => p.lines)) quantities.set(line.itemId, (quantities.get(line.itemId) ?? 0n) + decimal(line.quantity));
  return {
    cash: cashBefore && cashAfter ? { before: cashBefore, after: cashAfter, delta: money(amount(cashAfter.total) - amount(cashBefore.total)), currency: 'USD', status: 'draft; separate purchase approval required' } : { delta: money(0n), currency: 'USD', status: 'No purchase cash change' },
    promise: { before: before.promiseDate ?? null, after: after.promiseDate ?? null, lines: after.promiseHistory?.at(-1)?.lines ?? [] },
    affectedPromises,
    service: { affectedOrders: affectedPromises.length, backorders: [...quantities].map(([itemId, quantity]) => ({ itemId, unit: afterContext.s.items.find(item => item.id === itemId)?.unit, quantity: format(quantity) })),
      basis: entry.type === 'po.revise' ? 'Uncommitted draft purchases are not dated supply. Customer fill dates and reservations remain unchanged until separately approved committed supply exists.' : 'Only the selected backordered lines receive their calculated dates. Reserved units retain their promise; physical stock is unchanged.',
      uncertainty: 'Dates are requested or estimated; receipt and delivery remain unconfirmed.' },
    customerMessageQueuedOnApply: entry.type === 'order.repromise',
  };
}
