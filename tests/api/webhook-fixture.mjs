import assert from 'node:assert/strict';
export const signingSecret = 'synthetic-pier-1-private-signing-material';
export const rotatedSecret = 'synthetic-pier-2-private-signing-material';
export function receiver() {
  const requests = [];
  let outcome = 'accepted';
  return { requests, set outcome(value) { outcome = value; },
    async outboundService(request) {
      assert.equal(request.url, 'https://receiver.example.com/orders');
      const body = await request.text();
      requests.push({ body, headers: Object.fromEntries(request.headers) });
      if (outcome === 'lost') return Response.error();
      return new Response(null, { status: outcome === 'failed' ? 422 : outcome === 'redirect' ? 307 : 204,
        ...(outcome === 'redirect' ? { headers: { location: 'https://other.example.com/capture' } } : {}) });
    } };
}
export async function orderSubscription(h, order, extra = {}) {
  let subscription = await h.command('webhook.save', { name: 'Order receiver', destination: 'https://receiver.example.com/orders', fields: ['status','lines'], secret: signingSecret, ...extra });
  subscription = await h.command('webhook.preview', { subscriptionId: subscription.id, version: subscription.version, orderId: order.id });
  return h.command('webhook.approve', { subscriptionId: subscription.id, version: subscription.version, destination: subscription.destination, fields: subscription.fields, previewDigest: subscription.preview.digest, confirm: true });
}
export const orderPayload = b => ({ customerId: b.customer.id, warehouse: 'North', lines: [{ itemId: b.item.id, quantity: '2', price: '3' }] });
