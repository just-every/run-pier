import assert from 'node:assert/strict';
import { installation } from './harness.mjs';
export async function searchScenario() {
  const h = await installation();
  try {
    const customer = await h.command('party.save', { name: 'synthetic-pier-search Customer 100%', kind: 'customer' });
    await h.command('party.save', { name: 'synthetic-pier-search Supplier 100%', kind: 'supplier' });
    const items = [];
    for (let i = 0; i < 3; i++) items.push(await h.command('item.save', { sku: `synthetic-pier-search-${i}`, name: `Search item ${i}`, unit: 'each', packSize: '12', barcode: `synthetic-pier-unit-${i}`, caseBarcode: `synthetic-pier-case-${i}`, barcodes: [{ code: `synthetic-pier-inner-${i}`, quantity: '3' }], references: [{ partyId: customer.id, code: 'synthetic-pier-shared-alias' }], archived: i === 2 }));
    const read = async params => {
      const response = await h.request('/api/pier/search?' + new URLSearchParams(params));
      assert.equal(response.status, 200, await response.clone().text());
      return response.json();
    };
    for (const query of ['synthetic-pier-search-0', 'SYNTHETIC-PIER-UNIT-0', 'synthetic-pier-case-0', 'synthetic-pier-inner-0', 'Search item 0']) {
      const result = await read({ q: query });
      assert.deepEqual(result.rows.map(row => row.id), [items[0].id]);
      assert.equal(result.total, 1);
      assert.equal(result.hasMore, false);
      assert.equal(result.nextCursor, null);
    }
    const ids = [];
    let cursor;
    do {
      const result = await read({ q: 'synthetic-pier-shared-alias', limit: '1', ...(cursor ? { cursor } : {}) });
      assert.equal(result.rows.length, 1);
      assert.equal(result.total, 3, 'shared aliases retain every owner, including archived history');
      ids.push(result.rows[0].id);
      assert.equal(result.hasMore, result.nextCursor !== null);
      if (result.hasMore) assert.match(result.notice, /More matching records/);
      cursor = result.nextCursor;
    } while (cursor);
    assert.deepEqual(ids, items.map(item => item.id).sort());
    const customerResult = await read({ kind: 'customers', q: '100%' });
    assert.deepEqual(customerResult.rows.map(row => row.id), [customer.id], 'customer search excludes suppliers and treats percent literally');
    const none = await read({ q: 'synthetic-pier-no-match' });
    assert.deepEqual(none.rows, []);
    assert.equal(none.total, 0);
    assert.equal(none.hasMore, false);
    const first = await read({ q: 'synthetic-pier-shared-alias', limit: '1' });
    for (const params of [{ q: 'other', cursor: first.nextCursor }, { q: 'x', cursor: 'malformed' }]) assert.equal((await h.request('/api/pier/search?' + new URLSearchParams(params))).status, 409);
    for (const params of [{ q: '' }, { q: 'x', limit: '101' }, { q: 'x', kind: 'unknown' }]) assert.equal((await h.request('/api/pier/search?' + new URLSearchParams(params))).status, 400);
    await h.command('party.save', { name: 'Changed source', kind: 'customer' });
    assert.equal((await h.request('/api/pier/search?' + new URLSearchParams({ q: 'synthetic-pier-shared-alias', cursor: first.nextCursor }))).status, 409);
    const entered = await fetch(h.origin + '/auth/dev/enter?as=member', { redirect: 'manual', headers: { 'x-rer-dev-key': h.devKey } });
    const cookie = entered.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
    assert.equal((await h.request('/api/pier/search?q=synthetic-pier-search', { as: cookie })).status, 403);
    assert.equal((await h.request('/api/pier/search?q=synthetic-pier-search', { as: '' })).status, 401);
  } finally { await h.close(); }
}
