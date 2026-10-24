import { decimal, Problem, fail, format, get, positions, type Actor, type State } from '../model';
import { physicalState, scoped } from '../permissions';

export function liveQuestion(full: State, actor: Actor, params: URLSearchParams) {
  const s = physicalState(full, actor), kind = params.get('kind') ?? 'stock';
  const freshness = { stateVersion: s.version, observedAt: new Date().toISOString(), basis: 'Current committed Pier records; external and physical changes may be unreported.' };
  if (kind === 'stock') {
    const item = get(s, 'items', params.get('itemId') ?? '');
    const allowed = new Set(s.locations.map(location => location.id));
    const rows = positions(full).filter(p => p.itemId === item.id && allowed.has(p.locationId));
    const sum = (key: string) => format(rows.reduce((n, p: any) => n + decimal(p[key]), 0n));
    return { kind, itemId: item.id, unit: item.unit, ...freshness,
      answer: { onHand: sum('quantity'), reserved: sum('reserved'), available: sum('available') },
      evidence: rows.map(p => ({ locationId: p.locationId, status: p.status, quantity: p.quantity, reserved: p.reserved, available: p.available })),
      uncertainty: scoped(actor) ? 'Only granted bins are included. Order details, costs and customer data are unavailable to this scope.' : 'Reserved stock is committed to open demand. Quarantined stock cannot fulfil orders. No physical count is inferred.' };
  }
  if (scoped(actor)) throw new Problem('SCOPE', 'This question requires wider authority.', null, 403);
  if (kind === 'late') return { kind, ...freshness, evidence: s.purchaseOrders.filter(po => po.status === 'committed' && po.promiseDate < freshness.observedAt.slice(0, 10) && po.lines.some((l: any) => decimal(l.quantity) > decimal(l.received))).map(po => ({ id: po.id, version: po.version, promiseDate: po.promiseDate, lines: po.lines.map((l: any) => ({ itemId: l.itemId, remaining: format(decimal(l.quantity) - decimal(l.received)) })) })), uncertainty: 'UTC date comparison against requested dates; an unrecorded delivery is not inferred.' };
  return fail('QUESTION', 'Choose stock availability or late purchases. Margin and change simulations are not available yet.');
}
