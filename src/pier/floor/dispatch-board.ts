import { decimal, format, type Row, type State } from '../model';

export const dispatchStates = ['to pick', 'picking', 'picked', 'packed', 'labeled', 'shipped'] as const;
export function orderWarehouse(s: State, o: Row): string | null {
  const shipmentIds = new Set(s.shipments.filter(sh => sh.orderId === o.id).map(sh => sh.id));
  const bins = [...s.reservations.filter(r => r.orderId === o.id), ...s.movements.filter(m => shipmentIds.has(m.documentId) && BigInt(m.quantity) < 0n)];
  const allocated = [...new Set(bins.map(r => s.locations.find(l => l.id === r.locationId)?.warehouse).filter(Boolean))];
  return o.warehouse ?? s.carriers.find(c => c.id === o.carrierId)?.warehouse
    ?? s.waves.find(w => w.orders.some((x: any) => x.orderId === o.id))?.warehouse ?? (allocated.length === 1 ? allocated[0] : null);
}
export function dueDate(o: Row): string | null {
  return [o.promiseDate, o.shipByDate].filter((v): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)).sort()[0] ?? null;
}

/** Quantities, rather than the most advanced carton, determine the order's state. */
export function dispatchOrder(s: State, o: Row) {
  const remaining = o.lines.filter((l: any) => decimal(l.quantity) > decimal(l.dispatched) + decimal(l.cancelled));
  const actual = s.shipments.filter(sh => sh.orderId === o.id);
  const completed = !remaining.length && actual.length > 0;
  const waves = s.waves.filter(w => w.orders.some((x: any) => x.orderId === o.id));
  const picks = waves.flatMap(w => w.lines.filter((l: any) => l.orderId === o.id));
  const packs = s.packs.filter(p => p.orderId === o.id && p.status === 'packed');
  const sum = (rows: any[], key: string) => rows.reduce((n: bigint, l: any) => n + decimal(l[key]), 0n);
  const demand = (l: any) => decimal(l.quantity) - decimal(l.cancelled) - decimal(l.dispatched);
  const fullyPicked = remaining.every((l: any) => sum(picks.filter((p: any) => p.orderLineId === l.id), 'picked') >= decimal(l.quantity) - decimal(l.cancelled));
  const packedLines = packs.flatMap(p => p.cartons.flatMap((c: any) => c.lines));
  const fullyPacked = remaining.every((l: any) => sum(packedLines.filter((p: any) => p.orderLineId === l.id), 'quantity') >= demand(l));
  const labeled = packs.length > 0 && packs.every(p => p.cartons.every((carton: any) => s.shippingJobs.some(j => j.packId === p.id && j.carton === carton.number && ['labelled', 'delivered'].includes(j.status))));
  const short = remaining.some((l: any) => {
    const reserved = s.reservations.filter(r => r.orderLineId === l.id).reduce((n, r) => n + BigInt(r.quantity), 0n);
    return reserved < demand(l);
  });
  const state = completed ? 'shipped' : fullyPacked ? labeled ? 'labeled' : 'packed' : fullyPicked ? 'picked' : picks.length ? 'picking' : 'to pick';
  const reason = completed ? null : short ? 'short' : !fullyPicked ? 'unpicked' : !fullyPacked ? 'unpacked' : !labeled ? 'unlabeled' : 'awaiting dispatch';
  return { orderId: o.id, order: o.reference, warehouse: orderWarehouse(s, o), dueDate: dueDate(o), state, reason,
    shipped: format(o.lines.reduce((n: bigint, l: any) => n + decimal(l.dispatched), 0n)),
    ordered: format(o.lines.reduce((n: bigint, l: any) => n + decimal(l.quantity) - decimal(l.cancelled), 0n)) };
}

export function dispatchBoard(s: State, date: string, warehouse: string | null, now: string,
  localDate: (iso: string, zone: string) => string, localTime: (iso: string, zone: string) => string) {
  const carriers = s.carriers.filter(c => !warehouse || c.warehouse === warehouse);
  const orders = s.orders.filter(o => !o.cancelReason && o.lines.some((l: any) => decimal(l.quantity) > decimal(l.cancelled)) && (!warehouse || orderWarehouse(s, o) === warehouse) && dueDate(o) === date)
    .map(o => {
      const view = dispatchOrder(s, o), carrier = carriers.find(c => c.id === o.carrierId);
      const beforeCutoff = !!carrier && localDate(now, carrier.timeZone) === date && localTime(now, carrier.timeZone) < carrier.cutoff;
      return { ...view, carrierId: carrier?.id ?? null, carrier: carrier?.name ?? 'No carrier pickup', cutoff: carrier?.cutoff ?? null,
        timeZone: carrier?.timeZone ?? null, atRisk: view.state !== 'shipped', beforeCutoff,
        riskReason: view.state === 'shipped' ? null : !carrier ? 'No carrier pickup assigned' : `${view.reason}; remaining work before carrier pickup` };
    });
  return { warehouse, orders, counts: Object.fromEntries(dispatchStates.map(state => [state, orders.filter(o => o.state === state).length])),
    pickups: carriers.map(c => ({ carrierId: c.id, carrier: c.name, warehouse: c.warehouse, dock: c.dock, cutoff: c.cutoff, timeZone: c.timeZone })),
    atRisk: orders.filter(o => o.atRisk), riskBasis: 'Conservative: every unfinished due order is at risk until dispatch posts. No processing-time estimate is assumed.' };
}

export function overdueDispatch(s: State, asOf: string) {
  const rows = s.orders.filter(o => !o.cancelReason && dueDate(o) && dueDate(o)! < asOf)
    .map(o => dispatchOrder(s, o)).filter(o => o.state !== 'shipped' && o.ordered !== '0');
  return { asOf, rows, closedDays: s.dispatchDays.filter(d => d.date <= asOf).map(d => ({ id: d.id, date: d.date, warehouse: d.warehouse ?? null, timeZone: d.timeZone, closedAt: d.closedAt, ordersShipped: d.summary.ordersShipped, units: d.summary.units, lastShipmentAt: d.summary.lastShipmentAt, missed: d.summary.exceptions.filter((e: any) => ['not shipped', 'partly shipped'].includes(e.kind)) })) };
}
