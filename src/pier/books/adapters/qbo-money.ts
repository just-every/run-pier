import { cents, numeric, required, usd } from './types';
import type { BookDocument, BookResult } from './types';

const mismatch = (): never => { throw new Error('QBO money record differs from its Pier document; reconcile before continuing'); };
const sameQuantity = (actual: unknown, expected: string) => {
  const left = String(actual), right = expected;
  if (!/^-?(0|[1-9]\d*)(?:\.\d{1,6})?$/.test(left) || !/^-?(0|[1-9]\d*)(?:\.\d{1,6})?$/.test(right)) return false;
  const [lw, lf = ''] = left.split('.'), [rw, rf = ''] = right.split('.');
  return lw === rw && lf.padEnd(6, '0') === rf.padEnd(6, '0');
};
export async function paymentReference(payment: NonNullable<BookDocument['payment']>): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(payment.reference));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('').slice(0, 21);
}

export function creditMemoPayload(document: BookDocument, invoice: any): object {
  if (document.kind !== 'credit' || document.party?.kind !== 'customer') throw new Error('QBO credit memo requires a customer');
  if (!document.creditForReference) throw new Error('QBO credit memo requires its original invoice reference');
  if (invoice?.CustomerRef?.value !== document.party.id) mismatch();
  return {
    TxnDate: document.date,
    DocNumber: document.reference,
    CurrencyRef: { value: 'USD' },
    CustomerRef: { value: document.party.id },
    PrivateNote: `Pier credit for invoice ${document.creditForReference} (${required(invoice.Id, 'QBO invoice ID')})`,
    Line: document.lines.map(line => ({
      Description: line.description,
      Amount: numeric(line.amount),
      DetailType: 'SalesItemLineDetail',
      SalesItemLineDetail: {
        ItemRef: { value: required(line.itemId, 'mapped QBO credit item ID') },
        Qty: numeric(line.quantity, false),
        UnitPrice: numeric(required(line.unitPrice, 'credit unit price')),
        TaxCodeRef: { value: 'NON' },
      },
    })),
  };
}

export function creditMemoResult(entity: any, document: BookDocument, invoice: any): BookResult {
  if (document.kind !== 'credit' || document.party?.kind !== 'customer') mismatch();
  const id = required(entity?.Id, 'QBO response ID');
  if (invoice.DocNumber !== document.creditForReference || invoice.CustomerRef?.value !== document.party!.id
    || (document.remoteId && id !== document.remoteId) || entity.DocNumber !== document.reference || entity.TxnDate !== document.date
    || entity.CurrencyRef?.value !== 'USD' || entity.CustomerRef?.value !== document.party!.id
    || entity.PrivateNote !== `Pier credit for invoice ${document.creditForReference} (${invoice.Id})`
    || cents(entity.TotalAmt) !== cents(document.total)) mismatch();
  const lines = entity.Line?.filter((line: any) => line.DetailType === 'SalesItemLineDetail');
  if (!Array.isArray(lines) || lines.length !== document.lines.length) mismatch();
  for (const [index, expected] of document.lines.entries()) {
    const actual = lines[index];
    if (actual.Description !== expected.description || cents(actual.Amount) !== cents(expected.amount)
      || actual.SalesItemLineDetail?.ItemRef?.value !== expected.itemId
      || !sameQuantity(actual.SalesItemLineDetail?.Qty, expected.quantity)
      || cents(actual.SalesItemLineDetail?.UnitPrice) !== cents(expected.unitPrice)) mismatch();
  }
  return { id, status: 'posted' };
}

export async function paymentPayload(document: BookDocument, invoiceId: string): Promise<object> {
  const payment = document.payment;
  if (document.kind !== 'invoice' || !payment || document.party?.kind !== 'customer') throw new Error('QBO payment requires its customer invoice');
  if (!payment.bankAccountId) throw new Error('QBO payment requires a mapped bank account');
  const amount = cents(payment.amount);
  if (amount <= 0n || amount > cents(document.total)) throw new Error('QBO payment amount must be positive and within its invoice total');
  return {
    TxnDate: payment.date,
    TotalAmt: numeric(payment.amount),
    PaymentRefNum: await paymentReference(payment),
    PrivateNote: `Pier source ${required(payment.sourceReference, 'source payment identity')}; allocation ${required(payment.reference, 'payment allocation identity')}`,
    CustomerRef: { value: document.party.id },
    DepositToAccountRef: { value: payment.bankAccountId },
    Line: [{ Amount: numeric(payment.amount), LinkedTxn: [{ TxnId: invoiceId, TxnType: 'Invoice' }] }],
  };
}

export async function paymentResult(entity: any, document: BookDocument, invoice: any): Promise<BookResult> {
  const payment = document.payment;
  if (document.kind !== 'invoice' || !payment || document.party?.kind !== 'customer') mismatch();
  const id = required(entity?.Id, 'QBO response ID');
  const allocations = entity.Line?.flatMap((line: any) => (line.LinkedTxn ?? []).map((linked: any) => ({ line, linked })));
  if (entity.PaymentRefNum !== await paymentReference(payment!)
    || entity.PrivateNote !== `Pier source ${payment!.sourceReference}; allocation ${payment!.reference}` || entity.TxnDate !== payment!.date
    || entity.CustomerRef?.value !== document.party!.id || entity.DepositToAccountRef?.value !== payment!.bankAccountId
    || cents(entity.TotalAmt) !== cents(payment!.amount) || !Array.isArray(entity.Line) || entity.Line.length !== 1
    || !Array.isArray(allocations) || allocations.length !== 1
    || allocations[0].linked.TxnType !== 'Invoice' || allocations[0].linked.TxnId !== invoice.Id
    || cents(allocations[0].line.Amount) !== cents(payment!.amount)) mismatch();
  const invoiceTotal = cents(invoice.TotalAmt), open = cents(invoice.Balance);
  if (invoice.Id !== (document.remoteId ?? invoice.Id) || invoice.DocNumber !== document.reference
    || invoice.CustomerRef?.value !== document.party!.id || invoiceTotal !== cents(document.total)
    || invoiceTotal < 0n || open < 0n || open > invoiceTotal) mismatch();
  return { id: invoice.Id, status: 'posted', paid: usd(invoiceTotal - open), open: usd(open), paymentCurrent: true };
}
