import { decimal, fail, format, fresh, get, requireRole, row, text, type Context, type Row } from './model';
import { planningWarehouses, signedQuantity, supplyPosition } from './replenishment-position';
import { sellThrough } from './replenishment-demand';

export function planningScope(c: Context) {
  const settings = c.s.replenishmentSettings[0];
  const warehouses: string[] = settings?.warehouses ?? planningWarehouses(c);
  const valid = warehouses.every(w => planningWarehouses(c).includes(w)) && (!settings || warehouses.includes(settings.destinationWarehouse));
  return { settings, warehouses, valid, company: settings?.mode === 'company', destination: settings?.destinationWarehouse ?? warehouses[0] };
}
export function scopeCommand(c: Context, type: string, p: any): Row | undefined {
  if (type !== 'replenishment.configure') return;
  requireRole(c, []);
  const old = c.s.replenishmentSettings[0];
  if (old) fresh(old, p.version); else if (p.version !== 0) fail('STALE', 'Review current planning settings.');
  const known = planningWarehouses(c);
  if (!['location', 'company'].includes(p.mode) || !Array.isArray(p.warehouses) || !p.warehouses.length || new Set(p.warehouses).size !== p.warehouses.length || p.warehouses.some((w: string) => !known.includes(w))) fail('WAREHOUSE', 'Choose planning mode and distinct existing warehouses.');
  const destinationWarehouse = text(p.destinationWarehouse, 'Default receiving warehouse');
  if (!p.warehouses.includes(destinationWarehouse)) fail('WAREHOUSE', 'The default receiving warehouse must be included in planning.');
  const data = { mode: p.mode, warehouses: p.warehouses, destinationWarehouse, approvedBy: c.actor.id };
  return old ? Object.assign(old, data, { version: old.version + 1 }) : row(c, 'replenishmentSettings', data);
}
export function effectivePolicy(c: Context, itemId: string, warehouse: string) {
  const defaults = c.s.replenishmentPolicies.find(p => p.itemId === itemId && p.scope === 'sku');
  const local = c.s.replenishmentPolicies.find(p => p.itemId === itemId && p.scope !== 'sku' && p.warehouse === warehouse);
  return { defaults, local, policy: local ? { ...defaults, ...Object.fromEntries(Object.entries(local).filter(([, value]) => value !== null)) } as Row : defaults };
}
export function companyPosition(c: Context, itemId: string, warehouses: string[]) {
  const positions = warehouses.map(w => supplyPosition(c, itemId, w));
  const first = supplyPosition(c, itemId, '\0');
  for (const key of ['onHand', 'reserved', 'backorders', 'openDemand', 'onOrder', 'expected', 'inboundTransfers', 'outboundTransfers', 'position', 'draftQuantity'] as const)
    first[key] = format(positions.reduce((sum, p) => sum + signedQuantity(p[key]), 0n));
  first.drafts = positions.flatMap(p => p.drafts);
  first.receipts = positions.flatMap(p => p.receipts);
  return first;
}
export function companyHistory(c: Context, itemId: string, warehouses: string[], days: number) {
  const histories = warehouses.map(w => sellThrough(c, itemId, w, days));
  return (histories[0] ?? []).map((entry, index) => {
    const sold = histories.reduce((sum, h) => sum + decimal(h[index].sold), 0n);
    return { ...entry, sold: format(sold), soldPerDay: format(sold / BigInt(entry.days)), hasHistory: sold > 0n, shipmentIds: [...new Set(histories.flatMap(h => h[index].shipmentIds))] };
  });
}
