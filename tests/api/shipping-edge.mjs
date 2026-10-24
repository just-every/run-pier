import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
export const fixture = async name => JSON.parse(await readFile(`tests/fixtures/shipping/${name}.json`, 'utf8'));
/** Documented API recordings with synthetic identities; only the provider network is replaced. */
export function shippingEdge({ mailFetch } = {}) {
  const calls = [], emails = [], unapproved = [];
  let purchased = false, delivered = false, undeliverable = false, loseBuy = false, redirectNext = false, shipmentMode = 'test';
  return { calls, emails, unapproved, setShipmentMode: value => { shipmentMode = value; }, redirectNext: () => { redirectNext = true; }, delivered: () => { delivered = true; }, undeliverable: value => { undeliverable = value; }, loseBuy: () => { loseBuy = true; },
    async outbound(request) {
      const url = new URL(request.url);
      if (url.hostname === 'synthetic-pier-unapproved.example') { unapproved.push(await request.text()); throw new Error('Unapproved egress'); }
      if (url.hostname === 'api.sendgrid.com') {
        const body = await request.clone().json(); emails.push(body);
        return mailFetch ? mailFetch(request) : new Response(null, { status: 202, headers: { 'x-message-id': 'synthetic-mail' } });
      }
      if (url.hostname === 'easypost-files.s3.us-west-2.amazonaws.com') return new Response(await readFile(`tests/fixtures/shipping/label.${url.pathname.endsWith('.pdf') ? 'pdf' : 'zpl'}`));
      assert.equal(url.origin, 'https://api.easypost.com');
      assert.match(request.headers.get('authorization'), /^Basic /);
      const body = request.method === 'POST' ? await request.json() : null;
      calls.push({ method: request.method, path: url.pathname, body });
      if (redirectNext) { redirectNext = false; return new Response(null, { status: 307, headers: { location: "https://synthetic-pier-unapproved.example/collect" } }); }
      if (url.pathname === '/v2/addresses') {
        assert.equal(body.verify, true);
        const value = await fixture('address');
        if (undeliverable) value.verifications.delivery = { success: false, errors: [{ code: 'E.ADDRESS.NOT_FOUND', message: 'Address not found' }] };
        return Response.json(value);
      }
      if (url.pathname === '/v2/shipments') {
        assert.deepEqual(body.shipment.parcel, { weight: 40, length: 12, width: 8, height: 4 });
        assert.equal(body.shipment.to_address.zip, '94104-1210');
        return Response.json({ ...await fixture('shipment'), mode: shipmentMode });
      }
      if (url.pathname === '/v2/shipments/shp_synthetic/buy') {
        assert.equal(body.rate.id, 'rate_usps');
        assert.equal(purchased, false, 'no second label purchase'); purchased = true;
        if (loseBuy) return new Response('Lost provider confirmation', { status: 503 });
        return Response.json(await fixture('purchased'));
      }
      if (url.pathname === '/v2/shipments/shp_synthetic') return Response.json(await fixture(purchased ? 'purchased' : 'shipment'));
      if (url.pathname === '/v2/trackers/trk_synthetic') {
        const tracker = await fixture('tracker');
        if (!delivered) { tracker.status = 'pre_transit'; tracker.tracking_details = tracker.tracking_details.slice(0, 1); }
        return Response.json(tracker);
      }
      throw new Error(`Unexpected shipping fixture request ${request.method} ${url.pathname}`);
    },
  };
}
