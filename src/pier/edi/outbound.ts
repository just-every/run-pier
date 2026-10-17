import { decimal, fail, format, fresh, get, row, text, type Context, type Row } from '../model';
import { reserve } from '../orders';
import { resolveOrder } from './intake';
import { document, ediLines, exactProduct, timestamp, addMinutes } from './records';
import { issueSscc, validateSscc, gs1128Svg, gs1128Zpl } from './sscc';

export function acknowledge(c: Context, p: any): Row {
  const incoming = get(c.s, 'ediOrders', p.ediOrderId); fresh(incoming, p.version);
  const partner = get(c.s, 'ediPartners', incoming.partnerId);
  if (incoming.conflict) fail('EDI_AMENDMENT', incoming.conflict);
  if (c.s.ediDocuments.some(d => d.ediOrderId === incoming.id && d.kind === '855' && d.direction === 'outbound')) fail('EDI_ACK_EXISTS', 'The acknowledgment is already prepared. Preserve its exact reviewed contents.');
  if (!Array.isArray(p.lines) || p.lines.length !== incoming.lines.length || new Set(p.lines.map((l: any) => l.lineId)).size !== incoming.lines.length) fail('EDI_ACK_LINES', 'Review every retailer order line exactly once.');
  for (const source of incoming.lines) {
    const decision = p.lines.find((l: any) => l.lineId === source.id);
    if (!decision || !['accept','change','reject'].includes(decision.decision)) fail('EDI_ACK_LINES', 'Choose accept, change or reject for every line.');
    const q = decimal(decision.quantity), ordered = decimal(source.quantity, true);
    if (decision.decision === 'accept' && q !== ordered) fail('EDI_ACK_QUANTITY', 'An accepted line must keep the requested quantity.');
    if (decision.decision === 'reject' && q !== 0n) fail('EDI_ACK_QUANTITY', 'A rejected line must acknowledge zero units.');
    if (decision.decision === 'change' && (q === 0n || q >= ordered)) fail('EDI_ACK_QUANTITY', 'A changed line must acknowledge a positive quantity below the request.');
    source.decision = decision.decision;
    source.ackQuantity = decision.quantity;
    source.ackReason = decision.decision === 'accept' ? null : text(decision.reason, 'Line decision reason');
  }
  resolveOrder(c, incoming);
  if (incoming.blockers?.length) fail('EDI_UNRESOLVED', 'Resolve or explicitly reject every unresolved line before preparing the acknowledgment.', incoming.blockers);
  if (incoming.orderId) {
    const native = get(c.s, 'orders', incoming.orderId);
    if (incoming.nativeOrderVersion !== native.version) fail('EDI_ORDER_CHANGED', 'The native sales order changed after EDI import. Review its cancellation, allocations and commercial terms before acknowledging.');
    if (native.lines.some((l: any) => decimal(l.dispatched) > 0n) || c.s.waves.some(w => w.orders.some((o: any) => o.orderId === native.id)) || c.s.packs.some(pack => pack.orderId === native.id)) fail('EDI_FULFILLMENT', 'Warehouse work already references this order. Review amendments separately.');
    for (const source of incoming.lines) {
      if (!source.orderLineId) continue;
      const line = native.lines.find((l: any) => l.id === source.orderLineId);
      line.cancelled = source.decision === 'reject' ? line.quantity : exactProductDifference(source.quantity, source.ackQuantity, source.packQuantity);
    }
    c.s.reservations = c.s.reservations.filter(r => r.orderId !== native.id);
    reserve(c, native);
    incoming.nativeOrderVersion = native.version;
  }
  const decisions = incoming.lines.map((l: any) => l.decision);
  const ack = document(c, partner, '855', {
    senderId: partner.senderId, receiverId: partner.receiverId, poNumber: incoming.poNumber, poDate: incoming.poDate,
    ackType: decisions.every((d: string) => d === 'reject') ? 'RD' : decisions.every((d: string) => d === 'accept') ? 'AD' : 'AC',
    lines: incoming.lines.map((l: any) => ({ lineNumber: l.lineNumber, quantity: l.quantity, unit: l.unit, unitPrice: l.unitPrice, identifiers: l.identifiers, status: l.decision === 'reject' ? 'IR' : l.decision === 'change' ? 'IQ' : 'IA', ackQuantity: l.ackQuantity, reason: l.ackReason ?? undefined, arrivalDate: incoming.arrivalDate })),
  }, { ediOrderId: incoming.id, orderId: incoming.orderId, deadline: incoming.ackDeadline, decisions: incoming.lines.map((l: any) => ({ lineId: l.id, decision: l.decision, quantity: l.ackQuantity, reason: l.ackReason })) });
  incoming.ackDocumentId = ack.id; incoming.version++; return ack;
}
function exactProductDifference(requested: string, accepted: string, pack: string) {
  // Both products are checked separately so fractional pack conversions cannot truncate.
  const before = decimal(exactProduct(requested, pack));
  const after = decimal(exactProduct(accepted, pack));
  return format(before - after);
}
export function prepareAsn(c: Context, p: any): Row {
  const incoming = get(c.s, 'ediOrders', p.ediOrderId), partner = get(c.s, 'ediPartners', incoming.partnerId), pack = get(c.s, 'packs', p.packId);
  if (!incoming.orderId || pack.orderId !== incoming.orderId) fail('EDI_PACK_ORDER', 'Choose a closed pack for this retailer order.');
  if (!['packed','shipped'].includes(pack.status) || !pack.packedAt || !pack.cartons?.length) fail('EDI_PACK_OPEN', 'Close and measure every carton before preparing the ASN.');
  if (!incoming.ackDocumentId) fail('EDI_ACK_REQUIRED', 'Review and prepare the 855 before preparing the ASN.');
  const existing = c.s.ediDocuments.find(d => d.kind === '856' && d.packId === pack.id && d.direction === 'outbound');
  if (existing) return existing;
  const arrivalAt = timestamp(p.arrivalAt, 'retailer arrival time'), pickupAt = timestamp(p.pickupAt, 'pickup time');
  if (Date.parse(arrivalAt) <= Date.parse(c.now) || Date.parse(pickupAt) >= Date.parse(arrivalAt)) fail('EDI_ARRIVAL', 'The ASN requires a future arrival after pickup.');
  const deadline = new Date(Math.min(Date.parse(addMinutes(arrivalAt, -partner.asnBeforeArrivalMinutes)), Date.parse(addMinutes(pickupAt, partner.asnAfterPickupMinutes)))).toISOString();
  let sequence = c.s.ediPartners.filter(p => p.gs1Prefix === partner.gs1Prefix).reduce((maximum, p) => {
    const current = BigInt(p.ssccSequence ?? '0'); return current > maximum ? current : maximum;
  }, 0n);
  const cartons = pack.cartons.map((carton: any) => {
    if (!carton.lines?.length || !carton.weight || !carton.length || !carton.width || !carton.height) fail('EDI_CARTON', 'Each closed carton needs contents, weight and dimensions.');
    const sscc = issueSscc(partner.gs1Prefix, ++sequence);
    if (!validateSscc(sscc) || c.s.ediDocuments.some(d => d.cartons?.some((x: any) => x.sscc === sscc))) fail('EDI_SSCC', 'This SSCC is invalid or already assigned. Review the company prefix and sequence.');
    return { number: carton.number, sscc, weight: carton.weight, length: carton.length, width: carton.width, height: carton.height, lines: carton.lines.map((l: any) => ({ ...l })), ediLines: ediLines(incoming, carton.lines) };
  });
  const reference = text(p.shipmentReference, 'Shipment reference');
  const doc = document(c, partner, '856', { senderId: partner.senderId, receiverId: partner.receiverId, poNumber: incoming.poNumber, poDate: incoming.poDate, shipmentId: reference, shipDate: pickupAt.slice(0, 10), shipTo: incoming.shipTo, cartons: cartons.map((carton: any) => ({ sscc: carton.sscc, lines: carton.ediLines })) }, { ediOrderId: incoming.id, orderId: incoming.orderId, packId: pack.id, shipmentReference: reference, pickupAt, arrivalAt, deadline, cartons, packVersion: pack.version });
  partner.ssccSequence = sequence.toString(); partner.version++;
  incoming.version++; return doc;
}
export function prepareInvoice(c: Context, p: any): Row {
  const incoming = get(c.s, 'ediOrders', p.ediOrderId), partner = get(c.s, 'ediPartners', incoming.partnerId), shipment = get(c.s, 'shipments', p.shipmentId);
  if (!incoming.orderId || shipment.orderId !== incoming.orderId || !shipment.lines?.length) fail('EDI_INVOICE_SHIPMENT', 'An EDI invoice requires a real shipment of this retailer order.');
  const old = c.s.ediDocuments.find(d => d.kind === '810' && d.shipmentId === shipment.id && d.direction === 'outbound');
  if (old) return old;
  const native = get(c.s, 'orders', incoming.orderId);
  const lines = ediLines(incoming, shipment.lines);
  let total = 0n;
  for (const line of shipment.lines) {
    const ordered = native.lines.find((l: any) => l.id === line.orderLineId);
    if (!ordered || ordered.price === null || ordered.price === undefined) fail('EDI_INVOICE_PRICE', 'The shipped line needs its retained order price.');
    total += decimal(line.quantity) * decimal(ordered.price);
  }
  // X12 TDS uses cents, rounding the complete shipped value once.
  const totalCents = ((total + 5000000000n) / 10000000000n).toString();
  return document(c, partner, '810', { senderId: partner.senderId, receiverId: partner.receiverId, poNumber: incoming.poNumber, poDate: incoming.poDate, invoiceNumber: `EDI-${shipment.reference}`, invoiceDate: c.now.slice(0, 10), lines, totalCents }, { ediOrderId: incoming.id, orderId: incoming.orderId, shipmentId: shipment.id, invoiceNumber: `EDI-${shipment.reference}`, totalCents, currency: 'USD', lines, deadline: addMinutes(shipment.createdAt, partner.invoiceMinutes) });
}
export function labelEvent(c: Context, type: string, p: any): Row {
  const doc = get(c.s, 'ediDocuments', p.documentId);
  if (doc.kind !== '856' || doc.direction !== 'outbound') fail('EDI_LABEL', 'Choose a prepared ASN carton label.');
  const carton = doc.cartons.find((x: any) => x.sscc === p.sscc);
  if (!carton || !validateSscc(carton.sscc)) fail('EDI_LABEL', 'Choose a carton SSCC retained on this ASN.');
  const prior = c.s.ediLabelEvents.some(e => e.documentId === doc.id && e.sscc === carton.sscc);
  if (type === 'edi.label.reprint' && !prior) fail('EDI_LABEL', 'Prepare the first print before recording a reprint.');
  if (type === 'edi.label.print' && prior) fail('EDI_LABEL', 'This label was already prepared for printing. Reprint with a reason.');
  const event = row(c, 'ediLabelEvents', { documentId: doc.id, partnerId: doc.partnerId, orderId: doc.orderId, packId: doc.packId, sscc: carton.sscc, cartonNumber: carton.number, action: prior ? 'reprint' : 'print', reason: text(p.reason, 'Print reason'), actorId: c.actor.id, commandId: c.commandId, contents: structuredClone(carton.lines), outcome: 'prepared', physicalCompletion: false });
  return { ...event, svg: gs1128Svg(carton.sscc), zpl: gs1128Zpl(carton.sscc) };
}
