import { test, expect, type Page } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { ownerEntry } from './session'

test('warehouse interruptions retain exact task, reconcile stale allocations and recover stock once at 1440 and 390', async ({ page, context, browser }) => {
  const origin = await ownerEntry(page)
  const command = async (type: string, payload: object) => {
    const response = await context.request.post(`${origin}/api/pier/commands`, { headers: { origin }, data: { commandId: crypto.randomUUID(), type, payload } })
    const body = await response.json(); expect(body.ok, JSON.stringify(body)).toBe(true); return body.result
  }
  const state = async () => {
    const response = await context.request.get(`${origin}/api/pier/state`)
    expect(response.ok()).toBe(true); return response.json()
  }
  const idle = async () => { await expect(page.locator('main')).toHaveAttribute('aria-busy', 'false') }
  const scan = async (label: string, code: string) => {
    await page.getByRole('textbox', { name: label, exact: true }).fill(code)
    await page.getByRole('textbox', { name: label, exact: true }).press('Enter')
  }
  const openWave = async (wave: any) => {
    await page.goto(`${origin}/app#floor/pick`); await page.reload()
    await page.getByRole('row').filter({ hasText: `Wave ${wave.number} · ${wave.dock}` }).first().getByRole('button', { name: 'Open pick list' }).click()
    await expect(page.getByRole('heading', { name: `Pick list · Wave ${wave.number} · ${wave.dock}` })).toBeVisible()
  }
  let interrupted: { type: string; loseResponse: boolean } | null = null
  const observed: any[] = []
  await page.route('**/api/pier/commands', async route => {
    const request = route.request().postDataJSON(); observed.push(request)
    if (interrupted?.type !== request.type) { await route.continue(); return }
    const mode = interrupted; interrupted = null
    if (mode.loseResponse) {
      const response = await route.fetch()
      const body = await response.json()
      expect(body.ok, JSON.stringify(body)).toBe(true); expect(response.ok()).toBe(true)
    }
    await route.abort('internetdisconnected')
  })
  async function recover(type: string, action: () => Promise<void>) {
    const before = observed.length
    await action()
    const recovery = page.getByRole('heading', { name: 'Recover interrupted action', exact: true })
    await expect(recovery).toBeVisible(); await idle()
    const original = observed.slice(before).find(row => row.type === type)
    expect(original).toBeTruthy()
    await context.setOffline(true)
    await expect(page.getByText(/Network connection is unavailable/).first()).toBeVisible()
    if (shots) await page.screenshot({ path: join(shots, `${page.viewportSize()!.width}-warehouse-interrupted-${type}-${original.commandId}.png`), fullPage: true })
    await context.setOffline(false); await page.reload(); await idle()
    await expect(recovery).toBeVisible()
    if (type === 'pick.scan') await expect(page.locator(`#document-${original.payload.waveId}`)).toBeVisible()
    await expect(page.getByText(`${type} · command ${original.commandId}`, { exact: true })).toBeVisible()
    expect(observed).toHaveLength(before + 1) // Neither reconnect nor reload posts work.
    const replay = page.waitForRequest(request => request.url().endsWith('/api/pier/commands') && request.postDataJSON()?.commandId === original.commandId)
    await page.getByRole('button', { name: 'Retry this exact action', exact: true }).click()
    expect((await replay).postDataJSON()).toEqual(original)
    await expect(recovery).toHaveCount(0); await idle()
    return original
  }
  const shots = process.env.PIER_SCREENSHOTS
  if (shots) await mkdir(shots, { recursive: true })
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 })
    const suffix = `synthetic-pier-501-${width}-${crypto.randomUUID().slice(0, 8)}`
    const item = await command('item.save', { sku: suffix, name: suffix, unit: 'each', barcode: suffix, packSize: '1' })
    const bin = await command('location.save', { name: `${suffix}-bin`, warehouse: suffix, kind: 'bin' })
    const supplier = await command('party.save', { name: suffix, kind: 'supplier' })
    const customer = await command('party.save', { name: suffix, kind: 'customer' })
    const po = await command('po.draft', { supplierId: supplier.id, promiseDate: '2026-11-01', reason: 'Synthetic warehouse recovery proof', lines: [{ itemId: item.id, quantity: '4', price: '1' }] })
    await command('po.approve', { poId: po.id, version: po.version }); await command('po.commit', { poId: po.id, version: po.version })
    await command('receipt.create', { poId: po.id, supplierReference: suffix, lines: [{ poLineId: po.lines[0].id, locationId: bin.id, quantity: '4', cost: '1' }] })
    const carrier = await command('carrier.save', { name: suffix, warehouse: suffix, dock: 'Dock A', cutoff: '23:59', timeZone: 'America/Chicago' })
    const makeOrder = () => command('order.create', { customerId: customer.id, warehouse: suffix, promiseDate: '2026-11-01', lines: [{ itemId: item.id, quantity: '2', price: '3' }] })
    const order = await makeOrder()
    const wave = await command('wave.release', { carrierId: carrier.id, orderIds: [order.id] })
    await openWave(wave); await scan('Scan bin label', bin.name)
    await expect(page.getByRole('textbox', { name: 'Scan item', exact: true })).toBeVisible()
    interrupted = { type: 'pick.scan', loseResponse: false }
    await recover('pick.scan', () => scan('Scan item', item.barcode))
    let current = await state()
    expect(current.waves.find((row: any) => row.id === wave.id).lines[0].picked).toBe('1')
    await expect(page.getByRole('textbox', { name: 'Scan item', exact: true })).toBeVisible()
    interrupted = { type: 'pick.scan', loseResponse: true }
    await recover('pick.scan', () => scan('Scan item', item.barcode))
    current = await state()
    expect(current.waves.find((row: any) => row.id === wave.id).lines[0].scans).toHaveLength(2)
    expect(current.positions.find((row: any) => row.itemId === item.id).quantity).toBe('4')

    const payload = { waveId: wave.id, orderId: order.id }
    await command('pack.scan', { ...payload, code: item.barcode }); await command('pack.scan', { ...payload, code: item.barcode })
    await command('pack.measure', { ...payload, carton: 1, weight: '2', length: '4', width: '4', height: '4' }); await command('pack.close', payload)
    await page.goto(`${origin}/app#floor/pack`); await page.reload()
    await page.getByRole('row').filter({ hasText: order.reference }).first().getByRole('button', { name: 'Pack this order' }).click()
    await page.getByLabel('Shipment reference', { exact: true }).fill(`${suffix}-shipment`)
    interrupted = { type: 'pack.dispatch', loseResponse: true }
    const dispatched = await recover('pack.dispatch', () => page.getByRole('button', { name: 'Dispatch packed cartons', exact: true }).click())
    current = await state()
    expect(current.movements.filter((row: any) => row.commandId === dispatched.commandId)).toHaveLength(1)
    expect(current.movements.find((row: any) => row.commandId === dispatched.commandId).quantity).toBe('-2000000')
    expect(current.shipments.filter((row: any) => row.orderId === order.id)).toHaveLength(1)
    expect(current.positions.find((row: any) => row.itemId === item.id).quantity).toBe('2')

    const staleOrder = await makeOrder(), recipient = await makeOrder()
    const staleWave = await command('wave.release', { carrierId: carrier.id, orderIds: [staleOrder.id] })
    await openWave(staleWave); await scan('Scan bin label', bin.name)
    interrupted = { type: 'pick.scan', loseResponse: false }
    await scan('Scan item', item.barcode)
    await expect(page.getByRole('heading', { name: 'Recover interrupted action', exact: true })).toBeVisible(); await idle()
    const other = await browser.newContext()
    try {
      const otherPage: Page = await other.newPage(); await ownerEntry(otherPage)
      const otherCommand = async (type: string, payload: object) => {
        const response = await other.request.post(`${origin}/api/pier/commands`, { headers: { origin }, data: { commandId: crypto.randomUUID(), type, payload } })
        const body = await response.json(); expect(body.ok, JSON.stringify(body)).toBe(true); return body.result
      }
      const proposal = await otherCommand('proposal.prepare', { kind: 'reallocation', assumptions: 'Synthetic second-session allocation change', evidence: [staleOrder.id, recipient.id], plan: { fromOrderId: staleOrder.id, toOrderId: recipient.id, itemId: item.id, quantity: '2' } })
      await otherCommand('proposal.approve', { proposalId: proposal.id, version: proposal.version }); await otherCommand('proposal.execute', { proposalId: proposal.id, version: proposal.version })
    } finally { await other.close() }
    const beforeStale = await state(), beforeWrites = observed.length
    await page.reload(); await idle()
    await page.getByRole('button', { name: 'Retry this exact action', exact: true }).click()
    await expect(page.getByText(/Warehouse task or availability changed/).first()).toBeVisible(); await idle()
    expect(observed).toHaveLength(beforeWrites)
    current = await state()
    expect(current.movements).toEqual(beforeStale.movements)
    expect(current.reservations).toEqual(beforeStale.reservations)
    expect(current.waves.find((row: any) => row.id === staleWave.id).lines[0].picked).toBe('0')
    await expect(page.getByRole('button', { name: 'Discard retained scans', exact: true })).toBeVisible()
    if (shots) await page.screenshot({ path: join(shots, `${width}-warehouse-stale-recovery.png`), fullPage: true })
    await page.getByRole('button', { name: 'Discard retained scans', exact: true }).click()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)
  }
})
