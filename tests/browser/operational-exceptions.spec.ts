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
  await command('exception.policy', { version: 0, enabled: true, assigneeId: owner, escalationOwnerId: owner, dueHours: 24 })
  await command('exception.check', {})
  const cases = (await state()).operationalExceptions
  const record = cases.find((r: any) => r.sourceId === po.id), delivery = cases.find((r: any) => r.sourceId === order.id)
  await page.setViewportSize({ width: 1440, height: 1000 }); await page.goto(origin + '/app#activity')
  const panel = page.getByRole('region', { name: 'Operational cases' }), detail = panel.locator(`[data-case-id="${record.id}"]`)
  const deliveryDetail = panel.locator(`[data-case-id="${delivery.id}"]`)
  await deliveryDetail.locator('summary').first().click()
  await deliveryDetail.getByLabel('Next action', { exact: true }).fill('Call the customer and confirm the actual shipment evidence.')
  await deliveryDetail.getByRole('button', { name: 'Save next action', exact: true }).click()
  await expect(deliveryDetail.getByLabel('Next action', { exact: true })).toHaveValue('Call the customer and confirm the actual shipment evidence.')
  await deliveryDetail.locator('summary').first().click()
  await detail.locator('summary').first().click()
  await detail.getByLabel('Next action', { exact: true }).fill('Call supplier and review the retained receiving evidence.')
  await detail.getByLabel('Due date and time', { exact: true }).fill('2020-01-02T09:00')
  await detail.getByRole('button', { name: 'Save next action', exact: true }).click()
  await expect(detail).toContainText('Task unanswered by its due date.')
  await detail.getByRole('button', { name: 'Check closure evidence', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('current inventory reconciliation')
  await page.reload(); await detail.locator('summary').first().click()
  await expect(detail.getByLabel('Next action', { exact: true })).toHaveValue('Call supplier and review the retained receiving evidence.')
  const shots = process.env.PIER_SCREENSHOTS
  if (shots) {
    await mkdir(shots, { recursive: true })
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1000 })
      await panel.screenshot({ path: join(shots, `${width}-operational-cases.png`) })
    }
  }
  await page.setViewportSize({ width: 1440, height: 1000 })
  await detail.getByText('Cancel this case', { exact: true }).click()
  await detail.getByLabel('Cancellation reason', { exact: true }).fill('Owner abandoned duplicate procurement; remaining source work stays visible.')
  await detail.getByRole('checkbox').check()
  await detail.getByRole('button', { name: 'Cancel case', exact: true }).click()
  await page.reload(); await detail.locator('summary').first().click()
  await expect(detail.locator('summary').first()).toContainText('Canceled')
  await detail.getByText('Closure and case history', { exact: true }).click()
  await expect(detail).toContainText('Owner abandoned duplicate procurement; remaining source work stays visible.')
  if (shots) for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 })
    await panel.screenshot({ path: join(shots, `${width}-operational-case-history.png`) })
  }
})
