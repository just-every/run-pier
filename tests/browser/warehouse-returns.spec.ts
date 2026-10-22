import { test, expect, type Page } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { ownerEntry } from './session'
// @ts-expect-error Actual sibling Worker/D1, reached through HTTP.
import { pantryInstallation } from '../api/pantry-installation.mjs'

test('warehouse partial receiving, transfers, counts and authorized or quarantined return scans at 1440 and 390', async ({ page, context, browser }) => {
  test.setTimeout(240_000)
  const origin = await ownerEntry(page), pantry = await pantryInstallation()
  const shots = process.env.PIER_SCREENSHOTS
  if (shots) await mkdir(shots, { recursive: true })
  const command = async (type: string, payload: object) => {
    const response = await context.request.post(`${origin}/api/pier/commands`, { headers: { origin }, data: { commandId: crypto.randomUUID(), type, payload } })
    const body = await response.json(); expect(body.ok, JSON.stringify(body)).toBe(true); return body.result
  }
  const state = async () => (await context.request.get(`${origin}/api/pier/state`)).json()
  const action = async (p: Page, type: string, click: () => Promise<unknown>) => {
    const reply = p.waitForResponse(r => r.url().endsWith('/api/pier/commands') && r.request().postDataJSON()?.type === type)
    await click(); expect((await (await reply).json()).ok).toBe(true)
    await expect(p.locator('main')).toHaveAttribute('aria-busy', 'false')
  }
  const shot = async (p: Page, width: number, name: string) => {
    expect(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
    if (shots) await p.screenshot({ path: join(shots, `${width}-warehouse-${name}.png`), fullPage: true })
  }
  let receiver
  try {
    await pantry.command('chart.start', {})
    const inventory = await pantry.command('account.save', { code: '1300', name: 'Inventory Asset', type: 'asset', subtype: 'other' })
    const cogs = await pantry.command('account.save', { code: '5000', name: 'Cost of Goods Sold', type: 'expense', subtype: 'other' })
    const damage = await pantry.command('account.save', { code: '5100', name: 'Damaged stock', type: 'expense', subtype: 'other' })
    const revenue = (await pantry.view('state')).accounts.find((a: any) => a.code === '4000')
    const grant = await pantry.command('integration.create', { name: 'Warehouse return journey', scopes: ['contacts:write','invoices:write','bills:write','journals:write','documents:write','payments:read','reports:read','post'] })
    // The runtime-issued integration grant remains in memory and is never logged.
    const connected = await context.request.post(`${origin}/api/pier/commands`, { headers: { origin }, data: { commandId: crypto.randomUUID(), type: 'book.connect', payload: { baseUrl: pantry.origin, integrationToken: grant.token, inventoryAccountId: inventory.id, cogsAccountId: cogs.id, revenueAccountId: revenue.id, writeOffAccountId: damage.id, taxCode: 'exempt' } } })
    expect(connected.ok()).toBe(true)
    expect((await connected.json()).ok).toBe(true)
    receiver = await browser.newContext()
    const receivePage = await receiver.newPage()
    await ownerEntry(receivePage)
    await receivePage.goto(`${origin}/auth/dev/enter?as=member`)
    await receivePage.waitForURL(url => url.pathname === '/app')
    const member = await (await receiver.request.get(`${origin}/auth/session`)).json()
    await command('role.set', { operatorId: member.operator.id, role: 'operator' })
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1000 }); await receivePage.setViewportSize({ width, height: 1000 })
      const item = await command('item.save', { sku: `synthetic-pier-${width+600}`, name: `Warehouse return mug ${width}`, unit: 'each', packSize: '1', barcode: `synthetic-pier-${width+601}` })
      const source = await command('location.save', { name: `Receiving ${width}`, warehouse: `Warehouse ${width}`, kind: 'bin', barcode: `synthetic-pier-${width+602}` })
      const destination = await command('location.save', { name: `Returns ${width}`, warehouse: `Warehouse ${width}`, kind: 'bin', barcode: `synthetic-pier-${width+603}` })
      const transit = await command('location.save', { name: `Van ${width}`, warehouse: `Transfer ${width}`, kind: 'transit' })
      const supplier = await command('party.save', { name: `Warehouse supplier ${width}`, kind: 'supplier' })
      const customer = await command('party.save', { name: `Warehouse customer ${width}`, kind: 'customer' })
      let po = await command('po.draft', { supplierId: supplier.id, destinationWarehouse: source.warehouse, promiseDate: '2026-11-01', reason: 'Partial delivery', lines: [{ itemId: item.id, quantity: '8', price: '2' }] })
      await command('po.approve', { poId: po.id, version: po.version }); po = await command('po.commit', { poId: po.id, version: po.version })
      await page.goto(`${origin}/app#floor/receive`); await page.reload()
      await page.getByLabel('Purchase order', { exact: true }).selectOption(po.id)
      await page.getByLabel('Put away to bin', { exact: true }).selectOption(source.id)
      await action(page, 'receiving.start', () => page.getByRole('button', { name: 'Start receiving', exact: true }).click())
      await page.getByLabel('Times scanned', { exact: true }).fill('6')
      const scan = page.getByRole('textbox', { name: 'Scan item or bin', exact: true })
      await scan.fill(item.barcode); await action(page, 'receiving.scan', () => scan.press('Enter'))
      await page.getByLabel('Supplier delivery reference', { exact: true }).fill(`synthetic-pier-receipt-${width}`)
      await action(page, 'receiving.post', () => page.getByRole('button', { name: 'Post receipt into bins', exact: true }).click())
      expect((await state()).purchaseOrders.find((p: any) => p.id === po.id).lines[0].received).toBe('6')
      await shot(page, width, 'partial-receipt')
      const bill = await command('supplierBill.save', { poId: po.id, reference: `synthetic-pier-bill-${width}`, date: new Date().toISOString().slice(0,10), quantityTolerancePercent: '0', priceTolerancePercent: '0', lines: [{ poLineId: po.lines[0].id, quantity: '6', unitPrice: '2' }] })
      await command('supplierBill.approve', { id: bill.id, version: bill.version, receiptEvidence: bill.match.receiptEvidence })
      await page.goto(`${origin}/app#transfers`); await page.reload()
      const transferForm = page.getByRole('heading', { name: 'Dispatch available stock to transit', exact: true }).locator('..')
      for (const [name, value] of [['Item', item.id], ['Source bin', source.id], ['Destination bin', destination.id], ['Transit location', transit.id]]) await transferForm.getByLabel(name, { exact: true }).selectOption(value)
      await transferForm.getByLabel('Quantity (base units)', { exact: true }).fill('1'); await transferForm.getByLabel('Transfer reason', { exact: true }).fill('Move one mug to returns bench')
      await action(page, 'transfer.send', () => transferForm.getByRole('button', { name: 'Dispatch transfer', exact: true }).click())
      await action(page, 'transfer.receive', () => page.getByRole('button', { name: 'Confirm full destination receipt', exact: true }).click())
      await shot(page, width, 'transfer-received')
      await page.goto(`${origin}/app#counts`); await page.reload()
      const startCount = page.getByRole('heading', { name: 'Capture bin count frontier', exact: true }).locator('..')
      await startCount.getByLabel('Bin', { exact: true }).selectOption(destination.id)
      await action(page, 'count.capture', () => startCount.getByRole('button', { name: 'Begin count', exact: true }).click())
      const physical = page.getByRole('heading', { name: 'Record physical quantities', exact: true }).locator('..')
      await physical.getByLabel(`${item.name} · ${item.sku} · sellable (each)`, { exact: true }).fill('1')
      await physical.getByLabel('Count evidence / reason', { exact: true }).fill('Physical receiving handoff agrees with shelf')
      await action(page, 'count.record', () => physical.getByRole('button', { name: 'Save physical count for review', exact: true }).click())
      await action(page, 'count.approve', () => page.getByRole('button', { name: /^Approve version .* adjustment$/ }).click())
      await shot(page, width, 'cycle-count')
      const order = await command('order.create', { customerId: customer.id, warehouse: source.warehouse, lines: [{ itemId: item.id, quantity: '4', price: '3' }] })
      await command('dispatch.create', { orderId: order.id, shipmentReference: `synthetic-pier-shipment-${width}`, lines: [{ orderLineId: order.lines[0].id, quantity: '4' }] })
      await page.goto(`${origin}/app#floor/returns`); await page.reload()
      await page.getByLabel('Return reason', { exact: true }).fill('Customer returned an intact mug')
      const binScan = page.getByRole('textbox', { name: 'Scan return bin', exact: true })
      await binScan.fill(destination.barcode); await binScan.press('Enter')
      await expect(page.getByLabel('Return bin', { exact: true })).toHaveValue(destination.id)
      const returnedScan = page.getByRole('textbox', { name: 'Scan order label or returned item', exact: true })
      await returnedScan.fill(item.barcode); await action(page, 'return.scan', () => returnedScan.press('Enter'))
      await expect(page.getByRole('status').filter({ hasText: 'Returned stock is sellable' })).toBeVisible()
      let current = await state()
      expect(current.positions.find((p: any) => p.itemId === item.id && p.locationId === destination.id && p.status === 'sellable').quantity).toBe('2')
      await shot(page, width, 'restocked-one-scan')
      await page.getByLabel('Condition', { exact: true }).selectOption('damaged'); await page.getByLabel('Disposition', { exact: true }).selectOption('writeoff')
      await page.getByLabel('Return reason', { exact: true }).fill('Crushed mug, approved damage write-off')
      await returnedScan.fill(item.barcode); await action(page, 'return.scan', () => returnedScan.press('Enter'))
      current = await state()
      const written = current.returns.find((r: any) => r.itemId === item.id && r.status === 'writtenoff')
      expect(written.writeOffAccountId).toBe(damage.id); expect(written.writeOffCostTotal).toBe('2.000000000000')
      await shot(page, width, 'mapped-writeoff')
      await receivePage.goto(`${origin}/app#floor/returns`); await receivePage.reload()
      for (const condition of ['sellable','damaged']) {
        await receivePage.getByLabel('Return bin', { exact: true }).selectOption(destination.id)
        await receivePage.getByLabel('Condition', { exact: true }).selectOption(condition)
        await receivePage.getByLabel('Disposition', { exact: true }).selectOption(condition === 'sellable' ? 'restock' : 'writeoff')
        await receivePage.getByLabel('Return reason', { exact: true }).fill(`Receiver intake ${condition}, needs inspector`)
        const input = receivePage.getByRole('textbox', { name: 'Scan order label or returned item', exact: true })
        await input.fill(item.barcode); await action(receivePage, 'return.scan', () => input.press('Enter'))
        await shot(receivePage, width, `unauthorized-${condition}`)
      }
      current = await state()
      const waiting = current.returns.filter((r: any) => r.itemId === item.id && r.receivedBy === member.operator.id)
      expect(waiting).toHaveLength(2); expect(waiting.every((r: any) => r.status === 'quarantine' && !r.inspectedBy && !r.writeOffAccountId)).toBe(true)
      await command('book.sync', {})
      const jobs = (await state()).bookJobs
      expect(jobs.find((j: any) => j.key === `return-writeoff:${written.id}`).status).toBe('posted')
    }
    const ledger = await pantry.view('reports/trial-balance')
    expect(ledger.balanced).toBe(true)
    expect(ledger.rows.find((r: any) => r.id === damage.id).net).toBe(400)
  } finally { await receiver?.close(); await pantry.close() }
})
