import { decimal, format, SCALE, type Context } from './model';
import { allocate, amount, money } from './money';
import { valuationLedger } from './valuation-ledger';
import { returnCost } from './returns-cost';

/** Actual item contribution, with conservative reserves for physical returns. */
export function realizedMargin(c: Context, itemId: string) {
  if (c.actor.role !== 'owner') return { quantity: '0', revenue: null, cost: null, margin: null, shipmentIds: [], returnIds: [], invoiceIds: [], creditIds: [], unitRevenue: null,
    basis: 'Current owner authority is required for sales revenue and realized margin. No wider commercial read grant is introduced by a forecast.' };
  const ledger = valuationLedger(c.s, c.now);
  let quantity = 0n, revenue = 0n, cost = 0n, returnedQuantity = 0n, returnValue = 0n, recoveredCost = 0n, creditAdjustments = 0n;
  const shipmentIds: string[] = [], returnIds: string[] = [], invoiceIds = new Set<string>(), creditIds = new Set<string>();
  for (const shipment of c.s.shipments.filter(sh => sh.createdAt <= c.now)) {
    const lines = shipment.lines.filter((l: any) => l.itemId === itemId && !l.components);
    if (!lines.length) continue;
    const order = c.s.orders.find(o => o.id === shipment.orderId);
    const layers = ledger.consumed.get(`${shipment.id}:${itemId}`);
    if (!layers?.length || layers.some(l => l.value === null)) continue;
    const invoice = c.s.invoices.find(i => i.orderId === shipment.orderId && (i.shipmentId === shipment.id || i.policy === 'prepay')
      && i.status === 'authorized' && i.authorizedAt <= c.now);
    const economics: ({ line: any; quantity: bigint; revenue: bigint; credits: bigint; returnCredits: Map<string, bigint> } | null)[] = lines.map((line: any) => {
      const original = order?.lines.find((l: any) => l.id === line.orderLineId), q = decimal(line.quantity);
      if (!invoice) return typeof original?.price !== 'string' || order?.currency && order.currency !== 'USD' ? null
        : { line, quantity: q, revenue: q * decimal(original.price), credits: 0n, returnCredits: new Map<string, bigint>() };
      const priced = invoice.lines.find((l: any) => l.orderLineId === line.orderLineId && (!l.shipmentLineId || l.shipmentLineId === line.id));
      if (!priced) return null;
      const index = invoice.lines.indexOf(priced), weights = invoice.lines.map((l: any) => amount(l.amount));
      const discounts = invoice.charges.filter((l: any) => l.kind === 'discount').reduce((n: bigint, l: any) => n + amount(l.amount), 0n);
      const allocatedDiscount = allocate(discounts, weights)[index];
      // Discounts exceeding all item revenue cannot establish a positive item margin.
      const net = amount(priced.amount) + allocatedDiscount;
      const convert = (value: bigint) => value * decimal(invoice.usdRate) / SCALE;
      let credits = 0n;
      const returnCredits = new Map<string, bigint>();
      for (const credit of c.s.invoiceCredits.filter(cr => cr.invoiceId === invoice.id && cr.status === 'authorized' && cr.authorizedAt <= c.now)) {
        const value = credit.lines.filter((l: any) => l.invoiceLineId === priced.id).reduce((n: bigint, l: any) => n + amount(l.amount), 0n);
        if (!value) continue;
        const share = convert(value * q / decimal(priced.quantity));
        credits += share; creditIds.add(credit.id);
        if (credit.kind === 'return') returnCredits.set(credit.returnId, (returnCredits.get(credit.returnId) ?? 0n) + share);
      }
      invoiceIds.add(invoice.id);
      return { line, quantity: q, revenue: convert((net > 0n ? net : 0n) * q / decimal(priced.quantity)), credits, returnCredits };
    });
    if (economics.some(e => e === null)) continue;
    quantity += economics.reduce((n: bigint, e: any) => n + e.quantity, 0n);
    cost += layers.reduce((n, l) => n + l.value!, 0n); shipmentIds.push(shipment.id);
    for (const e of economics) {
      revenue += e!.revenue - e!.credits; creditAdjustments += e!.credits;
      for (const returned of c.s.returns.filter(r => r.shipmentId === shipment.id && r.shipmentLineId === e!.line.id && r.createdAt <= c.now)) {
        const restored = returnCost(c.s, returned, c.now);
        const q = decimal(returned.quantity), alreadyCredited = e!.returnCredits.get(returned.id) ?? 0n;
        const reserved = e!.revenue * q / e!.quantity;
        const pending = reserved > alreadyCredited ? reserved - alreadyCredited : 0n;
        revenue -= pending; returnedQuantity += q; returnValue += pending + alreadyCredited;
        // Quarantined or damaged units do not recover sellable cost for a new plan.
        if (restored !== null) recoveredCost += amount(restored) * decimal(returned.restocked ?? '0') / q;
        returnIds.push(returned.id);
      }
    }
  }
  const netCost = cost - recoveredCost;
  return { quantity: format(quantity), revenue: money(revenue), cost: money(netCost), margin: money(revenue - netCost), shipmentIds,
    returnedQuantity: format(returnedQuantity), returnValue: money(returnValue), recoveredCost: money(recoveredCost), returnIds,
    creditAdjustments: money(creditAdjustments), invoiceIds: [...invoiceIds], creditIds: [...creditIds],
    unitRevenue: quantity ? format(revenue > 0n ? revenue / quantity : 0n) : null,
    basis: 'Priced native shipments with known consumed USD cost. Authorized invoice item prices, allocated discounts and item credits supersede order prices. Physical returns reserve their net item value until credited, without counting the credit twice; only sellable restocked cost is recovered. Tax, freight income and financing are outside item contribution. Unpriced, unvalued, kit and unconverted non-USD lines are excluded.' };
}
