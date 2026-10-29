import { test, expect } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { createServer } from 'node:http'
import { ownerEntry } from './session'

test('BUY-005: buyer selects suppliers and quantities, saves SKU defaults, changes planning scope and reads matching reports at 1440 and 390', async ({ page, context }) => {
 const origin = process.env.PIER_BOOTSTRAP ? process.env.PIER_BASE_URL! : await ownerEntry(page)
 if (process.env.PIER_BOOTSTRAP) {
  expect((await context.request.post(`${origin}/auth/bootstrap`, { headers: { origin }, data: { token: process.env.PIER_BOOTSTRAP, displayName: 'Owner' }, maxRedirects: 0 })).status()).toBe(303)
  await page.goto(`${origin}/app`)
  if (new URL(page.url()).pathname === '/setup') { await page.getByRole('checkbox').check(); await page.getByRole('button', { name: 'Finish setup', exact: true }).click(); await page.waitForURL(url => url.pathname === '/app') }
 }
 const command = async (type: string, payload: object) => {
  const response = await context.request.post(`${origin}/api/pier/commands`, { headers: { origin }, data: { commandId: crypto.randomUUID(), type, payload } }); const body = await response.json(); expect(body.ok, JSON.stringify(body)).toBe(true); return body.result
 }
 let channelSku = '', channelNumber = 0
 const edge = createServer(async (request, response) => {
  response.setHeader('content-type', ['application', 'json'].join('/'))
  if (request.method === 'PUT') { let body = ''; for await (const chunk of request) body += chunk; response.end(JSON.stringify({ id: 1, ...JSON.parse(body) })); return }
  const path = new URL(request.url!, 'http://localhost').pathname
  response.end(JSON.stringify(path.endsWith('/products') ? [{ id: 1, name: 'Native channel demand', type: 'simple', sku: channelSku }] : [{ id: channelNumber, number: `synthetic-pier-${channelNumber}`, status: 'processing', currency: 'USD', billing: { first_name: 'Buyer', last_name: '' }, refunds: [], line_items: [{ id: 1, sku: channelSku, quantity: 3, price: 1 }] }]))
 })
 await new Promise<void>(resolve => edge.listen(0, '127.0.0.1', resolve))
 const edgePort = (edge.address() as { port: number }).port
 try {
 const shots = process.env.PIER_SCREENSHOTS
 if (shots) await mkdir(shots, { recursive: true })
 for (const width of [1440, 390]) {
  const supplier = await command('party.save', { name: `Harbor supply ${width}`, kind: 'supplier' }), alternate = await command('party.save', { name: `Alternate supply ${width}`, kind: 'supplier' })
  const eastName = `East ${width}`, westName = `West ${width}`
  const customer = await command('party.save', { name: `Wholesale buyer ${width}`, kind: 'customer' })
  const second = await command('party.save', { name: `West supply ${width}`, kind: 'supplier' })
  const east = await command('location.save', { name: `East rack ${width}`, warehouse: eastName, kind: 'bin' }), west = await command('location.save', { name: `West rack ${width}`, warehouse: westName, kind: 'bin' })
  const a = await command('item.save', { sku: `PLAN-A-${width}`, name: `Blue mugs ${width}`, unit: 'each', packSize: '1' }), e = await command('item.save', { sku: `PLAN-E-${width}`, name: `Tea cups ${width}`, unit: 'each', packSize: '1' })
  const b = await command('item.save', { sku: `PLAN-B-${width}`, name: `West mugs ${width}`, unit: 'each', packSize: '1' }), c = await command('item.save', { sku: `PLAN-C-${width}`, name: `Small cups ${width}`, unit: 'each', packSize: '1' }), d = await command('item.save', { sku: `PLAN-D-${width}`, name: `Transfer cups ${width}`, unit: 'each', packSize: '1' })
  const transit = await command('location.save', { name: `Transfer van ${width}`, warehouse: `Road ${width}`, kind: 'transit' })
  const purchase = async (item: any, quantity: string, location: any, received = quantity) => {
   let po = await command('po.draft', { supplierId: supplier.id, destinationWarehouse: location.warehouse, promiseDate: '2026-11-01', reason: 'Browser planning fixture', lines: [{ itemId: item.id, quantity, price: '1' }] }); await command('po.approve', { poId: po.id, version: po.version }); po = await command('po.commit', { poId: po.id, version: po.version })
   if (received !== '0') await command('receipt.create', { poId: po.id, supplierReference: `DEL-${item.sku}-${location.name}`, lines: [{ poLineId: po.lines[0].id, locationId: location.id, quantity: received, cost: '1' }] })
   return po
  }
  await purchase(a, '8', east); await purchase(a, '6', east, '0'); await purchase(e, '2', east); await purchase(e, '40', west)
  let legacy = await command('po.draft', { supplierId: supplier.id, promiseDate: '2026-11-01', reason: 'Legacy supply with no destination', lines: [{ itemId: a.id, quantity: '1000', price: '1' }] })
  await command('po.approve', { poId: legacy.id, version: legacy.version }); await command('po.commit', { poId: legacy.id, version: legacy.version })
  const bp = await purchase(b, '30', west, '25')
  await command('order.create', { customerId: customer.id, warehouse: westName, lines: [{ itemId: b.id, quantity: '32', price: '2' }] })
  await command('receipt.create', { poId: bp.id, supplierReference: `B later five ${width}`, lines: [{ poLineId: bp.lines[0].id, locationId: west.id, quantity: '5', cost: '1' }] })
  await purchase(c, '4', east); await purchase(d, '8', east); await purchase(d, '6', west)
  await command('transfer.send', { itemId: d.id, quantity: '8', fromLocationId: east.id, toLocationId: west.id, transitLocationId: transit.id, reason: 'Eight inbound to West' })
  await command('supplierItem.save', { itemId: b.id, supplierId: second.id, code: `B-${width}`, packSize: '6', minimum: '0', price: '1', leadDays: 7 })
  await command('supplierItem.save', { itemId: c.id, supplierId: supplier.id, code: `C-${width}`, packSize: '1', minimum: '10', reorderQuantity: '3', price: '1', leadDays: 7 })
  await command('supplierItem.save', { itemId: d.id, supplierId: supplier.id, code: `D-${width}`, packSize: '1', minimum: '0', price: '1', leadDays: 7 })
  for (const [item, point, quantity, method, maximum] of [[b, '10', '20', 'upTo', '60'], [c, '5', '8', 'fixed', undefined], [d, '10', '10', 'fixed', undefined]] as const) await command('replenishment.save', { itemId: item.id, warehouse: item.id === c.id ? eastName : westName, version: 0, supplierId: item.id === b.id ? second.id : supplier.id, method, maximum, safetyStock: '0', reorderPoint: point, reorderQuantity: quantity })
  for (const [item, source, pack, minimum] of [[a, supplier, '12', '24'], [a, alternate, '10', '0'], [e, supplier, '1', '0']] as const) await command('supplierItem.save', { itemId: item.id, supplierId: source.id, code: `${item.sku}-${pack}`, packSize: pack, minimum, price: '1', leadDays: 7, ...(source.id === alternate.id ? { minimumValue: '900' } : {}) })
  for (const [item, point, quantity] of [[a, '20', '40'], [e, '5', '10']] as const) await command('replenishment.save', { itemId: item.id, warehouse: eastName, version: 0, supplierId: supplier.id, method: 'fixed', safetyStock: '0', reorderPoint: point, reorderQuantity: quantity })
  const state = await (await context.request.get(`${origin}/api/pier/state`)).json()
  await command('replenishment.configure', { version: state.replenishmentSettings[0]?.version ?? 0, mode: 'location', warehouses: [eastName, westName], destinationWarehouse: eastName })
  await page.setViewportSize({ width, height: 1000 }); await page.goto(`${origin}/app#purchasing`); await page.reload(); await page.getByRole('button', { name: 'All', exact: true }).click()
  await page.getByRole('row').filter({ hasText: `Alternate supply ${width}` }).filter({ hasText: `Blue mugs ${width}` }).getByRole('button', { name: 'Edit terms', exact: true }).click()
  const termsEditor = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Revise supplier-item terms', exact: true }) }).last()
  await termsEditor.getByLabel('Supplier minimum order value (USD, optional)', { exact: true }).fill('1000')
  if (shots) await termsEditor.screenshot({ path: join(shots, `${width}-reorder-supplier-terms.png`) })
  const termsSaved = page.waitForResponse(response => response.url() === `${origin}/api/pier/commands` && response.request().postDataJSON()?.type === 'supplierItem.save')
  await termsEditor.getByRole('button', { name: 'Save', exact: true }).click()
  await termsSaved
  await page.locator('main[aria-busy="false"]').waitFor()
  const batch = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Reorder list and purchase batch', exact: true }) }).last()
  const aLabel = `Blue mugs ${width} · PLAN-A-${width}`, eLabel = `Tea cups ${width} · PLAN-E-${width}`
  await expect(batch.getByLabel(`Purchase quantity for ${aLabel} at ${eastName}`, { exact: true })).toHaveValue('48')
  const bLabel = `West mugs ${width} · PLAN-B-${width}`, cLabel = `Small cups ${width} · PLAN-C-${width}`
  // Read each visible calculation against the independently specified East and West fixture.
  const calculations = [
   { label: aLabel, warehouse: eastName, supplier: supplier.id, quantity: '48', point: '20', method: 'fixed', parameter: '40', pack: '12', minimum: '24', terms: ['8', '0', '0', '6', '0', '0', '14', '46', '2', '48', '0', '48'] },
   { label: bLabel, warehouse: westName, supplier: second.id, quantity: '66', point: '10', method: 'upTo', parameter: '60', pack: '6', minimum: '0', terms: ['30', '25', '7', '0', '0', '0', '-2', '62', '4', '66', '0', '66'] },
   { label: cLabel, warehouse: eastName, supplier: supplier.id, quantity: '10', point: '5', method: 'fixed', parameter: '3', pack: '1', minimum: '10', terms: ['4', '0', '0', '0', '0', '0', '4', '4', '6', '10', '0', '10'] },
   { label: eLabel, warehouse: eastName, supplier: supplier.id, quantity: '13', point: '5', method: 'fixed', parameter: '10', pack: '1', minimum: '0', terms: ['2', '0', '0', '0', '0', '0', '2', '13', '0', '13', '0', '13'] },
  ]
  for (const calculation of calculations) {
   const row = batch.getByRole('row').filter({ hasText: calculation.label })
   await row.getByText(`Calculation for ${calculation.label}`, { exact: true }).click()
   if (width === 1440) {
    await expect(row.getByLabel(`Purchase quantity for ${calculation.label} at ${calculation.warehouse}`, { exact: true })).toHaveValue(calculation.quantity)
    await expect(row.getByLabel(`Supplier for ${calculation.label} at ${calculation.warehouse}`, { exact: true })).toHaveValue(calculation.supplier)
    await expect(row.locator('details dd')).toHaveText(calculation.terms)
    await expect(row.locator('details p').first()).toHaveText(`Point ${calculation.point}; ${calculation.method} ${calculation.parameter}; pack ${calculation.pack}; minimum ${calculation.minimum}.`)
   }
  }
  if (width === 1440) { await expect(batch.getByRole('checkbox')).toHaveCount(4); await expect(batch).not.toContainText(d.sku) }
  if (shots) await batch.screenshot({ path: join(shots, `${width}-reorder-calculations.png`), style: '.pier-app .topbar { visibility: hidden !important; }' })
  // Draft all four scenario lines, remove only West's draft, then reload the public list.
  for (const calculation of calculations) await batch.getByLabel(`Select ${calculation.label} at ${calculation.warehouse}`, { exact: true }).check()
  await batch.getByRole('button', { name: 'Create selected purchase drafts', exact: true }).click()
  await expect(batch.getByLabel(`Purchase quantity for ${bLabel} at ${westName}`, { exact: true })).toHaveValue('0')
  const coveredState = await (await context.request.get(`${origin}/api/pier/state`)).json()
  const westDraft = coveredState.purchaseOrders.find((p: any) => p.status === 'draft' && p.supplierId === second.id)
  const eastDraft = coveredState.purchaseOrders.find((p: any) => p.status === 'draft' && p.supplierId === supplier.id)
  await page.getByRole('row').filter({ hasText: westDraft.reference }).getByRole('button', { name: 'Review', exact: true }).click()
  const deleted = page.waitForResponse(response => response.url() === `${origin}/api/pier/commands` && response.request().postDataJSON()?.type === 'po.delete')
  await page.locator(`#document-${westDraft.id}`).getByRole('button', { name: 'Delete uncommitted draft', exact: true }).click()
  await deleted
  await page.reload()
  if (width === 1440) {
   await expect(batch.getByLabel(`Purchase quantity for ${bLabel} at ${westName}`, { exact: true })).toHaveValue('66')
   for (const calculation of calculations.filter(c => c.label !== bLabel)) {
    const row = batch.getByRole('row').filter({ hasText: calculation.label })
    await expect(row.getByLabel(`Purchase quantity for ${calculation.label} at ${calculation.warehouse}`, { exact: true })).toHaveValue('0')
    await expect(row.getByLabel(`Supplier for ${calculation.label} at ${calculation.warehouse}`, { exact: true })).toHaveValue(calculation.supplier)
    await row.getByText(`Calculation for ${calculation.label}`, { exact: true }).click()
    await expect(row.locator('details')).toContainText(`${eastDraft.reference}: ${calculation.quantity} covered.`)
   }
  } else {
   for (const calculation of calculations) await batch.getByText(`Calculation for ${calculation.label}`, { exact: true }).click()
  }
  if (shots) await batch.screenshot({ path: join(shots, `${width}-reorder-deleted-west-draft.png`), style: '.pier-app .topbar { visibility: hidden !important; }' })
  await command('po.delete', { poId: eastDraft.id, version: eastDraft.version })
  await page.reload()
  await batch.getByLabel(`Select ${aLabel} at ${eastName}`, { exact: true }).check()
  await batch.getByLabel(`Supplier for ${aLabel} at ${eastName}`, { exact: true }).selectOption(alternate.id)
  await expect(batch.getByLabel(`Purchase quantity for ${aLabel} at ${eastName}`, { exact: true })).toHaveValue('50')
  await batch.getByText(`Calculation for ${aLabel}`, { exact: true }).click()
  await batch.getByLabel(`Purchase quantity for ${aLabel} at ${eastName}`, { exact: true }).fill('60')
  await batch.getByLabel(`Select ${eLabel} at ${eastName}`, { exact: true }).check()
  if (shots) await batch.screenshot({ path: join(shots, `${width}-reorder-batch.png`) })
  await batch.getByRole('button', { name: 'Create selected purchase drafts', exact: true }).click()
  await expect(batch.getByLabel(`Purchase quantity for ${aLabel} at ${eastName}`, { exact: true })).toHaveValue('0')
  const after = await (await context.request.get(`${origin}/api/pier/state`)).json(), draft = after.purchaseOrders.find((p: any) => p.status === 'draft' && p.supplierId === alternate.id)
  expect(draft.lines[0].quantity).toBe('60'); expect(draft.minimumOrderValueUnmet).toBe(true)
  await page.getByRole('row').filter({ hasText: draft.reference }).getByRole('button', { name: 'Review', exact: true }).click()
  const review = page.locator(`#document-${draft.id}`)
  await expect(review).toContainText('Supplier minimum order value of 1000 USD is unmet')
  if (shots) await review.screenshot({ path: join(shots, `${width}-reorder-draft.png`) })
  channelSku = e.sku; channelNumber = width
  const channel = await command('channel.save', { name: `Demand ${width}`, provider: 'woocommerce', baseUrl: `http://127.0.0.1:${edgePort}`, warehouse: eastName, credentials: { consumerKey: 'synthetic-pier-1', consumerSecret: 'synthetic-pier-2' } })
  await page.reload()
  // Save a reusable default from the existing policy editor.
  const demand = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Demand and replenishment', exact: true }) }).last()
  await demand.getByRole('row').filter({ hasText: eLabel }).filter({ hasText: eastName }).getByRole('button', { name: 'Review policy', exact: true }).click()
  const history = page.locator('section.panel').filter({ has: page.getByRole('heading', { name: 'Observed demand', exact: true }) })
  await expect(history).toContainText('Native shipped: 0; channel ordered: 3')
  await expect(history.getByRole('link', { name: `Channel order synthetic-pier-${width}`, exact: true }).first()).toBeVisible()
  if (shots) await history.screenshot({ path: join(shots, `${width}-native-demand.png`) })
  const policy = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Replenishment policy', exact: true }) }).last()
  await policy.getByLabel('Save as SKU default for locations without overrides', { exact: true }).check()
  if (shots) await policy.screenshot({ path: join(shots, `${width}-reorder-default.png`) })
  await policy.getByRole('button', { name: 'Save buyer policy', exact: true }).click()
  await expect.poll(async () => (await (await context.request.get(`${origin}/api/pier/state`)).json()).replenishmentPolicies.filter((p: any) => p.itemId === e.id && p.scope === 'sku').length).toBe(1)
  const scope = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Reorder planning scope', exact: true }) }).last()
  await scope.getByLabel('Replenishment scope', { exact: true }).selectOption('company')
  await scope.getByRole('button', { name: 'Save planning scope', exact: true }).click()
  await expect(batch.getByLabel(`Select ${eLabel} at ${eastName}`, { exact: true })).toHaveCount(0)
  if (shots) await scope.screenshot({ path: join(shots, `${width}-reorder-scope.png`) })
  await page.goto(`${origin}/app#reports`); await page.reload()
  const report = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Current low-stock report', exact: true }) }).last()
  await expect(report).toContainText(a.sku); await expect(report).not.toContainText(e.sku)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)
  if (shots) await report.screenshot({ path: join(shots, `${width}-reorder-report.png`) })
  await command('channel.save', { ...channel, enabled: false })
  await command('item.save', { ...a, archived: true }); await command('item.save', { ...e, archived: true })
  for (const item of [b, c, d]) await command('item.save', { ...item, archived: true })
 }
 } finally { await new Promise<void>((resolve, reject) => edge.close(error => error ? reject(error) : resolve())) }
})
