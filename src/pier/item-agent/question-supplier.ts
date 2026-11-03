import { backorderDates } from '../backorders';
import { amount, money } from '../money';
import { fail, get, type Context, type Row } from '../model';
import { purchasing } from '../purchasing';
import { expectedLandedCost } from '../purchasing-workflow';

const purchase = (po: Row) => ({ poId: po.id, version: po.version, supplierId: po.supplierId,
  promiseDate: po.promiseDate, destinationWarehouse: po.destinationWarehouse, status: po.status,
  lines: po.lines.map((line: any) => ({ itemId: line.itemId, quantity: line.quantity, price: line.price,
    termsId: line.terms?.id ?? null, termsVersion: line.terms?.version ?? null, leadDays: line.terms?.leadDays ?? null,
    minimum: line.terms?.minimum ?? null, packSize: line.terms?.packSize ?? null })),
  cash: expectedLandedCost(po), minimumOrderValueUnmet: po.minimumOrderValueUnmet });

/** A draft what-if uses the ordinary purchase revision, without a real write. */
export function supplierQuestion(c: Context, params: URLSearchParams) {
  const po = get(c.s, 'purchaseOrders', params.get('poId') ?? '');
  if (po.status !== 'draft') fail('PO_STATE', 'Choose an uncommitted draft purchase order for this comparison.');
  const supplierId = params.get('supplierId') || po.supplierId;
  const supplier = get(c.s, 'parties', supplierId);
  const promiseDate = params.get('promiseDate') || po.promiseDate;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(promiseDate) || !Number.isFinite(Date.parse(promiseDate)) || new Date(promiseDate).toISOString().slice(0, 10) !== promiseDate) fail('DATE', 'Choose a valid proposed purchase date.');
  const trial: Context = { ...c, s: structuredClone(c.s) };
  const lines = po.lines.map((line: any) => {
    if (supplierId === po.supplierId) return { itemId: line.itemId, quantity: line.quantity, price: line.price };
    const terms = c.s.supplierItems.find(term => term.supplierId === supplierId && term.itemId === line.itemId);
    if (!terms) fail('SUPPLIER_TERMS', 'The proposed supplier needs current terms for every purchase item.');
    return { itemId: line.itemId, quantity: line.quantity, price: terms!.price };
  });
  const after = purchasing(trial, 'po.revise', { ...po, poId: po.id, version: po.version, supplierId, promiseDate, lines, reason: 'Compare supplier and requested date against current live evidence.' })!;
  const beforeImage = purchase(po), afterImage = purchase(after);
  const itemIds = new Set<string>(po.lines.map((line: any) => line.itemId));
  const promises = backorderDates(c).filter(plan => c.s.orders.some(order => order.id === plan.orderId && (!po.destinationWarehouse || !order.warehouse || order.warehouse === po.destinationWarehouse)) && plan.lines.some((line: any) => itemIds.has(line.itemId)));
  return { before: beforeImage, after: afterImage,
    supplier: { id: supplier.id, version: supplier.version, name: supplier.name },
    cashDelta: money(amount(afterImage.cash.total) - amount(beforeImage.cash.total)), currency: 'USD',
    affectedPromises: promises.map(plan => ({ orderId: plan.orderId, orderVersion: c.s.orders.find(order => order.id === plan.orderId)!.version,
      lines: plan.lines.filter((line: any) => itemIds.has(line.itemId)).map((line: any) => ({ orderLineId: line.orderLineId, itemId: line.itemId, backorder: line.backorder,
        currentPromise: line.promiseDate, expectedDate: line.expectedDate, estimated: line.estimated, uncovered: line.uncovered, sources: line.sources })),
      effect: 'No change to committed supply or customer promises from revising this draft.' })),
    ordinaryCommand: { type: 'po.revise', payload: { poId: po.id, version: po.version, supplierId, promiseDate, destinationWarehouse: po.destinationWarehouse, freight: po.freight, duty: po.duty, tax: po.tax, lines, reason: 'Review the exact supplier and requested date change.' } },
    uncertainty: 'Comparison only. Supplier changes use current recorded supplier-item prices; a missing price blocks the comparison. Cash is the proposed operational landed cost, not a payment or currency conversion. Requested dates and lead days do not confirm arrival. The draft adds no inbound supply until a human separately approves and commits it; customer messages and reservations are unchanged.' };
}
