import { decimal, fail, format, fresh, get, move, requireRole, text, type Context, type Row } from './model';
import { createReturn, orders } from './orders';
import { resolve } from './floor/codes';
import { returnLookup } from './returns-lookup';
import { valuationLedger } from './valuation-ledger';
import { money } from './money';
import { returnCost } from './returns-cost';

function inspection(p: any) {
  if (!['sellable', 'damaged'].includes(p.condition)) fail('RETURN_CONDITION', 'Record whether this unit is sellable or damaged.');
  if (!['restock', 'quarantine', 'writeoff'].includes(p.disposition)) fail('RETURN_DISPOSITION', 'Choose restock, quarantine or write off.');
  if ((p.disposition === 'restock' && p.condition !== 'sellable') || (p.disposition === 'writeoff' && p.condition !== 'damaged')) fail('RETURN_CONDITION', 'Only sellable units may be restocked; write-off requires damaged condition.');
  return { condition: p.condition, disposition: p.disposition, reason: text(p.reason, 'Inspection reason') };
}

function dispose(c: Context, r: Row, p: any) {
  const review = inspection(p);
  Object.assign(r, { condition: review.condition, inspectionReason: review.reason, requestedDisposition: review.disposition, inspectedAt: c.now, inspectedBy: c.actor.id });
  if (review.disposition === 'quarantine') { r.version++; return r; }
  if (review.disposition === 'restock') {
    orders(c, 'return.approve', { returnId: r.id, version: r.version });
    orders(c, 'return.restock', { returnId: r.id, version: r.version });
  } else {
    const accountId = c.s.bookConnections.find(b => b.enabled)?.writeOffAccountId;
    if (!accountId) return fail('BOOK_ACCOUNT', 'An owner must map the damaged-stock expense account in Books before writing stock off. Keep it quarantined until then.');
    r.writeOffAccountId = accountId;
    const sourceIds = new Set(c.s.movements.filter(m => m.documentId === r.id && m.status === 'quarantine' && BigInt(m.quantity) > 0n).map(m => m.id));
    const layers = valuationLedger(c.s, c.now).positions.flatMap(position => position.layers).filter(layer => sourceIds.has(layer.sourceId));
    r.writeOffCostTotal = !layers.length || layers.some(layer => layer.value === null) ? null : money(layers.reduce((n, layer) => n + layer.value!, 0n));
    move(c, { itemId: r.itemId, locationId: r.locationId, status: 'quarantine', quantity: (-decimal(r.quantity)).toString(), reason: `Damaged return write-off: ${review.reason}`, documentId: r.id });
    r.status = 'writtenoff';
    r.version++;
  }
  r.dispositionAt = c.now;
  return r;
}

/** A scan is one atomic physical intake + authorized inspection. Operators
 * without inspection authority can receive it only into quarantine. */
export function returns(c: Context, type: string, p: any): Row | undefined {
  if (type === 'return.inspect') {
    requireRole(c, ['warehouse']);
    const r = get(c.s, 'returns', p.returnId);
    fresh(r, p.version);
    if (r.status !== 'quarantine') fail('RETURN_STATE', 'Only quarantined returns may be inspected.');
    return dispose(c, r, p);
  }
  if (type !== 'return.scan') return;
  requireRole(c, ['operator', 'warehouse']);
  const review = inspection(p), scanned = resolve(c.s, p.code);
  if (p.count !== undefined && p.count !== '' && (typeof p.count !== 'string' || !/^[1-9]\d{0,5}$/.test(p.count))) fail('SCAN_COUNT', 'Times scanned must be a positive whole number up to 999999.');
  const matches = returnLookup(c.s, p.code).filter(candidate => (!p.shipmentId || candidate.shipmentId === p.shipmentId) && (!p.shipmentLineId || candidate.shipmentLineId === p.shipmentLineId));
  if (matches.length !== 1) fail(matches.length ? 'AMBIGUOUS_RETURN' : 'RETURN_SOURCE', matches.length ? 'This item was shipped more than once. Choose its order and shipment before returning it.' : 'Choose a dispatch of this item with units still eligible for return.');
  const source = matches[0];
  if ('item' in scanned && scanned.item.item.id !== source.itemId) fail('RETURN_SOURCE', 'This item does not belong to the selected dispatch line.');
  if (!('item' in scanned) && (p.quantity === undefined || !p.shipmentLineId)) fail('RETURN_QUANTITY', 'Confirm the dispatched line and exact base-unit quantity when returning from an order or shipment label.');
  if ('bin' in scanned) fail('SCAN_BIN', 'Scan the returned item, order or shipment label.');
  let locationId = p.locationId;
  if (p.binCode) {
    const bin = resolve(c.s, p.binCode);
    if (!('bin' in bin)) return fail('BIN', 'Scan the destination bin label.');
    if (locationId && bin.bin.id !== locationId) fail('BIN', 'The scanned bin differs from the selected destination.');
    locationId = bin.bin.id;
  }
  if (get(c.s, 'locations', locationId).kind !== 'bin') fail('BIN', 'Returns require a named warehouse bin.');
  const quantity = 'item' in scanned ? scanned.item.units * BigInt(p.count || '1') : decimal(p.quantity, true);
  if (!quantity) fail('DECIMAL', 'A scan must return a positive quantity.');
  const r = createReturn(c, { ...source, locationId, quantity: format(quantity), reason: review.reason });
  Object.assign(r, { orderId: source.orderId, condition: review.condition, requestedDisposition: review.disposition, scannedCode: text(p.code), receivedBy: c.actor.id });
  r.costTotal = returnCost(c.s, r, c.now);
  return ['owner', 'warehouse'].includes(c.actor.role) ? dispose(c, r, p) : r;
}

export const returnCommands = { 'return.scan': returns, 'return.inspect': returns };
