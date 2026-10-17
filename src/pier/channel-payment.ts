import { amount } from './money';
import { fail, text, type Context, type Row } from './model';

/** Only a connected Stall can attest to its Stripe-confirmed checkout payment. */
export function recordChannelPayment(c: Context, order: Row, evidence: any) {
  if (evidence === undefined) return;
  const channel = c.backgroundPolicy?.collection === 'channels'
    ? c.s.channels.find(ch => ch.id === c.backgroundPolicy!.id && ch.provider === 'stall') : undefined;
  if (!channel || order.channel !== 'stall') fail('CHANNEL_PAYMENT', 'Only the connected shop can record its confirmed Stripe payment.');
  if (evidence.provider !== 'stripe' || typeof evidence.reference !== 'string' || !/^pi_[A-Za-z0-9_]+$/.test(evidence.reference)
    || evidence.currency !== 'USD' || typeof evidence.amount !== 'string' || !/^\d+\.\d{2}$/.test(evidence.amount)
    || order.total === null || amount(evidence.amount) !== amount(order.total) || amount(evidence.amount) <= 0n
    || typeof evidence.paidAt !== 'string' || !Number.isFinite(Date.parse(evidence.paidAt)))
    fail('CHANNEL_PAYMENT', 'The shop payment must match this USD order and include its Stripe payment reference and confirmation date.');
  const payment = { provider: 'stripe', reference: evidence.reference, amount: evidence.amount, currency: 'USD', paidAt: evidence.paidAt, orderReference: text(evidence.orderReference, 'Shop order reference') };
  if (order.channelPayment && JSON.stringify(order.channelPayment) !== JSON.stringify(payment)) fail('CHANNEL_PAYMENT', 'This order already has different shop payment evidence. Review the shop payment before continuing.');
  order.channelPayment = payment;
}
