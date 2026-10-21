import { componentQuantity, reservedKits } from './kits';
import { decimal, fail, format, SCALE, type Context } from './model';

const positive = (n: bigint) => n > 0n ? n : 0n;
export const ceilDivide = (n: bigint, d: bigint) => (n + d - 1n) / d;
export const roundPack = (n: bigint, pack: bigint) => n > 0n ? ceilDivide(n, pack) * pack : 0n;
export const planningWarehouses = (c: Context): string[] =>
  [...new Set<string>(c.s.locations.filter(l => l.kind === 'bin').map(l => l.warehouse))].sort();

/** Legacy demand without a route is assigned once, never once per warehouse. */
export function demandWarehouse(c: Context, order: any, line: any): string | null {
  if (order.warehouse) return order.warehouse;
  const allocation = c.s.reservations.find(r => r.orderLineId === line.id);
  return c.s.locations.find(l => l.id === allocation?.locationId)?.warehouse
    ?? c.s.locations.find(l => l.kind === 'bin')?.warehouse ?? null;
}

export function purchaseWarehouse(c: Context, po: any, line: any): string | null {
  // STOCK-001 keeps legacy supply in its unassigned bucket until a destination exists.
  return line.destinationWarehouse ?? po.destinationWarehouse ?? null;
}

/** The canonical stock position. Drafts are coverage, not committed supply. */
export function supplyPosition(c: Context, itemId: string, warehouse: string) {
  const locationIds = new Set(c.s.locations.filter(l => l.kind === 'bin' && l.warehouse === warehouse).map(l => l.id));
  const onHand = c.s.movements.filter(m => m.itemId === itemId && m.status === 'sellable' && locationIds.has(m.locationId))
    .reduce((n, m) => n + BigInt(m.quantity), 0n);
  const reserved = c.s.reservations.filter(r => r.itemId === itemId && locationIds.has(r.locationId))
    .reduce((n, r) => n + BigInt(r.quantity), 0n);
  let backorders = 0n;
  for (const order of c.s.orders) for (const line of order.lines) {
    if (demandWarehouse(c, order, line) !== warehouse) continue;
    if (line.kit) {
      const component = line.kit.components.find((part: any) => part.itemId === itemId);
      if (component) backorders += componentQuantity(positive(decimal(line.quantity) - decimal(line.dispatched) - decimal(line.cancelled) - reservedKits(c.s, line)), component.quantity);
      continue;
    }
    if (line.itemId !== itemId) continue;
    const allocated = c.s.reservations.filter(r => r.orderLineId === line.id)
      .reduce((n, r) => n + BigInt(r.quantity), 0n);
    backorders += positive(decimal(line.quantity) - decimal(line.dispatched) - decimal(line.cancelled) - allocated);
  }
  const receipts: { poId: string; quantity: string; promiseDate: string; confirmed: boolean }[] = [];
  const drafts: { poId: string; reference: string; quantity: string; supplierId: string }[] = [];
  let onOrder = 0n, draftQuantity = 0n;
  for (const po of c.s.purchaseOrders) for (const line of po.lines) {
    if (line.itemId !== itemId || purchaseWarehouse(c, po, line) !== warehouse) continue;
    const q = positive(decimal(line.quantity) - decimal(line.received));
    if (po.status === 'committed') {
      onOrder += q;
      if (q > 0n) receipts.push({ poId: po.id, quantity: format(q),
        promiseDate: po.confirmation?.promiseDate ?? po.promiseDate, confirmed: Boolean(po.confirmation) });
    } else if (po.status === 'draft') {
      draftQuantity += q;
      drafts.push({ poId: po.id, reference: po.reference ?? po.id, quantity: format(q), supplierId: po.supplierId });
    }
  }
  let inboundTransfers = 0n, outboundTransfers = 0n;
  for (const transfer of c.s.transfers) {
    if (transfer.itemId !== itemId || !['transit', 'committed'].includes(transfer.status)) continue;
    const remaining = positive(decimal(transfer.quantity) - decimal(transfer.received ?? '0'));
    if (locationIds.has(transfer.toLocationId)) inboundTransfers += remaining;
    // Dispatch already removed stock for in-transit transfers.
    if (transfer.status === 'committed' && locationIds.has(transfer.fromLocationId)) outboundTransfers += remaining;
  }
  const openDemand = reserved + backorders;
  const position = onHand - openDemand + onOrder + inboundTransfers - outboundTransfers;
  return {
    onHand: format(onHand), reserved: format(reserved), backorders: format(backorders),
    openDemand: format(openDemand), onOrder: format(onOrder), expected: format(onOrder),
    inboundTransfers: format(inboundTransfers), outboundTransfers: format(outboundTransfers),
    position: format(position), draftQuantity: format(draftQuantity), drafts, receipts,
  };
}

// Position may be negative; input quantities remain non-negative decimal strings.
export function signedQuantity(value: string): bigint {
  if (!/^-?\d+(?:\.\d{1,6})?$/.test(value)) return fail('DECIMAL', 'Invalid exact planning quantity.');
  const negative = value.startsWith('-');
  const [whole, fraction = ''] = (negative ? value.slice(1) : value).split('.');
  const quantity = BigInt(whole) * SCALE + BigInt(fraction.padEnd(6, '0'));
  return negative ? -quantity : quantity;
}
