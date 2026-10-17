import { decimal, format, fail, text } from './model';
import { amount, money } from './money';
import type { SourceBundle } from './import-kit';

/** Controls come from a separately supplied report; recompute from mapped openings. */
export function reconcileMoveIn(source: SourceBundle, controls: { payload: Record<string, string>; location: { artifact: string; row: number }; artifactHash: string }[]) {
  const actual = new Map<string, { locationKey: string; unit: string; quantity: bigint; value: bigint }>();
  const results: any[] = [], seen = new Set<string>();
  const error = (code: string, message: string, location?: { artifact: string; row: number }) => source.diagnostics.push({ severity: 'error', code, message, ...(location ? { location } : {}) });
  const openings = source.records.filter(r => r.kind === 'positions');
  for (const row of openings) {
    const p = row.payload as Record<string, string>;
    try {
      const key = JSON.stringify([text(p.locationKey), text(p.unit)]), quantity = decimal(p.quantity), cost = decimal(p.cost);
      const total = actual.get(key) ?? { locationKey: p.locationKey, unit: p.unit, quantity: 0n, value: 0n };
      total.quantity += quantity; total.value += quantity * cost; actual.set(key, total);
    } catch (e) { error((e as any).code ?? 'RECONCILIATION', (e as Error).message, row.location as any); }
  }
  if (!controls.length) error('CONTROL_REQUIRED', 'Supply independent per-location/base-unit quantity and USD value controls, including explicit zero totals for an empty opening snapshot.');
  for (const row of controls) {
    const p = row.payload;
    try {
      const key = JSON.stringify([text(p.locationKey), text(p.unit)]);
      if (seen.has(key)) fail('DUPLICATE_CONTROL', 'One independent control per location and base unit is required.');
      seen.add(key);
      if (openings.some(r => r.artifactHash === row.artifactHash)) fail('CONTROL_INDEPENDENCE', 'Controls must be a separate artifact from the opening-stock export.');
      if (!/^\d{1,20}(\.\d{1,12})?$/.test(p.value)) fail('CONTROL_VALUE', 'Control values require non-negative exact USD decimals with at most twelve places.');
      const expectedQ = decimal(p.quantity), expectedV = amount(p.value), total = actual.get(key);
      const q = total?.quantity ?? 0n, v = total?.value ?? 0n;
      const matched = q === expectedQ && v === expectedV;
      results.push({ locationKey: p.locationKey, unit: p.unit, expectedQuantity: format(expectedQ), actualQuantity: format(q), expectedValue: money(expectedV), actualValue: money(v), matched, location: row.location });
      if (!matched) error('CONTROL_MISMATCH', `Independent control differs for ${p.locationKey} (${p.unit}): source ${format(expectedQ)} / USD ${money(expectedV)}, mapped ${format(q)} / USD ${money(v)}.`, row.location);
    } catch (e) { error((e as any).code ?? 'RECONCILIATION', (e as Error).message, row.location); }
  }
  for (const [key, total] of actual) if (!seen.has(key)) error('CONTROL_MISSING', `Missing independent control for ${total.locationKey} (${total.unit}).`);
  return results;
}
