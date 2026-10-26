import { test, expect } from '@playwright/test'
import { mkdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { ownerEntry } from './session'
// @ts-expect-error Fixtures create records only through authenticated HTTP.
import { catalogueCsv, catalogueJourney } from '../api/catalogue-fixtures.mjs'

test('CAT-001: catalogue references, barcode search, metadata editing and bulk review at 1440 and 390', async ({ page, context }) => {
  const origin = await ownerEntry(page)
  const h = {
    command: async (type: string, payload: object) => {
      const response = await context.request.post(`${origin}/api/pier/commands`, { headers: { origin }, data: { commandId: crypto.randomUUID(), type, payload } })
      const body = await response.json(); expect(body.ok, JSON.stringify(body)).toBe(true); return body.result
    },
    preview: async (csv: string) => (await context.request.post(`${origin}/api/pier/catalogue/preview`, { headers: { origin }, data: { csv } })).json(),
  }
  const b = await catalogueJourney(h), blue = b.items[0]
  await h.command('item.save', { ...b.items[1], archived: true })
  const shots = process.env.PIER_SCREENSHOTS
  if (shots) await mkdir(shots, { recursive: true })
  for (const width of [1440, 390]) {
    const shot = async (name: string) => { if (shots) await page.screenshot({ path: join(shots, `${width}-catalogue-${name}.png`), fullPage: true }) }
    await page.setViewportSize({ width, height: 1000 })
    await page.goto(`${origin}/app`); await page.reload()
    await page.getByRole('navigation', { name: 'Stock operations' }).getByRole('link', { name: 'Stock', exact: true }).click()
    await page.getByRole('group', { name: 'Warehouse', exact: true }).getByRole('button', { name: 'All', exact: true }).click()
    const search = page.getByRole('textbox', { name: 'Search product, barcode or SKU', exact: true })
    for (const code of ['MUG-BLUE', '036000291452', '10036000291459', 'INNER-BLUE', 'SUP-BLUE', 'PC-BLUE', 'CAFE-B']) {
      await search.fill(code)
      await expect(page.locator('.stock-table').getByRole('row').filter({ hasText: 'Blue stoneware mug' })).toHaveCount(1)
      await expect(page.locator('.stock-table').getByRole('row').filter({ hasText: 'White stoneware mug' })).toHaveCount(0)
    }
    await search.fill('PC-SHARED')
    await expect(page.locator('.stock-table tbody').getByRole('row')).toHaveCount(2)
    await page.getByLabel('Archive filter', { exact: true }).selectOption('archived')
    await expect(page.locator('.stock-table tbody').getByRole('row')).toHaveCount(1)
    await expect(page.locator('.stock-table')).toContainText('White stoneware mug')
    await page.getByLabel('Archive filter', { exact: true }).selectOption('')
    await search.fill('CAFE-B')
    await page.getByLabel('Category filter', { exact: true }).selectOption('Drinkware')
    await page.getByLabel('Variant family filter', { exact: true }).selectOption('Stoneware mugs')
    await shot('search')
    await page.getByRole('button', { name: 'Blue stoneware mug', exact: true }).click()
    await page.getByText('Catalogue details · MUG-BLUE', { exact: true }).click()
    await expect(page.getByText('4 × 3 × 4.5 in', { exact: true })).toBeVisible()
    await expect(page.getByText('CAFE-B', { exact: true })).toBeVisible()
    await shot('details')
    await page.getByRole('button', { name: 'Edit item', exact: true }).click()
    const editor = page.locator('#item-editor')
    await expect(editor.getByLabel('Variant family', { exact: true })).toHaveValue('Stoneware mugs')
    await editor.getByLabel('Weight (lb)', { exact: true }).fill(width === 1440 ? '0.8' : '0.75')
    await shot('editor')
    await editor.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(editor).toHaveCount(0)
    await page.getByText('Bulk import or edit catalogue CSV', { exact: true }).click()
    const file = page.getByLabel('Catalogue CSV file', { exact: true })
    const bad = catalogueCsv([{ sku: 'COLLISION', name: 'Duplicate code', unit: 'each', packSize: '1', barcode: '0036000291452' }])
    await file.setInputFiles({ name: 'collision.csv', mimeType: 'text/csv', buffer: Buffer.from(bad) })
    await page.getByRole('button', { name: 'Preview catalogue changes', exact: true }).click()
    await expect(page.getByRole('alert').filter({ hasText: 'COLLISION' })).toContainText('MUG-BLUE')
    await expect(page.getByRole('button', { name: 'Approve and apply catalogue changes', exact: true })).toBeDisabled()
    await shot('collision')
    const csv = catalogueCsv([{ sku: blue.sku, name: 'Blue stoneware mug', unit: 'each', packSize: '12', category: 'Drinkware', weight: width === 1440 ? '0.85' : '0.9' }])
    await file.setInputFiles({ name: 'catalogue-update.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) })
    await page.getByRole('button', { name: 'Preview catalogue changes', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Review catalogue changes', exact: true })).toBeVisible()
    await page.getByText('Inspect proposed item', { exact: true }).click()
    await shot('preview')
    await page.getByRole('button', { name: 'Approve and apply catalogue changes', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Review catalogue changes', exact: true })).toHaveCount(0)
    const savedState = await (await context.request.get(`${origin}/api/pier/state`)).json()
    expect(savedState.items.find((item: any) => item.id === blue.id).weight).toBe(width === 1440 ? '0.85' : '0.9')
    await shot('applied')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)
  }
  let routing = await h.command('routing.save', {source:'manual',mode:'fixed',shortage:'hold',eligible:['Dallas']})
  routing = await h.command('routing.preview',{ruleId:routing.id,version:routing.version}); await h.command('routing.activate',{ruleId:routing.id,version:routing.version})
  let po = await h.command('po.draft', { supplierId: b.supplier.id, destinationWarehouse: 'Dallas', promiseDate: '2026-11-01', reason: 'Shared BOL return journey', lines: [{ itemId: blue.id, quantity: '6', price: '2.5' }] })
  await h.command('po.approve', { poId: po.id, version: po.version })
  po = await h.command('po.commit', { poId: po.id, version: po.version })
  await h.command('receipt.create', { poId: po.id, supplierReference: 'Catalogue delivery', lines: [{ poLineId: po.lines[0].id, locationId: b.location.id, quantity: '6', cost: '2.5' }] })
  for (let index = 0; index < 2; index++) {
    const order = await h.command('order.create', { customerId: b.customer.id, warehouse: 'Dallas', promiseDate: '2026-11-01', lines: [{ itemId: blue.id, quantity: '1', price: '5' }] })
    await h.command('dispatch.create', { orderId: order.id, shipmentReference: 'CONSOLIDATED-BOL', lines: [{ orderLineId: order.lines[0].id, quantity: '1' }] })
  }
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 })
    await page.goto(`${origin}/app`)
    await page.getByRole('navigation', { name: 'Stock operations' }).getByRole('link', { name: 'Floor', exact: true }).click()
    await page.getByRole('navigation', { name: 'Floor steps' }).getByRole('link', { name: 'Returns', exact: true }).click()
    const scan = page.getByRole('textbox', { name: 'Scan order label or returned item', exact: true })
    const shipment = (await (await context.request.get(`${origin}/api/pier/state`)).json()).shipments.find((row: any) => row.reference === 'CONSOLIDATED-BOL')
    await scan.fill(shipment.barcode); await scan.press('Enter')
    await expect(page.getByRole('heading', { name: 'Confirm scanned return', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Use this dispatch', exact: true })).toHaveCount(0)
    if (shots) await page.screenshot({ path: join(shots, `${width}-catalogue-shipment-barcode.png`), fullPage: true })
    await page.reload()
    await scan.fill('CONSOLIDATED-BOL'); await scan.press('Enter')
    await expect(page.getByRole('button', { name: 'Use this dispatch', exact: true })).toHaveCount(2)
    await expect(page.getByRole('heading', { name: 'Confirm scanned return', exact: true })).toHaveCount(0)
    if (shots) await page.screenshot({ path: join(shots, `${width}-catalogue-shared-bol-choose.png`), fullPage: true })
    await page.getByRole('button', { name: 'Use this dispatch', exact: true }).first().click()
    await expect(page.getByRole('heading', { name: 'Confirm scanned return', exact: true })).toBeVisible()
    if (shots) await page.screenshot({ path: join(shots, `${width}-catalogue-shared-bol-selected.png`), fullPage: true })
  }
  expect((await (await context.request.get(`${origin}/api/pier/state`)).json()).returns).toHaveLength(0)
  await page.getByLabel('Return bin', { exact: true }).selectOption(b.location.id)
  await page.getByLabel('Return reason', { exact: true }).fill('Customer returned the supplier half-unit pack')
  await page.getByRole('textbox', { name: 'Scan order label or returned item', exact: true }).fill('SUP-BLUE')
  await page.getByRole('textbox', { name: 'Scan order label or returned item', exact: true }).press('Enter')
  await expect(page.getByRole('heading', { name: 'Confirm scanned return', exact: true })).toHaveCount(0)
  const returned = (await (await context.request.get(`${origin}/api/pier/state`)).json()).returns
  expect(returned).toHaveLength(1)
  expect(returned[0].quantity).toBe('0.5')

})

test('owner typed-field controls define, edit, import and filter every record type with custody refusal at 1440 and 390', async ({ page, context, browser }) => {
  const origin = await ownerEntry(page)
  const command = async (type: string, payload: object) => {
    const response = await context.request.post(origin + '/api/pier/commands', { headers: { origin }, data: { commandId: crypto.randomUUID(), type, payload } })
    const body = await response.json(); expect(body.ok, JSON.stringify(body)).toBe(true); return body.result
  }
  const suffix = crypto.randomUUID().slice(0,8)
  await command('location.save', { name: 'Typed fields ' + suffix, warehouse: 'Dallas', kind: 'bin' })
  const item = await command('item.save', { sku: 'synthetic-pier-fields-' + suffix, name: 'Typed field item', unit: 'each', packSize: '1' })
  const customer = await command('party.save', { kind: 'customer', name: 'Typed field customer' })
  const supplier = await command('party.save', { kind: 'supplier', name: 'Typed field supplier' })
  const order = await command('order.create', { customerId: customer.id, warehouse: 'Dallas', promiseDate: '2026-11-01', lines: [{ itemId: item.id, quantity: '1' }] })
  const shots = process.env.PIER_SCREENSHOTS
  if (shots) await mkdir(shots, { recursive: true })
  for (const width of [1440, 390]) {
    const shot = async (name: string) => { if (shots) await page.screenshot({ path: join(shots, width + '-fields-' + name + '.png'), fullPage: true }) }
    await page.setViewportSize({ width, height: 1000 })
    await page.goto(origin + '/app#activity'); await page.getByRole('link', { name: 'Custom fields', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Custom fields', exact: true })).toBeVisible()
    for (const [kind, record, type, value] of [['item', item, 'text', 'synthetic-pier-private'], ['customer', customer, 'boolean', 'false'], ['supplier', supplier, 'number', '1.25'], ['order', order, 'date', '2026-11-02'], ['item', item, 'choice', 'blue']] as const) {
      const key = 'field_' + width + '_' + type + '_' + suffix
      await page.getByLabel('Record type', { exact: true }).selectOption(kind)
      await page.getByText('Define a custom field', { exact: true }).click()
      await page.getByLabel('Field key', { exact: true }).fill(key)
      await page.getByLabel('Field label', { exact: true }).fill(kind + ' ' + type + ' attribute ' + width + ' ' + suffix)
      await page.getByLabel('Field type', { exact: true }).selectOption(type)
      if (type === 'choice') await page.getByLabel('Choices (one per line)', { exact: true }).fill('blue\ngreen')
      await page.getByRole('button', { name: 'Define field', exact: true }).click()
      await expect(page.getByRole('button', { name: 'Define field', exact: true })).toBeEnabled()
      await page.getByLabel('Field record', { exact: true }).selectOption(record.id)
      const input = page.getByLabel(kind + ' ' + type + ' attribute ' + width + ' ' + suffix, { exact: true })
      if (type === 'boolean' || type === 'choice') await input.selectOption(value); else await input.fill(value)
      await page.getByRole('button', { name: 'Save field values', exact: true }).click()
      await expect(page.getByRole('button', { name: 'Save field values', exact: true })).toBeEnabled()
      await expect(input).toHaveValue(value)
      const saved = await (await context.request.get(origin + '/api/pier/state')).json()
      const savedRecord = (kind === 'item' ? saved.items : kind === 'order' ? saved.orders : saved.parties).find((r: any) => r.id === record.id)
      expect(savedRecord.customFields[key]).toBe(type === 'boolean' ? false : value)
      const definition = saved.customFieldDefinitions.find((d: any) => d.ownerType === kind && d.key === key)
      await page.getByLabel('Filter field', { exact: true }).selectOption(definition.id)
      const filter = page.getByLabel('Filter value', { exact: true })
      if (type === 'boolean' || type === 'choice') await filter.selectOption(value); else await filter.fill(value)
      await page.getByRole('button', { name: 'Filter records', exact: true }).click()
      await expect(page.getByText('1 matching records', { exact: true })).toBeVisible()
      await shot(kind + '-filtered')
      const upload = async (content: string) => page.getByLabel('Field JSON file', { exact: true }).setInputFiles({ name: 'synthetic-pier-fields.json', mimeType: 'application/json', buffer: Buffer.from(content) })
      await upload('{')
      await expect(page.getByRole('alert')).toBeVisible()
      const importedValue = type === 'boolean' ? true : type === 'number' ? '2.5' : type === 'date' ? '2026-11-03' : type === 'choice' ? 'green' : 'synthetic-pier-imported'
      await upload(JSON.stringify([{ ownerType: kind, recordId: record.id, version: savedRecord.version, values: { [key]: importedValue } }]))
      await expect(page.getByRole('heading', { name: 'Review field import', exact: true })).toBeVisible()
      await shot(kind + '-import-review')
      await page.getByRole('button', { name: 'Approve field import', exact: true }).click()
      await expect(page.getByRole('heading', { name: 'Review field import', exact: true })).toHaveCount(0)
      await expect(input).toHaveValue(String(importedValue))
      const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download field records', exact: true }).click()])
      const downloaded = JSON.parse(await readFile((await download.path())!, 'utf8'))
      expect(downloaded.find((r: any) => r.recordId === record.id).values[key]).toBe(importedValue)
      await page.getByText('Define a custom field', { exact: true }).click()
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
    }
    await page.goto(origin + '/app#activity')
    await page.getByText('Retention and erasure', { exact: true }).click()
    await page.getByLabel('Erasure subject kind', { exact: true }).selectOption('customer')
    await page.getByLabel('Erasure subject', { exact: true }).selectOption(customer.id)
    await page.getByRole('button', { name: 'Inspect erasure dependencies', exact: true }).click()
    await expect(page.getByRole('alert').filter({ hasText: 'Erasure refused: subject attribution' })).toBeVisible()
    await shot('erasure-refusal')
    await page.getByRole('button', { name: 'Record erasure refusal', exact: true }).click()
    await expect(page.getByRole('alert').filter({ hasText: 'No content was deleted by this request.' }).first()).toBeVisible()
    await page.getByLabel('Document identity filter', { exact: true }).fill('')
    await expect(page.getByRole('table').filter({ hasText: 'Privacy.eraseSubject' })).toContainText('Refused')
    await shot('activity-refused')
  }
  const staff = await browser.newContext()
  try {
    const denied = await staff.newPage()
    await denied.goto(process.env.PIER_OPEN!.replace('as=owner', 'as=member'))
    await denied.waitForURL(url => url.pathname === '/app' && !url.hash.includes('rer-dev'))
    for (const width of [1440, 390]) {
      await denied.setViewportSize({ width, height: 1000 }); await denied.goto(origin + '/app#activity/custom-fields')
      await expect(denied.getByRole('status').filter({ hasText: 'Only the current owner' })).toBeVisible()
      await expect(denied.getByLabel('Field record', { exact: true })).toHaveCount(0)
      if (shots) await denied.screenshot({ path: join(shots, width + '-fields-denied.png'), fullPage: true })
    }
  } finally { await staff.close() }
})
