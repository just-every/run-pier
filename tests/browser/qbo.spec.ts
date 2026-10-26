import { test, expect } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { ownerEntry } from './session'

// @ts-expect-error Shared public-command business fixture.
import { basics, buy, receive } from '../api/harness.mjs'

test('QuickBooks settings retain exact mappings and recover a refused connection at 1440 and 390', async ({ page }) => {
  const origin = await ownerEntry(page)
  const command = async (type: string, payload: object) => {
    const response = await page.request.post(`${origin}/api/pier/commands`, { data: { commandId: crypto.randomUUID(), type, payload } })
    const body = await response.json(); expect(body.ok, body.error?.message).toBe(true); return body.result
  }
  const h = { command }, b = await basics(h,`QBO-${crypto.randomUUID().slice(0,8)}-`), po = await buy(h, b, '12')
  await receive(h, b, po, '12')
  const screenshots = process.env.PIER_SCREENSHOTS
  if (screenshots) await mkdir(screenshots, { recursive: true })
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 })
    await page.goto(`${origin}/app#books/settings`)
    await page.getByLabel('Ledger provider', { exact: true }).selectOption('qbo')
    await expect(page.getByRole('heading', { name: 'Connect QuickBooks Online', exact: true })).toBeVisible()
    await page.getByLabel('Authorized company ID', { exact: true }).fill('123456')
    await page.getByLabel('Intuit client ID', { exact: true }).fill('synthetic-pier-1')
    await page.getByLabel('Intuit client secret', { exact: true }).fill('synthetic-pier-2')
    await page.getByLabel('Authorized refresh token', { exact: true }).fill('synthetic-pier-3')
    await page.getByLabel('Approved cutover date', { exact: true }).fill('2026-10-26')
    await page.getByLabel('Reviewed opening inventory USD',{exact:true}).fill('0.00')
    await page.getByLabel('Reviewed opening cost of goods USD',{exact:true}).fill('0.00')
    await page.getByLabel('Inventory asset account ID', { exact: true }).fill('review-needed')
    await page.getByLabel('Cost of goods account ID', { exact: true }).fill('302')
    await page.getByLabel('Sales income account ID', { exact: true }).fill('303')
    await page.getByLabel(`QuickBooks item · ${b.item.sku}`, { exact: true }).fill('101')
    await page.getByLabel(`QuickBooks customer · ${b.customer.name}`, { exact: true }).fill('201')
    await page.getByLabel(`QuickBooks supplier · ${b.supplier.name}`, { exact: true }).fill('202')
    await page.getByRole('checkbox', { name: /I authorize Pier/ }).check()
    const response = page.waitForResponse(r => r.url().endsWith('/api/pier/commands') && r.request().method() === 'POST')
    await page.getByRole('button', { name: 'Connect QuickBooks', exact: true }).click()
    const reply = await (await response).json(); expect(reply.ok).toBe(false); expect(reply.error.code).toBe('BOOK_MAPPING')
    await expect(page.getByRole('alert').filter({ hasText: 'Connection was not saved' })).toBeVisible()
    await expect(page.getByLabel(`QuickBooks item · ${b.item.sku}`, { exact: true })).toHaveValue('101')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    expect(await page.evaluate(() => sessionStorage.getItem('pier.pending-command'))).toBeNull()
    const mask = [page.getByLabel('Intuit client ID', { exact: true }), page.getByLabel('Intuit client secret', { exact: true }), page.getByLabel('Authorized refresh token', { exact: true })]
    if (screenshots) await page.screenshot({ path: join(screenshots, `${width}-qbo-settings-refusal.png`), fullPage: true, mask })
    await page.getByLabel('Inventory asset account ID', { exact: true }).fill('301')
    await expect(page.getByLabel('Authorized refresh token', { exact: true })).toHaveValue('synthetic-pier-3')
    if (screenshots) await page.screenshot({ path: join(screenshots, `${width}-qbo-settings-recovery.png`), fullPage: true, mask })
    await page.getByRole('link', { name: 'Back to Books', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Books', exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Supplier invoices', exact: true })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    if (screenshots) await page.screenshot({ path: join(screenshots, `${width}-qbo-books.png`), fullPage: true })
  }
})
