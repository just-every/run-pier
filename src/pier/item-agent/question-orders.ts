import { reservedKits } from '../kits';
import { decimal, format, positions, Problem, type Actor, type Row, type State } from '../model';
import { scoped } from '../permissions';

const denied = () => { throw new Problem('SCOPE', 'This order is unavailable within your current warehouse authority.', null, 403); };

function permitted(s: State, actor: Actor, order: Row) {
  if (!scoped(actor)) return true;
  const grant = actor.permissions!, warehouse = order.warehouse;
  if (!warehouse || !grant.warehouses.includes(warehouse)) return false;
  const bins = s.locations.filter(l => l.kind === 'bin' && l.warehouse === warehouse);
  if (!bins.length || (grant.locationIds.length && bins.some(bin => !grant.locationIds.includes(bin.id)))) return false;
  const allowed = new Set(bins.map(bin => bin.id));
  // A split order can carry allocations outside its displayed warehouse. Do not
  // reveal their existence or use their quantities to derive a scoped answer.
  if (order.routing?.reserveWarehouses?.some((w: string) => w !== warehouse)) return false;
  return s.reservations.filter(r => r.orderId === order.id).every(r => allowed.has(r.locationId));
}

const identity = (order: Row) => ({ id: order.id, reference: order.reference, version: order.version, warehouse: order.warehouse ?? null });
export function orderChoices(s: State, actor: Actor) {
  return s.orders.filter(order => order.documentType !== 'quote' && permitted(s, actor, order)).map(identity);
}

/** Deliberate physical projection: never spread a commercial order or line. */
export function orderShortage(s: State, actor: Actor, orderId: string) {
  const order = s.orders.find(row => row.id === orderId && row.documentType !== 'quote');
  if (!order || !permitted(s, actor, order)) return denied();
  const binIds = new Set(s.locations.filter(l => l.kind === 'bin' && (!scoped(actor) || l.warehouse === order.warehouse)).map(l => l.id));
  const stock = positions(s).filter(p => binIds.has(p.locationId));
  const lines = order.lines.map((line: any) => {
    const own = s.reservations.filter(r => r.orderId === order.id && r.orderLineId === line.id && binIds.has(r.locationId));
    const physical = { ...s, reservations: own };
    const reserved = line.kit ? reservedKits(physical, line) : own.reduce((n, r) => n + BigInt(r.quantity), 0n);
    const remaining = decimal(line.quantity) - decimal(line.dispatched) - decimal(line.cancelled);
    const backorder = remaining - reserved;
    const itemIds = new Set<string>([line.itemId, ...(line.kit?.components.map((part: any) => part.itemId) ?? [])]);
    return { orderLineId: line.id, itemId: line.itemId, unit: s.items.find(item => item.id === line.itemId)?.unit,
      quantity: line.quantity, dispatched: line.dispatched, cancelled: line.cancelled, remaining: format(remaining), reserved: format(reserved), backorder: format(backorder),
      explanation: backorder > 0n ? 'Remaining demand exceeds this order’s hard reservations. Free stock requires an authorized allocation; quarantine, protected holds and unavailable trace stock cannot fulfil this line.' : 'This order’s hard reservations cover its remaining demand.',
      reservations: own.map(r => ({ reservationId: r.id, itemId: r.itemId, locationId: r.locationId, quantity: format(BigInt(r.quantity)) })),
      stock: stock.filter(p => itemIds.has(p.itemId)).map(p => ({ itemId: p.itemId, locationId: p.locationId, status: p.status, quantity: p.quantity, reserved: p.reserved, held: p.held, available: p.available, traceUnavailable: p.traceUnavailable })),
    };
  });
  return { order: identity(order), lines,
    uncertainty: 'Demand and hard allocations are committed Pier records, not a physical count. Stock evidence covers permitted bins. Free units are not automatically promised; no supplier arrival or delivery date is inferred.' };
}
