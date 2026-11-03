import { fresh, get, requireRole, row, text, fail, type Context, type Row, type State } from '../model';
import { amount, money } from '../money';
import { nativeBalance, customerBalance } from '../invoices/state';
import { invoiceTerms } from '../invoices/terms';

export function repDefaults(s: State, customerId: string) {
  const rep = s.salesReps.find(r => r.id === s.parties.find(p => p.id === customerId)?.salesRepId);
  return { salesRepId: rep?.id ?? null, salesRep: rep ? structuredClone(rep) : null };
}
export function customerViews(s: State, now: string) {
  const today = now.slice(0, 10);
  return s.parties.filter(p => p.kind === 'customer').map(customer => {
    const aging: Record<string, Record<string, bigint>> = {};
    const invoices = s.invoices.filter(i => i.customerId === customer.id && i.status === 'authorized').map(invoice => {
      const balance = nativeBalance(s, invoice.id), n = amount(balance);
      const overdueDays = Math.max(0, Math.floor((Date.parse(today) - Date.parse(invoice.dueDate)) / 86400000));
      const bucket = n < 0n || overdueDays === 0 ? 'current' : overdueDays <= 30 ? '1-30' : overdueDays <= 60 ? '31-60' : overdueDays <= 90 ? '61-90' : 'over90';
      aging[invoice.currency] ??= { current: 0n, '1-30': 0n, '31-60': 0n, '61-90': 0n, over90: 0n };
      aging[invoice.currency][bucket] += n;
      return { invoiceId: invoice.id, reference: invoice.reference, currency: invoice.currency, dueDate: invoice.dueDate, balance, overdueDays, bucket, salesRep: invoice.salesRep };
    });
    return { customerId: customer.id, asOf: today, balance: customerBalance(s, customer.id), aging: Object.fromEntries(Object.entries(aging).map(([currency, buckets]) => [currency, Object.fromEntries(Object.entries(buckets).map(([bucket, value]) => [bucket, money(value)]))])), invoices,
      orderIds: s.orders.filter(o => o.customerId === customer.id).map(o => o.id), shipmentIds: s.shipments.filter(sh => s.orders.some(o => o.id === sh.orderId && o.customerId === customer.id)).map(sh => sh.id) };
  });
}
export function customers(c: Context, type: string, p: any): Row | undefined {
  if (!['customer.profile', 'customer.rep', 'salesRep.save', 'order.salesRep'].includes(type)) return;
  requireRole(c, ['owner']);
  if (type === 'salesRep.save') {
    if (!['outside', 'operator'].includes(p.kind)) fail('REP', 'Choose an outside rep or an active Pier operator.');
    if (p.kind === 'operator' && !c.automationActors?.[p.operatorId]) fail('REP', 'Choose an active Pier operator.');
    return row(c, 'salesReps', { name: text(p.name), kind: p.kind, operatorId: p.kind === 'operator' ? p.operatorId : null });
  }
  if (type === 'order.salesRep') {
    const order = get(c.s, 'orders', p.orderId); fresh(order, p.version); const rep = get(c.s, 'salesReps', p.salesRepId);
    order.repHistory = [...(order.repHistory ?? []), { before: order.salesRepId ?? null, after: rep.id, actorId: c.actor.id, at: c.now, reason: text(p.reason) }];
    order.salesRepId = rep.id; order.salesRep = structuredClone(rep); order.version++; return order;
  }
  const customer = get(c.s, 'parties', p.customerId); fresh(customer, p.version);
  if (customer.kind !== 'customer') fail('CUSTOMER', 'Choose a customer.');
  if (type === 'customer.rep') { const rep = get(c.s, 'salesReps', p.salesRepId); customer.salesRepId = rep.id; }
  else {
    const list = (value: any, name: string) => {
      if (!Array.isArray(value) || value.length > 20) return fail('CUSTOMER_PROFILE', `Supply at most 20 ${name}.`);
      return value.map((v: any) => text(v, name));
    };
    const terms = invoiceTerms(p.paymentTerms, c.now.slice(0, 10), 0n).terms;
    Object.assign(customer, { contacts: list(p.contacts, 'contacts'), addresses: list(p.addresses, 'addresses'), paymentTerms: terms });
  }
  customer.profileReason = text(p.reason); customer.version++; return customer;
}
