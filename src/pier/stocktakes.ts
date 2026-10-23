import { tracePositions, policyFor } from './trace-core';
import { CENT } from './money';
import { decimal, format, fresh, get, row, text, fail, requireRole, move, positions, type Context, type Row, type State } from './model';
import { sha256, canonicalJson } from '../modules/import-kit/src/provenance/identity';
import { binMatches, itemScan } from './floor/codes';
import { valuationLedger, takeLayers } from './valuation-ledger';

const frontier = (s: State, locationId: string) => sha256(canonicalJson(s.movements.filter(m => m.locationId === locationId)));
const zoneOf = (location: Row) => location.zone || 'Unzoned';
const key = (line: any) => `${line.itemId}:${line.status}:${line.identityId ?? ""}`;
function capture(c: Context, locationId: string) {
  const valued = valuationLedger(c.s, '9999').positions;
  return [...positions(c.s).filter(p => p.locationId === locationId && !policyFor(c.s, p.itemId)), ...tracePositions(c.s).filter(p => p.locationId === locationId)].map((p: any) => {
    const layers = (valued.find(v => v.itemId === p.itemId && v.locationId === locationId && v.status === p.status)?.layers ?? []).filter(l => !p.identityId || l.traceId === p.identityId);
    return { itemId: p.itemId, identityId: p.identityId ?? null, status: p.status, expected: p.quantity, layers: layers.map(l => ({ quantity: l.quantity.toString(), value: l.value?.toString() ?? null, sourceId: l.sourceId, receivedAt: l.receivedAt })), valueCents: layers.some(l => l.value === null) ? null : (layers.reduce((n, l) => n + (l.value ?? 0n), 0n) / CENT).toString() };
  });
}
export function stocktakeView(c: Context, take: Row) {
  const bins = take.bins.map((bin: any) => ({ ...bin, stale: take.status === 'open' && frontier(c.s, bin.locationId) !== bin.frontier }));
  const preview = bins.flatMap((bin: any) => {
    const observed = bin.observations ?? [];
    const keys = new Set([...bin.snapshot.map(key), ...observed.map(key)]);
    return [...keys].map(k => {
      const original = bin.snapshot.find((l: any) => key(l) === k), actual = observed.find((l: any) => key(l) === k);
      const expected = original?.expected ?? '0';
      const rule = take.zones.find((z: any) => z.zone === bin.zone)?.uncounted;
      const quantity = actual?.quantity ?? (rule === 'zero' ? '0' : expected);
      const delta = decimal(quantity) - decimal(expected);
      const removed = delta < 0n ? takeLayers((original?.layers ?? []).map((l: any) => ({ ...l, quantity: BigInt(l.quantity), value: l.value === null ? null : BigInt(l.value) })), -delta) : [];
      const valueCents = delta === 0n ? '0' : delta > 0n || removed.some(l => l.value === null) ? null : (-removed.reduce((n, l) => n + (l.value ?? 0n), 0n) / CENT).toString();
      const absolute = delta < 0n ? -delta : delta;
      const value = valueCents === null ? null : BigInt(valueCents) < 0n ? -BigInt(valueCents) : BigInt(valueCents);
      const above = absolute > decimal(take.quantityThreshold) || (delta !== 0n && value === null) || (value !== null && value * 10000n > decimal(take.valueThreshold));
      const prior = bin.history.at(-2)?.observations?.find((l: any) => key(l) === k);
      return { locationId: bin.locationId, zone: bin.zone, itemId: original?.itemId ?? actual.itemId, identityId: original?.identityId ?? actual?.identityId ?? null, status: original?.status ?? actual.status,
        expected, quantity, delta: format(delta), valueCents, counted: !!actual,
        recountRequired: above && (!actual || !prior || prior.quantity !== actual.quantity) };
    });
  });
  if (c.actor.role !== 'owner') return { ...take, result: undefined, bins: bins.map((b: any) => ({ ...b, snapshot: b.snapshot.map((l: any) => ({ itemId: l.itemId, identityId: l.identityId, status: l.status })), history: b.history.map((h: any) => ({ ...h, frontier: undefined })) })), preview: [] };
  return { ...take, bins, preview };
}

// Compare all physical effects before atomic admission, including import removal
// and reservation reallocations that do not append a movement.
export function enforceStocktakeFreeze(c: Context, before: State, type: string, payload: any) {
  for (const take of before.stocktakes.filter(t => t.frozen && t.status === 'open')) {
    if (type === 'stocktake.approve' && payload.stocktakeId === take.id) continue;
    const ids = new Set([...take.bins.map((b: any) => b.locationId), ...[...before.locations, ...c.s.locations].filter(l => l.kind === 'bin' && l.warehouse === take.warehouse && (!take.scopeZones?.length || take.scopeZones.includes(zoneOf(l)))).map(l => l.id)]);
    const physical = (s: State) => canonicalJson({ movements: s.movements.filter(m => ids.has(m.locationId)), reservations: s.reservations.filter(r => ids.has(r.locationId)),
      locations: s.locations.filter(l => ids.has(l.id)), picks: s.waves.flatMap(w => w.lines).filter((l: any) => ids.has(l.locationId)) });
    if (physical(before) !== physical(c.s)) fail('STOCKTAKE_FROZEN', `Stocktake ${take.reference} freezes these bins. Complete or cancel it before moving or picking stock.`, { stocktakeId: take.id });
  }
}

export function stocktakes(c: Context, type: string, p: any): Row | undefined {
  if (!type.startsWith('stocktake.')) return;
  requireRole(c, ['warehouse']);
  if (type === 'stocktake.start') {
    requireRole(c, ['owner']);
    const warehouse = text(p.warehouse, 'Warehouse');
    const zones = Array.isArray(p.zones) ? [...new Set<string>(p.zones.map((z: any) => text(z, 'Zone')))] : [];
    const locations = c.s.locations.filter(l => l.kind === 'bin' && l.warehouse === warehouse && (!zones.length || zones.includes(zoneOf(l))));
    if (!locations.length || zones.some(z => !locations.some(l => zoneOf(l) === z))) fail('STOCKTAKE_SCOPE', 'Choose existing warehouse bins and zones.');
    if (c.s.stocktakes.some(t => t.status === 'open' && t.bins.some((b: any) => locations.some(l => l.id === b.locationId)))) fail('STOCKTAKE_SCOPE', 'A stocktake already covers these bins.');
    const quantityThreshold = format(decimal(p.quantityThreshold)), valueThreshold = format(decimal(p.valueThreshold));
    return row(c, 'stocktakes', { reference: `ST-${String(c.s.stocktakes.length + 1).padStart(4, '0')}`, warehouse, frozen: p.frozen === true,
      scopeZones: zones, quantityThreshold, valueThreshold, status: 'open', reason: text(p.reason), ledgerStatus: 'not-posted',
      zones: [...new Set(locations.map(zoneOf))].map(zone => ({ zone, uncounted: null, assignedTo: c.actor.id })),
      bins: locations.map(l => ({ locationId: l.id, zone: zoneOf(l), frontier: frontier(c.s, l.id), snapshot: capture(c, l.id), observations: null, history: [] })) });
  }
  const take = get(c.s, 'stocktakes', p.stocktakeId); fresh(take, p.version);
  if (take.status !== 'open') fail('STOCKTAKE_STATE', 'This stocktake is already closed.');
  if (type === 'stocktake.zone') {
    requireRole(c, ['owner']);
    const zone = take.zones.find((z: any) => z.zone === p.zone);
    if (!zone || !['zero', 'unchanged'].includes(p.uncounted)) fail('STOCKTAKE_ZONE', 'Choose a zone and its uncounted-position rule.');
    if (!['owner', 'warehouse'].includes(c.automationActors?.[p.assignedTo] ?? '')) fail('STOCKTAKE_ASSIGNEE', 'Assign an active owner or warehouse operator.');
    zone.uncounted = p.uncounted; zone.assignedTo = p.assignedTo;
  } else if (type === 'stocktake.record') {
    const bin = take.bins.find((b: any) => b.locationId === p.locationId);
    if (!bin || !binMatches(get(c.s, 'locations', p.locationId), p.binCode)) fail('WRONG_BIN', 'Scan the selected bin before recording its physical count.');
    const zone = take.zones.find((z: any) => z.zone === bin.zone);
    if (c.actor.role !== 'owner' && zone.assignedTo !== c.actor.id) fail('STOCKTAKE_ASSIGNEE', 'This zone is assigned to another operator.');
    if (!Array.isArray(p.lines)) fail('LINES', 'Supply physically counted positions.');
    if (frontier(c.s, bin.locationId) !== bin.frontier) {
      // A fresh physical submission captures a new frontier; old attempts stay retained.
      bin.snapshot = capture(c, bin.locationId); bin.frontier = frontier(c.s, bin.locationId); bin.history = [...bin.history, { at: c.now, stale: true }];
    }
    const seen = new Set();
    const observations = p.lines.map((l: any) => {
      const hit = itemScan(c.s, l.itemCode, 'count it');
      if (!['sellable', 'quarantine'].includes(l.status)) fail('COUNT_LINE', 'Choose sellable or quarantine stock.');
      const policy = policyFor(c.s, hit.item.id);
      const matching = policy ? c.s.traceIdentities.filter(i => i.itemId === hit.item.id && (hit.trace?.identityId === i.id || (l.identityCode && [i.code, i.serial, i.lot].includes(l.identityCode)) || (hit.trace?.lot && i.lot === hit.trace.lot) || (hit.trace?.serial && i.serial === hit.trace.serial))) : [];
      if (policy && matching.length !== 1) fail('TRACE_COUNT', 'Scan the exact retained lot or serial identity.');
      if (policy?.mode === 'serial' && !['0', '1'].includes(format(decimal(l.quantity)))) fail('TRACE_SERIAL', 'Count each serial as zero or one.');
      const result = { itemId: hit.item.id, identityId: matching[0]?.id ?? null, status: l.status, quantity: format(decimal(l.quantity)), itemCode: text(l.itemCode) };
      if (seen.has(key(result))) fail('COUNT_LINE', 'Count each item and status once per bin.'); seen.add(key(result));
      return result;
    });
    bin.observations = observations;
    bin.history.push({ at: c.now, actorId: c.actor.id, frontier: bin.frontier, observations: structuredClone(observations), reason: text(p.reason) });
  } else if (type === 'stocktake.cancel') {
    requireRole(c, ['owner']); take.status = 'cancelled'; take.closedAt = c.now; take.closedBy = c.actor.id; take.closeReason = text(p.reason);
  } else if (type === 'stocktake.approve') {
    requireRole(c, ['owner']);
    if (take.zones.some((z: any) => !z.uncounted)) fail('STOCKTAKE_ZONE', 'Choose the uncounted-position rule for every zone.');
    const review = stocktakeView(c, take);
    if (review.bins.some((b: any) => b.stale)) fail('COUNT_FRONTIER', 'Stock moved after capture. Physically recount each stale bin.');
    if (review.preview.some((l: any) => l.recountRequired)) fail('COUNT_RECOUNT', 'Recount above-threshold positions and confirm the same physical quantity.');
    for (const line of review.preview) {
      if (line.delta === '0') continue;
      const signed = line.delta.startsWith('-') ? -decimal(line.delta.slice(1)) : decimal(line.delta);
      const movement = move(c, { itemId: line.itemId, locationId: line.locationId, status: line.status, quantity: signed.toString(), reason: take.reason, documentId: take.id });
      line.movementId = movement.id;
    }
    take.result = review.preview; take.status = 'posted'; take.closedAt = c.now; take.closedBy = c.actor.id;
    take.ledgerStatus = 'not-posted';
  } else fail('COMMAND', 'Unknown stocktake command.');
  take.version++; return stocktakeView(c, take);
}
