import { test, expect } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { ownerEntry } from './session'
// @ts-expect-error Public-door data preparation shared with the API journey.
import { openJourney } from '../api/open-fixtures.mjs'

test('OPEN-001: all product areas remain open with three warehouses and 25 staff; provider costs appear before activation', async ({ page, context }) => {
  const origin = await ownerEntry(page)
  await openJourney({
    command: async (type: string, payload: object) => {
      const response = await context.request.post(`${origin}/api/pier/commands`, { headers: { origin }, data: { commandId: crypto.randomUUID(), type, payload } }); const body = await response.json(); expect(body.ok).toBe(true); return body.result
    },
    request: async (path: string, options: any) => context.request.post(origin + path, { headers: { origin }, data: options.body }).then(response => ({ status: response.status() })),
  })
  await page.goto(`${origin}/app#activity`)
  await page.reload()
  await expect(page.getByRole('row').filter({ hasText: 'staff25@example.test' })).toBeVisible()
  const shots = process.env.PIER_SCREENSHOTS
  if (shots) await mkdir(shots, { recursive: true })
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 })
    for (const [tab, heading] of [['sales', 'Sales orders'], ['stock', 'Stock'], ['purchasing', 'Purchasing'], ['floor', 'Floor'], ['transfers', 'Transfers'], ['counts', 'Counts'], ['reports', 'Reports'], ['imports', 'Imports'], ['activity', 'Activity'], ['channels', 'Channels'], ['books', 'Books'], ['edi', 'Retail EDI'], ['ai', 'AI setup']]) {
      await page.goto(`${origin}/app#${tab}`)
      await expect(page.getByRole('heading', { name: heading, exact: true }).first()).toBeVisible()
      await expect(page.getByRole('dialog')).toHaveCount(0)
    }
    await expect(page.getByText('OpenAI bills your account', { exact: false })).toBeVisible()
    if (shots) await page.screenshot({ path: join(shots, `${width}-open-ai.png`), fullPage: true })
    await page.goto(`${origin}/app#channels`)
    for (const provider of ['Shopify', 'Amazon', 'WooCommerce', 'Stall']) {
      await page.getByRole('button', { name: `Set up ${provider}`, exact: true }).click()
      const editor = page.locator('#channel-connection-editor')
      await expect(editor.getByText('Provider costs.', { exact: false })).toBeVisible()
      await expect(editor.getByText('Pier charges no connection, license or per-seat fee.', { exact: false })).toBeVisible()
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)
      if (shots) await page.screenshot({ path: join(shots, `${width}-open-${provider.toLowerCase()}.png`), fullPage: true })
      await editor.getByRole('button', { name: 'Cancel', exact: true }).click()
    }
    for (const tab of ['books', 'edi', 'floor/shipping']) {
      await page.goto(`${origin}/app#${tab}`)
      if (tab === 'books') await page.getByRole('button', { name: 'Connect Pantry', exact: true }).click()
      if (tab === 'edi') await page.getByText('Retailer settings and item mappings', { exact: true }).click()
      await expect(page.getByText('Provider costs.', { exact: false }).first()).toBeVisible()
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)
      if (shots) await page.screenshot({ path: join(shots, `${width}-open-${tab.replace('/', '-')}.png`), fullPage: true })
    }
  }
  const paused = await context.request.post(`${origin}/api/pier/commands`, { headers: { origin }, data: { commandId: crypto.randomUUID(), type: 'channel.save', payload: { name: 'Wholesale store paused', provider: 'woocommerce', baseUrl: 'https://store.example.test', warehouse: 'Dallas', enabled: false, credentials: { consumerKey: 'test-only-key', consumerSecret: 'test-only-secret' } } } })
  expect((await paused.json()).ok).toBe(true)
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 })
    await page.goto(`${origin}/app#channels`); await page.reload()
    const row = page.locator('.channel-setup-row').filter({ hasText: 'Wholesale store paused' })
    await expect(row.getByRole('button', { name: 'Enable Wholesale store paused', exact: true })).toBeVisible()
    await expect(row.getByText('Provider costs.', { exact: false })).toBeVisible()
    if (shots) await row.screenshot({ path: join(shots, `${width}-open-paused.png`) })
  }
})
