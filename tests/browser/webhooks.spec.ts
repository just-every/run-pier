import { test, expect } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { ownerEntry } from './session'
// @ts-expect-error Real Worker and D1 public doors; only the outgoing receiver is a fixture.
import { installation, basics, buy, receive } from '../api/harness.mjs'
// @ts-expect-error Shared receiver fixture at the outbound network edge.
import { receiver, signingSecret, rotatedSecret, orderPayload } from '../api/webhook-fixture.mjs'

test('owners preview, rotate, reconcile and revoke signed order webhooks', async ({ page }) => {
  const origin = await ownerEntry(page), edge = receiver(), h = await installation(edge)
  try {
    // The installed built page talks to an isolated real authenticated Worker.
    // No business response is mocked; this adapter changes only its origin.
    await page.route('**/api/pier/**', async route => {
      const request = route.request(), url = new URL(request.url())
      const response = await h.request(url.pathname + url.search, { method: request.method(), ...(request.postData() ? { body: JSON.parse(request.postData()!) } : {}) })
      await route.fulfill({ status: response.status, contentType: 'application/json', body: await response.text() })
    })
    const b = await basics(h); await receive(h, b, await buy(h, b, '10'), '10')
    const first = await h.command('order.create', orderPayload(b))
    await page.setViewportSize({ width: 1440, height: 1000 })
    await page.goto(`${origin}/app#activity/webhooks`)
    await expect(page.getByRole('heading', { name: 'Order webhooks', exact: true })).toBeVisible()
    const shots = process.env.PIER_SCREENSHOTS
    async function proof(name: string) {
      if (!shots) return
      await mkdir(shots, { recursive: true })
      for (const width of [1440, 390]) {
        await page.setViewportSize({ width, height: 1000 })
        await page.evaluate(() => window.scrollTo(0, 0))
        await page.screenshot({ path: join(shots, `${width}-webhooks-${name}.png`), fullPage: true })
      }
      await page.setViewportSize({ width: 1440, height: 1000 })
    }
    async function save(type: string, action: () => Promise<unknown>) {
      const pending = page.waitForResponse(response => response.url().endsWith('/api/pier/commands') && response.request().postDataJSON()?.type === type)
      await action(); const response = await pending; expect((await response.json()).ok).toBe(true)
      await expect(page.locator('main')).toHaveAttribute('aria-busy', 'false')
    }
    await page.getByLabel('Subscription name', { exact: true }).fill('Warehouse order receiver')
    await page.getByLabel('HTTPS destination', { exact: true }).fill('https://receiver.example.com/orders')
    await page.getByLabel('Signing secret', { exact: true }).fill(signingSecret)
    await save('webhook.save', () => page.getByRole('button', { name: 'Save draft subscription', exact: true }).click())
    await page.getByLabel('Preview order', { exact: true }).selectOption(first.id)
    await save('webhook.preview', () => page.getByRole('button', { name: 'Preview order payload', exact: true }).click())
    const preview = page.getByRole('region', { name: 'Payload preview', exact: true })
    await expect(preview).toContainText(first.id); await expect(preview).toContainText('orderVersion'); await expect(preview).toContainText(b.item.id)
    await expect(preview).not.toContainText(b.customer.id)
    await proof('preview')
    await preview.getByRole('checkbox').check()
    await save('webhook.approve', () => page.getByRole('button', { name: 'Approve exact destination', exact: true }).click())
    const second = await h.command('order.create', orderPayload(b)); edge.outcome = 'failed'
    await save('webhook.process', () => page.getByRole('button', { name: 'Process approved deliveries', exact: true }).click())
    const delivery = page.locator('.webhook-delivery').first()
    await expect(delivery.getByRole('heading', { name: 'failed', exact: true })).toBeVisible()
    await expect(delivery).toContainText('HTTP 422')
    await expect(delivery.getByRole('link', { name: 'Source order' })).toHaveAttribute('href', `#sales/${second.id}`)
    await proof('failure')
    await page.getByLabel('New signing secret', { exact: true }).fill(rotatedSecret)
    await page.getByLabel('My receiver is ready for the new secret immediately.', { exact: true }).check()
    await save('webhook.rotate', () => page.getByRole('button', { name: 'Rotate signing secret', exact: true }).click())
    await expect(page.getByRole('region', { name: 'Current subscription' })).toContainText('2')
    await proof('rotation')
    await delivery.getByLabel('Receiver outcome', { exact: true }).selectOption('receiver-confirmed-not-accepted')
    await delivery.getByLabel('Receiver reconciliation evidence', { exact: true }).fill('Receiver event search confirms rejection without acceptance')
    await delivery.getByRole('checkbox').check()
    await save('webhook.recover', () => delivery.getByRole('button', { name: 'Record receiver review', exact: true }).click())
    edge.outcome = 'lost'
    await save('webhook.process', () => page.getByRole('button', { name: 'Process approved deliveries', exact: true }).click())
    await expect(delivery.getByRole('heading', { name: 'uncertain', exact: true })).toBeVisible()
    await expect(delivery).toContainText('Response lost')
    await proof('uncertain-recovery')
    await delivery.getByLabel('Receiver outcome', { exact: true }).selectOption('receiver-confirmed-accepted')
    await delivery.getByLabel('Receiver reconciliation evidence', { exact: true }).fill('Receiver confirms event was accepted before response loss')
    await delivery.getByRole('checkbox').check()
    await save('webhook.recover', () => delivery.getByRole('button', { name: 'Record receiver review', exact: true }).click())
    await expect(delivery.getByRole('heading', { name: 'reviewed-accepted', exact: true })).toBeVisible()
    await proof('reviewed')
    await save('webhook.revoke', () => page.getByRole('button', { name: 'Revoke subscription', exact: true }).click())
    await expect(page.getByRole('region', { name: 'Current subscription' })).toContainText('Revoked')
    await expect(page.getByRole('button', { name: 'Process approved deliveries', exact: true })).toBeDisabled()
    await proof('revoked')
    expect(edge.requests).toHaveLength(2)
  } finally { await page.unroute('**/api/pier/**'); await h.close() }
})
