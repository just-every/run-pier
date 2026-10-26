import assert from 'node:assert/strict';
import { installation } from './harness.mjs';

const root = '/api/pier/movement-exports';
export async function movementExportScenario() {
  const h = await installation();
  try {
    const start = async id => {
      const res = await h.request(root, { method: 'POST', body: { commandId: id } });
      assert.equal(res.status, 202, await res.clone().text());
      return res.json();
    };
    const tick = async () => (await h.mf.getWorker()).scheduled({ scheduledTime: new Date('2026-11-01T12:00:00Z'), cron: '* * * * *' });
    const progress = async id => {
      const res = await h.request(root + '/' + id);
      return { status: res.status, body: await res.json() };
    };
    const empty = await start('synthetic-pier-empty');
    assert.equal(empty.total, 0);
    await tick();
    assert.deepEqual((({ status, total, processed, pages }) => ({ status, total, processed, pages }))((await progress(empty.id)).body), { status: 'complete', total: 0, processed: 0, pages: 0 });

    // A real reviewed native opening generates 1,205 movements, not SQL fixtures.
    const count = 1205;
    const locations = Array.from({ length: count }, (_, i) => `l${i},Bin ${i},Warehouse ${i % 3},bin`);
    const positions = Array.from({ length: count }, (_, i) => `p${i},i,l${i},sellable,${i % 2 ? '0.125' : '2'},each,0.25`);
    for (let offset = 0; offset < count; offset += 200) {
      const files = [
        { kind: 'items', name: 'items.csv', csv: `key,sku,name,barcode,unit,packSize\ni,synthetic-pier-export-${offset},Export item,synthetic-pier-barcode-${offset},each,1\n` },
        { kind: 'locations', name: 'locations.csv', csv: 'key,name,warehouse,kind\n' + locations.slice(offset, offset + 200).join('\n') + '\n' },
        { kind: 'positions', name: 'positions.csv', csv: 'key,itemKey,locationKey,status,quantity,unit,cost\n' + positions.slice(offset, offset + 200).join('\n') + '\n' },
      ];
      let batch = await h.command('import.stage', { namespace: 'synthetic-pier-export-' + offset, sourceVersion: '1', mappingRevision: '1', cutoffTimezone: 'UTC', exportedAt: '2026-11-01T00:00:00Z', filters: 'All synthetic openings', files });
      assert.deepEqual(batch.errors, []);
      for (const stage of ['mapped', 'reconciled', 'shadow', 'frozen']) batch = await h.command('import.review', { batchId: batch.id, version: batch.version, stage, reason: 'Reconcile exact public-door export fixture' });
      await h.command('import.commit', { batchId: batch.id, version: batch.version });
    }
    const native = await h.state();
    const transit = await h.command('location.save', { name: 'Export transit', warehouse: 'Warehouse 0', kind: 'transit' });
    await h.command('transfer.send', { itemId: native.items.find(item => item.sku === 'synthetic-pier-export-0').id, fromLocationId: native.locations.find(location => location.name === 'Bin 0').id, toLocationId: native.locations.find(location => location.name === 'Bin 3').id, transitLocationId: transit.id, quantity: '0.125', reason: 'Export exact signed transfer movements' });
    const total = count + 2;
    const source = (await (await h.request('/api/pier/export')).json()).movements;
    assert.equal(source.length, total);
    const job = await start('synthetic-pier-export-job');
    assert.deepEqual({ total: job.total, processed: job.processed, status: job.status }, { total, processed: 0, status: 'pending' });
    assert.equal((await h.request(`${root}/${job.id}/pages/0`)).status, 409, 'incomplete artifacts never look complete');
    await tick();
    let observed = (await progress(job.id)).body;
    assert.deepEqual({ total: observed.total, processed: observed.processed, pages: observed.pages, status: observed.status }, { total, processed: 1000, pages: 10, status: 'pending' });
    await h.restartWithFreshSigningKey();
    assert.equal((await progress(job.id)).body.processed, 1000, 'durable progress survives a Worker restart');
    await Promise.all([tick(), tick()]);
    observed = (await progress(job.id)).body;
    assert.deepEqual({ total: observed.total, processed: observed.processed, pages: observed.pages, status: observed.status }, { total, processed: total, pages: 13, status: 'complete' });
    assert.equal((await start(job.id)).id, job.id, 'same request identity recovers the export');
    const downloaded = [];
    for (let page = 0; page < observed.pages; page++) {
      const response = await h.request(`${root}/${job.id}/pages/${page}`);
      assert.equal(response.status, 200, await response.clone().text());
      assert.equal(response.headers.get('cache-control'), 'no-store');
      assert.equal(response.headers.get('x-pier-export-total'), String(total));
      const rows = (await response.text()).trim().split('\n').map(line => JSON.parse(line));
      assert.equal(rows.length, page === 12 ? 7 : 100);
      downloaded.push(...rows);
    }
    assert.deepEqual(downloaded, source, 'all exact exported source rows appear once, in sequence, including fractional quantities and provenance');
    assert.equal(new Set(downloaded.map(row => row.id)).size, total);
    assert.equal(downloaded.filter(row => row.quantity === '125000').length, 603);
    assert.equal(downloaded.filter(row => row.quantity === '2000000').length, 603);
    assert.equal(downloaded.filter(row => row.quantity === '-125000').length, 1);
    assert.equal((await h.request(`${root}/${job.id}/pages/13`)).status, 404);
    const entered = await fetch(h.origin + '/auth/dev/enter?as=member', { redirect: 'manual', headers: { 'x-rer-dev-key': h.devKey } });
    const cookie = entered.headers.getSetCookie().map(v => v.split(';')[0]).join('; ');
    for (const path of [root + '/' + job.id, `${root}/${job.id}/pages/0`]) assert.equal((await h.request(path, { as: cookie })).status, 403);
    assert.equal((await h.request(root, { as: cookie, method: 'POST', body: { commandId: 'synthetic-pier-denied' } })).status, 403);
    assert.equal((await h.request(root, { as: '', method: 'POST', body: { commandId: 'synthetic-pier-anonymous' } })).status, 401);
    assert.equal((await h.request(root, { method: 'POST', headers: { origin: 'https://foreign.example.test' }, body: { commandId: 'synthetic-pier-cross-origin' } })).status, 403);
    await h.command('party.save', { name: 'Source revision changed', kind: 'customer' });
    assert.equal((await progress(job.id)).status, 409);
    assert.equal((await progress(job.id)).body.status, 'stale');
    assert.equal((await h.request(`${root}/${job.id}/pages/0`)).status, 409);
    const replacement = await start('synthetic-pier-replacement');
    assert.equal(replacement.status, 'pending');
    await tick();
    await tick();
    assert.equal((await progress(replacement.id)).body.status, 'complete', 'a fresh export recovers from source invalidation');
    const owner = (await h.state()).actor;
    const revoked = await h.request('/auth/session/revoke', { method: 'POST', body: { sessionId: owner.sessionId } });
    assert.equal(revoked.status, 204);
    assert.equal((await h.request(`${root}/${replacement.id}/pages/0`)).status, 401);
    await h.restartWithFreshSigningKey();
    assert.equal((await progress(replacement.id)).status, 409, 'fresh owner sign-in cannot revive a revoked export authorization');
    return { movements: total, pages: observed.pages, processed: observed.processed, complete: true };
  } finally {
    await h.close();
  }
}
