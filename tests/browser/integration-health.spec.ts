import { test, expect, type APIRequestContext } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { ownerEntry } from './session'
// @ts-expect-error Shared fixture uses authenticated public Worker commands.
import { stockJourney, stockBusiness } from '../api/stock-fixtures.mjs'

test('SYNC-001: owners inspect native stock checkpoints and recover denied health at desktop and phone widths', async ({ page, context, browser }) => {
  const origin = await ownerEntry(page)
  const command = async (type: string, payload: object) => {
    const response = await context.request.post(origin + '/api/pier/commands', { headers: { origin }, data: { commandId: crypto.randomUUID(), type, payload } })
    const body = await response.json()
    expect(body.ok, JSON.stringify(body)).toBe(true)
    return body.result
  }
  const b = await stockJourney({ command })
  const read = async (request: APIRequestContext, path: string) => {
    const response = await request.get(origin + path)
    expect(response.status(), path).toBe(200)
    return response.json()
  }
  const business = async () => ({ ...stockBusiness(await read(context.request, '/api/pier/export')), positions: (await read(context.request, '/api/pier/state')).positions })
  const stream = (request: APIRequestContext, consumer: string, limit = 2) => read(request, `/api/pier/stock-changes?consumer=${consumer}&limit=${limit}`)
  const acknowledge = async (request: APIRequestContext, batch: any) => {
    const response = await request.post(origin + '/api/pier/stock-changes/ack', { headers: { origin }, data: { consumer: batch.consumer, checkpoint: batch.pageToken } })
    expect(response.status()).toBe(200)
    const result = await response.json()
    expect(result.acknowledgedSequence).toBe(batch.events.at(-1).sequence)
  }
  const observer = await stream(context.request, 'synthetic-pier-health-oracle', 100)
  expect(observer.hasMore).toBe(false)
  expect(observer.events.length).toBeGreaterThan(4)
  expect(new Set(observer.events.map((event: any) => event.locationId))).toContain(b.source.id)
  expect(new Set(observer.events.map((event: any) => event.locationId))).toContain(b.destination.id)
  const shots = process.env.PIER_SCREENSHOTS
  if (shots) await mkdir(shots, { recursive: true })
  const staff = await browser.newContext()
  try {
    const staffPage = await staff.newPage()
    const entry = new URL(process.env.PIER_OPEN!)
    const fragment = new URLSearchParams(entry.hash.slice(1)); fragment.set('as', 'member'); entry.hash = fragment.toString()
    await staffPage.goto(entry.href)
    await staffPage.waitForURL(url => url.pathname === '/app' && !url.hash.includes('rer-dev'))
    const session = await read(staff.request, '/auth/session')
    await command('role.set', { operatorId: session.operator.id, role: 'viewer', permissions: { warehouses: ['North'], locationIds: [b.source.id] } })
    const scoped = await stream(staff.request, 'synthetic-pier-health-scoped', 100)
    expect(scoped.hasMore).toBe(false)
    expect(scoped.events).toEqual(observer.events.filter((event: any) => event.locationId === b.source.id))
    const scopedName = 'Stock consumer synthetic-pier-health-scoped'
    const health = page.getByRole('region', { name: 'Integration health', exact: true })
    const detail = (name: string) => health.locator('details').filter({ has: page.locator('summary', { hasText: name }) }).first()
    const fact = (details: ReturnType<typeof detail>, label: string) => details.locator('dl > div').filter({ has: page.locator('dt').getByText(label, { exact: true }) }).locator('dd')
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1000 })
      const shot = async (name: string) => {
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
        if (shots) await page.screenshot({ path: join(shots, `${width}-native-health-${name}.png`), fullPage: true })
      }
      const consumer = `synthetic-pier-health-${width}`, name = `Stock consumer ${consumer}`
      const pending = await stream(context.request, consumer)
      expect(pending.acknowledgedSequence).toBe(0)
      expect(pending.events).toEqual(observer.events.slice(0, 2))
      const before = await business()
      for (const key of ['movements', 'reservations', 'orders', 'purchaseOrders', 'receipts', 'shipments', 'commands']) expect(before[key].length, key).toBeGreaterThan(0)
      const inspect = async (checkpoint: number, events: any[], count: number) => {
        const details = detail(name)
        const summary = details.locator(':scope > summary')
        await expect(summary).toHaveText(`${name} · active · ${count} pending · 0 failed · 0 uncertain`)
        if (await details.getAttribute('open') === null) await summary.click()
        await expect(fact(details, 'Scope')).toHaveText('All physical locations under current actor authority')
        await expect(fact(details, 'Cursor')).toHaveText(String(checkpoint))
        await expect(details.getByText('Acknowledged stock sequence; fetching does not advance it.', { exact: true })).toBeVisible()
        const mapping = details.getByRole('row').filter({ hasText: 'outstanding-page' }).getByRole('cell').nth(2)
        if (events.length) await expect(mapping).toHaveText(events.map(event => event.eventId).join(' · '))
        else await expect(details.getByRole('row').filter({ hasText: 'outstanding-page' })).toHaveCount(0)
        if (checkpoint) await expect(fact(details, 'Last completed sync')).not.toHaveText('No completed sync recorded')
        else await expect(fact(details, 'Last completed sync')).toHaveText('No completed sync recorded')
      }
      const refresh = async () => {
        const response = page.waitForResponse(response => response.url() === origin + '/api/pier/integrations')
        await health.getByRole('button', { name: 'Refresh health', exact: true }).click()
        expect((await response).status()).toBe(200)
        await expect(health.getByRole('button', { name: 'Refresh health', exact: true })).toBeEnabled()
      }
      await page.goto(origin + '/app#channels')
      await refresh()
      await inspect(0, pending.events, observer.events.length)
      const scopedDetails = detail(scopedName)
      await scopedDetails.locator(':scope > summary').click()
      await expect(fact(scopedDetails, 'Scope')).toHaveText('North: A1')
      await expect(fact(scopedDetails, 'Cursor')).toHaveText('0')
      await expect(scopedDetails.locator(':scope > summary')).toContainText(`${scoped.events.length} pending`)
      await expect(scopedDetails.getByRole('row').filter({ hasText: 'outstanding-page' }).getByRole('cell').nth(2)).toHaveText(scoped.events.map((event: any) => event.eventId).join(' · '))
      for (let repeat = 0; repeat < 2; repeat++) {
        await refresh()
        await inspect(0, pending.events, observer.events.length)
        expect(await stream(context.request, consumer)).toEqual(pending)
        expect(await business()).toEqual(before)
      }
      await shot('pending')
      await detail(name).getByRole('link', { name: 'Open connector recovery', exact: true }).click()
      await expect(page.getByRole('heading', { name: 'Activity', exact: true })).toBeVisible()
      await expect(page.getByRole('heading', { name: 'Decision and input history', exact: true })).toBeVisible()
      expect(await stream(context.request, consumer)).toEqual(pending)
      expect(await business()).toEqual(before)
      await shot('activity')
      await page.goto(origin + '/app#channels'); await page.reload()
      await inspect(0, pending.events, observer.events.length)
      expect(await stream(context.request, consumer)).toEqual(pending)
      expect(await business()).toEqual(before)
      await acknowledge(context.request, pending)
      const next = await stream(context.request, consumer)
      expect(next.acknowledgedSequence).toBe(pending.events.at(-1).sequence)
      expect(next.events).toEqual(observer.events.slice(2, 4))
      await refresh()
      await inspect(next.acknowledgedSequence, next.events, observer.events.length - 2)
      await acknowledge(context.request, pending)
      expect(await stream(context.request, consumer)).toEqual(next)
      expect(await business()).toEqual(before)
      await shot('acknowledged')
      const signout = await context.request.post(origin + '/auth/signout', { headers: { origin }, data: {} })
      expect(signout.ok()).toBe(true)
      const denied = page.waitForResponse(response => response.url() === origin + '/api/pier/integrations')
      await health.getByRole('button', { name: 'Refresh health', exact: true }).click()
      expect((await denied).status()).toBe(401)
      await expect(health.getByRole('alert')).toContainText('Check your owner access and retry.')
      await expect(health.locator('details')).toHaveCount(0)
      for (const event of next.events) await expect(health).not.toContainText(event.eventId)
      expect((await context.request.get(origin + '/api/pier/export')).status()).toBe(401)
      await shot('expired')
      await ownerEntry(page)
      await page.goto(origin + '/app#channels')
      await inspect(next.acknowledgedSequence, next.events, observer.events.length - 2)
      expect(await stream(context.request, consumer)).toEqual(next)
      expect(await business()).toEqual(before)
      await shot('recovered')

      // A still-signed-in native operator loses health admission as soon as owner authority is removed.
      await command('role.set', { operatorId: session.operator.id, role: 'owner' })
      await staffPage.setViewportSize({ width, height: 1000 })
      await staffPage.goto(origin + '/app#channels'); await staffPage.reload()
      const staffHealth = staffPage.getByRole('region', { name: 'Integration health', exact: true })
      await staffHealth.locator('summary').filter({ hasText: name }).click()
      await expect(staffHealth).toContainText(next.events[0].eventId)
      await command('role.set', { operatorId: session.operator.id, role: 'viewer', permissions: { warehouses: ['North'], locationIds: [b.source.id] } })
      const beforeRevoked = await business()
      const forbidden = staffPage.waitForResponse(response => response.url() === origin + '/api/pier/integrations')
      await staffHealth.getByRole('button', { name: 'Refresh health', exact: true }).click()
      expect((await forbidden).status()).toBe(403)
      await expect(staffHealth.getByRole('alert')).toBeVisible()
      await expect(staffHealth.locator('details')).toHaveCount(0)
      expect((await staff.request.get(origin + '/api/pier/integrations')).status()).toBe(403)
      expect(await stream(context.request, consumer)).toEqual(next)
      expect(await business()).toEqual(beforeRevoked)
      if (shots) await staffPage.screenshot({ path: join(shots, `${width}-native-health-revoked.png`), fullPage: true })
    }
  } finally { await staff.close() }
})
