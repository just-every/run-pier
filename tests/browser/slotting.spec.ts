import { test, expect } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { ownerEntry } from './session'

test('WMS-002: configure capacity, review directions and confirm physical tasks at 1440 and 390', async ({ page, context }) => {
  const suffix = crypto.randomUUID().slice(0, 6)
  const origin = await ownerEntry(page), errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  const state = async () => (await context.request.get(`${origin}/api/pier/state`)).json()
  const command = async (type: string, payload: object) => {
    const response = await context.request.post(`${origin}/api/pier/commands`, { headers: { origin }, data: { commandId: crypto.randomUUID(), type, payload } })
    const body = await response.json(); expect(body.ok, JSON.stringify(body)).toBe(true); return body.result
  }
  const shots = process.env.PIER_SCREENSHOTS
  if (shots) await mkdir(shots, { recursive: true })
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 })
    const warehouse = `Slotting ${width}-${suffix}`
    const item = await command('item.save', { sku: `SLOT-${width}-${suffix}`, name: `Warehouse mugs ${width}`, unit: 'each', packSize: '1', barcode: `ITEM-${width}-${suffix}`, dimensions: { length: '2', width: '2', height: '2', unit: 'cm' } })
    const source = await command('location.save', { name: `Receiving-${width}-${suffix}`, warehouse, kind: 'bin' })
    const reserve = await command('location.save', { name: `Reserve-${width}-${suffix}`, warehouse, kind: 'bin' })
    const face = await command('location.save', { name: `Pick-${width}-${suffix}`, warehouse, kind: 'bin' })
    const supplier = await command('party.save', { name: `Supplier ${width}-${suffix}`, kind: 'supplier' })
    let po = await command('po.draft', { supplierId: supplier.id, promiseDate: '2026-11-01', reason: 'Directed warehouse proof', lines: [{ itemId: item.id, quantity: '20', price: '4' }] })
    await command('po.approve', { poId: po.id, version: po.version })
    po = await command('po.commit', { poId: po.id, version: po.version })
    await command('receipt.create', { poId: po.id, supplierReference: `IN-${width}-${suffix}`, lines: [{ poLineId: po.lines[0].id, locationId: source.id, quantity: '12', cost: '4' }] })
    await page.goto(`${origin}/app#transfers`); await page.reload()
    await expect(page.getByRole('heading', { name: 'Transfers', exact: true })).toBeVisible()
    if (shots) await page.screenshot({ path: join(shots, `${width}-transfers.png`), fullPage: true })
    const configure = async (bin: any, isFace: boolean) => {
      await page.getByLabel('Bin policy to edit', { exact: true }).selectOption(bin.id)
      const form = page.locator('section.panel').filter({ has: page.getByRole('heading', { name: `Storage policy · ${bin.name}`, exact: true }) })
      await form.getByLabel('Usable capacity (cm³)', { exact: true }).fill('80')
      for (const dimension of ['length', 'width', 'height']) await form.getByLabel(`Bin ${dimension} (cm)`, { exact: true }).fill('20')
      await form.getByLabel('Aisle coordinate (metres)', { exact: true }).fill(isFace ? '1' : '5')
      await form.getByLabel('Bay coordinate (metres)', { exact: true }).fill(isFace ? '1' : '4')
      await form.getByLabel('Pick sequence', { exact: true }).fill(isFace ? '1' : '2')
      await form.getByLabel('Permitted stock', { exact: true }).selectOption([item.id])
      if (isFace) {
        await form.getByRole('checkbox', { name: 'Pick face', exact: true }).check()
        await form.getByLabel('Item threshold to add or replace', { exact: true }).selectOption(item.id)
        await form.getByLabel('Pick-face minimum (base units)', { exact: true }).fill('2')
        await form.getByLabel('Pick-face maximum (base units)', { exact: true }).fill('5')
      }
      if (shots) await form.screenshot({ path: join(shots, `${width}-${isFace ? 'pick-face' : 'reserve'}-policy.png`) })
      await form.getByRole('button', { name: 'Save bin policy', exact: true }).click()
      await expect.poll(async () => (await state()).locations.find((l: any) => l.id === bin.id).storagePolicy?.capacityCm3).toBe('80')
    }
    await configure(face, true); await configure(reserve, false)
    const prepare = async (putAway: boolean) => {
      const form = page.locator('section.panel').filter({ has: page.getByRole('heading', { name: 'Plan put-away and replenishment', exact: true }) })
      await form.getByLabel('Planning warehouse', { exact: true }).selectOption(warehouse)
      await form.getByLabel('Receiving bin to put away', { exact: true }).selectOption(putAway ? source.id : '')
      const before = (await state()).movements
      await form.getByRole('button', { name: 'Prepare warehouse plan', exact: true }).click()
      const plan = page.locator('section.panel').filter({ has: page.getByRole('heading', { name: `Warehouse plan · ${warehouse}`, exact: true }) }).first()
      await expect(plan.getByRole('button', { name: 'Approve exact warehouse plan', exact: true })).toBeVisible()
      expect((await state()).movements).toEqual(before)
      if (shots) await plan.screenshot({ path: join(shots, `${width}-${putAway ? 'put-away' : 'replenishment'}-review.png`) })
      await plan.getByRole('button', { name: 'Approve exact warehouse plan', exact: true }).click()
      return plan
    }
    const confirm = async (plan: any, from: any, to: any, quantity: string) => {
      const form = plan.locator('section.panel').filter({ has: page.getByRole('heading', { name: 'Confirm physical task', exact: true }) })
      await form.getByLabel('Scan source bin', { exact: true }).fill(from.name)
      await form.getByLabel('Scan destination bin', { exact: true }).fill(to.name)
      await form.getByLabel('Scan task item', { exact: true }).fill('WRONG-SKU')
      await form.getByLabel('Confirmed base-unit quantity', { exact: true }).fill(quantity)
      await form.getByLabel('Device or workstation', { exact: true }).fill(`Scanner ${width}`)
      const before = (await state()).movements
      await form.getByRole('button', { name: 'Confirm scanned movement', exact: true }).click()
      await expect(page.getByText(/Code WRONG-SKU is not an item or bin barcode/)).toBeVisible()
      expect((await state()).movements).toEqual(before)
      await form.getByLabel('Scan task item', { exact: true }).fill(item.barcode)
      await form.getByRole('button', { name: 'Confirm scanned movement', exact: true }).click()
      await expect(plan.getByText(/Movement confirmed/)).toBeVisible()
    }
    let plan = await prepare(true)
    await confirm(plan, source, reserve, '10')
    plan = await prepare(false)
    await confirm(plan, reserve, face, '5')
    await plan.getByText('ABC slotting and pick evidence', { exact: true }).click()
    await expect(plan.getByRole('table')).toBeVisible()
    if (shots) await plan.screenshot({ path: join(shots, `${width}-completed-and-abc.png`) })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)
    const after = await state()
    expect(after.positions.find((p: any) => p.itemId === item.id && p.locationId === face.id).quantity).toBe('5')
    expect(after.positions.find((p: any) => p.itemId === item.id && p.locationId === reserve.id).quantity).toBe('5')
    await page.reload()
    await expect(page.getByText(`Scanner ${width}`).first()).toBeVisible()
  }
  expect(errors).toEqual([])
})
