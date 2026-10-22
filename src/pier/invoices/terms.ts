import { decimal, fail, format, SCALE } from '../model';
import { isoDay } from '../sales-quotes';
import { money, toCents } from '../money';

export function invoiceTerms(value: any, date: string, subtotal: bigint) {
  const terms = typeof value === 'string' ? { kind: value } : value ?? { kind: 'dueReceipt' };
  if (!['dueReceipt', 'net15', 'net30', 'net60', 'eom', 'earlyDiscount'].includes(terms.kind)) fail('INVOICE_TERMS', 'Choose due on receipt, Net 15/30/60, end of month or early discount.');
  const due = new Date(`${isoDay(date, 'Invoice date')}T00:00:00Z`);
  let discount: any = null;
  if (terms.kind === 'eom') due.setUTCMonth(due.getUTCMonth() + 1, 0);
  else {
    const days = terms.kind === 'earlyDiscount' ? Number(terms.netDays) : Number(terms.kind.replace('net', '')) || 0;
    if (terms.kind === 'earlyDiscount') {
      const rate = decimal(terms.discountPercent, true), withinDays = Number(terms.withinDays);
      if (rate > 100n * SCALE || !Number.isInteger(days) || days < 1 || days > 365 || !Number.isInteger(withinDays) || withinDays < 1 || withinDays >= days) fail('INVOICE_TERMS', 'Early discount needs a percentage, discount days and a later net due day.');
      discount = { percent: format(rate), through: new Date(due.valueOf() + withinDays * 86400000).toISOString().slice(0, 10), amount: money(toCents(subtotal * rate / (100n * SCALE))), application: 'Linked credit requires approval; full balance remains payable until then.' };
    }
    due.setUTCDate(due.getUTCDate() + days);
  }
  return { terms: { ...terms, earlyDiscount: discount }, dueDate: due.toISOString().slice(0, 10) };
}
