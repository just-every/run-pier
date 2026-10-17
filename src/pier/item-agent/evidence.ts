import { decimal, format, get, positions, type Context } from '../model';
import { forecast } from '../replenishment';
import { canonicalJson, sha256 } from '../import-kit';

/** Only records relevant to this item enter a review or leave for the provider. */
export function itemSources(c: Context, itemId: string) {
  const item = get(c.s, 'items', itemId);
  const documents = (rows: any[]) => rows.filter(r => r.lines?.some((l: any) => l.itemId === itemId)).map(r => ({ ...r, lines: r.lines.filter((l: any) => l.itemId === itemId) }));
  const purchases = documents(c.s.purchaseOrders);
  const supplierIds = new Set([...purchases.map(p => p.supplierId), ...c.s.supplierItems.filter(t => t.itemId === itemId).map(t => t.supplierId)]);
  return {
    item,
    locations: c.s.locations,
    supplierItems: c.s.supplierItems.filter(t => t.itemId === itemId),
    suppliers: c.s.parties.filter(p => supplierIds.has(p.id)).map(p => ({ id: p.id, version: p.version, name: p.name })),
    movements: c.s.movements.filter(m => m.itemId === itemId),
    reservations: c.s.reservations.filter(r => r.itemId === itemId),
    orders: documents(c.s.orders).map(o => ({ id: o.id, version: o.version, reference: o.reference, warehouse: o.warehouse, promiseDate: o.promiseDate, lines: o.lines })),
    purchaseOrders: purchases.map(po => ({ id: po.id, version: po.version, reference: po.reference, supplierId: po.supplierId, destinationWarehouse: po.destinationWarehouse, status: po.status, promiseDate: po.promiseDate, confirmation: po.confirmation, lines: po.lines })),
    receipts: documents(c.s.receipts), shipments: documents(c.s.shipments),
    transfers: c.s.transfers.filter(t => t.itemId === itemId),
    policies: c.s.replenishmentPolicies.filter(p => p.itemId === itemId),
    holds: c.s.channelHolds.filter(h => h.itemId === itemId),
  };
}
export const sourceDigest = (c: Context, itemId: string) => sha256(canonicalJson(JSON.parse(JSON.stringify(itemSources(c, itemId)))));

export function checkItem(c: Context, itemId: string) {
  const sources = itemSources(c, itemId);
  if (sources.item.archived) return { checks: [{ kind: 'stock', title: 'Archived item', detail: 'History remains available. New purchasing and policy changes are unavailable.', evidence: [itemId] }], actions: [], sources };
  const plans = forecast({ ...c, s: { ...c.s, items: [sources.item] } });
  const checks: any[] = [], actions: any[] = [];
  const addAction = (action: any) => actions.push({ ...action, id: crypto.randomUUID(), status: 'prepared' });
  const stockPositions = positions(c.s).filter(p => p.itemId === itemId);
  const onHand = stockPositions.filter(p => p.status === 'sellable').reduce((sum, p) => sum + decimal(p.quantity), 0n);
  let demand = 0n, expected = 0n;
  for (const o of sources.orders) for (const line of o.lines) demand += decimal(line.quantity) - decimal(line.dispatched) - decimal(line.cancelled);
  for (const po of sources.purchaseOrders.filter(po => po.status === 'committed')) for (const line of po.lines) {
    const remainder = decimal(line.quantity) - decimal(line.received);
    if (remainder > 0n) expected += remainder;
  }
  checks.push({ kind: 'stock', title: 'Stock against open demand and purchases',
    detail: `${format(onHand)} sellable on hand; ${format(demand)} outstanding order demand; ${format(expected)} committed purchase remainder. Expected stock cannot fulfil a present reservation.`,
    values: { onHand: format(onHand), openDemand: format(demand), expected: format(expected), uncovered: format(demand > onHand + expected ? demand - onHand - expected : 0n) },
    evidence: [...sources.orders.map(o => o.id), ...sources.purchaseOrders.map(po => po.id), ...sources.movements.map(m => m.id)] });
  if (!plans.length) checks.push({ kind: 'reorder', title: 'Reorder point needs a warehouse', detail: 'Define a warehouse bin and supplier terms before reviewing replenishment.', evidence: [itemId] });
  for (const f of plans) {
    checks.push({ kind: 'reorder', title: `${f.warehouse}: reorder point against sell-through`,
      detail: f.hasHistory ? `${f.observedSold} shipped over ${f.windowDays} days. Current reorder point ${f.applied.reorderPoint ?? 'not set'}; observed lead-time demand plus safety stock suggests ${f.learned.reorderPoint}. Observed sales can be censored by stockouts.` : `No native shipments in ${f.windowDays} days. A reorder point cannot be learned from absent history.`,
      values: { warehouse: f.warehouse, position: f.position, onHand: f.onHand, reserved: f.reserved, backorders: f.backorders, onOrder: f.onOrder, inboundTransfers: f.inboundTransfers, draftQuantity: f.draftQuantity, observedSold: f.observedSold, windowDays: f.windowDays, leadDays: f.leadDays, safetyStock: f.safetyStock, currentPoint: f.applied.reorderPoint, learnedPoint: f.hasHistory ? f.learned.reorderPoint : null, suggestedQuantity: f.suggestedQuantity },
      evidence: [f.policyId, f.terms?.id, ...f.windows.find(w => w.days === f.windowDays)!.shipmentIds, ...f.receipts.map(r => r.poId)].filter(Boolean) });
    if (f.hasHistory && f.policy && f.applied.reorderPoint !== f.learned.reorderPoint && !(f.applied.method === 'upTo' && f.applied.maximum !== null && decimal(f.learned.reorderPoint) > decimal(f.applied.maximum))) {
      addAction({ kind: 'reorder-point', title: `Set ${f.warehouse} reorder point to ${f.learned.reorderPoint}`, targetId: f.policy.id,
        before: structuredClone(f.policy), after: { reorderPoint: f.learned.reorderPoint }, evidence: [f.policy.id, ...f.windows.find(w => w.days === f.windowDays)!.shipmentIds] });
    }
    if (f.low && !f.blockedReason && decimal(f.suggestedQuantity) > 0n) {
      addAction({ kind: 'purchase-draft', title: `Draft ${f.suggestedQuantity} ${sources.item.unit} for ${f.warehouse}`,
        before: null, after: { supplierId: f.supplierId, destinationWarehouse: f.warehouse,
          promiseDate: new Date(Date.parse(c.now) + f.leadDays * 86_400_000).toISOString().slice(0, 10),
          freight: f.freight, duty: f.duty, reason: 'Human-applied item review; exact purchase approval is still required.',
          lines: [{ itemId, quantity: f.suggestedQuantity, price: f.unitPrice }] },
        evidence: [f.policyId, f.terms?.id, ...f.receipts.map(r => r.poId)].filter(Boolean) });
    }
  }
  for (const terms of sources.supplierItems) {
    const receipts = sources.receipts.filter(r => r.status === 'posted' && r.currency === 'USD' && sources.purchaseOrders.some(po => po.id === r.poId && po.supplierId === terms.supplierId))
      .map(r => {
        const costs = [...new Set<string>(r.lines.map((l: any) => l.cost))];
        return { receiptId: r.id, at: r.createdAt, cost: costs.length === 1 ? costs[0] : null, lineCosts: costs };
      })
      .sort((a, b) => b.at.localeCompare(a.at) || b.receiptId.localeCompare(a.receiptId));
    const latest = receipts[0];
    checks.push({ kind: 'cost', title: `Supplier cost: ${sources.suppliers.find(s => s.id === terms.supplierId)?.name ?? terms.supplierId}`,
      detail: latest?.cost != null ? `Current terms ${terms.price} USD per ${sources.item.unit}; last posted receipt ${latest.cost} USD per ${sources.item.unit}. Receipt cost is observed evidence, not a new supplier quote. Freight and duty stay separate.` : latest ? 'The latest receipt has several item-line costs. Review those lines before selecting a supplier price; no single price is inferred.' : 'No posted receipt with reviewed USD costs from this supplier for comparison. No cost change is inferred.',
      values: { supplierId: terms.supplierId, termsPrice: terms.price, lastReceiptCost: latest?.cost ?? null, lastReceiptAt: latest?.at ?? null, recentReceipts: receipts.slice(0, 3) },
      evidence: [terms.id, ...receipts.slice(0, 3).map(r => r.receiptId)] });
    if (latest?.cost != null && decimal(terms.price) !== decimal(latest.cost)) addAction({ kind: 'supplier-price', title: `Use last receipt cost ${latest.cost} USD in supplier terms`,
      targetId: terms.id, before: structuredClone(terms), after: { price: latest.cost }, evidence: [terms.id, latest.receiptId] });
  }
  if (!sources.supplierItems.length) checks.push({ kind: 'cost', title: 'No supplier cost to compare', detail: 'Add supplier-item terms to compare their price against posted receipt evidence.', evidence: [itemId] });
  return { checks, actions, sources };
}
