import { test, expect, type Page, type Locator } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'

const origin = process.env.PIER_BASE_URL || 'http://127.0.0.1:8787'
const shots = process.env.PIER_SCREENSHOTS
const section = (page: Page, title: string) => page.locator('section').filter({ has: page.getByRole('heading', { name: title, exact: true }) }).last()

async function submit(page: Page, form: Locator, button: string, success = true) {
  const result = page.waitForResponse(response => response.url() === `${origin}/api/pier/commands` && response.request().method() === 'POST')
  await form.getByRole('button', { name: button, exact: true }).click()
  const response = await result
  const body = await response.json()
  expect(body.ok).toBe(success)
  await expect(page.locator('main')).toHaveAttribute('aria-busy', 'false')
  if (success) await expect(page.getByRole('status').filter({ hasText: 'Saved.' })).toBeVisible()
  else await expect(page.getByRole('alert')).toBeVisible()
}

for (const width of [1440, 390]) {
test(`owner completes real UI journeys at ${width}px`, async ({ page, context }) => {
  const entry = process.env.PIER_OPEN
  if (!entry) throw new Error('Set PIER_OPEN privately to rer dev’s native owner-entry URL; this test requires an actual local installation.')
  await page.setViewportSize({ width, height: 1000 })
  if (shots) {
    await mkdir(shots, { recursive: true })
    await page.goto(`${origin}/`)
    const lobbyState = await page.getByRole('link', { name: 'Finish setup', exact: true }).isVisible() ? 'unclaimed-lobby' : 'lobby'
    await page.screenshot({ path: join(shots, `${width}-${lobbyState}.png`), fullPage: true })
    await page.goto(`${origin}/signin`)
    await page.screenshot({ path: join(shots, `${width}-signin.png`), fullPage: true })
  }
  // Native entry is a credential. Keep it out of trace, screenshots and errors.
  try {
    await page.goto(entry)
    await page.waitForURL(url => !url.hash.includes('rer-dev') && ['/app', '/setup'].includes(url.pathname))
  } catch { throw new Error('Native owner entry failed; obtain a fresh local entry privately.') }
  if (new URL(page.url()).pathname === '/setup') {
    if (shots) for (const setupWidth of [1440, 390]) {
      await page.setViewportSize({ width: setupWidth, height: 1000 })
      await page.screenshot({ path: join(shots, `${setupWidth}-setup.png`), fullPage: true })
    }
    await page.setViewportSize({ width, height: 1000 })
    await page.getByRole('checkbox').check()
    await page.getByRole('button', { name: 'Finish setup', exact: true }).click()
    await page.waitForURL(url => url.pathname === '/app')
  }
  await page.setViewportSize({ width, height: 1000 })
  await page.goto(`${origin}/app`)
  // The app opens on the order workbench; Stock is one rail link away.
  await expect(page.getByRole('heading', { name: 'Sales orders', exact: true })).toBeVisible()
  await page.getByRole('link', { name: 'Stock', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Stock', exact: true })).toBeVisible()
  const tag = `UI-${crypto.randomUUID().slice(0, 8)}`
  const itemName = `${tag} test item`, itemOption = `${tag} test item · ${tag} (each)`, supplier = `${tag} supplier`, customer = `${tag} customer`, source = `${tag} A`, destination = `${tag} B`, transit = `${tag} transit`
  await page.getByRole('button', { name: 'Add item', exact: true }).click()
  let form = section(page, 'Add item')
  await form.getByLabel('SKU', { exact: true }).fill(tag)
  await form.getByLabel('Product name', { exact: true }).fill(itemName)
  await form.getByLabel('Base unit', { exact: true }).fill('each')
  await form.getByLabel('Exact pack conversion', { exact: true }).fill('0.5')
  await submit(page, form, 'Save')
  for (const [name, kind] of [[source, 'bin'], [destination, 'bin'], [transit, 'transit']]) {
    form = section(page, 'Add warehouse bin or transit location')
    await form.getByLabel('Bin / location name', { exact: true }).fill(name)
    await form.getByLabel('Warehouse', { exact: true }).fill(tag)
    await form.getByLabel('Location kind', { exact: true }).selectOption(kind)
    await submit(page, form, 'Save')
  }
  for (const [name, kind] of [[supplier, 'supplier'], [customer, 'customer']]) {
    form = section(page, 'Add customer or supplier')
    await form.getByLabel('Name', { exact: true }).fill(name)
    await form.getByLabel('Relationship', { exact: true }).selectOption(kind)
    await submit(page, form, 'Save')
  }
  await page.getByRole('link', { name: 'Purchasing', exact: true }).click()
  form = section(page, 'Supplier-item terms')
  await form.getByLabel('Supplier', { exact: true }).selectOption({ label: supplier })
  await form.getByLabel('Item', { exact: true }).selectOption({ label: itemOption })
  for (const [name, value] of [['Supplier code', tag], ['Pack size in base units', '0.5'], ['Unit price (USD)', '2.4'], ['Minimum quantity (base units)', '0.5'], ['Lead time (days)', '3']]) await form.getByLabel(name, { exact: true }).fill(value)
  await submit(page, form, 'Save')
  form = section(page, 'Draft supplier purchase order')
  await form.getByLabel('Supplier', { exact: true }).selectOption({ label: supplier })
  await form.getByLabel('Promise date', { exact: true }).fill('2026-11-01')
  await form.getByLabel('Purchase reason', { exact: true }).fill('Browser acceptance purchase')
  await form.getByLabel('Item 1', { exact: true }).selectOption({ label: itemOption })
  await form.getByLabel('Quantity (base units)', { exact: true }).fill('4.25')
  await form.getByLabel('Unit price (USD)', { exact: true }).fill('2.4')
  await submit(page, form, 'Save draft for exact review')
  const poRow = page.getByRole('row').filter({ hasText: supplier }).filter({ has: page.getByRole('button', { name: 'Review', exact: true }) }).last()
  await poRow.getByRole('button', { name: 'Review', exact: true }).click()
  await submit(page, page.locator('main'), await page.getByRole('button', { name: /^Approve exact version / }).innerText())
  await submit(page, page.locator('main'), 'Commit approved order')
  form = section(page, 'Partial receipt into bins')
  await form.getByLabel('Supplier receipt reference', { exact: true }).fill(`${tag}-receipt`)
  await form.getByLabel('Destination bin', { exact: true }).selectOption({ label: source })
  await form.getByLabel('Received (each)', { exact: true }).fill('3.25')
  await form.getByLabel('Receipt unit cost (USD)', { exact: true }).fill('2.4')
  let receiptCommandId = ''
  const interruptReceipt = async (route: import('@playwright/test').Route) => {
    const body = route.request().postDataJSON()
    if (body.type !== 'receipt.create' || receiptCommandId) { await route.continue(); return }
    receiptCommandId = body.commandId
    const committed = await route.fetch()
    expect(committed.status()).toBe(200)
    await route.abort('connectionreset')
  }
  await page.route('**/api/pier/commands', interruptReceipt)
  await form.getByRole('button', { name: 'Record receipt', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Recover interrupted action', exact: true })).toBeVisible()
  await page.unroute('**/api/pier/commands', interruptReceipt)
  await page.reload()
  const recovery = section(page, 'Recover interrupted action')
  const retryRequest = page.waitForRequest(request => request.url() === `${origin}/api/pier/commands`)
  await submit(page, recovery, 'Retry this exact action')
  expect((await retryRequest).postDataJSON().commandId).toBe(receiptCommandId)
  const recovered = await (await context.request.get(`${origin}/api/pier/state`)).json()
  expect(recovered.receipts.filter((receipt: any) => receipt.supplierReference === `${tag}-receipt`)).toHaveLength(1)

  await page.getByRole('link', { name: 'Sales orders', exact: true }).click()
  form = section(page, 'New sales order')
  await form.getByLabel('Customer', { exact: true }).selectOption({ label: customer })
  await form.getByLabel('Promise date', { exact: true }).fill('2026-11-02')
  await form.getByLabel('Item 1', { exact: true }).selectOption({ label: itemOption })
  await form.getByLabel('Quantity (base units)', { exact: true }).fill('2.25')
  await submit(page, form, 'Create and reserve available stock')
  await page.getByRole('row').filter({ hasText: customer }).getByRole('button', { name: /^Open order SO-/ }).click()
  await expect(page.getByRole('heading', { name: 'Reserved sources for physical picking' })).toBeVisible()
  form = section(page, 'Pick and dispatch reserved lines')
  await form.getByLabel('Shipment reference', { exact: true }).fill(`${tag}-shipment`)
  await form.getByLabel(`${itemName} · ${tag} · dispatch (each)`, { exact: true }).fill('0.75')
  await submit(page, form, 'Confirm partial dispatch')
  form = section(page, 'Cancel remaining demand')
  await form.getByLabel('Cancellation reason', { exact: true }).fill('Cancel unshipped acceptance demand')
  await submit(page, form, 'Cancel unshipped demand and release reservations')
  form = section(page, 'Return dispatched goods into quarantine').last()
  await form.getByLabel('Shipment line', { exact: true }).selectOption({ index: 1 })
  await form.getByLabel('Quarantine bin', { exact: true }).selectOption({ label: source })
  await form.getByLabel('Returned quantity (base units)', { exact: true }).fill('0.25')
  await form.getByLabel('Return reason', { exact: true }).fill('Physical acceptance return')
  await submit(page, form, 'Record quarantined return')
  const returnedRecord = section(page, 'Quarantine review').locator('.record').filter({ hasText: itemName }).last()
  await submit(page, returnedRecord, 'Approve exact return for restocking')
  await submit(page, returnedRecord, 'Restock approved return')
  await page.getByRole('link', { name: 'Transfers', exact: true }).click()
  form = section(page, 'Dispatch available stock to transit')
  await form.getByLabel('Item', { exact: true }).selectOption({ label: itemOption })
  await form.getByLabel('Source bin', { exact: true }).selectOption({ label: source })
  await form.getByLabel('Destination bin', { exact: true }).selectOption({ label: destination })
  await form.getByLabel('Transit location', { exact: true }).selectOption({ label: transit })
  await form.getByLabel('Quantity (base units)', { exact: true }).fill('0.5')
  await form.getByLabel('Transfer reason', { exact: true }).fill('Physical bin transfer')
  await submit(page, form, 'Dispatch transfer')
  await submit(page, page.getByRole('row').filter({ hasText: itemName }).last(), 'Confirm full destination receipt')
  await page.getByRole('link', { name: 'Counts', exact: true }).click()
  form = section(page, 'Capture bin count frontier')
  await form.getByLabel('Bin', { exact: true }).selectOption({ label: destination })
  await submit(page, form, 'Begin count')
  form = section(page, 'Record physical quantities').last()
  await form.getByLabel(`${itemName} · ${tag} · sellable (each)`, { exact: true }).fill('0.5')
  await form.getByLabel('Count evidence / reason', { exact: true }).fill('Physical shelf agrees')
  await submit(page, form, 'Save physical count for review')
  const approve = page.getByRole('button', { name: /^Approve version .* adjustment$/ }).last()
  await submit(page, section(page, destination), await approve.innerText())
  // Inspect actual persisted state, not a fake browser response or internal service.
  const saved = await context.request.get(`${origin}/api/pier/state`)
  const state = await saved.json()
  const item = state.items.find((row: any) => row.sku === tag)
  const bin = state.locations.find((row: any) => row.name === destination)
  expect(state.positions.find((row: any) => row.itemId === item.id && row.locationId === bin.id && row.status === 'sellable').quantity).toBe('0.5')
  expect(state.movements.some((row: any) => row.itemId === item.id)).toBe(true)
  await page.getByRole('link', { name: 'Purchasing', exact: true }).click()
  const receiptRecord = section(page, 'Receipts and linked corrections').locator('.record').filter({ hasText: `${tag}-receipt` }).last()
  form = receiptRecord.locator('section').filter({ has: page.getByRole('heading', { name: 'Reverse receipt with compensating movements', exact: true }) })
  await form.getByLabel('Correction reason', { exact: true }).fill('Unsafe reversal after physical dispatch')
  await submit(page, form, 'Check dependencies and reverse', false)
  await expect(page.getByRole('alert')).toContainText('downstream movements')
  await page.getByRole('link', { name: 'Counts', exact: true }).click()
  form = section(page, 'Capture bin count frontier')
  await form.getByLabel('Bin', { exact: true }).selectOption({ label: source })
  await submit(page, form, 'Begin count')
  form = section(page, source).locator('section').filter({ has: page.getByRole('heading', { name: 'Record physical quantities', exact: true }) })
  await form.getByLabel(`${itemName} · ${tag} · sellable (each)`, { exact: true }).fill('2.2')
  await form.getByLabel('Count evidence / reason', { exact: true }).fill('Reviewed physical correction after downstream work')
  await submit(page, form, 'Save physical count for review')
  await page.getByRole('link', { name: 'Purchasing', exact: true }).click()
  form = receiptRecord.locator('section').filter({ has: page.getByRole('heading', { name: 'Correct receipt from a physical bin count', exact: true }) })
  await form.getByLabel('Reviewed physical count', { exact: true }).selectOption({ index: 1 })
  await form.getByLabel('Correction reason', { exact: true }).fill('Use reviewed count; retain dispatched history')
  await submit(page, form, 'Approve linked count correction')
  await page.getByRole('link', { name: 'Imports', exact: true }).click()
  // The native CSV kit sits behind the move-in form's disclosure.
  await page.getByText('Import Pier native CSV instead', { exact: true }).click()
  form = section(page, 'Capture native CSV files')
  const sources = [
    ['items', 'key,sku,name,barcode,unit,packSize\nitem,' + tag + '-IMPORT,' + tag + ' imported item,,each,1\n'],
    ['locations', 'key,name,warehouse,kind\nbin,' + tag + ' import bin,' + tag + ',bin\n'],
    ['positions', 'key,itemKey,locationKey,status,quantity,unit,cost\nopening,item,bin,sellable,0.3,each,2.4\n'],
  ]
  await form.getByLabel('Original CSV files', { exact: true }).setInputFiles(sources.map(([kind, csv]) => ({ name: `${kind}.csv`, mimeType: 'text/csv', buffer: Buffer.from(csv, 'utf-8') })))
  for (let index = 0; index < sources.length; index++) await form.getByLabel('Native record type', { exact: true }).nth(index).selectOption(sources[index][0])
  for (const [name, value] of [['Source namespace', tag], ['Source version', 'browser-acceptance'], ['Exported at (ISO timestamp)', '2026-10-13T00:00:00Z'], ['Export filters / scope', 'isolated browser acceptance rows'], ['Cutoff timezone', 'America/Chicago'], ['Mapping revision', '1']]) await form.getByLabel(name, { exact: true }).fill(value)
  await submit(page, form, 'Stage files without changing live stock')
  const batch = page.locator('section.panel').filter({ has: page.getByRole('heading', { name: new RegExp(`^${tag} `) }) }).last()
  for (const stage of ['mapped', 'reconciled', 'shadow', 'frozen']) {
    form = batch.locator('section').filter({ has: page.getByRole('heading', { name: 'Review the next migration stage', exact: true }) })
    await form.getByLabel('Review stage', { exact: true }).selectOption(stage)
    await form.getByLabel('Review reason / evidence', { exact: true }).fill(`Checked ${stage} against native rows`)
    await submit(page, form, 'Record review')
  }
  await submit(page, batch, await batch.getByRole('button', { name: /^Commit frozen version / }).innerText())
  form = batch.locator('section').filter({ has: page.getByRole('heading', { name: 'Undo accepted batch', exact: true }) })
  await form.getByLabel('Undo reason', { exact: true }).fill('Browser acceptance rollback before downstream use')
  await submit(page, form, 'Check dependencies and undo')
  await page.getByRole('link', { name: 'Activity', exact: true }).click()
  const invitedName = `${tag} stock agent`, invitedEmail = `${tag.toLowerCase()}@example.test`
  form = section(page, 'Invite an operator')
  await form.getByLabel('Operator name', { exact: true }).fill(invitedName)
  await form.getByLabel('Operator email', { exact: true }).fill(invitedEmail)
  const invitation = page.waitForResponse(response => response.url() === `${origin}/auth/invite` && response.request().method() === 'POST')
  await form.getByRole('button', { name: 'Invite operator', exact: true }).click()
  const accepted = await invitation
  expect(accepted.status()).toBe(202)
  expect((await accepted.json()).status).toBe('accepted')
  const operatorRow = section(page, 'Operator roles').getByRole('row').filter({ hasText: invitedName })
  await expect(operatorRow).toContainText(invitedEmail)
  await expect(operatorRow).toContainText('Invited')
  form = section(page, 'Set an invited operator’s role')
  await form.getByLabel('Operator', { exact: true }).selectOption({ label: invitedName })
  await form.getByLabel('Role', { exact: true }).selectOption('agent')
  await submit(page, form, 'Save')
  await expect(operatorRow.getByRole('cell').last()).toHaveText('Agent')
  form = section(page, 'Prepare evidence-backed proposal')
  await form.getByLabel('Preparation kind', { exact: true }).selectOption('replenishment')
  await form.getByLabel('Assumptions and explanation', { exact: true }).fill(`${tag}: reviewed replenishment preparation; stock remains physical`)
  await form.getByLabel('Evidence record identities (one per line)', { exact: true }).fill(item.id)
  await form.getByLabel('Supplier', { exact: true }).selectOption({ label: supplier })
  await form.getByLabel('Item', { exact: true }).selectOption({ label: itemOption })
  for (const [name, value] of [['Minimum quantity', '0'], ['Recommended quantity', '1'], ['Stretch quantity', '2'], ['Promise date', '2026-11-05'], ['Demand, stockout censoring, lead times and expected receipts', 'Observed order cancelled; review supplier lead time and the remaining receipt']]) await form.getByLabel(name, { exact: true }).fill(value)
  await submit(page, form, 'Save preparation for human review')
  const proposal = page.locator('section.panel').filter({ hasText: `${tag}: reviewed replenishment preparation` }).last()
  await submit(page, proposal, await proposal.getByRole('button', { name: /^Approve exact version / }).innerText())
  await submit(page, proposal, 'Apply approved proposal')
  await expect(proposal).toContainText('Executed')
  for (const screenshotWidth of [width]) {
    await page.setViewportSize({ width: screenshotWidth, height: 1000 })
    for (const [tab, title] of [['stock', 'Stock'], ['sales', 'Sales orders'], ['purchasing', 'Purchasing'], ['transfers', 'Transfers'], ['counts', 'Counts'], ['imports', 'Imports'], ['activity', 'Activity']]) {
      await page.goto(`${origin}/app#${tab}`)
      await expect(page.getByRole('heading', { name: title, exact: true }).first()).toBeVisible()
      if (tab === 'stock') await page.getByRole('button', { name: itemName, exact: true }).first().click()
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)
      if (shots) { await mkdir(shots, { recursive: true }); await page.screenshot({ path: join(shots, `${screenshotWidth}-${tab}.png`), fullPage: true }) }
    }
  }
  await page.getByRole('button', { name: 'Sign out', exact: true }).click()
  await page.waitForURL(url => url.pathname === '/signin')
  expect((await context.request.get(`${origin}/api/pier/state`)).status()).toBe(401)
  await page.goto(`${origin}/`)
  await expect(page.getByRole('link', { name: 'Sign in', exact: true })).toBeVisible()
  if (shots) await page.screenshot({ path: join(shots, `${width}-lobby.png`), fullPage: true })
  await page.getByRole('link', { name: 'Sign in', exact: true }).click()
  await page.waitForURL(url => url.pathname === '/signin')
  if (shots) await page.screenshot({ path: join(shots, `${width}-signin.png`), fullPage: true })
})

}
