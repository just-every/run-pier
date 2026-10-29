import { expect, type Browser, type BrowserContext, type Page, type Locator } from '@playwright/test'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
// @ts-expect-error The independent PDF parser reads downloaded bytes.
import { pdfText } from '../api/pdf-text.mjs'

type Options = { page: Page; context: BrowserContext; browser: Browser; origin: string; suffix: string; item: any; customer: any; supplier: any; order: any; location: any; command: (type: string, payload: object) => Promise<any> }

/** Continue the typed-field journey through the retained document and original doors. */
export async function retainedFieldCustody({ page, context, browser, origin, suffix, item, customer, supplier, order, location, command }: Options) {
  const state = async () => (await context.request.get(origin + '/api/pier/state')).json()
  const external: string[] = []
  const observe = (request: { url: () => string }) => {
    const url = new URL(request.url())
    if (['http:', 'https:'].includes(url.protocol) && url.origin !== origin) external.push(url.origin)
  }
  context.on('request', observe)
  const screens = async (target: Page, name: string, subject: Locator) => {
    if (!process.env.PIER_SCREENSHOTS) return
    for (const width of [1440, 390]) {
      await target.setViewportSize({ width, height: 1000 })
      await subject.screenshot({ path: join(process.env.PIER_SCREENSHOTS, width + '-custody-' + name + '.png'), fullPage: true })
    }
    await target.setViewportSize({ width: 1440, height: 1000 })
  }
  await page.setViewportSize({ width: 1440, height: 1000 })
  let po = await command('po.draft', { supplierId: supplier.id, destinationWarehouse: 'Dallas', promiseDate: '2026-11-01', reason: 'Synthetic retained field documents', lines: [{ itemId: item.id, quantity: '4', price: '2.5' }] })
  await command('po.approve', { poId: po.id, version: po.version })
  po = await command('po.commit', { poId: po.id, version: po.version })
  await command('receipt.create', { poId: po.id, supplierReference: 'synthetic-pier-custody', lines: [{ poLineId: po.lines[0].id, locationId: location.id, quantity: '4', cost: '2.5' }] })
  po = (await state()).purchaseOrders.find((row: any) => row.id === po.id)
  let packedOrder = await command('order.create', { customerId: customer.id, warehouse: 'Dallas', promiseDate: '2026-11-01', lines: [{ itemId: item.id, quantity: '1', price: '5' }] })
  packedOrder = await command('customField.set', { ownerType: 'order', recordId: packedOrder.id, version: packedOrder.version, values: (await state()).orders.find((row: any) => row.id === order.id).customFields })
  const carrier = await command('carrier.save', { name: 'Synthetic custody ' + suffix, warehouse: 'Dallas', timeZone: 'America/Chicago', cutoff: '16:00', dock: 'Synthetic dock' })
  let wave = await command('wave.release', { carrierId: carrier.id, orderIds: [packedOrder.id] })
  wave = await command('pick.scan', { waveId: wave.id, lineId: wave.lines[0].id, binCode: location.name, itemCode: item.sku })
  await command('pack.scan', { waveId: wave.id, orderId: packedOrder.id, code: item.sku })
  await command('pack.measure', { waveId: wave.id, orderId: packedOrder.id, carton: 1, weight: '1', length: '4', width: '4', height: '4' })
  const pack = await command('pack.close', { waveId: wave.id, orderId: packedOrder.id })

  // A real Worker refusal, followed by owner setup and the same public action.
  await page.goto(origin + '/app#sales')
  await page.getByText('Business documents and templates', { exact: true }).click()
  await page.getByLabel('Business document kind', { exact: true }).selectOption('purchase-order')
  await page.getByLabel('Business document source', { exact: true }).selectOption(po.id)
  await page.getByRole('button', { name: 'Generate exact PDF', exact: true }).click()
  await expect(page.getByRole('alert').filter({ hasText: 'Add your business name and address' })).toBeVisible()
  expect((await state()).salesDocuments).toHaveLength(0)
  await screens(page, 'document-error', page.getByRole('alert').filter({ hasText: 'Add your business name and address' }))
  await command('business.save', { name: 'Synthetic Pier custody', address: '1 Synthetic Pier Road', shipTo: {} })
  await page.reload()
  await page.getByText('Business documents and templates', { exact: true }).click()
  const documents: any[] = []
  for (const [kind, source, sourceKind, expectedField] of [
    ['purchase-order', po, 'purchaseOrders', 'Field_1440_number_' + suffix + ': 2.5'],
    ['packing-slip', pack, 'packs', '2026-11-03'],
  ] as const) {
    await page.getByLabel('Business document kind', { exact: true }).selectOption(kind)
    await page.getByLabel('Business document source', { exact: true }).selectOption(source.id)
    const generated = page.waitForResponse(response => response.url().endsWith('/api/pier/commands') && response.request().postDataJSON()?.type === 'print.generate')
    await page.getByRole('button', { name: 'Generate exact PDF', exact: true }).click()
    const result = await (await generated).json()
    expect(result.ok).toBe(true)
    const document = result.result
    documents.push(document)
    const template = (await (await context.request.get(origin + '/api/pier/print')).json()).templates.find((row: any) => row.kind === kind)
    expect(document.templateId).toBe(template.id)
    expect(document.templateVersion).toBe(template.version)
    const row = page.getByRole('row').filter({ hasText: document.filename })
    await row.getByText('Inspect document identity', { exact: true }).click()
    await expect(row).toContainText(document.id)
    await expect(row).toContainText(sourceKind + ' · ' + source.id)
    await expect(row).toContainText('Record ' + source.version + ' · template ' + document.templateVersion)
    await expect(row).toContainText(document.templateId)
    await expect(page.getByText('Field-bearing PDFs remain owner-only.', { exact: false })).toBeVisible()
    const [download] = await Promise.all([page.waitForEvent('download'), row.getByRole('link', { name: 'Download exact PDF', exact: true }).click()])
    expect(download.suggestedFilename()).toBe(document.filename)
    const bytes = await readFile((await download.path())!)
    expect(bytes).toEqual(Buffer.from(document.pdf, 'base64'))
    const text = await pdfText(bytes)
    expect(text).toContain('synthetic-pier-imported')
    expect(text).toContain(expectedField)
    expect(text).toContain('Record version ' + source.version)
    expect(text).toContain('Template version ' + document.templateVersion)
    const [reprint] = await Promise.all([page.waitForEvent('popup'), row.getByRole('link', { name: 'Open exact PDF', exact: true }).click()])
    await reprint.waitForURL(origin + '/api/pier/sales-documents/' + document.id + '.pdf')
    const retained = await context.request.get(reprint.url())
    expect(retained.status()).toBe(200)
    expect(await retained.body()).toEqual(bytes)
    await reprint.close()
    await screens(page, kind, row)
  }
  // A later live edit must not rewrite either retained PDF or its provenance.
  const current = (await state()).items.find((row: any) => row.id === item.id)
  await command('customField.set', { ownerType: 'item', recordId: item.id, version: current.version, values: { ...current.customFields, ['field_1440_text_' + suffix]: 'synthetic-pier-later-value' } })
  for (const document of documents) {
    const retained = await context.request.get(origin + '/api/pier/sales-documents/' + document.id + '.pdf')
    expect(await retained.body()).toEqual(Buffer.from(document.pdf, 'base64'))
  }

  await page.goto(origin + '/app#imports')
  await page.getByText('Import Pier native CSV instead', { exact: true }).click()
  const capture = page.getByRole('heading', { name: 'Capture native CSV files', exact: true }).locator('..')
  const file = capture.getByLabel('Original CSV files', { exact: true })
  await file.setInputFiles({ name: 'synthetic-pier-invalid.csv', mimeType: 'text/csv', buffer: Buffer.from([255]) })
  await expect(page.getByRole('alert').filter({ hasText: 'not valid UTF-8' })).toBeVisible()
  await screens(page, 'original-error', page.getByRole('alert').filter({ hasText: 'not valid UTF-8' }))
  const filename = 'synthetic-pier-original-' + suffix + '.csv'
  const fieldValue = 'synthetic-pier-retained-original'
  const metadata = JSON.stringify({ customFields: { ['field_1440_text_' + suffix]: fieldValue } })
  const csv = 'key,sku,name,barcode,unit,packSize,metadata\r\n' + ['original', 'synthetic-pier-original-' + suffix, 'Retained typed original', '', 'each', '1', metadata].map(value => '"' + value.replaceAll('"', '""') + '"').join(',') + '\r\n'
  const originalBytes = Buffer.from(csv, 'utf8'), digest = createHash('sha256').update(originalBytes).digest('hex')
  await file.setInputFiles({ name: filename, mimeType: 'text/csv', buffer: originalBytes })
  await expect(page.getByRole('alert').filter({ hasText: 'not valid UTF-8' })).toHaveCount(0)
  await capture.getByLabel('Native record type', { exact: true }).selectOption('items')
  for (const [label, value] of [['Source namespace', 'synthetic-pier-custody-' + suffix], ['Source version', 'synthetic-pier-1'], ['Exported at (ISO timestamp)', '2026-10-01T12:00:00Z'], ['Export filters / scope', 'Synthetic typed item'], ['Cutoff timezone', 'UTC'], ['Mapping revision', 'synthetic-pier-1']]) await capture.getByLabel(label, { exact: true }).fill(value)
  const staged = page.waitForResponse(response => response.url().endsWith('/api/pier/commands') && response.request().postDataJSON()?.type === 'import.stage')
  await capture.getByRole('button', { name: 'Stage files without changing live stock', exact: true }).click()
  const result = await (await staged).json()
  expect(result.ok).toBe(true)
  const batch = result.result
  expect(batch.errors).toEqual([])
  const panel = page.locator('[id="document-' + batch.id + '"]')
  await panel.getByText('Inspect mappings, originals and source rows', { exact: true }).click()
  await expect(panel).toContainText(filename)
  await expect(panel).toContainText('SHA-256 ' + digest + ' · ' + originalBytes.length + ' bytes')
  await expect(panel).toContainText('Only the current owner can retrieve retained originals.')
  await panel.getByText('Inspect mapped fields', { exact: true }).click()
  await expect(panel).toContainText(fieldValue)
  const originalLink = panel.getByRole('link', { name: 'Download retained original CSV', exact: true })
  const originalUrl = new URL((await originalLink.getAttribute('href'))!, origin).href
  const [download] = await Promise.all([page.waitForEvent('download'), originalLink.click()])
  expect(download.suggestedFilename()).toBe(filename)
  expect(await readFile((await download.path())!)).toEqual(originalBytes)
  const original = await context.request.get(originalUrl)
  expect(original.status()).toBe(200)
  expect(original.headers()['cache-control']).toBe('no-store')
  expect(await original.body()).toEqual(originalBytes)
  await screens(page, 'original-retained', panel)

  const staff = await browser.newContext()
  staff.on('request', observe)
  try {
    const denied = await staff.newPage()
    await denied.setViewportSize({ width: 1440, height: 1000 })
    await denied.goto(process.env.PIER_OPEN!.replace('as=owner', 'as=member'))
    await denied.waitForURL(url => url.pathname === '/app' && !url.hash.includes('rer-dev'))
    const staffActor = (await (await staff.request.get(origin + '/api/pier/state')).json()).actor
    const privatePaths = [originalUrl, ...documents.map(document => origin + '/api/pier/sales-documents/' + document.id + '.pdf')]
    const refuseDownloads = async () => {
      for (const path of privatePaths) {
        const response = await staff.request.get(path)
        expect(response.status()).toBe(403)
        expect(await response.text()).not.toContain(fieldValue)
        expect(await response.text()).not.toContain('synthetic-pier-imported')
      }
    }
    const deniedScreens = async (prefix: string) => {
      await denied.goto(origin + '/app#imports')
      await expect(denied.getByRole('status').filter({ hasText: 'Only the current owner can inspect native imports' })).toBeVisible()
      await expect(denied.getByRole('link', { name: 'Download retained original CSV', exact: true })).toHaveCount(0)
      await expect(denied.locator('body')).not.toContainText(fieldValue)
      await screens(denied, prefix + '-original-denied', denied.getByRole('status').filter({ hasText: 'Only the current owner can inspect native imports' }).locator('..'))
      await denied.goto(origin + '/app#sales')
      await expect(denied.getByRole('status').filter({ hasText: 'Only the current owner can generate or retrieve' })).toBeVisible()
      await expect(denied.getByRole('button', { name: 'Generate exact PDF', exact: true })).toHaveCount(0)
      await screens(denied, prefix + '-document-denied', denied.getByRole('status').filter({ hasText: 'Only the current owner can generate or retrieve' }).locator('..'))
    }
    await refuseDownloads()
    await deniedScreens('staff')
    await command('role.set', { operatorId: staffActor.id, role: 'owner' })
    try {
      await denied.goto(origin + '/app#sales')
      await denied.getByText('Business documents and templates', { exact: true }).click()
      await denied.getByLabel('Business document kind', { exact: true }).selectOption('purchase-order')
      await denied.getByLabel('Business document source', { exact: true }).selectOption(po.id)
      const generated = denied.waitForResponse(response => response.url().endsWith('/api/pier/commands') && response.request().postDataJSON()?.type === 'print.generate')
      await denied.getByRole('button', { name: 'Generate exact PDF', exact: true }).click()
      const response = await generated, ownedResult = await response.json(), recoveredCommand = response.request().postDataJSON()
      expect(ownedResult.ok).toBe(true)
      await expect(denied.getByRole('button', { name: 'Generate exact PDF', exact: true })).toBeEnabled()
      expect(await (await staff.request.get(originalUrl)).body()).toEqual(originalBytes)
      expect(await (await staff.request.get(origin + '/api/pier/sales-documents/' + ownedResult.result.id + '.pdf')).body()).toEqual(Buffer.from(ownedResult.result.pdf, 'base64'))
      await denied.getByLabel('Business document source', { exact: true }).selectOption(po.id)
      await command('role.set', { operatorId: staffActor.id, role: 'viewer' })
      const before = await state()
      await denied.getByRole('button', { name: 'Generate exact PDF', exact: true }).click()
      await expect(denied.getByRole('alert').filter({ hasText: 'Your current role cannot perform this command.' })).toBeVisible()
      await screens(denied, 'revoked-prepared-document', denied.getByRole('alert').filter({ hasText: 'Your current role cannot perform this command.' }))
      const recovered = await staff.request.post(origin + '/api/pier/commands', { headers: { origin }, data: recoveredCommand })
      expect(recovered.status()).toBe(403)
      expect(await recovered.text()).not.toContain('synthetic-pier-later-value')
      await refuseDownloads()
      await deniedScreens('revoked')
      const after = await state()
      expect(after.salesDocuments).toEqual(before.salesDocuments)
      expect(after.imports).toEqual(before.imports)
      expect(after.correspondence).toEqual(before.correspondence)
      expect(after.deliveries).toEqual(before.deliveries)
    } finally {
      await command('role.set', { operatorId: staffActor.id, role: 'viewer' })
    }
    expect(await (await context.request.get(originalUrl)).body()).toEqual(originalBytes)
    expect(external).toEqual([])
  } finally {
    context.off('request', observe)
    await staff.close()
  }
}
