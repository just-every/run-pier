import { test, expect } from '@playwright/test'
import { mkdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { ownerEntry } from './session'
// @ts-expect-error Public-command fixture shared with the authenticated API journey.
import { packedFreight } from '../api/ltl-fixtures.mjs'

test('manual LTL owner completes manifest, quote, BOL and pickup recovery at 1440 and 390', async ({ page, context }) => {
  const origin = await ownerEntry(page)
  const outbound: string[] = []
  page.on('request', request => { if (new URL(request.url()).origin !== origin && /^https?:/.test(request.url())) outbound.push(new URL(request.url()).origin) })
  const command = async (type: string, payload: object) => {
    const response = await context.request.post(`${origin}/api/pier/commands`, { headers: { origin }, data: { commandId: crypto.randomUUID(), type, payload } })
    const body = await response.json(); expect(body.ok, JSON.stringify(body)).toBe(true); return body.result
  }
  const { pack, order } = await packedFreight({ command })
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto(`${origin}/app#floor/shipping`); await page.reload()
  const area = page.locator('.ltl-freight')
  await expect(area.getByRole('heading', { name: 'Manual LTL freight', exact: true })).toBeVisible()
  const shots = process.env.PIER_SCREENSHOTS
  if (shots) await mkdir(shots, { recursive: true })
  const capture = async (name: string) => {
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1000 })
      if (shots) await page.screenshot({ path: join(shots, `${width}-ltl-${name}.png`), fullPage: true })
    }
    await page.setViewportSize({ width: 1440, height: 1000 })
  }
  const submit = async (name: string, type: string) => {
    const response = page.waitForResponse(response => response.url().endsWith('/api/pier/commands') && response.request().postDataJSON()?.type === type)
    await area.getByRole('button', { name, exact: true }).click()
    const body = await (await response).json(); expect(body.ok, JSON.stringify(body)).toBe(true); return body.result
  }
  await area.getByLabel('Manifest reference', { exact: true }).fill('synthetic-pier-browser-ltl-1')
  await area.getByLabel('Freight ship from', { exact: true }).fill('10 North Dock')
  await area.getByLabel('Freight ship to', { exact: true }).fill('20 South Dock')
  await area.getByLabel('Freight commodity', { exact: true }).fill('Synthetic brass fittings')
  await area.getByLabel('liftgate', { exact: true }).check()
  for (let pallet = 1; pallet <= 2; pallet++) {
    for (const [label, value] of [['gross weight (lb)', pallet === 1 ? '10' : '12'], ['length (in)', '48'], ['width (in)', '40'], ['height (in)', pallet === 1 ? '36' : '42'], ['NMFC number', pallet === 1 ? '12345' : '12346'], ['NMFC class', pallet === 1 ? '70' : '85']]) await area.getByLabel(`Pallet ${pallet} ${label}`, { exact: true }).fill(value)
  }
  const manifest = await submit('Save pallet manifest', 'ltl.save')
  await expect(area).toContainText(order.reference)
  await expect(area.getByRole('row').filter({ hasText: 'Carton 1' })).toContainText('10 lb · 48 × 40 × 36 in')
  await expect(area.getByRole('row').filter({ hasText: 'Carton 2' })).toContainText('12346 · class 85')
  await capture('manifest')
  for (const [label, value] of [['Quoted carrier', 'Synthetic Freight Lines'], ['Carrier SCAC', 'SYNT'], ['Carrier quote reference', 'synthetic-pier-quote-1'], ['Quoted amount (USD)', '125.50'], ['Freight charge terms', 'Third party'], ['Freight bill-to name and address', 'Synthetic Freight Payer, 30 Billing Road'], ['Manual quote evidence', 'Carrier phone quote includes liftgate']]) await area.getByLabel(label, { exact: true }).fill(value)
  await submit('Retain manual quote', 'ltl.quote')
  await expect(area).toContainText('USD 125.50')
  await expect(area).toContainText('Synthetic Freight Payer, 30 Billing Road')
  await area.getByLabel('Operator-recorded PRO number', { exact: true }).fill('synthetic-pier-pro-1')
  await area.getByLabel('Planned pickup date', { exact: true }).fill('2026-11-02')
  await area.getByLabel('Freight review reason', { exact: true }).fill('Owner reviewed exact freight details')
  let reviewed = await submit('Review exact freight details', 'ltl.review')
  await expect(area).toContainText('Goods remain unshipped until pickup confirmation')
  await capture('quote-review')
  const document = await submit('Generate current VICS BOL', 'print.generate')
  const downloadEvent = page.waitForEvent('download')
  await area.getByRole('link', { name: 'Download retained VICS BOL', exact: true }).last().click()
  const downloaded = await readFile((await (await downloadEvent).path())!)
  expect(downloaded.subarray(0, 5).toString()).toBe('%PDF-')
  await expect(area).toContainText(`Source version ${reviewed.version} · template version ${document.templateVersion}`)
  await capture('bol-pickup')
  const before = await (await context.request.get(`${origin}/api/pier/state`)).json()
  expect(before.shipments).toHaveLength(0)
  expect(before.packs.find((row: any) => row.id === pack.id).status).toBe('packed')
  const reserved = before.reservations.filter((row: any) => row.orderId === order.id)
  expect(reserved.map((row: any) => row.quantity)).toEqual(['4000000'])
  reviewed = await command('ltl.review', { manifestId: manifest.id, version: reviewed.version, proNumber: 'synthetic-pier-pro-2', pickupDate: '2026-11-02', reason: 'Corrected operator PRO before pickup' })
  await area.getByLabel('I confirm the listed pallets were picked up.', { exact: true }).check()
  await area.getByLabel('Observed pickup evidence', { exact: true }).fill('Owner saw both pallets handed to the driver')
  const stale = page.waitForResponse(response => response.url().endsWith('/api/pier/commands') && response.request().postDataJSON()?.type === 'ltl.pickup')
  await area.getByRole('button', { name: 'Confirm pickup and dispatch once', exact: true }).click()
  expect((await (await stale).json()).error.code).toBe('STALE')
  await expect(area.getByRole('alert')).toContainText('Reload')
  const refused = await (await context.request.get(`${origin}/api/pier/state`)).json()
  expect(refused.shipments).toHaveLength(0); expect(refused.reservations).toEqual(before.reservations)
  await capture('stale-recovery')
  await page.reload()
  await expect(area).toContainText('synthetic-pier-pro-2')
  await submit('Generate current VICS BOL', 'print.generate')
  await area.getByLabel('I confirm the listed pallets were picked up.', { exact: true }).check()
  await area.getByLabel('Observed pickup evidence', { exact: true }).fill('Owner saw both pallets handed to the driver')
  let lost = false
  await page.route('**/api/pier/commands', async route => {
    if (route.request().postDataJSON()?.type !== 'ltl.pickup' || lost) return route.continue()
    lost = true
    const response = await route.fetch()
    expect((await response.json()).ok).toBe(true)
    await route.abort('failed')
  })
  await area.getByRole('button', { name: 'Confirm pickup and dispatch once', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Recover interrupted action', exact: true })).toBeVisible()
  await expect(page.getByText('Recover the exact reviewed LTL pickup and its once-only dispatch', { exact: true })).toBeVisible()
  await capture('lost-response')
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Recover interrupted action', exact: true })).toBeVisible()
  await expect(page.getByText('synthetic-pier-browser-ltl-1', { exact: true })).toBeVisible()
  const recovered = page.waitForResponse(response => response.url().endsWith('/api/pier/commands') && response.request().postDataJSON()?.type === 'ltl.pickup')
  await page.getByRole('button', { name: 'Retry this exact action', exact: true }).click()
  expect((await (await recovered).json()).ok).toBe(true)
  await expect(page.getByRole('heading', { name: 'Recover interrupted action', exact: true })).toHaveCount(0)
  await expect(area.getByRole('status')).toContainText('Pickup recorded · PRO synthetic-pier-pro-2')
  await page.reload()
  await expect(area.getByRole('status')).toContainText('Owner saw both pallets handed to the driver')
  await expect(area.getByRole('heading', { name: 'Retained manual quote', exact: true })).toBeVisible()
  await expect(area).toContainText('USD 125.50')
  await expect(area).toContainText('Synthetic Freight Payer, 30 Billing Road')
  await expect(area).toContainText('Carrier phone quote includes liftgate')
  const after = await (await context.request.get(`${origin}/api/pier/state`)).json()
  expect(after.shipments).toHaveLength(1)
  expect(after.shipments[0].ltlManifestId).toBe(manifest.id)
  expect(after.orders.find((row: any) => row.id === order.id).lines[0].dispatched).toBe('4')
  expect(after.reservations.filter((row: any) => row.orderId === order.id)).toHaveLength(0)
  expect(outbound).toEqual([])
  await capture('dispatched')
})
