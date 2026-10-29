import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const fixture = async name => JSON.parse(await readFile(`tests/fixtures/channels/${name}.json`, 'utf8'));

/** Only the network edge is synthetic. Business state is always read over HTTP. */
export function channelEdge() {
  const publications = [], extraOrders = [];
  let readState, stallReservation;
  return { publications, extraOrders, setState: fn => { readState = fn; }, setStallOrder: order => { stallReservation = order; },
    async outbound(request) {
      const url = new URL(request.url), page = url.searchParams.get('page') ?? '1';
      const reply = (body, headers = {}) => Response.json(body, { headers });
      if (url.hostname === 'woo.example.test') {
        assert.match(request.headers.get('authorization'), /^Basic /);
        if (request.method === 'PUT') {
          const body = await request.json(), id = Number(url.pathname.split('/').at(-1));
          publications.push({ provider: 'woocommerce', quantity: String(body.stock_quantity), at: Date.now() });
          return reply({ id, ...body });
        }
        if (url.pathname.endsWith('/products')) return reply(await fixture(`woocommerce-products-page-${page}`), { 'X-WP-TotalPages': '2' });
        if (url.pathname.endsWith('/variations')) return reply(await fixture(`woocommerce-variations-page-${page}`), { 'X-WP-TotalPages': '2' });
        if (url.pathname.endsWith('/orders')) return reply([...(await fixture(`woocommerce-orders-page-${page}`)), ...(page === '1' ? extraOrders : [])], { 'X-WP-TotalPages': '2' });
      }
      if (url.hostname === 'shop.example.test') {
        assert.equal(request.headers.get('x-shopify-access-token'), 'synthetic-shop-token');
        const body = await request.json(), query = body.query;
        if (query.includes('query PierListings')) return reply(await fixture(`shopify-listings-page-${body.variables.after ? '2' : '1'}`));
        if (query.includes('query PierOrderLines')) return reply(await fixture('shopify-order-lines-page-2'));
        if (query.includes('query PierOrders')) return reply(await fixture(`shopify-orders-page-${body.variables.after ? '2' : '1'}`));
        if (query.includes('query PierInventory')) return reply(await fixture('shopify-stock-current'));
        if (query.includes('mutation PierStock')) {
          const quantity = body.variables.input.quantities[0].quantity;
          publications.push({ provider: 'shopify', quantity: String(quantity), at: Date.now() });
          return reply({ data: { inventorySetQuantities: { inventoryAdjustmentGroup: { changes: [{ name: 'available', quantityAfterChange: quantity }] }, userErrors: [] } } });
        }
      }
      if (url.hostname === 'amazon.example.test') {
        assert.equal(request.headers.get('x-amz-access-token'), 'synthetic-amazon-token');
        if (url.pathname.endsWith('/orders')) return reply(await fixture(`amazon-orders-page-${url.searchParams.has('paginationToken') ? '2' : '1'}`));
        if (url.pathname.endsWith('/items/SELLER')) return reply(await fixture(`amazon-listings-page-${url.searchParams.has('pageToken') ? '2' : '1'}`));
        if (request.method === 'PATCH') {
          const body = await request.json();
          publications.push({ provider: 'amazon', quantity: String(body.patches[0].value[0].quantity), at: Date.now() });
          return reply({ sku: decodeURIComponent(url.pathname.split('/').at(-1)), status: 'ACCEPTED', submissionId: crypto.randomUUID(), issues: [] });
        }
        if (request.method === 'GET') {
          const body = await fixture('amazon-stock-current'); body.sku = decodeURIComponent(url.pathname.split('/').at(-1)); return reply(body);
        }
      }
      if (url.hostname === 'stall.example.test') {
        if (url.pathname.endsWith('/state')) return reply({ products: [{ id: 'CASE-BLUE', value: { sku: 'CASE-BLUE', name: 'Blue case', active: true } }], orders: stallReservation ? [{ id: 'stall-paid-one', currency: 'usd', customerEmail: 'buyer@example.test', totalCents: 1250, payment: { sessionId: 'cs_paid_session', intentId: 'pi_channel_fixture', paidAt: stallReservation.createdAt }, reservation: { id: stallReservation.id }, lines: [{ sku: 'CASE-BLUE', quantity: 1, unitCents: 1250 }] }] : [] });
        if (url.pathname.endsWith('/catalogue')) {
          const state = await readState(), item = state.items.find(i => i.sku === 'CASE-BLUE');
          const available = state.positions.filter(p => p.itemId === item.id && p.status === 'sellable').reduce((n, p) => n + Number(p.available), 0);
          publications.push({ provider: 'stall', quantity: String(available), at: Date.now() });
          return reply({ items: [{ sku: item.sku, available: String(available) }] });
        }
      }
      throw new Error(`Unexpected channel fixture request ${request.method} ${url.origin}${url.pathname}`);
    },
  };
}

/** Shopify 2026-10 protocol fixture, solely at the outgoing network edge. */
export function locationEdge(sku = 'BOLT') {
  const page = nodes => ({ nodes, pageInfo: { hasNextPage: false, endCursor: null } });
  const inventory = new Map(), accepted = new Map(), writes = [], mutations = [], orders = [];
  const reject = new Set(), lose = new Set();
  const edge = { inventory, writes, mutations, orders, reject, lose, afterRead: null,
    async outbound(request) {
      const { query, variables } = await request.json();
      const reply = data => Response.json({ data }, { headers: { 'X-Shopify-API-Version': '2026-10' } });
      if (query.includes('query PierListings')) return reply({ productVariants: page([{ id: 'gid://shopify/ProductVariant/1', sku, title: 'Default', product: { title: 'Synthetic Pier stock' }, inventoryItem: { id: 'gid://shopify/InventoryItem/1' } }]) });
      if (query.includes('query PierOrders')) return reply({ orders: page(orders) });
      if (query.includes('query PierInventory')) {
        const quantity = inventory.get(variables.locationId) ?? 0;
        const callback = edge.afterRead; edge.afterRead = null;
        if (callback) await callback(variables.locationId);
        return reply({ inventoryItem: { inventoryLevel: { quantities: [{ name: 'available', quantity }] } } });
      }
      if (query.includes('mutation PierStock')) {
        const row = variables.input.quantities[0], key = variables.idempotencyKey;
        mutations.push({ ...row, key });
        assert.equal(variables.input.name, 'available');
        assert.equal(variables.input.reason, 'correction');
        if (reject.has(row.locationId)) return reply({ inventorySetQuantities: { inventoryAdjustmentGroup: null, userErrors: [{ code: 'INVALID', field: ['input'], message: 'Synthetic location refusal' }] } });
        if (!accepted.has(key)) {
          assert.equal(row.changeFromQuantity, inventory.get(row.locationId) ?? 0);
          inventory.set(row.locationId, row.quantity);
          writes.push({ ...row, key });
          accepted.set(key, { inventorySetQuantities: { inventoryAdjustmentGroup: { changes: [{ name: 'available', quantityAfterChange: row.quantity }] }, userErrors: [] } });
        }
        if (lose.delete(row.locationId)) throw new Error('Synthetic accepted response loss');
        return reply(accepted.get(key));
      }
      throw new Error('Unexpected synthetic Pier Shopify protocol request');
    },
  };
  return edge;
}
