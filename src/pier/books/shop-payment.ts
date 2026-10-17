import { amount } from '../money';
import type { State, Row } from '../model';
import type { BookDocument } from './adapters/types';

/** A partial dispatch records only its share of the shop's confirmed payment. */
export function withShopPayment(state: State, orderId: string, connection: Row, doc: BookDocument): BookDocument {
  if (doc.kind !== 'invoice') return doc;
  const order = state.orders.find(o => o.id === orderId), payment = order?.channelPayment;
  if (!payment) return doc;
  const invoiced = state.bookJobs.filter(j => j.kind === 'invoice' && j.sourceId === orderId && j.document)
    .reduce((n, j) => n + amount(j.document.total), 0n);
  if (invoiced > amount(payment.amount)) throw new Error('Shipment invoices exceed the shop payment. Review the order and payment before continuing.');
  return { ...doc, payment: { reference: `stripe:${payment.reference}:${doc.reference}`, sourceReference: payment.reference,
    amount: doc.total, date: payment.paidAt.slice(0, 10), bankAccountId: connection.stripeBankAccountId ?? '' } };
}

/** Current stock includes every posted source, even when its local bill date is ahead of UTC. */
export function reconciliationDate(state: State, today: string) {
  return state.bookJobs.reduce((latest, job) => job.document?.date > latest ? job.document.date : latest, today);
}
