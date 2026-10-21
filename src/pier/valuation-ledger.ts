import { decimal, SCALE, type Movement, type State } from './model';
import { usdRate } from './import-currency';
import { allocate, amount, extended, share, toCents } from './money';

export type Layer = { quantity: bigint; value: bigint | null; sourceId: string; receivedAt: string; parts?: (Layer & { itemId: string })[] };
export type Position = { itemId: string; locationId: string; status: string; layers: Layer[] };
const sumValue = (layers: Layer[]) => layers.reduce((n, layer) => n + (layer.value ?? 0n), 0n);
// Cost layers carry whole cents, so every COGS, return and valuation amount is postable.
const receiptValue = (line: any): bigint | null => line.currency === 'USD'
  ? toCents(line.landedTotal ? amount(line.landedTotal) : extended(line.quantity, line.cost))
  : null;
// A non-USD opening is valued only through the USD rate its batch records.
function openingValue(q: bigint, opening: any, batch: any): bigint | null {
  const rate = usdRate(batch, opening.currency);
  return rate === null ? null : toCents(q * decimal(opening.cost) * rate / SCALE);
}
function revalueLayer(layer: Layer, value: bigint | null) {
  const prior = layer.value;
  layer.value = value;
  if (!layer.parts) return;
  const weights = layer.parts.map(part=>prior && part.value!==null ? part.value : part.quantity);
  const values = value===null ? weights.map(()=>null) : allocate(value,weights);
  layer.parts.forEach((part,i)=>revalueLayer(part,values[i]));
}

export function takeLayers(layers: Layer[], quantity: bigint, sourceId?: string): Layer[] {
  const taken: Layer[] = [];
  for (const layer of layers) {
    if (quantity === 0n || (sourceId && layer.sourceId !== sourceId)) continue;
    const q = quantity < layer.quantity ? quantity : layer.quantity;
    if (!q) continue;
    let value = layer.value === null ? null : share(layer.value, q, layer.quantity);
    let parts: (Layer & { itemId: string })[] | undefined;
    if (layer.parts) {
      parts = [];
      for (const itemId of new Set(layer.parts.map(part=>part.itemId))) {
        const source = layer.parts.filter(part=>part.itemId===itemId);
        const product = source.reduce((n,part)=>n+part.quantity,0n) * q;
        if (product % layer.quantity) throw new Error('Kit component quantity exceeds supported precision.');
        parts.push(...takeLayers(source, product/layer.quantity).map(part=>({...part,itemId})));
      }
      // Split the actual retained component layers, rather than rounding each
      // component and the rolled-up kit separately. Their values always agree.
      value = parts.some(part=>part.value===null) ? null : sumValue(parts);
    }
    taken.push({ ...layer, quantity: q, value, ...(parts ? { parts } : {}) });
    layer.quantity -= q;
    if (value !== null && layer.value !== null) layer.value -= value;
    quantity -= q;
  }
  if (quantity) throw new Error('Cost layers do not reconcile to physical movements.');
  return taken;
}

/** Each commercial shipment line owns exactly its physical issue layers. */
export function shipmentLayers(consumed: Map<string, Layer[]>, shipment: any, line: any): Layer[] {
  const stock = new Map([...consumed].map(([key,layers]) => [key, structuredClone(layers)]));
  for (const previous of shipment.lines) {
    const parts: (Layer & { itemId: string })[] = (previous.components ?? [{ itemId: previous.itemId, quantity: previous.quantity }]).flatMap((part: any) => takeLayers(stock.get(`${shipment.id}:${part.itemId}`) ?? [], decimal(part.quantity)).map(layer => ({ ...layer, itemId: part.itemId })));
    if (previous.id !== line.id) continue;
    if (!line.kit) return parts;
    const components = parts.flatMap(part => part.itemId === line.itemId ? part.parts ?? [] : [part]);
    return [{ quantity: decimal(line.quantity), value: parts.some(part => part.value === null) ? null : sumValue(parts), sourceId: line.id, receivedAt: shipment.createdAt, parts: components }];
  }
  return [];
}

export function valuationLedger(s: State, end: string) {
  const positions = new Map<string, Position>();
  const consumed = new Map<string, Layer[]>();
  const moved = new Map<string, Layer[]>();
  const kitting = new Map((s.kittingTasks ?? []).map(task => [task.id, task]));
  const kitIssues = new Map<string, (Layer & { itemId: string })[]>();
  const returnedQuantities = new Map<string, bigint>();
  const shipments = new Map(s.shipments.map(row => [row.id, row]));
  const transfers = new Set(s.transfers.map(row => row.id));
  const returns = new Map(s.returns.map(row => [row.id, row]));
  const receiptLines = new Map<string, any>();
  for (const receipt of s.receipts) for (const line of receipt.lines) receiptLines.set(line.movementId, { ...line, currency: receipt.currency });
  const history = s.costingMethods.filter(row => row.createdAt <= end).sort((a, b) => a.frontier - b.frontier || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  const totals = { receipts: 0n, openings: 0n, returns: 0n, adjustments: 0n, cogs: 0n };
  const incomplete = new Set<keyof typeof totals>();
  const record = (key: keyof typeof totals, layers: Layer[], sign = 1n) => {
    totals[key] += sumValue(layers) * sign;
    if (layers.some(layer => layer.value === null)) incomplete.add(key);
  };
  let method = 'fifo', methodIndex = 0;
  const position = (m: Movement) => {
    const key = JSON.stringify([m.itemId, m.locationId, m.status]);
    if (!positions.has(key)) positions.set(key, { itemId: m.itemId, locationId: m.locationId, status: m.status, layers: [] });
    return positions.get(key)!;
  };
  const average = (itemId: string) => {
    const layers = [...positions.values()].filter(p => p.itemId === itemId).flatMap(p => p.layers).filter(l => l.quantity > 0n);
    // Unknown source currency/cost cannot become a guessed USD average.
    if (layers.some(l => l.value === null)) { for (const layer of layers) revalueLayer(layer,null); return; }
    const values = allocate(sumValue(layers), layers.map(l => l.quantity));
    layers.forEach((layer, i) => { revalueLayer(layer,values[i]); });
  };
  const applyMethods = (frontier: number) => {
    while (methodIndex < history.length && history[methodIndex].frontier <= frontier) {
      method = history[methodIndex++].method;
      if (method === 'average') for (const itemId of new Set([...positions.values()].map(p => p.itemId))) average(itemId);
    }
  };
  for (const m of s.movements.filter(m => m.createdAt <= end)) {
    applyMethods(m.sequence - 1);
    const p = position(m), q = BigInt(m.quantity), key = `${m.documentId}:${m.itemId}`;
    const isInternal = (s.slottingPlans ?? []).some(p => p.id === m.documentId) || transfers.has(m.documentId) || (s.supplierReturns.some(r => r.id === m.documentId) && m.reason === 'Supplier return quarantine') || (returns.has(m.documentId) && m.reason === 'Reviewed restock');
    if (q < 0n) {
      const returnSource = returns.has(m.documentId) ? s.movements.find(source => source.documentId === m.documentId && source.status === 'quarantine' && BigInt(source.quantity) > 0n)?.id : undefined;
      const layers = takeLayers(p.layers, -q, returnSource ?? (receiptLines.has(m.reversalId ?? '') && !s.counts.some(c => c.id === m.documentId) ? m.reversalId! : undefined));
      if (kitting.has(m.documentId)) kitIssues.set(m.documentId, [...(kitIssues.get(m.documentId) ?? []), ...layers.map(layer => ({ ...layer, itemId: m.itemId }))]);
      else if (isInternal) moved.set(key, layers);
      else if (shipments.has(m.documentId)) {
        consumed.set(key, [...(consumed.get(key) ?? []), ...layers]);
        record('cogs', layers);
      } else if (s.receipts.some(r => r.id === m.documentId)) {
        const original = receiptLines.get(m.reversalId ?? '');
        const originalValue = original ? receiptValue(original) : null;
        if (method === 'average' && originalValue !== null && !layers.some(l => l.value === null)) {
          // Remove the reversed supplier value, then redistribute the remaining
          // pool. An average issue cost cannot replace the original receipt bill.
          const remaining = [...positions.values()].filter(p => p.itemId === m.itemId).flatMap(p => p.layers).filter(l => l.quantity > 0n);
          if (remaining.every(l => l.value !== null)) {
            const values = allocate(sumValue(remaining) + sumValue(layers) - originalValue, remaining.map(l => l.quantity));
            remaining.forEach((layer, i) => { revalueLayer(layer,values[i]); });
          }
          totals.receipts -= originalValue;
        } else record('receipts', layers, -1n);
      } else record('adjustments', layers, -1n);
    } else if (q > 0n) {
      if (isInternal) {
        const layers = moved.get(key);
        if (!layers) throw new Error('Transfer cost source is missing.');
        p.layers.push(...layers);
        moved.delete(key);
        continue;
      }
      let layers: Layer[];
      const receiptLine = receiptLines.get(m.id), returned = returns.get(m.documentId);
      const task = kitting.get(m.documentId);
      if (task) {
        const issued = kitIssues.get(task.id) ?? [];
        if (task.direction === 'assemble') {
          layers = [{ quantity: q, value: issued.some(l => l.value === null) ? null : sumValue(issued), sourceId: m.id, receivedAt: m.createdAt, parts: structuredClone(issued) }];
        } else {
          const parts = issued.flatMap(l => l.parts ?? [] ).filter(l => l.itemId === m.itemId);
          if (parts.reduce((n,l) => n + l.quantity, 0n) !== q) throw new Error('Disassembly must use the assembled definition and component quantities.');
          layers = parts;
        }
      } else if (receiptLine) {
        const value = receiptValue(receiptLine);
        layers = [{ quantity: q, value, sourceId: m.id, receivedAt: m.createdAt }];
        record('receipts', layers);
      } else if (returned) {
        const shipment = shipments.get(returned.shipmentId);
        const line = shipment?.lines.find((l: any) => l.id === returned.shipmentLineId);
        const lineLayers = line ? shipmentLayers(consumed, shipment, line) : [];
        const priorReturned = returnedQuantities.get(returned.shipmentLineId) ?? 0n;
        if (priorReturned) takeLayers(lineLayers, priorReturned);
        layers = line ? takeLayers(lineLayers, q).map(layer => ({ ...layer, sourceId: m.id, receivedAt: m.createdAt })) : [{ quantity:q, value:null, sourceId:m.id, receivedAt:m.createdAt }];
        returnedQuantities.set(returned.shipmentLineId, priorReturned + q);
        record('returns', layers);
      } else {
        const batch = s.imports.find(b => b.id === m.importId);
        const sourceKey = batch?.postedRows?.find((entry: any) => entry.id === m.id)?.key;
        const opening = batch?.costEvidence?.find((entry: any) => sourceKey ? entry.sourceKey === sourceKey : entry.itemId === m.itemId && entry.locationId === m.locationId);
        const original = m.reversalId ? receiptLines.get(m.reversalId) : null;
        const originalValue = original ? receiptValue(original) : null;
        const value = original ? originalValue === null ? null : share(originalValue, q, decimal(original.quantity))
          : opening ? openingValue(q, opening, batch) : null;
        layers = [{ quantity: q, value, sourceId: m.id, receivedAt: m.createdAt }];
        record(m.importId ? 'openings' : 'adjustments', layers);
      }
      p.layers.push(...layers);
      if (method === 'average') average(m.itemId);
    }
  }
  applyMethods(Number.MAX_SAFE_INTEGER);
  return { positions: [...positions.values()], consumed, totals, incomplete, method, history };
}
