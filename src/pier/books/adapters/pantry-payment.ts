import { pantryClient, PantryRefusal } from './pantry-client';
import type { BookDocument } from './types';

type Client = ReturnType<typeof pantryClient>;
const cents = (value: string) => BigInt(value.replace('.', ''));

async function paymentRecord(client: Client, doc: BookDocument, invoice: any) {
  const expected = doc.payment!;
  const rows = (await client.request('payments?reference=' + encodeURIComponent(expected.reference))).payments;
  if (!Array.isArray(rows)) throw new PantryRefusal('Pantry did not return payment records. Check the Pantry connection.', 502);
  const payment = client.matching(rows, row => row.reference === expected.reference);
  if (!payment) return null;
  if (payment.reversal_id) throw new PantryRefusal('This shop payment was reversed in Pantry. Review the reversal with your accountant; Pier will not recreate it.', 409);
  if (payment.direction !== 'received' || payment.contact_id !== invoice.customer_id || payment.bank_account_id !== expected.bankAccountId
    || payment.payment_date !== expected.date || BigInt(payment.amount_cents) !== cents(expected.amount)
    || !Array.isArray(payment.allocations) || payment.allocations.length !== 1
    || payment.allocations[0].target_kind !== 'invoice' || payment.allocations[0].target_id !== invoice.id
    || BigInt(payment.allocations[0].amount_cents) !== cents(expected.amount))
    throw new PantryRefusal('The payment with this shop reference differs in Pantry. Review its amount, account and invoice allocation.', 409);
  return payment;
}

export async function shopPaymentCurrent(client: Client, doc: BookDocument, invoice: any) {
  if (!doc.payment) return true;
  if (!doc.payment.bankAccountId) return false;
  return !!await paymentRecord(client, doc, invoice);
}

export async function postShopPayment(client: Client, doc: BookDocument, invoice: any) {
  const payment = doc.payment;
  if (!payment) return;
  if (!payment.bankAccountId) throw new PantryRefusal('This shop order is already paid through Stripe. In Books settings, choose the Pantry bank or Stripe clearing account for shop payments, then sync again.', 409);
  if (await paymentRecord(client, doc, invoice)) return;
  if (BigInt(invoice.open_cents) !== cents(payment.amount)) throw new PantryRefusal('The shop invoice already has a payment or credit in Pantry. Review it before recording the Stripe payment; Pier will not apply it twice.', 409);
  await client.post('payments', { direction: 'received', contactId: invoice.customer_id, date: payment.date, amount: payment.amount,
    bankAccountId: payment.bankAccountId, reference: payment.reference, method: 'card', memo: `Stripe payment ${payment.sourceReference}; shipped share ${doc.reference}`,
    allocations: [{ targetId: invoice.id, amount: payment.amount }], post: true }, doc, 'stripe-payment');
  if (!await paymentRecord(client, doc, invoice)) throw new PantryRefusal('Pantry did not confirm the shop payment. Check Pantry before continuing.', 502);
}
