import { test, expect } from '@playwright/test'
import { mkdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { ownerEntry } from './session'
// @ts-expect-error Shared public-command setup; no database editing.
import { basics, buy, receive } from '../api/harness.mjs'

test('WMS-003: warehouse dispatch states, reviewed ship-by schedule, close download and overdue report at 1440 and 390', async ({ page, context }) => {
  const origin = await ownerEntry(page)
  const command = async (type: string, payload: object) => {
    const response = await context.request.post(`${origin}/api/pier/commands`, { headers: { origin }, data: { commandId: crypto.randomUUID(), type, payload } })
    const body = await response.json(); expect(body.ok, JSON.stringify(body)).toBe(true); return body.result
  }
  const h = { command }, b = await basics(h)
  await receive(h, b, await buy(h, b, '12'), '12')
  const zone = 'America/Chicago'
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
  const later = new Date(Date.now() + 86400000).toISOString().slice(0, 10), earlier = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
  const carrier = await command('carrier.save', { name: 'Parcel pickup', warehouse: 'North', dock: 'Dock A', cutoff: '23:59', timeZone: zone })
  const orders = []
  for (let index = 0; index < 5; index++) {
    const order = await command('order.create', { customerId: b.customer.id, warehouse: 'North', promiseDate: index === 4 ? earlier : index === 3 ? later : today, lines: [{ itemId: b.item.id, quantity: '2', price: '3' }] })
    await command('order.carrier', { orderId: order.id, carrierId: carrier.id }); orders.push(order)
  }
  let wave = await command('wave.release', { carrierId: carrier.id, orderIds: orders.slice(0, 3).map(order => order.id) })
  for (let index = 0; index < 3; index++) {
    const order = orders[index], line = wave.lines.find((line: any) => line.orderId === order.id)
    wave = await command('pick.scan', { waveId: wave.id, lineId: line.id, binCode: 'A1', itemCode: '10001', quantity: index === 2 ? '1' : '2' })
    if (index === 2) continue
    const payload = { waveId: wave.id, orderId: order.id }
    await command('pack.scan', { ...payload, code: '10001' })
    await command('pack.scan', { ...payload, code: '10001' })
    await command('pack.measure', { ...payload, carton: 1, weight: '2.5', length: '12', width: '8', height: '4' })
    await command('pack.close', payload)
    if (index === 0) await command('pack.dispatch', { ...payload, shipmentReference: 'Dock handoff 104' })
  }
  const shots = process.env.PIER_SCREENSHOTS
  if (shots) await mkdir(shots, { recursive: true })
  let closed = false
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 })
    await page.goto(`${origin}/app#floor/pick`); await page.reload()
    const schedule = page.locator('section').filter({ has: page.getByRole('heading', { name: `Pickup for ${orders[3].reference}`, exact: true }) }).last()
    await schedule.getByLabel('Reviewed carrier-service ship-by date', { exact: true }).fill(today)
    const saved = page.waitForResponse(response => response.url().endsWith('/api/pier/commands') && response.request().postDataJSON()?.type === 'order.carrier')
    await schedule.getByRole('button', { name: 'Save pickup schedule', exact: true }).click(); expect((await (await saved).json()).ok).toBe(true)
    if (shots) await page.screenshot({ path: join(shots, `${width}-dispatch-pickup.png`), fullPage: true })
    await page.goto(`${origin}/app#floor/dispatch`)
    const board = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Dispatch board', exact: true }) }).last()
    await expect(board.getByRole('row').filter({ hasText: orders[0].reference })).toContainText('shipped')
    await expect(board.getByRole('row').filter({ hasText: orders[1].reference })).toContainText('unlabeled')
    await expect(board.getByRole('row').filter({ hasText: orders[2].reference })).toContainText('picking')
    await expect(board.getByRole('row').filter({ hasText: orders[3].reference })).toContainText('At risk before cut-off')
    if (!closed) {
      const saved = page.waitForResponse(response => response.url().endsWith('/api/pier/commands') && response.request().postDataJSON()?.type === 'dispatch.close')
      await board.getByRole('button', { name: /^Close .* and email the owner$/ }).click(); expect((await (await saved).json()).ok).toBe(true); closed = true
    }
    const downloadEvent = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Download day-close JSON', exact: true }).click()
    const file = await (await downloadEvent).path(); const record = JSON.parse(await readFile(file!, 'utf8'))
    expect(record.summary.ordersShipped).toBe(1); expect(record.summary.units).toBe('2')
    expect(record.summary.exceptions.filter((row: any) => row.kind === 'not shipped')).toHaveLength(3)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)
    if (shots) await page.screenshot({ path: join(shots, `${width}-dispatch-board.png`), fullPage: true })
    await page.goto(`${origin}/app#reports`)
    const report = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Overdue orders', exact: true }) }).last()
    await expect(report.getByRole('row').filter({ hasText: orders[4].reference })).toContainText('unpicked')
    await expect(report).toContainText('1 orders · 2 units')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)
    if (shots) await page.screenshot({ path: join(shots, `${width}-dispatch-report.png`), fullPage: true })
  }
})
