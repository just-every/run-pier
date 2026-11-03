import { decimal, fail, fresh, get, id, item, row, type Context, type Row } from '../model';
import { orders } from '../orders';
import { parse850, parse997 } from './x12';
import { addMinutes, document, exactPrice, exactProduct } from './records';

function mapped(c: Context, partner: Row, source: any) {
  const bp = source.identifiers.find((x: any) => x.qualifier === 'BP')?.value;
  const upc = source.identifiers.find((x: any) => x.qualifier === 'UP')?.value;
  const matches = c.s.ediMappings.filter(m => m.partnerId === partner.id && ((bp && m.buyerCode === bp) || (upc && m.upc === upc)));
  if (matches.length !== 1) return { mappingId: null, itemId: null, blocker: matches.length ? 'BP and UPC identify conflicting mappings. Resolve the retailer item mapping.' : 'Map this retailer BP or UPC before creating the order.' };
  const mapping = matches[0];
  if ((bp && mapping.buyerCode && mapping.buyerCode !== bp) || (upc && mapping.upc && mapping.upc !== upc)) return { mappingId: mapping.id, itemId: mapping.itemId, blocker: 'The retailer BP and UPC disagree with the retained item mapping.' };
  const i = c.s.items.find(i => i.id === mapping.itemId && !i.archived);
  if (!i) return { mappingId: mapping.id, itemId: mapping.itemId, blocker: 'The mapped item is archived or unavailable.' };
  if (mapping.unit !== source.unit) return { mappingId: mapping.id, itemId: i.id, blocker: `Retailer unit ${source.unit} differs from mapped unit ${mapping.unit}.` };
  try {
    return { mappingId: mapping.id, mappingVersion: mapping.version, itemId: i.id, packQuantity: mapping.packQuantity, baseQuantity: exactProduct(source.quantity, mapping.packQuantity), basePrice: exactPrice(source.unitPrice, mapping.packQuantity), blocker: null };
  } catch (error) { return { mappingId: mapping.id, itemId: i.id, blocker: error instanceof Error ? error.message : 'Review the mapped pack conversion.' }; }
}
export function resolveOrder(c: Context, incoming: Row): Row {
  if (incoming.orderId) return incoming;
  const partner = get(c.s, 'ediPartners', incoming.partnerId);
  incoming.lines = incoming.lines.map((line: any) => ({ ...line, ...mapped(c, partner, line) }));
  incoming.blockers = [
    ...(incoming.conflict ? [incoming.conflict] : []),
    ...(incoming.unmappedSegments?.length ? ['The purchase order contains unsupported conditions or references. Review the retained source before importing.'] : []),
    ...incoming.lines.filter((l: any) => l.blocker && l.decision !== 'reject').map((l: any) => `Line ${l.lineNumber}: ${l.blocker}`),
  ];
  if (incoming.blockers.length) { incoming.status = 'blocked'; return incoming; }
  const accepted = incoming.lines.filter((l: any) => l.decision !== 'reject');
  if (!accepted.length) { incoming.status = 'rejected'; return incoming; }
  const created = orders(c, 'order.create', {
    customerId: partner.customerId, warehouse: partner.warehouse, ediPartnerId:partner.id,shipTo:incoming.shipTo,currency: 'USD', channel: 'edi', promiseDate: incoming.arrivalDate ?? null,
    lines: accepted.map((l: any) => ({ itemId: l.itemId, quantity: l.baseQuantity, price: l.basePrice })),
  })!;
  const native = get(c.s, 'orders', created.id);
  Object.assign(native, { ediOrderId: incoming.id, ediPartnerId: partner.id, channelReference: incoming.poNumber, shipTo: incoming.shipTo ?? null });
  accepted.forEach((l: any, n: number) => { l.orderLineId = native.lines[n].id; });
  incoming.orderId = native.id; incoming.nativeOrderVersion = native.version; incoming.status = 'imported'; incoming.importedAt = c.now;
  return incoming;
}
export function receive(c: Context, p: any): Row {
  const partner = get(c.s, 'ediPartners', p.partnerId);
  if (partner.enabled === false) fail('EDI_PARTNER', 'This retailer connection is disabled.');
  if (typeof p.x12 !== 'string' || new TextEncoder().encode(p.x12).length > 250000) fail('EDI_SIZE', 'Submit one X12 purchase order of at most 250,000 bytes.');
  let parsed: ReturnType<typeof parse850>;
  try { parsed = parse850(p.x12); } catch (error) { return fail('EDI_850', error instanceof Error ? error.message : 'Invalid X12 850.'); }
  if (parsed.senderId !== partner.receiverId || parsed.receiverId !== partner.senderId) fail('EDI_PARTNER_IDS', 'The X12 sender and receiver do not match this retailer connection.');
  const controlKey = [parsed.interchangeControl, parsed.groupControl, parsed.transactionControl].join(':');
  const previous = c.s.ediOrders.find(o => o.partnerId === partner.id && o.controlKey === controlKey);
  if (previous) {
    if (previous.x12 !== p.x12) fail('EDI_DUPLICATE_CONTROL', 'This control identity was already received with different contents. Review the original document.');
    return previous;
  }
  const priorPo = c.s.ediOrders.find(o => o.partnerId === partner.id && o.poNumber === parsed.poNumber);
  const incoming = row(c, 'ediOrders', { ...parsed, partnerId: partner.id, controlKey, x12: p.x12, receivedAt: c.now, receivedBy: c.actor.id, commandId: c.commandId, ackDeadline: addMinutes(c.now, partner.ackMinutes), orderId: null, status: 'blocked', conflict: priorPo ? `Purchase order ${parsed.poNumber} already exists. Retailer amendments require review; no second sales order was created.` : null, lines: parsed.lines.map(l => ({ ...l, id: id() })) });
  const original = row(c, 'ediDocuments', { partnerId: partner.id, ediOrderId: incoming.id, kind: '850', direction: 'inbound', status: 'received', x12: p.x12, receivedAt: c.now, interchangeControl: parsed.interchangeControl, groupControl: parsed.groupControl, transactionControl: parsed.transactionControl, receivedBy: c.actor.id, commandId: c.commandId });
  incoming.documentId = original.id;
  const ack = document(c, partner, '997', { senderId: partner.senderId, receiverId: partner.receiverId, sourceGroupControl: parsed.groupControl, sourceTransactionControl: parsed.transactionControl, acknowledgment: 'A' }, { ediOrderId: incoming.id, sourceDocumentId: original.id, deadline: null });
  incoming.acknowledgmentDocumentId = ack.id;
  resolveOrder(c, incoming); return incoming;
}
export function receive997(c: Context, p: any): Row {
  const partner = get(c.s, 'ediPartners', p.partnerId);
  if (typeof p.x12 !== 'string' || new TextEncoder().encode(p.x12).length > 250000) fail('EDI_SIZE', 'Submit one X12 acknowledgment of at most 250,000 bytes.');
  let ack: ReturnType<typeof parse997>;
  try { ack = parse997(p.x12); } catch (error) { return fail('EDI_997', error instanceof Error ? error.message : 'Invalid X12 997.'); }
  if (ack.senderId !== partner.receiverId || ack.receiverId !== partner.senderId) fail('EDI_PARTNER_IDS', 'The acknowledgment sender and receiver do not match the retailer.');
  const old = c.s.ediDocuments.find(d => d.partnerId === partner.id && d.direction === 'inbound' && d.kind === '997' && d.groupControl === ack.groupControl && d.transactionControl === ack.transactionControl && d.interchangeControl === ack.interchangeControl);
  if (old) { if (old.x12 !== p.x12) fail('EDI_DUPLICATE_CONTROL', 'This acknowledgment control identity has conflicting contents.'); return old; }
  const matches = c.s.ediDocuments.filter(d => d.partnerId === partner.id && d.direction === 'outbound' && Number(d.groupControl) === Number(ack.sourceGroupControl) && (!ack.sourceTransactionControl || Number(d.transactionControl) === Number(ack.sourceTransactionControl)));
  const evidence = row(c, 'ediDocuments', { ...ack, partnerId: partner.id, kind: '997', direction: 'inbound', x12: p.x12, status: matches.length === 1 ? 'received' : 'unmatched', receivedAt: c.now, receivedBy: c.actor.id, commandId: c.commandId, sourceDocumentId: matches.length === 1 ? matches[0].id : null });
  if (matches.length === 1) {
    const doc = matches[0];
    if (doc.functionalAcknowledgment) { evidence.status = 'conflict'; evidence.problem = 'A functional acknowledgment is already recorded for this document. Review both originals.'; }
    else { doc.functionalAcknowledgment = { documentId: evidence.id, status: ack.acknowledgment, receivedAt: c.now }; doc.version++; }
  }
  return evidence;
}
export function saveMapping(c: Context, p: any): Row {
  const partner = get(c.s, 'ediPartners', p.partnerId), i = item(c.s, p.itemId);
  const old = p.id ? get(c.s, 'ediMappings', p.id) : undefined;
  if (old) {
    fresh(old, p.version);
    if (old.partnerId !== partner.id) fail('EDI_MAPPING', 'Create a separate mapping for another retailer.');
    if (c.s.ediOrders.some(o => o.orderId && o.lines.some((l: any) => l.mappingId === old.id))) fail('EDI_MAPPING_USED', 'An imported order uses this mapping. Preserve its established pack and item identity.');
  }
  const buyerCode = typeof p.buyerCode === 'string' ? p.buyerCode.trim() : '';
  const upc = typeof p.upc === 'string' ? p.upc.trim() : '';
  if ((!buyerCode && !upc) || buyerCode.length > 80 || (upc && !/^\d{12,14}$/.test(upc))) fail('EDI_MAPPING', 'Enter a retailer BP code or a 12–14 digit UPC/GTIN.');
  if (c.s.ediMappings.some(m => m.id !== old?.id && m.partnerId === partner.id && ((buyerCode && m.buyerCode === buyerCode) || (upc && m.upc === upc)))) fail('EDI_MAPPING_DUPLICATE', 'This retailer code already maps to an item. Edit that mapping.');
  if (typeof p.unit !== 'string' || !/^[A-Z0-9]{2,3}$/.test(p.unit)) fail('EDI_UNIT', 'Enter the retailer X12 unit code.');
  decimal(p.packQuantity, true);
  const data = { partnerId: partner.id, buyerCode: buyerCode || null, upc: upc || null, itemId: i.id, unit: p.unit, packQuantity: p.packQuantity, mappedBy: c.actor.id, updatedAt: c.now };
  return old ? Object.assign(old, data, { version: old.version + 1 }) : row(c, 'ediMappings', data);
}
