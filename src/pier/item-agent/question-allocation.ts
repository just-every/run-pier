import { backorderDates } from '../backorders';
import { decimal, fail, format, get, type Context } from '../model';
import { proposals } from '../proposals';
import { orderShortage } from './question-orders';

/** Exercise the real proposal state machine on a disposable copy. */
export function allocationQuestion(c: Context, params: URLSearchParams) {
  const fromOrderId = params.get('fromOrderId') ?? '', toOrderId = params.get('toOrderId') ?? '', itemId = params.get('itemId') ?? '';
  if (fromOrderId === toOrderId) fail('REALLOCATION', 'Choose two different orders.');
  const from = get(c.s, 'orders', fromOrderId), to = get(c.s, 'orders', toOrderId);
  if ([from, to].some(order => order.documentType === 'quote' || order.fulfilment === 'dropship')) fail('REALLOCATION', 'Choose two warehouse sales orders.');
  const item = get(c.s, 'items', itemId), quantity = format(decimal(params.get('quantity'), true));
  if ([from, to].some(order => order.lines.some((line: any) => line.itemId === itemId && line.kit))) fail('REALLOCATION', 'Kit allocations require their complete component review.');
  const destinationWarehouses: string[] = to.routing?.reserveWarehouses ?? (to.warehouse ? [to.warehouse] : []);
  const sourceBins = c.s.reservations.filter(r => r.orderId === from.id && r.itemId === itemId).map(r => get(c.s, 'locations', r.locationId));
  if (destinationWarehouses.length && sourceBins.some(bin => !destinationWarehouses.includes(bin.warehouse))) fail('REALLOCATION', 'The source reservations are outside the destination order’s eligible warehouses.');
  const before = [from, to].map(order => orderShortage(c.s, c.actor, order.id));
  const beforePromises = backorderDates(c).filter(plan => [from.id, to.id].includes(plan.orderId));
  const trial: Context = { ...c, s: structuredClone(c.s) };
  const plan = { fromOrderId, toOrderId, itemId, quantity };
  const proposal = proposals(trial, 'proposal.prepare', { kind: 'reallocation', evidence: [from.id, to.id, item.id], assumptions: 'Compare an exact reservation transfer; physical stock and recorded promises stay unchanged.', plan })!;
  // Ordinary command publication increments the state frontier between steps.
  // Advance only this disposable context so the existing stale checks run intact.
  trial.s.version++;
  proposals(trial, 'proposal.approve', { proposalId: proposal.id, version: proposal.version });
  trial.s.version++;
  proposals(trial, 'proposal.execute', { proposalId: proposal.id, version: proposal.version });
  return { itemId, unit: item.unit, quantity, before, after: [from, to].map(order => orderShortage(trial.s, c.actor, order.id)),
    affectedPromises: { before: beforePromises, after: backorderDates(trial).filter(row => [from.id, to.id].includes(row.orderId)) },
    sources: { orders: [from, to].map(order => ({ id: order.id, version: order.version })),
      reservations: c.s.reservations.filter(r => r.orderId === from.id && r.itemId === itemId).map(r => ({ reservationId: r.id, locationId: r.locationId, itemId: r.itemId, quantity: format(BigInt(r.quantity)) })) },
    ordinaryPlan: { type: 'proposal.prepare', payload: { kind: 'reallocation', evidence: [from.id, to.id, item.id], assumptions: 'Review this exact transfer against current reservations and promises.', plan } },
    uncertainty: 'Simulation only. The donor loses these reserved units and may backorder; the recipient gains the same units. Physical stock, recorded customer promises and outgoing messages are unchanged. Dates are recalculated estimates from recorded supply, not delivery guarantees. A real proposal needs current exact-version human approval and ordinary execution.' };
}
