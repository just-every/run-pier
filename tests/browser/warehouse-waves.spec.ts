import { test, expect, type Page } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { ownerEntry } from './session'

const commandResult = (page: Page, type: string) => page.waitForResponse(response => response.url().endsWith('/api/pier/commands') && response.request().postDataJSON()?.type === type)
async function scan(page: Page, label: string, code: string, type?: string) {
  const saved = type ? commandResult(page, type) : undefined
  await page.getByLabel(label, { exact: true }).fill(code)
  await page.getByLabel(label, { exact: true }).press('Enter')
  if (saved) { const body = await (await saved).json(); expect(body.ok, JSON.stringify(body)).toBe(true) }
}

for (const width of [1440, 390]) test(`warehouse zone merge, ten order totes and overflow at ${width}px`, async ({ page, context }) => {
  test.setTimeout(240_000)
  await page.setViewportSize({ width, height: 1000 })
  const origin = await ownerEntry(page), seed = `synthetic-waves-${width}-${crypto.randomUUID().slice(0, 8)}`
  const command = async (type: string, payload: object) => {
    const response = await context.request.post(`${origin}/api/pier/commands`, { headers: { origin }, data: { commandId: crypto.randomUUID(), type, payload } })
    const body = await response.json(); expect(body.ok, JSON.stringify(body)).toBe(true); return body.result
  }
  const supplier = await command('party.save', { name: `${seed} supplier`, kind: 'supplier' }), customer = await command('party.save', { name: `${seed} customer`, kind: 'customer' })
  const prepare = async (suffix: string, names: string[], quantities: number[], zones?: string[]) => {
    const warehouse = `${seed}-${suffix}`, bins = []
    for (const [index, name] of names.entries()) bins.push(await command('location.save', { name, warehouse, kind: 'bin', zone: zones?.[index] || '' }))
    const item = await command('item.save', { sku: `${seed}-${suffix}`, name: `${suffix} warehouse unit`, barcode: `${seed}-${suffix}-code`, unit: 'each', packSize: '1' })
    let po = await command('po.draft', { supplierId: supplier.id, promiseDate: '2026-11-01', reason: 'Warehouse journey stock', lines: [{ itemId: item.id, quantity: String(quantities.reduce((a, b) => a + b, 0)), price: '1' }] })
    await command('po.approve', { poId: po.id, version: po.version }); po = await command('po.commit', { poId: po.id, version: po.version })
    await command('receipt.create', { poId: po.id, supplierReference: `${seed}-${suffix}`, lines: bins.map((bin, index) => ({ poLineId: po.lines[0].id, locationId: bin.id, quantity: String(quantities[index]), cost: '1' })) })
    const carrier = await command('carrier.save', { name: `${seed}-${suffix} pickup`, warehouse, dock: 'Dock A', cutoff: '23:59', timeZone: 'America/Chicago' })
    return { warehouse, bins, item, carrier }
  }
  const newOrder = async (fixture: any) => {
    const order = await command('order.create', { customerId: customer.id, warehouse: fixture.warehouse, lines: [{ itemId: fixture.item.id, quantity: '2', price: '3' }] })
    await command('order.carrier', { orderId: order.id, carrierId: fixture.carrier.id }); return order
  }
  const release = async (mode: string, count: number) => {
    await page.goto(`${origin}/app#floor/pick`); await page.reload()
    await page.getByLabel('Picking method', { exact: true }).selectOption(mode)
    const saved = commandResult(page, 'wave.release')
    await page.getByRole('button', { name: `Release wave · Dock A · ${count} ${count === 1 ? 'order' : 'orders'}`, exact: true }).click()
    const body = await (await saved).json(); expect(body.ok, JSON.stringify(body)).toBe(true)
    const wave = body.result
    await page.locator('tr').filter({ hasText: `Wave ${wave.number} · Dock A` }).getByRole('button', { name: 'Open pick list', exact: true }).click()
    await expect(page.getByRole('heading', { name: `Pick list · Wave ${wave.number} · Dock A`, exact: true })).toBeVisible()
    return wave
  }
  const openPack = async (order: any) => {
    await page.goto(`${origin}/app#floor/pack`)
    await page.locator('tr').filter({ hasText: order.reference }).getByRole('button', { name: 'Pack this order', exact: true }).click()
    await expect(page.getByRole('heading', { name: `Pack ${order.reference}`, exact: true })).toBeVisible()
  }
  const measure = async () => {
    for (const [label, value] of [['Weight (lb)', '1'], ['Length (in)', '8'], ['Width (in)', '6'], ['Height (in)', '4']]) await page.getByLabel(label, { exact: true }).fill(value)
    const saved = commandResult(page, 'pack.measure'); await page.getByRole('button', { name: 'Save weight and size', exact: true }).click(); expect((await (await saved).json()).ok).toBe(true)
  }
  const closeAndDispatch = async (reference: string) => {
    let saved = commandResult(page, 'pack.close'); await page.getByRole('button', { name: 'Mark order packed', exact: true }).click(); expect((await (await saved).json()).ok).toBe(true)
    await page.getByLabel('Shipment reference', { exact: true }).fill(reference)
    saved = commandResult(page, 'pack.dispatch'); await page.getByRole('button', { name: 'Dispatch packed cartons', exact: true }).click(); expect((await (await saved).json()).ok).toBe(true)
  }
  const shot = async (name: string) => {
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
    if (process.env.PIER_SCREENSHOTS) { await mkdir(process.env.PIER_SCREENSHOTS, { recursive: true }); await page.screenshot({ path: join(process.env.PIER_SCREENSHOTS, `${width}-warehouse-${name}.png`), fullPage: true }) }
  }

  const zone = await prepare('zones', ['A-01', 'C-01'], [1, 1], ['East', 'West']), zonedOrder = await newOrder(zone)
  await page.goto(`${origin}/app#floor/pick`); await page.reload()
  await page.getByLabel('Bin to assign a zone', { exact: true }).selectOption(zone.bins[0].id)
  await page.getByLabel('Picking zone', { exact: true }).fill('East')
  let zoneSaved = commandResult(page, 'location.save'); await page.getByRole('button', { name: 'Save picking zone', exact: true }).click(); expect((await (await zoneSaved).json()).ok).toBe(true)
  const zonedWave = await release('zone', 1)
  await page.getByLabel('Pick zone', { exact: true }).selectOption('East')
  await expect(page.locator('.pick-task')).toContainText('A-01')
  await scan(page, 'Scan bin label', 'C-01'); await expect(page.getByRole('alert')).toContainText('Wrong bin')
  await expect(page.getByLabel('Scan item', { exact: true })).toHaveCount(0)
  await scan(page, 'Scan bin label', 'A-01')
  let rejected = commandResult(page, 'pick.scan'); await page.getByLabel('Scan item', { exact: true }).fill('C-01'); await page.getByLabel('Scan item', { exact: true }).press('Enter'); expect((await (await rejected).json()).ok).toBe(false)
  await scan(page, 'Scan item', zone.item.barcode, 'pick.scan')
  await shot('zone-selection')
  await openPack(zonedOrder); await scan(page, 'Scan item into carton 1', zone.item.barcode, 'pack.scan'); await measure()
  await expect(page.getByRole('button', { name: 'Mark order packed', exact: true })).toBeDisabled()
  await expect(page.getByRole('status').filter({ hasText: 'Waiting for zone contributions' })).toContainText('West')
  const popupEvent = page.waitForEvent('popup'); await page.getByRole('link', { name: 'Print packing slip', exact: true }).click()
  const slip = await popupEvent; await slip.waitForLoadState(); await expect(slip.locator('body')).toContainText(zonedOrder.reference); await slip.close()
  await shot('zone-merge-waiting')
  await page.goto(`${origin}/app#floor/pick`)
  await page.locator('tr').filter({ hasText: `Wave ${zonedWave.number} · Dock A` }).getByRole('button', { name: 'Open pick list', exact: true }).click()
  await page.getByLabel('Pick zone', { exact: true }).selectOption('West')
  await scan(page, 'Scan bin label', 'C-01'); await scan(page, 'Scan item', zone.item.barcode, 'pick.scan')
  await openPack(zonedOrder); await scan(page, 'Scan item into carton 1', zone.item.barcode, 'pack.scan')
  await expect(page.getByRole('cell', { name: 'Ready to merge', exact: true })).toHaveCount(2)
  await shot('zone-merge-complete'); await closeAndDispatch(`${seed}-merged`)

  const batch = await prepare('batch', ['B-03', 'B-09'], [20, 2]), orders = []
  for (let n = 0; n < 10; n++) orders.push(await newOrder(batch))
  const wave = await release('batch', 10)
  let saved = commandResult(page, 'pick.short'); await page.getByRole('button', { name: 'Bin empty or short', exact: true }).click(); expect((await (await saved).json()).ok).toBe(true)
  await expect(page.locator(`#document-${wave.id}`)).toContainText('Overflow B-09')
  await shot('overflow-and-totes')
  for (let n = 1; n < 10; n++) {
    await scan(page, 'Scan bin label', 'B-03')
    await page.getByLabel('Quantity for this scan (optional)', { exact: true }).fill(n === 9 ? '1' : '2')
    await scan(page, 'Scan item', batch.item.barcode, 'pick.scan')
    if (n === 9) { saved = commandResult(page, 'pick.short'); await page.getByRole('button', { name: 'Bin empty or short', exact: true }).click(); expect((await (await saved).json()).ok).toBe(true) }
  }
  await scan(page, 'Scan bin label', 'B-09'); await page.getByLabel('Quantity for this scan (optional)', { exact: true }).fill('2'); await scan(page, 'Scan item', batch.item.barcode, 'pick.scan')
  await shot('ten-picked-one-short')
  for (const [index, order] of orders.entries()) {
    await openPack(order)
    await expect(page.locator('section').filter({ has: page.getByRole('heading', { name: `Pack ${order.reference}`, exact: true }) }).last()).toContainText(`tote ${wave.orders.find((row: any) => row.orderId === order.id).tote}`)
    for (let unit = 0; unit < (index === 9 ? 1 : 2); unit++) await scan(page, 'Scan item into carton 1', batch.item.barcode, 'pack.scan')
    await measure(); await closeAndDispatch(`${seed}-batch-${index}`)
  }
  const state = await (await context.request.get(`${origin}/api/pier/state`)).json()
  expect(state.orders.filter((order: any) => orders.some(o => o.id === order.id) && order.lines.some((line: any) => line.dispatched !== line.quantity)).map((order: any) => order.id)).toEqual([orders[9].id])
  const shipments = state.shipments.filter((shipment: any) => orders.some(o => o.id === shipment.orderId))
  expect(shipments).toHaveLength(10)
  for (const shipment of shipments) for (const line of shipment.lines) expect(orders.find(o => o.id === shipment.orderId).lines.some((own: any) => own.id === line.orderLineId)).toBe(true)
  await shot('ten-shipped-short-order-open')
})
