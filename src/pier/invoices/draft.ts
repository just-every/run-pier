import { decimal, fail, format, get, id, nextReference, SCALE, text, type Context, type Row } from '../model';
import { amount, CENT, money, toCents } from '../money';
import { estimateTax } from '../tax-rules';
import { isoDay } from '../sales-quotes';
import { invoiceTerms } from './terms';
import { append, records } from './state';

export function invoicePolicy(c: Context, order: Row): Row | undefined {
  return c.s.salesPolicies.find(r => r.kind === 'invoicing' && r.orderId === order.id) ?? c.s.salesPolicies.find(r => r.kind === 'invoicing' && r.customerId === order.customerId && !r.orderId);
}
export function noLegacyInvoice(c: Context, order: Row, shipmentId?: string) {
  const shipments = new Set(c.s.shipments.filter(s => s.orderId === order.id && (!shipmentId || s.id === shipmentId)).map(s => s.id));
  if (c.s.bookJobs.some(j => j.kind === 'invoice' && (j.attempted || j.remoteId) && (shipments.has(String(j.key).replace(/^invoice:/, '')) || j.sourceId === order.id)))
    fail('INVOICE_LEGACY_POSTED', 'This source already has a legacy books invoice or an uncertain posting. Reconcile it before native invoicing.');
}
export function sourceLines(c: Context, order: Row, shipment: Row | undefined, p: any) {
  if (order.documentType === 'quote' && !order.acceptedAt) fail('INVOICE_SOURCE', 'Accept the order before preparing its invoice.');
  if (order.channelId || order.channelPayment) fail('INVOICE_CHANNEL', 'Channel invoices require their charged-tax and payment mapping before native authorization.');
  const lines = (shipment?.lines ?? order.lines).map((line: any) => {
    const source = shipment ? order.lines.find((l: any) => l.id === line.orderLineId) : line;
    if (!source) return fail('INVOICE_SOURCE', 'Shipment line no longer matches its order.');
    const quantity = shipment ? decimal(line.quantity, true) : decimal(line.quantity) - decimal(line.cancelled);
    if (quantity <= 0n) return null;
    const item = get(c.s, 'items', source.itemId);
    const override = p.unitPrices?.find((r: any) => r.orderLineId === source.id);
    const price = override?.price ?? source.price;
    if (typeof price !== 'string') return fail('INVOICE_PRICE', 'Price every source line before invoicing.');
    decimal(price);
    if (override && !p.priceReason) fail('INVOICE_PRICE', 'Record the reason for reviewed invoice price conversion.');
    const exact = quantity * decimal(price);
    return { id: id(), orderLineId: source.id, shipmentLineId: shipment ? line.id : null, itemId: item.id, sku: item.sku, description: item.name, quantity: format(quantity), unit: item.unit, packSize: source.packSize ?? item.packSize, commercialQuantity: shipment ? null : source.commercialQuantity ?? null, commercialUnit: shipment ? null : source.commercialUnit ?? item.unit, unitPrice: price, price, sourcePrice: source.price, exactAmount: money(exact), amount: money(toCents(exact)), priceSnapshot: structuredClone(source.priceSnapshot ?? null), customerItemCode: item.customerItems?.find((r: any) => r.customerId === order.customerId)?.code ?? null, trace: structuredClone(line.trace ?? line.traces ?? null) };
  }).filter(Boolean);
  if (!lines.length) fail('INVOICE_SOURCE', 'There are no accepted or shipped quantities to invoice.');
  return lines;
}
export function chargeLines(value: any) {
  if (!Array.isArray(value ?? []) || (value?.length ?? 0) > 100) fail('INVOICE_CHARGES', 'Supply at most 100 charge lines.');
  return (value ?? []).map((r: any) => {
    if (!['freight', 'handling', 'surcharge', 'discount'].includes(r.kind) || typeof r.taxable !== 'boolean') fail('INVOICE_CHARGES', 'Choose freight, handling, surcharge or discount and explicitly review its taxability.');
    const n = decimal(typeof r.amount === 'string' ? r.amount.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '') : r.amount) * SCALE;
    if (n % CENT) fail('INVOICE_CHARGES', 'Charge lines must be whole cents.');
    return { id: id(), kind: r.kind, description: text(r.description ?? r.kind), amount: money(r.kind === 'discount' ? -n : n), taxable: r.taxable };
  });
}
export function draftInvoice(c: Context, p: any) {
  const order = get(c.s, 'orders', p.orderId), policy = invoicePolicy(c, order), mode = policy?.mode ?? 'shipment';
  const shipment = p.shipmentId ? get(c.s, 'shipments', p.shipmentId) : undefined;
  if (shipment && shipment.orderId !== order.id) fail('INVOICE_SOURCE', 'Choose a shipment of this order.');
  if (mode === 'shipment' && !shipment) fail('INVOICE_SOURCE', 'Shipment invoicing requires an actual shipment.');
  if (mode === 'prepay' && shipment) fail('INVOICE_PREPAY', 'This prepay order is invoiced on acceptance; its later shipments never create another invoice.');
  if (mode === 'prepay' && order.lines.some((l: any) => decimal(l.dispatched) > 0n)) fail('INVOICE_PREPAY', 'A prepay invoice must be prepared before shipment.');
  const active = records(c.s, 'invoices').filter(r => r.orderId === order.id && !['voided', 'cancelled'].includes(r.status));
  if (active.some(r => r.policy === 'prepay' || mode === 'prepay' || r.shipmentId === shipment?.id)) fail('INVOICE_EXISTS', 'This source already has a native invoice. Open its retained record.');
  noLegacyInvoice(c, order, mode === 'shipment' ? shipment!.id : undefined);
  const currency = p.currency ?? order.currency ?? 'USD';
  if (!['USD', 'CAD'].includes(currency)) fail('INVOICE_CURRENCY', 'Native invoices currently support USD and reviewed CAD.');
  if (currency !== (order.currency ?? 'USD') && (!p.usdRate || !Array.isArray(p.unitPrices) || order.lines.some((l: any) => !p.unitPrices.some((r: any) => r.orderLineId === l.id)))) fail('INVOICE_CURRENCY', 'A currency conversion requires a reviewed USD rate and an explicitly reviewed price for each order line.');
  const rate = currency === 'USD' ? SCALE : decimal(p.usdRate, true), lines = sourceLines(c, order, shipment, p), charges = chargeLines(p.charges ?? (mode === 'prepay' ? order.charges : []));
  const itemNet = lines.reduce((n: bigint, l: any) => n + amount(l.amount), 0n), net = itemNet + charges.reduce((n: bigint, r: any) => n + amount(r.amount), 0n);
  if (net < 0n) fail('INVOICE_CHARGES', 'Discounts cannot exceed the invoice items and charges.');
  const tax = estimateTax(c, order.customerId, order.shipTo, order.routing?.reserveWarehouses?.length>1?null:order.warehouse, lines, charges);
  if (tax.status !== 'estimate' || tax.amount === null) return fail('INVOICE_TAX', tax.source + '. Review the source and prepare the draft again; no tax rate is assumed.');
  if (tax.lines.reduce((n: bigint, line: any) => n + amount(line.taxableAmount), 0n) < 0n) fail('INVOICE_CHARGES', 'Taxable discounts exceed taxable items and charges.');
  tax.status = 'retained-owner-estimate';
  const total = net + amount(tax.amount), date = isoDay(p.invoiceDate ?? c.now.slice(0, 10), 'Invoice date');
  return append(c, 'invoices', { reference: nextReference(records(c.s, 'invoices'), 'INV'), orderId: order.id, customerId: order.customerId, salesRepId: order.salesRepId ?? null, salesRep: structuredClone(order.salesRep ?? null), customer: structuredClone(get(c.s, 'parties', order.customerId)), shipmentId: shipment?.id ?? null, sourceVersion: shipment?.version ?? order.version, sourceOrderVersion: order.version, sourceSnapshot: structuredClone(shipment ?? order), policy: mode, policySnapshot: structuredClone(policy ?? { mode: 'shipment' }), date, invoiceDate: date, ...invoiceTerms(p.terms ?? policy?.terms ?? get(c.s, 'parties', order.customerId).paymentTerms, date, net), currency, usdRate: format(rate), usdTotal: money(toCents(total * rate / SCALE)), lines, charges, subtotal: money(net), tax, total: money(total), status: 'draft', priceReason: p.priceReason ? text(p.priceReason) : null, ledger: { status: 'pending-external-posting', reason: 'No verified native invoice ledger adapter is connected.' }, review: null });
}
