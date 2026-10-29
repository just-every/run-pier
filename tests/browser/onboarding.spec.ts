import { test, expect } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { ownerEntry } from './session'
// @ts-expect-error Native fixture is submitted only through authenticated public commands.
import { nativeCapture } from '../api/onboarding-fixture.mjs'

test('owner follows onboarding source problems, reviewed cutover and reload recovery', async ({ page, context }) => {
  const origin = await ownerEntry(page)
  await page.setViewportSize({ width: 1440, height: 1000 })
  const command = async (type: string, payload: object, commandId = crypto.randomUUID()) => {
    const response = await context.request.post(`${origin}/api/pier/commands`, { headers: { origin }, data: { commandId, type, payload } })
    const body = await response.json(); expect(body.ok, JSON.stringify(body)).toBe(true); return body.result
  }
  const exportRecords = async () => {
    const { exportedAt, ...records } = await (await context.request.get(`${origin}/api/pier/export`)).json()
    return records
  }
  const screen = () => page.getByRole('region', { name: 'Onboarding diagnostic', exact: true })
  const capture = async (name: string) => {
    const shots = process.env.PIER_SCREENSHOTS
    if (!shots) return
    await mkdir(shots, { recursive: true })
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1000 })
      await page.screenshot({ path: join(shots, `${width}-onboarding-${name}.png`), fullPage: true })
    }
    await page.setViewportSize({ width: 1440, height: 1000 })
  }
  const open = async () => {
    await page.goto(`${origin}/app#activity/onboarding`); await page.reload()
    await expect(page.getByRole('button', { name: 'Reload onboarding', exact: true })).toBeEnabled()
  }
  const beforeEmpty = await exportRecords()
  await page.goto(`${origin}/app#activity`)
  await page.getByRole('region', { name: 'Settings', exact: true }).getByRole('link', { name: 'Onboarding diagnostic', exact: true }).click()
  await expect(screen()).toContainText('Empty installation')
  await expect(screen().getByRole('link', { name: 'Record your business details', exact: true })).toHaveAttribute('href', '#purchasing')
  await expect(screen()).toContainText('No successful provider request recorded')
  await capture('empty')
  expect(await exportRecords()).toEqual(beforeEmpty)
  await page.route('**/api/pier/onboarding', route => route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }))
  await page.getByRole('button', { name: 'Reload onboarding', exact: true }).click()
  await expect(screen().getByRole('alert')).toContainText('Onboarding could not be loaded')
  await expect(screen().getByRole('heading', { name: 'Next native action', exact: true })).toHaveCount(0)
  await capture('read-error')
  await page.unroute('**/api/pier/onboarding')
  await page.getByRole('button', { name: 'Reload onboarding', exact: true }).click()
  await expect(screen()).toContainText('Empty installation')

  const invalid = await command('import.stage', nativeCapture('2', 'AUD'))
  await open()
  const invalidView = screen().getByRole('region', { name: `Native capture ${invalid.id}`, exact: true })
  await expect(invalidView).toContainText('Invalid')
  await expect(invalidView).toContainText('CONVERSION_RATE')
  await expect(invalidView).toContainText('positions.csv, row 2')
  await expect(invalidView).toContainText('opening')
  await capture('invalid')
  await invalidView.getByRole('link', { name: 'Inspect source problem', exact: true }).first().click()
  await expect(page).toHaveURL(`${origin}/app#imports/${invalid.id}`)
  await expect(page.locator(`[id="document-${invalid.id}"]`)).toContainText('positions.csv, row 2')

  let batch = await command('import.stage', nativeCapture())
  await open()
  await expect(screen().getByRole('region', { name: `Native capture ${batch.id}`, exact: true })).toContainText('Staged')
  await capture('staged')
  await screen().getByRole('link', { name: 'Review identities and units', exact: true }).first().click()
  for (const stage of ['mapped', 'reconciled', 'shadow', 'frozen']) {
    const review = page.locator(`[id="document-${batch.id}"]`).getByRole('heading', { name: 'Review the next migration stage', exact: true }).locator('..')
    await review.getByLabel('Review stage', { exact: true }).selectOption(stage)
    await review.getByLabel('Review reason / evidence', { exact: true }).fill('Owner checked original rows and independent totals')
    const reply = page.waitForResponse(response => response.url().endsWith('/api/pier/commands') && response.request().postDataJSON()?.type === 'import.review')
    await review.getByRole('button', { name: 'Record review', exact: true }).click()
    batch = (await (await reply).json()).result
    expect(batch.status).toBe(stage)
    await expect(page.getByRole('button', { name: 'Saving…', exact: true })).toHaveCount(0)
  }
  await open()
  const reviewed = screen().getByRole('region', { name: `Native capture ${batch.id}`, exact: true })
  await expect(reviewed).toContainText('Reviewed'); await expect(reviewed).toContainText('Frozen')
  await expect(reviewed).toContainText('4 explicit review stages retained')
  await capture('reviewed')
  await reviewed.getByRole('link', { name: 'Commit the explicitly frozen version', exact: true }).click()
  const payload = { batchId: batch.id, version: batch.version }
  const committedResponse = page.waitForResponse(response => response.url().endsWith('/api/pier/commands') && response.request().postDataJSON()?.type === 'import.commit')
  await page.getByRole('button', { name: `Commit frozen version ${batch.version}`, exact: true }).click()
  const committedReply = await committedResponse, intent = committedReply.request().postDataJSON()
  expect((await committedReply.json()).ok).toBe(true)
  const posted = await exportRecords()
  expect(posted.movements).toHaveLength(1); expect(posted.movements[0].quantity).toBe('2000000')
  await command('import.commit', payload, intent.commandId)
  expect(await exportRecords()).toEqual(posted)
  await open()
  await expect(screen().getByRole('region', { name: `Native capture ${batch.id}`, exact: true })).toContainText('Committed')
  await capture('committed')

  let revision = await command('import.stage', { ...nativeCapture('3'), sourceVersion: 'owner-export-2' })
  await open()
  const revisionView = screen().getByRole('region', { name: `Native capture ${revision.id}`, exact: true })
  await expect(revisionView).toContainText('REVISION_REVIEW'); await expect(revisionView).toContainText('opening')
  await capture('revision')
  await revisionView.getByRole('link', { name: 'Review changed source rows explicitly', exact: true }).click()
  const changed = page.locator(`[id="document-${revision.id}"]`).getByRole('heading', { name: 'Review changed source rows', exact: true }).locator('..')
  await changed.getByRole('checkbox', { name: 'Approve replacement of this exact source row', exact: true }).check()
  await changed.getByLabel('Revision decision reason', { exact: true }).fill('Correct opening quantity from owner source')
  const revised = page.waitForResponse(response => response.url().endsWith('/api/pier/commands') && response.request().postDataJSON()?.type === 'import.revise')
  await changed.getByRole('button', { name: 'Approve selected replacements and re-preview', exact: true }).click()
  revision = (await (await revised).json()).result
  expect(revision.errors).toEqual([])
  await open()
  await expect(screen().getByRole('region', { name: `Native capture ${revision.id}`, exact: true })).toContainText('Staged')
  const beforeReads = await exportRecords()
  await page.getByRole('button', { name: 'Reload onboarding', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Reload onboarding', exact: true })).toBeEnabled()
  expect(await exportRecords()).toEqual(beforeReads)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)
  // Denied refreshes discard the private projection; a later sign-in can recover it.
  await page.route('**/api/pier/onboarding', route => route.fulfill({ status: 403, contentType: 'application/json', body: '{}' }))
  await page.getByRole('button', { name: 'Reload onboarding', exact: true }).click()
  await expect(screen().getByRole('alert')).toBeVisible()
  await expect(screen().getByRole('region', { name: `Native capture ${revision.id}`, exact: true })).toHaveCount(0)
  await page.unroute('**/api/pier/onboarding')
  await page.getByRole('button', { name: 'Reload onboarding', exact: true }).click()
  await expect(screen().getByRole('region', { name: `Native capture ${revision.id}`, exact: true })).toBeVisible()
  await capture('recovered')
})
