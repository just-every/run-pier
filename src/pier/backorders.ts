import { reservedKits } from './kits';
import { decimal, format, min, type Context, type Row } from './model';

export const afterDays = (now: string, days: number) => new Date(Date.parse(now) + days * 86400000).toISOString().slice(0, 10);
const latest = (a: string | null, b: string | null) => a && b ? (a > b ? a : b) : a || b;

/** Dated supply is consumed once in customer-promise/order-date priority order.
 * A forecast is never an on-hand reservation or a supplier confirmation. */
export function backorderDates(c: Context) {
  const today = c.now.slice(0, 10);
  const supply = c.s.purchaseOrders.filter(po => po.status === 'committed').flatMap(po => po.lines.map((line: any) => ({
    poId: po.id, itemId: line.itemId, warehouse: po.destinationWarehouse || null,
    remaining: decimal(line.quantity) - decimal(line.received),
    date: po.confirmation?.promiseDate || afterDays(c.now, line.terms?.leadDays ?? 0),
    confirmed: !!po.confirmation,
  }))).filter(l => l.remaining > 0n).sort((a, b) => a.date.localeCompare(b.date) || a.poId.localeCompare(b.poId));
  const orders = [...c.s.orders].sort((a, b) => String(a.promiseDate || '9999').localeCompare(String(b.promiseDate || '9999')) || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  return orders.map(order => {
    const warehouse = order.warehouse || null;
    const lines = order.lines.map((line: any) => {
      const reserved = line.kit ? reservedKits(c.s, line) : c.s.reservations.filter(r => r.orderLineId === line.id).reduce((n, r) => n + BigInt(r.quantity), 0n);
      let need = decimal(line.quantity) - decimal(line.dispatched) - decimal(line.cancelled) - reserved;
      const backorder = need;
      let expectedDate: string | null = null, estimated = false;
      const sources: { poId: string | null; quantity: string; date: string | null; confirmed: boolean; basis: string }[] = [];
      for (const inbound of supply) {
        if (need <= 0n) break;
        if (inbound.itemId !== line.itemId || (warehouse && inbound.warehouse && inbound.warehouse !== warehouse)) continue;
        const used = min(need, inbound.remaining);
        if (used <= 0n) continue;
        inbound.remaining -= used; need -= used;
        const date = inbound.date < today ? today : inbound.date;
        expectedDate = latest(expectedDate, date); estimated ||= !inbound.confirmed;
        sources.push({ poId: inbound.poId, quantity: format(used), date, confirmed: inbound.confirmed, basis: inbound.confirmed ? 'supplier confirmed' : 'PO date from supplier lead time' });
      }
      if (need > 0n) {
        const policy = c.s.replenishmentPolicies.find(p => p.itemId === line.itemId && p.warehouse === warehouse);
        const terms = c.s.supplierItems.find(t => t.itemId === line.itemId && (!policy || t.supplierId === policy.supplierId));
        const date = terms ? afterDays(c.now, policy?.leadDays ?? terms.leadDays) : null;
        expectedDate = date ? latest(expectedDate, date) : null;
        estimated = true;
        // The part no purchase order covers is shown with its own quantity and basis.
        sources.push({ poId: null, quantity: format(need), date, confirmed: false, basis: date ? 'not on a purchase order yet; supplier lead time' : 'not on a purchase order and no supplier lead time' });
      }
      return { orderLineId: line.id, itemId: line.itemId, promiseDate: line.backorderPromiseDate ?? order.promiseDate ?? null, backorder: format(backorder), expectedDate,
        estimated, uncovered: format(need), sources,
        explanation: backorder <= 0n ? 'Reserved stock covers this line.' : estimated ? 'Estimate: unconfirmed supply or supplier lead time; receipt is still required.' : 'Confirmed inbound purchase supply; receipt is still required.' };
    });
    const waiting = lines.filter((l: any) => decimal(l.backorder) > 0n);
    const expectedDate = waiting.some((l: any) => !l.expectedDate) ? null : waiting.reduce((d: string | null, l: any) => latest(d, l.expectedDate), null);
    const fingerprint = JSON.stringify(waiting.map((l: any) => ({ line: l.orderLineId, date: l.expectedDate, sources: l.sources, uncovered: l.uncovered, estimated: l.estimated })));
    // `needsRepromise` is any move from the promise (earlier supply may re-promise
    // earlier); `late` is the exception: waiting lines that will not fill by the promise.
    const late = waiting.some((line: any) => !!line.promiseDate && (!line.expectedDate || line.expectedDate > line.promiseDate));
    return { orderId: order.id, expectedDate, estimated: waiting.some((l: any) => l.estimated), lines, fingerprint,
      needsRepromise: waiting.some((line: any) => !!line.expectedDate && line.expectedDate !== line.promiseDate), late };
  });
}

export function orderBackorder(c: Context, order: Row) {
  return backorderDates(c).find(r => r.orderId === order.id)!;
}
