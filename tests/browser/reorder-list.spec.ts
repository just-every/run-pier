import { test, expect } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
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
 const shots = process.env.PIER_SCREENSHOTS
 if (shots) await mkdir(shots, { recursive: true })
 for (const width of [1440, 390]) {
  const supplier = await command('party.save', { name: `Harbor supply ${width}`, kind: 'supplier' }), alternate = await command('party.save', { name: `Alternate supply ${width}`, kind: 'supplier' })
  const eastName = `East ${width}`, westName = `West ${width}`
  const east = await command('location.save', { name: `East rack ${width}`, warehouse: eastName, kind: 'bin' }), west = await command('location.save', { name: `West rack ${width}`, warehouse: westName, kind: 'bin' })
  const a = await command('item.save', { sku: `PLAN-A-${width}`, name: `Blue mugs ${width}`, unit: 'each', packSize: '1' }), e = await command('item.save', { sku: `PLAN-E-${width}`, name: `Tea cups ${width}`, unit: 'each', packSize: '1' })
  const purchase = async (item: any, quantity: string, location: any, received = quantity) => {
   let po = await command('po.draft', { supplierId: supplier.id, destinationWarehouse: location.warehouse, promiseDate: '2026-11-01', reason: 'Browser planning fixture', lines: [{ itemId: item.id, quantity, price: '1' }] }); await command('po.approve', { poId: po.id, version: po.version }); po = await command('po.commit', { poId: po.id, version: po.version })
   if (received !== '0') await command('receipt.create', { poId: po.id, supplierReference: `DEL-${item.sku}-${location.name}`, lines: [{ poLineId: po.lines[0].id, locationId: location.id, quantity: received, cost: '1' }] })
  }
  await purchase(a, '8', east); await purchase(a, '6', east, '0'); await purchase(e, '2', east); await purchase(e, '40', west)
  for (const [item, source, pack, minimum] of [[a, supplier, '12', '24'], [a, alternate, '10', '0'], [e, supplier, '1', '0']] as const) await command('supplierItem.save', { itemId: item.id, supplierId: source.id, code: `${item.sku}-${pack}`, packSize: pack, minimum, price: '1', leadDays: 7, ...(source.id === alternate.id ? { minimumValue: '900' } : {}) })
  for (const [item, point, quantity] of [[a, '20', '40'], [e, '5', '10']] as const) await command('replenishment.save', { itemId: item.id, warehouse: eastName, version: 0, supplierId: supplier.id, method: 'fixed', safetyStock: '0', reorderPoint: point, reorderQuantity: quantity })
  const state = await (await context.request.get(`${origin}/api/pier/state`)).json()
  await command('replenishment.configure', { version: state.replenishmentSettings[0]?.version ?? 0, mode: 'location', warehouses: [eastName, westName], destinationWarehouse: eastName })
  await page.setViewportSize({ width, height: 1000 }); await page.goto(`${origin}/app#purchasing`); await page.reload(); await page.getByRole('button', { name: 'All', exact: true }).click()
  await page.getByRole('row').filter({ hasText: `Alternate supply ${width}` }).filter({ hasText: `Blue mugs ${width}` }).getByRole('button', { name: 'Edit terms', exact: true }).click()
  const termsEditor = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Revise supplier-item terms', exact: true }) }).last()
  await termsEditor.getByLabel('Supplier minimum order value (USD, optional)', { exact: true }).fill('1000')
  if (shots) await termsEditor.screenshot({ path: join(shots, `${width}-reorder-supplier-terms.png`) })
  await termsEditor.getByRole('button', { name: 'Save', exact: true }).click()
  const batch = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Reorder list and purchase batch', exact: true }) }).last()
  const aLabel = `Blue mugs ${width} · PLAN-A-${width}`, eLabel = `Tea cups ${width} · PLAN-E-${width}`
  await expect(batch.getByLabel(`Purchase quantity for ${aLabel} at ${eastName}`, { exact: true })).toHaveValue('48')
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
  // Save a reusable default from the existing policy editor.
  const demand = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Demand and replenishment', exact: true }) }).last()
  await demand.getByRole('row').filter({ hasText: eLabel }).filter({ hasText: eastName }).getByRole('button', { name: 'Review policy', exact: true }).click()
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
  await command('item.save', { ...a, archived: true }); await command('item.save', { ...e, archived: true })
 }
})
