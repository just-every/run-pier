import { canonicalJson, sha256 } from '../import-kit';
import { fail, fresh, get, text, type Context, type Row } from '../model';
import { orders } from '../orders';
import { isoDay, quoteLines } from '../sales-quotes';
import { routingFrontier } from '../routing';

const frontier = (c: Context) => sha256(canonicalJson({ day: c.now.slice(0, 10), routing: routingFrontier(c.s), items: c.s.items, prices: c.s.priceLists, rules: c.s.routingRules, holds: c.s.channelHolds, kits: c.s.kitDefinitions }));
function corrected(c: Context, value: any) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('DOCUMENT_REVIEW', 'Enter the corrected customer, PO, item mappings, units and quantities.');
  const customerId = text(value.customerId, 'Reviewed customer'), customerPO = text(value.customerPO, 'Customer PO');
  if (get(c.s, 'parties', customerId).kind !== 'customer') fail('CUSTOMER', 'Choose a customer.');
  const warehouse = value.warehouse ? text(value.warehouse, 'Fixed warehouse') : undefined;
  let shipTo: Record<string, string> | null = null;
  if (value.shipTo) {
    shipTo = {};
    for (const field of ['line1', 'city', 'state', 'postalCode', 'country']) if (value.shipTo[field]) shipTo[field] = text(value.shipTo[field], `Ship-to ${field}`);
    if (shipTo.state && !/^[A-Z]{2}$/.test(shipTo.state) || shipTo.country && !/^[A-Z]{2}$/.test(shipTo.country)) fail('ADDRESS', 'Use uppercase two-letter state and country codes.');
  }
  const promiseDate = value.promiseDate ? isoDay(value.promiseDate, 'Requested date') : null;
  if (!Array.isArray(value.lines) || !value.lines.length || value.lines.length > 100) fail('LINES', 'Review between one and 100 order lines.');
  const lines = value.lines.map((line: any) => ({ itemId: text(line.itemId, 'Mapped item'), quantity: text(line.quantity, 'Reviewed quantity'), unit: text(line.unit, 'Reviewed unit'), ...(line.price === undefined || line.price === '' ? {} : { price: text(line.price, 'Reviewed USD unit price') }) }));
  // Reuse quote validation for explicit base/case units and exact conversion.
  quoteLines(c, { customerId, lines });
  return { customerId, customerPO, ...(warehouse ? { warehouse } : {}), shipTo, promiseDate, lines };
}
function create(c: Context, review: any) {
  if (c.s.orders.some(o => o.customerId === review.customerId && o.customerPO === review.customerPO)) fail('DUPLICATE', 'This customer PO already has an order, including customer-file imports.');
  const priced = quoteLines(c, review);
  if (priced.some((line: any) => line.price === null)) fail('PRICE', 'Review a USD unit price for every line without a current customer price tier.');
  const order = orders(c, 'order.create', {
    customerId: review.customerId, warehouse: review.warehouse, shipTo: review.shipTo, promiseDate: review.promiseDate,
    channel: 'document', routingSource: 'document',
    lines: priced.map((line: any, index: number) => ({ itemId: line.itemId, quantity: line.quantity, ...(review.lines[index].price === undefined ? {} : { price: review.lines[index].price }), commercialQuantity: line.commercialQuantity, commercialUnit: line.commercialUnit, packSize: line.packSize, unit: line.unit })),
  })!;
  const native = get(c.s, 'orders', order.id);
  native.customerPO = review.customerPO;
  return { order, native };
}
export function reviewExtraction(c: Context, type: string, p: any): Row | undefined {
  if (!['document.review', 'document.approve'].includes(type)) return;
  const extraction = get(c.s, 'documentExtractions', p.extractionId);
  if (extraction.status === 'approved') {
    if (type === 'document.approve' && p.version === extraction.approvedVersion) return extraction;
    return fail('DOCUMENT_STATE', 'This extraction was already approved. Open its retained order.');
  }
  fresh(extraction, p.version);
  if (!['completed', 'reviewed'].includes(extraction.status)) fail('DOCUMENT_STATE', 'Review a completed cited extraction.');
  const document = get(c.s, 'evidenceDocuments', extraction.documentId);
  if (c.s.orders.some(o => o.evidenceSha256 === document.sha256)) fail('DUPLICATE', 'This original already created a reviewed order.');
  if (type === 'document.review') {
    if (p.resolveAmbiguities !== true) fail('DOCUMENT_REVIEW', 'Explicitly confirm every citation, ambiguity and item/pack mapping was reviewed.');
    const review = corrected(c, p.review), reason = text(p.reason, 'Review and correction reason');
    const trial: Context = { ...c, s: structuredClone(c.s) };
    const { order } = create(trial, review);
    const preview = { warehouse: order.warehouse, routing: order.routing, lines: order.lines, total: order.total, pricingStatus: order.pricingStatus, errors: [] };
    Object.assign(extraction, { status: 'reviewed', review, reviewReason: reason, reviewedBy: c.actor.id, reviewedAt: c.now, preview, reviewFrontier: frontier(c), version: extraction.version + 1 });
    return extraction;
  }
  if (extraction.status !== 'reviewed' || !extraction.review || extraction.reviewFrontier !== frontier(c)) fail('STALE', 'Stock, pricing, customer or routing changed. Preview the corrected draft again before approving.');
  const { order, native } = create(c, extraction.review);
  Object.assign(native, { evidenceDocumentId: document.id, evidenceSha256: document.sha256, documentExtractionId: extraction.id, documentReview: { actorId: c.actor.id, at: c.now, version: extraction.version, reason: extraction.reviewReason } });
  Object.assign(extraction, { status: 'approved', orderId: order.id, approvedBy: c.actor.id, approvedAt: c.now, approvedVersion: extraction.version, version: extraction.version + 1 });
  document.links.push({ kind: 'orders', id: order.id, actorId: c.actor.id, at: c.now });
  document.version++;
  return extraction;
}
