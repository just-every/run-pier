import { test, expect } from '@playwright/test'
import { createServer } from 'node:http'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { ownerEntry } from './session'
// @ts-expect-error Shopify protocol fixture runs only at the external network edge.
import { locationEdge } from '../api/channel-edge.mjs'

test('owners map Shopify locations, preview affected orders and recover distinct publication outcomes', async ({ page, context }) => {
  const origin = await ownerEntry(page), edge = locationEdge('synthetic-pier-location');
  const server = createServer(async (request, response) => {
    try {
      let body = ''; for await (const chunk of request) body += chunk;
      const result = await edge.outbound(new Request('http://localhost' + request.url, { method: 'POST', headers: { 'content-type': 'application/json' }, body }));
      response.writeHead(result.status, Object.fromEntries(result.headers)); response.end(await result.text());
    } catch { response.destroy(); }
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const command = async (type: string, payload: object) => {
    const result = await context.request.post(`${origin}/api/pier/commands`, { headers: { origin }, data: { commandId: crypto.randomUUID(), type, payload } });
    const body = await result.json(); expect(body.ok, JSON.stringify(body)).toBe(true); return body.result;
  };
  const state = async () => (await context.request.get(`${origin}/api/pier/state`)).json();
  const submit = async (scope: ReturnType<typeof page.locator>, name: string, ok = true) => {
    const response = page.waitForResponse(r => r.url() === `${origin}/api/pier/commands` && r.request().method() === 'POST');
    await scope.getByRole('button', { name, exact: true }).click();
    expect((await (await response).json()).ok).toBe(ok);
    await expect(page.locator('main')).toHaveAttribute('aria-busy', 'false');
  };
  const shots = process.env.PIER_SCREENSHOTS;
  if (shots) await mkdir(shots, { recursive: true });
  const capture = async (name: string) => {
    if (!shots) return;
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.screenshot({ path: join(shots, `${width}-${name}.png`), fullPage: true });
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
  };
  try {
    await page.setViewportSize({ width: 1440, height: 1000 });
    const item = await command('item.save', { sku: 'synthetic-pier-location', name: 'Mapped brass bolts', unit: 'each', packSize: '1' });
    const supplier = await command('party.save', { name: 'Synthetic Pier supplier', kind: 'supplier' });
    const bins = [];
    for (const [warehouse, quantity] of [['East', '20'], ['West', '12'], ['FBA', '50']]) {
      const bin = await command('location.save', { name: `synthetic-pier-${warehouse}`, warehouse, kind: 'bin' }); bins.push(bin);
      let po = await command('po.draft', { supplierId: supplier.id, destinationWarehouse: warehouse, promiseDate: '2026-11-01', reason: 'Synthetic publication fixture', lines: [{ itemId: item.id, quantity, price: '1' }] });
      await command('po.approve', { poId: po.id, version: po.version }); po = await command('po.commit', { poId: po.id, version: po.version });
      await command('receipt.create', { poId: po.id, supplierReference: 'synthetic-pier-1', lines: [{ poLineId: po.lines[0].id, locationId: bin.id, quantity, cost: '1' }] });
    }
    await command('channel.hold', { itemId: item.id, warehouse: 'West', quantity: '2', reason: 'Protected channel allocation' });
    const loc1 = 'gid://shopify/Location/1', loc2 = 'gid://shopify/Location/2';
    const pageOf = (nodes: unknown[]) => ({ nodes, pageInfo: { hasNextPage: false, endCursor: null } });
    edge.orders.push({ id: 'gid://shopify/Order/101', name: 'synthetic-pier-101', closed: false, cancelledAt: null, displayFinancialStatus: 'PAID', displayFulfillmentStatus: 'UNFULFILLED', currencyCode: 'USD', customer: { displayName: 'Synthetic Pier buyer' }, shippingAddress: null, fulfillmentOrders: pageOf([{ assignedLocation: { location: { id: loc2 } } }]), lineItems: pageOf([{ id: 'gid://shopify/LineItem/101', sku: item.sku, requiresShipping: true, unfulfilledQuantity: 2, originalUnitPriceSet: { shopMoney: { amount: '2', currencyCode: 'USD' } } }]) });
    const port = (server.address() as { port: number }).port;
    const channel = await command('channel.save', { name: 'Mapped Shopify', provider: 'shopify', baseUrl: `http://127.0.0.1:${port}`, warehouse: 'East', buffer: '1', credentials: { accessToken: 'synthetic-pier-1', locationId: loc1 } });
    await expect.poll(async () => (await state()).orders.find((o: any) => o.channelId === channel.id)?.warehouse, { timeout: 15000 }).toBe('East');
    const before = await state(), order = before.orders.find((o: any) => o.channelId === channel.id);
    expect(order.warehouse).toBe('East'); expect(order.lines[0].reserved).toBe('2');
    await page.goto(`${origin}/app#sales`); await page.reload();
    const settings = page.getByRole('region', { name: 'Routing settings', exact: true });
    await settings.getByText('Warehouse routing rules', { exact: true }).click();
    const form = settings.locator('section').filter({ has: page.getByRole('heading', { name: 'Prepare a warehouse routing rule', exact: true }) }).last();
    await form.getByLabel('Routing order source', { exact: true }).selectOption(`channel:${channel.id}`);
    await form.getByLabel('Routing mode', { exact: true }).selectOption('channel-location');
    await form.getByLabel('Channel location identifier 1', { exact: true }).fill(loc1);
    await form.getByLabel('Mapped warehouse 1', { exact: true }).selectOption('East');
    await form.getByRole('button', { name: 'Add channel location mapping', exact: true }).click();
    await form.getByLabel('Channel location identifier 2', { exact: true }).fill('ambiguous');
    await form.getByLabel('Mapped warehouse 2', { exact: true }).selectOption('West');
    await submit(form, 'Save routing draft', false);
    await expect(page.getByRole('alert')).toContainText('exact Shopify location identity');
    expect((await state()).routingRules.filter((r: any) => r.source === `channel:${channel.id}`)).toHaveLength(0);
    await form.getByLabel('Channel location identifier 2', { exact: true }).fill(loc2);
    await capture('shopify-location-mapping');
    await submit(form, 'Save routing draft');
    const review = settings.locator('section').filter({ has: page.getByRole('heading', { name: 'Channel · Mapped Shopify · routing revision 1', exact: true }) }).last();
    await submit(review, 'Dry-run last 30 days');
    const affected = review.getByRole('row').filter({ hasText: order.reference });
    await expect(affected).toContainText('East'); await expect(affected).toContainText('West'); await expect(affected).toContainText('Warehouse changes');
    await capture('shopify-location-preview');
    edge.reject.add(loc2);
    await submit(review, 'Activate reviewed rule');
    await expect.poll(async () => (await state()).channelListings.find((l: any) => l.channelId === channel.id)?.publicationLocations?.find((p: any) => p.locationId === loc2)?.publication?.status, { timeout: 15000 }).toBe('uncertain');
    const afterActivation = await state();
    for (const kind of ['orders', 'movements', 'reservations', 'receipts', 'purchaseOrders', 'shipments']) expect(afterActivation[kind]).toEqual(before[kind]);
    await page.goto(`${origin}/app#channels`); await page.reload();
    const rows = page.locator('.channel-inventory').getByRole('row');
    const east = rows.filter({ hasText: loc1 }), west = rows.filter({ hasText: loc2 });
    await expect(east.getByRole('cell').nth(2)).toHaveText('17');
    await expect(east.getByRole('cell').nth(5)).toContainText('17');
    await expect(west.getByRole('cell').nth(2)).toHaveText('9');
    await expect(west).toContainText('not confirmed');
    await west.getByText('Location outcomes', { exact: true }).click();
    await expect(west).toContainText('uncertain');
    await capture('shopify-location-failure');
    edge.reject.delete(loc2);
    await submit(page.locator('main'), 'Sync now');
    await expect(west.getByRole('cell').nth(5)).toContainText('9'); await expect(west).toContainText('In step');
    await expect(west).toContainText('accepted');
    const current = await state();
    expect(current.channelListings.filter((l: any) => l.channelId === channel.id && !l.orderOnly)).toHaveLength(1);
    expect(current.positions.find((p: any) => p.locationId === bins[2].id).quantity).toBe('50');
    expect(edge.writes.map((w: any) => [w.locationId, w.quantity])).toEqual([[loc1, 17], [loc2, 9]]);
    await capture('shopify-location-reconciled');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});
