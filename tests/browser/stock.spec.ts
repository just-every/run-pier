import { test, expect } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { ownerEntry } from './session'
// @ts-expect-error Worker/D1 fixture uses only authenticated public commands.
import { stockJourney } from '../api/stock-fixtures.mjs'

test('STOCK-001: stock totals, empty items and SKU/barcode/bin/status/warehouse filters at desktop and phone widths', async ({ page, context }) => {
  const origin = await ownerEntry(page)
  await stockJourney({ command: async (type: string, payload: object) => {
    const response = await context.request.post(`${origin}/api/pier/commands`, { headers: { origin }, data: { commandId: crypto.randomUUID(), type, payload } })
    const body = await response.json(); expect(body.ok, JSON.stringify(body)).toBe(true); return body.result
  } })
  const state = await (await context.request.get(`${origin}/api/pier/state`)).json()
  const item = state.items.find((row: any) => row.sku === 'BOLT')
  const shots = process.env.PIER_SCREENSHOTS
  if (shots) await mkdir(shots, { recursive: true })
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 })
    await page.goto(`${origin}/app#stock`)
    await page.reload()
    await page.getByRole('group', { name: 'Warehouse', exact: true }).getByRole('button', { name: 'All', exact: true }).click()
    const totals = page.getByRole('region', { name: 'Stock totals', exact: true })
    await expect(totals.getByRole('row').filter({ hasText: 'South' })).toContainText('13 each')
    for (const row of [...state.warehouseStocks, ...state.companyStocks.map((r: any) => ({ ...r, warehouse: 'Company total' }))]) {
      const shown = totals.getByRole('row').filter({ hasText: row.warehouse })
      const cells = shown.getByRole('cell')
      for (const [offset, field] of ['onHand', 'reserved', 'available', 'quarantine', 'transit', 'expected'].entries()) await expect(cells.nth(offset + 2)).toHaveText(`${row[field]} each`)
    }
    await expect(page.locator('.stock-table').getByRole('row').filter({ hasText: 'Unstocked steel washer' })).toContainText('No positions')
    for (const search of ['BOLT', '10001', 'Brass bolt']) {
      await page.getByRole('textbox', { name: 'Search product, barcode or SKU', exact: true }).fill(search)
      await expect(page.locator('.stock-table').getByRole('row').filter({ hasText: 'Brass bolt' })).toHaveCount(state.stockPositions.filter((p: any) => p.itemId === item.id).length)
      await expect(page.locator('.stock-table').getByRole('row').filter({ hasText: 'Unstocked steel washer' })).toHaveCount(0)
    }
    await page.getByLabel('Status filter', { exact: true }).selectOption('quarantine')
    await expect(page.locator('.stock-table').getByRole('row').filter({ hasText: 'Brass bolt' })).toHaveCount(1)
    await expect(page.locator('.stock-table').getByRole('row').filter({ hasText: 'Brass bolt' })).toContainText('0.5 each')
    await page.getByLabel('Status filter', { exact: true }).selectOption('')
    await page.getByLabel('Bin filter', { exact: true }).selectOption(state.locations.find((l: any) => l.name === 'A2').id)
    await expect(page.locator('.stock-table').getByRole('row').filter({ hasText: 'Brass bolt' })).toHaveCount(1)
    await page.getByLabel('Bin filter', { exact: true }).selectOption('')
    await page.getByRole('group', { name: 'Warehouse', exact: true }).getByRole('button', { name: 'South', exact: true }).click()
    await expect(totals.getByRole('row').filter({ hasText: 'North' })).toHaveCount(0)
    await expect(page.locator('.stock-table').getByRole('row').filter({ hasText: 'Brass bolt' })).toHaveCount(2)
    if (shots) await page.screenshot({ path: join(shots, `${width}-stock-south.png`), fullPage: true })
    await page.getByRole('group', { name: 'Warehouse', exact: true }).getByRole('button', { name: 'All', exact: true }).click()
    await page.getByRole('button', { name: 'Brass bolt', exact: true }).first().click()
    await expect(page.getByRole('region', { name: 'Selected item details' })).toContainText('In transit')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)
    if (shots) await page.screenshot({ path: join(shots, `${width}-stock-all.png`), fullPage: true })
  }
})
