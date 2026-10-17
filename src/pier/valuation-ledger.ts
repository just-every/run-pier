import { decimal, type Movement, type State } from './model';
import { allocate, amount, extended } from './money';

export type Layer = { quantity: bigint; value: bigint | null; sourceId: string; receivedAt: string };
export type Position = { itemId: string; locationId: string; status: string; layers: Layer[] };
const sumValue = (layers: Layer[]) => layers.reduce((n, layer) => n + (layer.value ?? 0n), 0n);
const receiptValue = (line: any): bigint | null => line.currency === 'USD'
  ? line.landedTotal ? amount(line.landedTotal) : extended(line.quantity, line.cost)
  : null;
export function takeLayers(layers: Layer[], quantity: bigint, sourceId?: string): Layer[] {
  const taken: Layer[] = [];
  for (const layer of layers) {
    if (quantity === 0n || (sourceId && layer.sourceId !== sourceId)) continue;
    const q = quantity < layer.quantity ? quantity : layer.quantity;
    if (!q) continue;
    const value = layer.value === null ? null : layer.value * q / layer.quantity;
    taken.push({ ...layer, quantity: q, value });
    layer.quantity -= q;
    if (value !== null && layer.value !== null) layer.value -= value;
    quantity -= q;
  }
  if (quantity) throw new Error('Cost layers do not reconcile to physical movements.');
  return taken;
}

export function valuationLedger(s: State, end: string) {
  const positions = new Map<string, Position>();
  const consumed = new Map<string, Layer[]>();
  const moved = new Map<string, Layer[]>();
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
    if (layers.some(l => l.value === null)) { for (const layer of layers) layer.value = null; return; }
    const values = allocate(sumValue(layers), layers.map(l => l.quantity));
    layers.forEach((layer, i) => { layer.value = values[i]; });
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
    const isInternal = transfers.has(m.documentId) || (returns.has(m.documentId) && m.reason === 'Reviewed restock');
    if (q < 0n) {
      const layers = takeLayers(p.layers, -q, receiptLines.has(m.reversalId ?? '') && !s.counts.some(c => c.id === m.documentId) ? m.reversalId! : undefined);
      if (isInternal) moved.set(key, layers);
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
            remaining.forEach((layer, i) => { layer.value = values[i]; });
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
      if (receiptLine) {
        const value = receiptValue(receiptLine);
        layers = [{ quantity: q, value, sourceId: m.id, receivedAt: m.createdAt }];
        record('receipts', layers);
      } else if (returned) {
        const shipment = shipments.get(returned.shipmentId);
        const line = shipment?.lines.find((l: any) => l.id === returned.shipmentLineId);
        const shipped = structuredClone(consumed.get(`${returned.shipmentId}:${m.itemId}`) ?? []);
        for (const prior of shipment?.lines ?? []) {
          if (prior.id === line?.id) break;
          if (prior.itemId === m.itemId) takeLayers(shipped, decimal(prior.quantity));
        }
        const lineLayers = line ? takeLayers(shipped, decimal(line.quantity)) : [];
        const shippedQ = lineLayers.reduce((n, l) => n + l.quantity, 0n);
        const priorReturned = returnedQuantities.get(returned.shipmentLineId) ?? 0n;
        const value = !line || !shippedQ || lineLayers.some(l => l.value === null) ? null : sumValue(lineLayers) * (priorReturned + q) / shippedQ - sumValue(lineLayers) * priorReturned / shippedQ;
        returnedQuantities.set(returned.shipmentLineId, priorReturned + q);
        layers = [{ quantity: q, value, sourceId: m.id, receivedAt: m.createdAt }];
        record('returns', layers);
      } else {
        const batch = s.imports.find(b => b.id === m.importId);
        const opening = batch?.costEvidence?.find((e: any) => e.itemId === m.itemId && e.locationId === m.locationId);
        const original = m.reversalId ? receiptLines.get(m.reversalId) : null;
        const originalValue = original ? receiptValue(original) : null;
        const value = original ? originalValue === null ? null : originalValue * q / decimal(original.quantity)
          : opening && batch?.currency === 'USD' ? q * decimal(opening.cost) : null;
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
