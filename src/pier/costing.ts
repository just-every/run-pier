import { fail, movementFrontier, requireRole, row, text, type Context, type Row } from './model';

export function costing(c: Context, type: string, p: any): Row | undefined {
  if (type !== 'costing.method') return;
  requireRole(c, []);
  if (!['fifo', 'average'].includes(p.method)) fail('COSTING_METHOD', 'Choose FIFO or moving average.');
  if (p.confirm !== true) fail('COSTING_CONFIRM', 'Confirm the dated change. Existing shipment costs remain unchanged.');
  const current = c.s.costingMethods.at(-1)?.method ?? 'fifo';
  if (c.s.costingMethods.length && current === p.method) fail('COSTING_METHOD', 'That costing method is already in use.');
  return row(c, 'costingMethods', {
    method: p.method, previousMethod: current, reason: text(p.reason, 'Change reason'),
    actorId: c.actor.id, frontier: movementFrontier(c.s), effectiveAt: c.now,
  });
}
