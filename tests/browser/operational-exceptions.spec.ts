import { test, expect } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { ownerEntry } from './session'

test('owners assign overdue cases, see premature closure refusal and retain documented cancellation', async ({ page, context }) => {
  const origin = await ownerEntry(page)
  const command = async (type: string, payload: object) => {
    const response = await context.request.post(origin + '/api/pier/commands', { headers: { origin }, data: { commandId: crypto.randomUUID(), type, payload } })
    const body = await response.json(); expect(body.ok, JSON.stringify(body)).toBe(true); return body.result
  }
  const state = async () => (await context.request.get(origin + '/api/pier/state')).json()
  const supplier = await command('party.save', { kind: 'supplier', name: 'Harbor case supply' })
  const item = await command('item.save', { sku: 'CASE-1', name: 'Case review bolts', unit: 'each', packSize: '1' })
  let po = await command('po.draft', { supplierId: supplier.id, promiseDate: '2020-01-01', reason: 'Overdue supplier confirmation', lines: [{ itemId: item.id, quantity: '4', price: '1' }] })
  await command('po.approve', { poId: po.id, version: po.version }); po = await command('po.commit', { poId: po.id, version: po.version })
  await command('location.save', { name: 'Case receiving bin', warehouse: 'North', kind: 'bin' })
  const customer = await command('party.save', { kind: 'customer', name: 'Harbor case customer' })
  let routing = await command('routing.save', { source: 'manual', mode: 'rules', shortage: 'split', zones: [], defaultEligible: ['North'] })
  routing = await command('routing.preview', { ruleId: routing.id, version: routing.version })
  await command('routing.activate', { ruleId: routing.id, version: routing.version })
  const order = await command('order.create', { customerId: customer.id, promiseDate: '2020-01-01', lines: [{ itemId: item.id, quantity: '2', price: '2' }] })
  const owner = (await state()).actor.id
  const shots = process.env.PIER_SCREENSHOTS
  if (shots) await mkdir(shots, { recursive: true })
  await page.setViewportSize({ width: 390, height: 1000 }); await page.goto(origin + '/app')
  await page.getByRole('navigation', { name: 'Stock operations' }).getByRole('link', { name: 'Activity', exact: true }).click()
  const settings = page.getByRole('region', { name: 'Settings', exact: true })
  await settings.getByText('Case settings', { exact: true }).click()
  await settings.getByLabel('Default assigned owner', { exact: true }).selectOption(owner)
  await settings.getByLabel('Escalation owner', { exact: true }).selectOption(owner)
  await settings.getByLabel('Hours before escalation', { exact: true }).fill('24')
  await settings.getByRole('checkbox', { name: 'Check overdue work every minute' }).check()
  await settings.getByRole('button', { name: 'Save case settings', exact: true }).click()
  await expect.poll(async () => (await state()).operationalExceptionPolicies[0]).toMatchObject({ enabled: true, assigneeId: owner, escalationOwnerId: owner, dueHours: 24 })
  await page.reload()
  await settings.getByText('Case settings', { exact: true }).click()
  await expect(settings.getByLabel('Default assigned owner', { exact: true })).toHaveValue(owner)
  await expect(settings.getByRole('checkbox', { name: 'Check overdue work every minute' })).toBeChecked()
  if (shots) for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 })
    await settings.screenshot({ path: join(shots, `${width}-operational-case-settings.png`) })
  }
  await settings.getByText('Case settings', { exact: true }).click()
  const panel = page.getByRole('region', { name: 'Operational cases' })
  await panel.getByRole('button', { name: 'Check overdue work', exact: true }).click()
  await expect.poll(async () => (await state()).operationalExceptions.some((r: any) => r.sourceId === po.id)).toBe(true)
  const cases = (await state()).operationalExceptions
  const record = cases.find((r: any) => r.sourceId === po.id), delivery = cases.find((r: any) => r.sourceId === order.id)
  expect(delivery).toBeTruthy()
  const detail = panel.locator(`[data-case-id="${record.id}"]`)
  const deliveryDetail = panel.locator(`[data-case-id="${delivery.id}"]`)
  await deliveryDetail.locator('summary').first().click()
  await deliveryDetail.getByLabel('Assigned owner', { exact: true }).selectOption(owner)
  await deliveryDetail.getByLabel('Next action', { exact: true }).fill('Call the customer and confirm the actual shipment evidence.')
  await deliveryDetail.getByRole('button', { name: 'Save next action', exact: true }).click()
  await expect(deliveryDetail.getByLabel('Next action', { exact: true })).toHaveValue('Call the customer and confirm the actual shipment evidence.')
  await expect.poll(async () => (await state()).operationalExceptions.find((r: any) => r.id === delivery.id)).toMatchObject({ assigneeId: owner, nextAction: 'Call the customer and confirm the actual shipment evidence.' })
  await deliveryDetail.locator('summary').first().click()
  await page.setViewportSize({ width: 1440, height: 1000 })
  await detail.locator('summary').first().click()
  await detail.getByLabel('Assigned owner', { exact: true }).selectOption(owner)
  await detail.getByLabel('Next action', { exact: true }).fill('Call supplier and review the retained receiving evidence.')
  await detail.getByLabel('Due date and time', { exact: true }).fill('2020-01-02T09:00')
  await detail.getByRole('button', { name: 'Save next action', exact: true }).click()
  await expect(detail).toContainText('Task unanswered by its due date.')
  await detail.getByRole('button', { name: 'Check closure evidence', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('current inventory reconciliation')
  expect((await state()).operationalExceptions.find((r: any) => r.id === record.id).status).toBe('open')
  if (shots) for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 })
    await page.getByRole('alert').screenshot({ path: join(shots, `${width}-operational-case-refusal.png`) })
  }
  await page.reload(); await detail.locator('summary').first().click()
  await expect(detail.getByLabel('Next action', { exact: true })).toHaveValue('Call supplier and review the retained receiving evidence.')
  if (shots) {
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1000 })
      await panel.screenshot({ path: join(shots, `${width}-operational-cases.png`) })
    }
  }
  await page.setViewportSize({ width: 390, height: 1000 })
  await detail.getByText('Cancel this case', { exact: true }).click()
  await detail.getByLabel('Cancellation reason', { exact: true }).fill('Owner abandoned duplicate procurement; remaining source work stays visible.')
  await detail.getByRole('checkbox').check()
  await detail.getByRole('button', { name: 'Cancel case', exact: true }).click()
  await expect.poll(async () => (await state()).operationalExceptions.find((r: any) => r.id === record.id).status).toBe('cancelled')
  expect((await state()).purchaseOrders.find((r: any) => r.id === po.id).status).toBe('committed')
  await page.reload(); await detail.locator('summary').first().click()
  await expect(detail.locator('summary').first()).toContainText('Canceled')
  await detail.getByText('Closure and case history', { exact: true }).click()
  await expect(detail).toContainText('Owner abandoned duplicate procurement; remaining source work stays visible.')
  if (shots) for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 })
    await panel.screenshot({ path: join(shots, `${width}-operational-case-history.png`) })
  }
  const colleague = await context.browser()!.newContext()
  let colleagueId: string
  try {
    const staff = await colleague.newPage()
    await staff.goto(process.env.PIER_OPEN!.replace('as=owner', 'as=member'))
    await staff.waitForURL(url => url.pathname === '/app' && !url.hash.includes('rer-dev'))
    colleagueId = (await (await colleague.request.get(origin + '/auth/session')).json()).operator.id
  } finally { await colleague.close() }
  await command('role.set', { operatorId: colleagueId, role: 'owner' })
  await page.reload(); await deliveryDetail.locator('summary').first().click()
  await deliveryDetail.getByLabel('Assigned owner', { exact: true }).selectOption(colleagueId)
  await deliveryDetail.getByRole('button', { name: 'Save next action', exact: true }).click()
  await expect.poll(async () => (await state()).operationalExceptions.find((r: any) => r.id === delivery.id).assigneeId).toBe(colleagueId)
  await command('role.set', { operatorId: colleagueId, role: 'viewer' })
  await page.reload(); await deliveryDetail.locator('summary').first().click()
  await expect(deliveryDetail).toContainText('Unassigned')
  await expect(deliveryDetail).toContainText('Choose a current owner')
  if (shots) for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 })
    await panel.screenshot({ path: join(shots, `${width}-operational-case-unassigned.png`) })
  }
  await deliveryDetail.getByLabel('Assigned owner', { exact: true }).selectOption(owner)
  await deliveryDetail.getByRole('button', { name: 'Save next action', exact: true }).click()
  await expect.poll(async () => (await state()).operationalExceptions.find((r: any) => r.id === delivery.id).assigneeId).toBe(owner)
  await expect(deliveryDetail).not.toContainText('Choose a current owner')
  if (shots) for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 })
    await panel.screenshot({ path: join(shots, `${width}-operational-case-reassigned.png`) })
  }
})
