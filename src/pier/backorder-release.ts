import { decimal, format, get, fresh, row, text, fail, requireRole, type Context, type Row } from './model';
import { canonicalJson, sha256 } from './import-kit';
import { reserve } from './orders';

const defaultPriority = ['promiseDate', 'customerPriority', 'orderDate'];
export function priorityFields(c: Context): string[] { return c.s.backorderPolicies[0]?.priority ?? defaultPriority; }
export function prioritizedOrders(c: Context) {
  const value = (o: Row, field: string): string | number => field === 'promiseDate' ? o.promiseDate || '9999-12-31' : field === 'customerPriority' ? -(c.s.parties.find(p => p.id === o.customerId)?.backorderPriority ?? 0) : o.createdAt;
  return c.s.orders.filter(o => o.fulfilment !== 'dropship').sort((a, b) => {
    for (const field of priorityFields(c)) { const x = value(a, field), y = value(b, field); const difference = typeof x === 'number' ? x - Number(y) : x.localeCompare(String(y)); if (difference) return difference; }
    return a.id.localeCompare(b.id);
  });
}
const evidence = (c: Context) => sha256(canonicalJson({ movements: c.s.movements, reservations: c.s.reservations, orders: c.s.orders, purchases: c.s.purchaseOrders, transfers: c.s.transfers, policies: c.s.backorderPolicies, parties: c.s.parties, locations: c.s.locations, traces: c.s.traceIdentities, traceReservations: c.s.traceReservations, traceEvents: c.s.traceEvents, holds: c.s.channelHolds, replenishmentPolicies: c.s.replenishmentPolicies, kitDefinitions: c.s.kitDefinitions }));
export function releaseBackorders(c: Context, type: string, p: any): Row | undefined {
  if (!type.startsWith('backorder.')) return;
  requireRole(c, ['operator']);
  if (type === 'backorder.priority') {
    requireRole(c, ['owner']);
    if (!Array.isArray(p.priority) || p.priority.length !== 3 || new Set(p.priority).size !== 3 || p.priority.some((f: string) => !defaultPriority.includes(f))) fail('PRIORITY', 'Order promise date, customer priority and order date exactly once.');
    const old = c.s.backorderPolicies[0]; if (old) fresh(old, p.version); else if (p.version !== 0) fail('STALE', 'Reload the current priority rule.');
    const data = { priority: p.priority, reason: text(p.reason), approvedBy: c.actor.id };
    return old ? Object.assign(old, data, { version: old.version + 1 }) : row(c, 'backorderPolicies', data);
  }
  if (type === 'backorder.customerPriority') {
    requireRole(c, ['owner']); const customer = get(c.s, 'parties', p.customerId); fresh(customer, p.version);
    if (customer.kind !== 'customer' || !Number.isSafeInteger(p.priority) || p.priority < 0 || p.priority > 100) fail('PRIORITY', 'Customer priority must be a whole number from zero to 100.');
    customer.backorderPriority = p.priority; customer.priorityReason = text(p.reason); customer.version++; return customer;
  }
  if (type === 'backorder.prepare') {
    const receipt = get(c.s, 'receipts', p.receiptId);
    if (receipt.status === 'reversed') fail('RECEIPT', 'Use an active receipt.');
    const warehouse = text(p.warehouse, 'Warehouse');
    const binIds = new Set(receipt.lines.map((l: any) => l.locationId).filter((id: string) => c.s.locations.some(l => l.id === id && l.warehouse === warehouse)));
    if (!binIds.size) fail('WAREHOUSE', 'This receipt has no bins in the selected warehouse.');
    const trial: Context = { ...c, s: structuredClone(c.s) }, originalIds = new Set(c.s.reservations.map(r => r.id));
    trial.s.locations = trial.s.locations.filter(l => binIds.has(l.id));
    const waiting = [];
    for (const order of prioritizedOrders(c)) {
      if (order.documentType === 'quote' && !order.acceptedAt) continue;
      const eligible = order.routing?.reserveWarehouses ?? (order.warehouse ? [order.warehouse] : []);
      if (!eligible.includes(warehouse)) continue;
      const copy = structuredClone(order);
      copy.routing = undefined; copy.warehouse = warehouse;
      const before = trial.s.reservations.filter(r => r.orderId === order.id).reduce((n, r) => n + BigInt(r.quantity), 0n);
      reserve(trial, copy);
      const allocations = trial.s.reservations.filter(r => r.orderId === order.id && !originalIds.has(r.id));
      if (allocations.length) waiting.push({ orderId: order.id, reference: order.reference, version: order.version, allocations, added: format(allocations.reduce((n, r) => n + BigInt(r.quantity), 0n)), previouslyReserved: format(before) });
    }
    return row(c, 'backorderReleases', { receiptId: receipt.id, warehouse, priority: priorityFields(c), fingerprint: evidence(c), orders: waiting, status: 'prepared', reason: text(p.reason), preparedBy: c.actor.id });
  }
  if (type === 'backorder.release') {
    const release = get(c.s, 'backorderReleases', p.releaseId); fresh(release, p.version);
    if (release.status !== 'prepared') fail('RELEASE_STATE', 'This release already completed.');
    if (release.fingerprint !== evidence(c)) fail('STALE', 'Demand, supply, confirmation or priority changed. Prepare the fill list again.');
    if (!release.orders.length) fail('BACKORDER_EMPTY', 'No backorders can be filled from these bins.');
    for (const planned of release.orders) {
      const order = get(c.s, 'orders', planned.orderId); fresh(order, planned.version);
      c.s.reservations.push(...structuredClone(planned.allocations)); order.version++;
    }
    release.status = 'released'; release.releasedBy = c.actor.id; release.releasedAt = c.now; release.version++; return release;
  }
  fail('COMMAND', 'Unknown backorder command.');
}
