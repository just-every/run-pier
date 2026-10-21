import { gs1 } from './gs1';
import { decimal, format, type Row } from './model';
import { barcodesOf, clean, same } from './floor/codes';

export type ReturnSource = { items: Row[]; orders: Row[]; shipments: Row[]; returns: Row[]; parties: Row[]; traceIdentities?: Row[]; traceEvents?: Row[] };
export type ReturnCandidate = { id: string; shipmentId: string; shipmentLineId: string; orderId: string; orderReference: string; shipmentReference: string; customer: string; itemId: string; remaining: string };

/** A label identifies its dispatches; an item shows every eligible dispatch.
 * Several matches always need a human choice, never newest-order guessing. */
export function returnLookup(s: ReturnSource, raw: unknown): ReturnCandidate[] {
  const parsed=gs1(raw), code=clean(parsed?.code ?? raw);
  const identities=(s.traceIdentities??[]).filter(i=>same(code,i.serial)||same(code,i.code)||(parsed?.trace?.serial&&i.serial===parsed.trace.serial));
  const itemIds = new Set([...identities.map(i=>i.itemId),...s.items.filter(i => [...barcodesOf(i).map(b => b.code), i.sku].some(value => same(code, value))).map(i => i.id)]);
  const orderIds = new Set(s.orders.filter(o => same(code, o.reference) || same(code, o.id)).map(o => o.id));
  return s.shipments.flatMap(sh => {
    const order = s.orders.find(o => o.id === sh.orderId);
    const label = orderIds.has(sh.orderId) || same(code, sh.reference) || same(code, sh.id);
    return sh.lines.flatMap((line: any) => {
      if (!label && !itemIds.has(line.itemId)) return [];
      if(identities.length && !(s.traceEvents??[]).some(e=>e.documentId===sh.id&&BigInt(e.quantity)<0n&&identities.some(i=>i.id===e.identityId)&&line.reservations?.some((link:any)=>link.movementId===e.movementId)))return [];
      const returned = s.returns.filter(r => r.shipmentLineId === line.id).reduce((n, r) => n + decimal(r.quantity), 0n);
      const remaining = decimal(line.quantity) - returned;
      if (remaining <= 0n) return [];
      return [{ id: line.id, shipmentId: sh.id, shipmentLineId: line.id, orderId: sh.orderId, orderReference: order?.reference ?? sh.orderId, shipmentReference: sh.reference, customer: s.parties.find(p => p.id === order?.customerId)?.name ?? '', itemId: line.itemId, remaining: format(remaining) }];
    });
  });
}
