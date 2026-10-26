import { expect, type Browser, type BrowserContext, type Page } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { ownerEntry } from './session'

const section = (page: Page, title: string) => page.locator('section.panel').filter({ has: page.getByRole('heading', { name: title, exact: true }) }).last()
async function submit(page: Page, form: ReturnType<typeof section>, title: string, type: string) {
  const response = page.waitForResponse(response => response.url().endsWith('/api/pier/commands') && response.request().method() === 'POST' && response.request().postDataJSON().type === type)
  await form.getByRole('button', { name: title, exact: true }).click()
  const result = await response, body = await result.json()
  expect(result.status(), JSON.stringify(body)).toBe(200)
  await expect(page.locator('main[aria-busy="true"]')).toHaveCount(0)
  return body.result
}

export async function roleAccessJourney({ page, context, browser }: { page: Page; context: BrowserContext; browser: Browser }) {
  const origin = await ownerEntry(page), shots = process.env.PIER_SCREENSHOTS
  if (shots) await mkdir(shots, { recursive: true })
  const command = async (type: string, payload: any) => {
    const response = await context.request.post(origin + '/api/pier/commands', { headers: { origin }, data: { commandId: crypto.randomUUID(), type, payload } })
    const body = await response.json(); expect(response.status(), JSON.stringify(body)).toBe(200); return body.result
  }
  const staffContext = await browser.newContext()
  try {
    const staff = await staffContext.newPage()
    await staff.goto(process.env.PIER_OPEN!.replace('as=owner', 'as=member'))
    await staff.waitForURL(url => url.pathname === '/app' && !url.hash.includes('rer-dev'))
    const session = await (await staffContext.request.get(origin + '/auth/session')).json()
    const staffId = session.operator.id
    for (const width of [1440, 390]) {
      const tag = `synthetic-pier-${width}-${crypto.randomUUID().slice(0, 6)}`, warehouse = `West ${tag}`
      const item = await command('item.save', { sku: tag, name: 'Stoneware coffee mug', unit: 'each', packSize: '1', barcode: tag + '-unit' })
      const bin = await command('location.save', { name: 'A-14 ' + tag, warehouse, kind: 'bin', barcode: tag + '-bin' })
      const foreign = await command('location.save', { name: 'B-03 ' + tag, warehouse: 'East ' + tag, kind: 'bin' })
      const supplier = await command('party.save', { name: 'Harbor Ceramics ' + tag, kind: 'supplier' })
      const customer = await command('party.save', { name: 'Cedar Cafe ' + tag, kind: 'customer' })
      let route = await command('routing.save', { source: 'manual', mode: 'fixed', shortage: 'hold', eligible: [warehouse] })
      route = await command('routing.preview', { ruleId: route.id, version: route.version })
      await command('routing.activate', { ruleId: route.id, version: route.version })
      let po = await command('po.draft', { supplierId: supplier.id, destinationWarehouse: warehouse, promiseDate: '2099-01-01', reason: 'Restock coffee service', lines: [{ itemId: item.id, quantity: '6', price: '19.37' }] })
      await command('po.approve', { poId: po.id, version: po.version })
      po = await command('po.commit', { poId: po.id, version: po.version })
      await command('role.set', { operatorId: staffId, role: 'warehouse', permissions: { warehouses: [warehouse], locationIds: [bin.id], expiresAt: '2099-01-01T00:00:00Z' } })
      await staff.setViewportSize({ width, height: 1000 })
      const shot = async (name: string, target = staff) => {
        await expect(target.locator('body')).toHaveJSProperty('scrollWidth', width)
        const empty = await target.locator('button:visible').evaluateAll(buttons => buttons.filter(button => !button.textContent?.trim()).length)
        expect(empty).toBe(0)
        if (shots) await target.screenshot({ path: join(shots, `${width}-roles-${name}.png`), fullPage: target !== page })
      }
      await staff.goto(origin + '/app#floor/receive'); await staff.reload()
      let form = section(staff, 'Receive a purchase order by scanning')
      await form.getByLabel('Purchase order', { exact: true }).selectOption(po.id)
      await form.getByLabel('Put away to bin', { exact: true }).selectOption(bin.id)
      await submit(staff, form, 'Start receiving', 'receiving.start')
      const scan = async (label: string, code: string, type: string) => {
        const saved = staff.waitForResponse(response => response.url().endsWith('/api/pier/commands') && response.request().method() === 'POST' && response.request().postDataJSON().type === type)
        await staff.getByLabel(label, { exact: true }).fill(code)
        await staff.getByLabel(label, { exact: true }).press('Enter')
        const response = await saved, body = await response.json()
        expect(response.status(), JSON.stringify(body)).toBe(200)
        await expect(staff.locator('main[aria-busy="true"]')).toHaveCount(0)
        return body.result
      }
      await staff.getByLabel('Times scanned', { exact: true }).fill('6')
      await scan('Scan item or bin', item.barcode, 'receiving.scan')
      await expect(staff.getByLabel('Freight on this delivery (USD)', { exact: true })).toHaveCount(0)
      await expect(staff.locator('main')).not.toContainText(customer.name)
      await expect(staff.locator('main')).not.toContainText('19.37')
      await shot('receiving')
      form = section(staff, 'Post this receipt')
      await form.getByLabel('Supplier delivery reference', { exact: true }).fill('Delivery ' + tag)
      await submit(staff, form, 'Post receipt into bins', 'receiving.post')
      await expect(section(staff, 'Scanned receipts')).toContainText('Delivery ' + tag)
      await shot('received')
      const order = await command('order.create', { customerId: customer.id, lines: [{ itemId: item.id, quantity: '2', price: '71.29' }] })
      const carrier = await command('carrier.save', { name: 'Afternoon pickup ' + tag, warehouse, dock: 'Dock 2', cutoff: '16:00', timeZone: 'America/Chicago' })
      const wave = await command('wave.release', { carrierId: carrier.id, orderIds: [order.id] })
      // Warehouse scope is exercised by the actual picker, packer and document doors.
      const response = await staffContext.request.post(origin + '/api/pier/commands', { headers: { origin }, data: { commandId: crypto.randomUUID(), type: 'pick.scan', payload: { waveId: wave.id, lineId: wave.lines[0].id, binCode: bin.barcode, itemCode: item.barcode, quantity: '2' } } })
      expect(response.status(), await response.text()).toBe(200)
      await staff.goto(origin + '/app#floor/pack'); await staff.reload()
      await expect(staff.getByRole('heading', { name: `Pack ${order.reference}`, exact: true })).toBeVisible()
      for (let i = 0; i < 2; i++) await scan('Scan item into carton 1', item.barcode, 'pack.scan')
      form = section(staff, 'Weigh and measure carton 1')
      for (const [label, value] of [['Weight (lb)', '2'], ['Length (in)', '8'], ['Width (in)', '6'], ['Height (in)', '4']]) await form.getByLabel(label, { exact: true }).fill(value)
      await submit(staff, form, 'Save weight and size', 'pack.measure')
      const closed = staff.waitForResponse(response => response.url().endsWith('/api/pier/commands') && response.request().postDataJSON()?.type === 'pack.close')
      await staff.getByRole('button', { name: 'Mark order packed', exact: true }).click()
      expect((await closed).status()).toBe(200)
      await expect(section(staff, 'Dispatch packed order')).toBeVisible()
      await shot('packed')
      const slip = await staffContext.newPage()
      try {
        await slip.setViewportSize({ width, height: 1000 })
        for (const [name, path] of [['order-slip', `/api/pier/orders/${order.id}/packing-slip`], ['pack-slip', await staff.getByRole('link', { name: 'Print packing slip', exact: true }).getAttribute('href')]]) {
          await slip.goto(origin + path)
          await expect(slip.locator('body')).toContainText(item.name)
          for (const forbidden of [customer.name, '19.37', '71.29']) await expect(slip.locator('body')).not.toContainText(forbidden)
          await shot(name!, slip)
        }
      } finally { await slip.close() }
      form = section(staff, 'Dispatch packed order')
      await form.getByLabel('Shipment reference', { exact: true }).fill('BOL ' + tag)
      await submit(staff, form, 'Dispatch packed cartons', 'pack.dispatch')
      await expect(section(staff, 'Shipped from the pack station')).toContainText('BOL ' + tag)
      await shot('dispatched')
      await command('role.set', { operatorId: staffId, role: 'warehouse', permissions: { warehouses: [foreign.warehouse], locationIds: [] } })
      await staff.reload()
      await expect(section(staff, 'Shipped from the pack station')).not.toContainText('BOL ' + tag)
      const denied = await staffContext.request.get(origin + `/api/pier/orders/${order.id}/packing-slip`)
      expect(denied.status()).toBe(403)
      await shot('revoked')
      await page.setViewportSize({ width, height: 1000 }); await page.goto(origin + '/app#activity'); await page.reload()
      form = section(page, 'Set an invited operator’s role')
      await form.getByLabel('Operator', { exact: true }).selectOption(staffId)
      await form.getByLabel('Role', { exact: true }).selectOption('sales')
      await form.getByRole('checkbox', { name: 'Restrict to physical stock and counts' }).uncheck()
      await form.getByRole('checkbox', { name: 'Hide sales prices' }).check()
      await submit(page, form, 'Save', 'role.set')
      const row = section(page, 'Operator roles').getByRole('row').filter({ hasText: 'member@dev.localhost' })
      await expect(row).toContainText('Sales prices hidden')
      await row.scrollIntoViewIfNeeded()
      await shot('commercial-restriction', page)
      await form.getByLabel('Operator', { exact: true }).selectOption(staffId)
      await expect(form.getByRole('checkbox', { name: 'Hide sales prices' })).toBeChecked()
      await form.scrollIntoViewIfNeeded()
      await shot('commercial-form', page)
      await form.getByLabel('Role', { exact: true }).selectOption('finance')
      await submit(page, form, 'Save', 'role.set')
      await expect(row).toContainText('Finance')
      await shot('finance', page)
    }
  } finally { await staffContext.close() }
}
