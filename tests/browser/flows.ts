import type { Page, Locator } from '@playwright/test'

// Public browser workflows. Factories bind the current disposable installation,
// so each part of a business journey has fresh native authority and stock.
export async function journey(width = 1440) {
const { authenticatorCode } = await import('../api/strong-auth-fixture.mjs');
const { pantryInstallation } = await import('../api/pantry-installation.mjs');
const { inboundNotice } = await import('../api/inbound-asn-fixture.mjs');
const { salesWorkbook } = await import('../api/sales-workbook.mjs');
const { documentOriginal } = await import('../api/document-original.mjs');
const { pdfText } = await import('../api/pdf-text.mjs');
const { ownerEntry } = await import('./session');

const { expect } = await import('@playwright/test');
const { mkdir } = await import('node:fs/promises');
const { join } = await import('node:path');


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



async function salesHarness(page:any,context:any){
  const base=await ownerEntry(page)
  const state=async()=>{const response=await context.request.get(`${base}/api/pier/state`);expect(response.ok()).toBe(true);return response.json()}
  const command=async(type:string,payload:any)=>{const response=await context.request.post(`${base}/api/pier/commands`,{headers:{origin:base},data:{commandId:crypto.randomUUID(),type,payload}});const body=await response.json();expect(body.ok,JSON.stringify(body)).toBe(true);return body.result}
  const panel=(title:string)=>page.locator('section.panel').filter({has:page.getByRole('heading',{name:title,exact:true})}).last()
  const shot=async(width:number,name:string)=>{if(shots)await page.screenshot({path:join(shots,`${width}-${name}.png`),fullPage:true});if(shots)await page.screenshot({path:join(shots,`${width}-${name}-viewport.png`)});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1)).toBe(true)}
  const fixture=async(width:number)=>{
    const suffix=crypto.randomUUID().slice(0,6),name=`synthetic-pier-${width}-${suffix}`
    const item=await command('item.save',{sku:name,name:`Case ${name}`,unit:'each',packSize:'12',barcode:`item-${name}`}),bin=await command('location.save',{name:`Bin ${name}`,warehouse:name,kind:'bin'}),customer=await command('party.save',{name:`Buyer ${name}`,kind:'customer'}),supplier=await command('party.save',{name:`Supplier ${name}`,kind:'supplier'})
    let po=await command('po.draft',{supplierId:supplier.id,promiseDate:'2026-11-01',reason:'Browser stock',lines:[{itemId:item.id,quantity:'100',price:'1'}]});await command('po.approve',{poId:po.id,version:po.version});po=await command('po.commit',{poId:po.id,version:po.version});await command('receipt.create',{poId:po.id,supplierReference:name,lines:[{poLineId:po.lines[0].id,locationId:bin.id,quantity:'100',cost:'1'}]})
    await command('business.save',{name:'Harbor Wholesale Supply',address:'30 Dock Road, San Francisco CA 94107',shipTo:{}})
    return {item,bin,customer,supplier,name}
  }
  const sales=async()=>{await page.goto(`${base}/app#sales`);await page.reload();await expect(page.getByRole('heading',{name:'Sales orders',exact:true})).toBeVisible()}
  const saved=async(form:any,button:string)=>{await form.getByRole('button',{name:button,exact:true}).click();await expect(page.locator('main')).toHaveAttribute('aria-busy','false');await expect(page.getByRole('status').filter({hasText:'Saved.'})).toBeVisible()}
  return {base,state,command,panel,shot,fixture,sales,saved}
}


async function assertNativeWidth(page: Page) {
  const result = await page.evaluate(() => ({ viewport: window.innerWidth, width: document.documentElement.scrollWidth, edges: [...document.querySelectorAll('body *')].map(e => ({ tag: e.tagName, class: e.className, right: e.getBoundingClientRect().right, text: e.textContent?.slice(0, 60) })).filter(e => e.right > window.innerWidth + 1).slice(-20) }))
  expect(result.width, JSON.stringify(result)).toBeLessThanOrEqual(result.viewport + 1)
}
return [
{ title: `owner completes real UI journeys at ${width}px`, run: async ({ page, context }) => {
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
    if (shots) for (const setupWidth of [1440]) {
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
  await form.getByLabel('Receipt unit cost (source currency)', { exact: true }).fill('2.4')
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
  const recoveryPanel = section(page, 'Recover interrupted action')
  await expect(recoveryPanel).not.toContainText(receiptCommandId)
  await expect(recoveryPanel).not.toContainText('receipt.create')
  if (shots) for (const proofWidth of [1440]) {
    await page.setViewportSize({ width: proofWidth, height: 1000 })
    await page.screenshot({ path: join(shots, `${proofWidth}-receipt-recovery.png`), fullPage: true })
  }
  await page.setViewportSize({ width, height: 1000 })
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
  await form.getByLabel('Order warehouse', { exact: true }).selectOption(tag)
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
  form = section(page, 'Review restock quantity').last()
  await form.getByLabel('Restock quantity (base units)', { exact: true }).fill('0.1')
  await submit(page, form, 'Approve partial restock')
  await submit(page, returnedRecord, 'Restock approved return')
  let partialState = await (await context.request.get(`${origin}/api/pier/state`)).json()
  const partialReturn = partialState.returns.find((row: any) => row.reason === 'Physical acceptance return' && partialState.items.some((item: any) => item.id === row.itemId && item.sku === tag))
  expect(partialReturn.status).toBe('quarantine'); expect(partialReturn.restocked).toBe('0.1')
  expect(partialState.positions.find((row: any) => row.itemId === partialReturn.itemId && row.locationId === partialReturn.locationId && row.status === 'quarantine').quantity).toBe('0.15')
  if (shots) for (const proofWidth of [1440]) {
    await page.setViewportSize({ width: proofWidth, height: 1000 })
    await returnedRecord.screenshot({ path: join(shots, `${proofWidth}-partial-return.png`) })
  }
  await page.setViewportSize({ width, height: 1000 })
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
  form = section(page, `Receive transfer: ${source} → ${destination}`)
  await form.getByLabel('Received quantity (base units)', { exact: true }).fill('0.2')
  await submit(page, form, 'Record destination receipt')
  partialState = await (await context.request.get(`${origin}/api/pier/state`)).json()
  const partialTransfer = partialState.transfers.find((row: any) => row.reason === 'Physical bin transfer' && row.itemId === partialReturn.itemId)
  expect(partialTransfer.status).toBe('transit'); expect(partialTransfer.received).toBe('0.2')
  expect(partialState.positions.find((row: any) => row.locationId === partialTransfer.transitLocationId && row.itemId === partialTransfer.itemId).quantity).toBe('0.3')
  if (shots) for (const proofWidth of [1440]) {
    await page.setViewportSize({ width: proofWidth, height: 1000 })
    await page.screenshot({ path: join(shots, `${proofWidth}-partial-transfer.png`), fullPage: true })
  }
  await page.setViewportSize({ width, height: 1000 })
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
  await expect(operatorRow.getByRole('cell').nth(2)).toHaveText('Agent')
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
} },
{ title: 'customer sales files preview prices and errors before creating orders on desktop', run: async({page,context})=>{
  const h=await salesHarness(page,context)
  for(const width of[1440]){
    await page.setViewportSize({width,height:1000});const b=await h.fixture(width);await h.command('priceList.save',{customerId:b.customer.id,itemId:b.item.id,minimumQuantity:'0',price:'2'});await h.sales()
    const header='customer,poReference,item,quantity,unit,price,shipTo,state,postalCode,country,requestedDate,warehouse',line=[b.customer.id,b.name,b.item.sku,'3','each','','40 Pier Road','CA','94107','US','2026-11-01',b.name].join(',')
    const form=h.panel('Review a customer order file');await form.getByLabel('Customer order CSV',{exact:true}).fill([header,line.split(',').map((cell,i)=>i===2?'unknown-pier-code':cell).join(',')].join('\n'));await h.saved(form,'Preview customer orders');let batch=(await h.state()).salesImports.at(-1);await expect(page.getByRole('row').filter({hasText:b.name}).getByText(/unknown-pier-code must resolve/)).toBeVisible();expect((await h.state()).orders.filter((o:any)=>o.customerId===b.customer.id)).toHaveLength(0);await h.shot(width,'sales-file-errors')
    {await form.getByLabel('Customer order file',{exact:true}).setInputFiles({name:`${b.name}.xlsx`,mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:Buffer.from(salesWorkbook([header.split(','),line.split(',')]))});await expect(form.getByText(`Workbook selected: ${b.name}.xlsx`,{exact:true})).toBeVisible()};await h.saved(form,'Preview customer orders');batch=(await h.state()).salesImports.find((r:any)=>r.groups.some((g:any)=>g.customerId===b.customer.id)&&r.preview.every((p:any)=>!p.errors.length));const preview=page.locator('section.panel').filter({has:page.getByRole('heading',{name:`Customer file · ${batch.name}`,exact:true})}).filter({has:page.getByRole('button',{name:'Approve exact customer orders',exact:true}).and(page.locator('button:not(:disabled)'))}).last();await h.shot(width,'sales-file-review');await preview.getByRole('button',{name:'Approve exact customer orders',exact:true}).click();await expect.poll(async()=>((await h.state()).orders.filter((o:any)=>o.customerId===b.customer.id)).length).toBe(1);await h.shot(width,'sales-file-created')
  }
} },
{ title: 'an owner authorizes, runs and pauses recurring demand on desktop', run: async({page,context})=>{
  const h=await salesHarness(page,context)
  for(const width of[1440]){
    await page.setViewportSize({width,height:1000});const b=await h.fixture(width);await h.sales();await page.getByText('Recurring wholesale orders',{exact:true}).click();let form=h.panel('Review customer credit clearance');await form.getByLabel('Credit customer',{exact:true}).selectOption(b.customer.id);await form.getByLabel('Credit decision',{exact:true}).selectOption('clear');await form.getByLabel('Reviewed credit allowance USD',{exact:true}).fill('30');await form.getByLabel('Credit clearance valid through',{exact:true}).fill(new Date(Date.now()+86400000*10).toISOString().slice(0,10));await form.getByLabel('Credit clearance reason',{exact:true}).fill('Owner reviewed recurring credit');await h.saved(form,'Save owner credit decision')
    form=h.panel('Authorize a recurring order');await form.getByLabel('Recurring order name',{exact:true}).fill(b.name);await form.getByLabel('Recurring customer',{exact:true}).selectOption(b.customer.id);await form.getByLabel('Recurring warehouse',{exact:true}).selectOption(b.name);await form.getByLabel('Recurring item',{exact:true}).selectOption(b.item.id);await form.getByLabel('Recurring base quantity',{exact:true}).fill('2');await form.getByLabel('Recurring unit price USD (blank uses current tier)',{exact:true}).fill('3');await form.getByLabel('Next recurrence day',{exact:true}).fill(new Date().toISOString().slice(0,10));await form.getByLabel('Maximum order total USD',{exact:true}).fill('10');await form.getByLabel('Recurring approval reason',{exact:true}).fill('Explicit bounded recurrence');await form.getByLabel('Enable approved recurrence',{exact:true}).check();await h.shot(width,'recurring-policy');await h.saved(form,'Save recurring order policy')
    const schedulePanel=h.panel(`Recurring · ${b.name}`);await schedulePanel.getByRole('button',{name:'Run due occurrence',exact:true}).click();await expect(schedulePanel.getByRole('link',{name:'Open generated order',exact:true})).toBeVisible();let schedule=(await h.state()).recurringOrders.find((r:any)=>r.name===b.name);expect(schedule.occurrences).toHaveLength(1);await h.shot(width,'recurring-created')
    form=h.panel(`Pause or cancel ${b.name}`);await form.getByLabel('Recurring control reason',{exact:true}).fill('Owner paused customer demand');await h.saved(form,'Apply recurring control');await expect(schedulePanel.getByText(/Paused · next due/)).toBeVisible();schedule=(await h.state()).recurringOrders.find((r:any)=>r.id===schedule.id);expect(schedule.enabled).toBe(false);await h.shot(width,'recurring-paused')
  }
} },
{ title: 'a direct supplier shipment records tracking and posts an explicitly authorized customer credit with unchanged stock on desktop', run: async({page,context})=>{
  const pantry=await pantryInstallation({revision:'e987ba0a2270a81c62d399c44c6e05d3b504bb07'})
  try {
  await pantry.command('chart.start',{})
  const inventory=await pantry.command('account.save',{code:'1300',name:'Inventory',type:'asset',subtype:'other'}),cogs=await pantry.command('account.save',{code:'5000',name:'Cost of goods',type:'expense',subtype:'other'}),revenue=(await pantry.view('state')).accounts.find((a:any)=>a.code==='4000')
  const credential=await pantry.command('integration.create',{name:'Pier browser',scopes:['contacts:write','invoices:write','bills:write','journals:write','documents:write','payments:read','reports:read','post']})
  const h=await salesHarness(page,context)
  for(const width of[1440]){
    await page.setViewportSize({width,height:1000});const b=await h.fixture(width),before=(await h.state()).movements;await h.sales();await page.getByText('Direct supplier dropships',{exact:true}).click();let form=h.panel('Link a direct supplier order');await form.getByLabel('Dropship customer',{exact:true}).selectOption(b.customer.id);await form.getByLabel('Dropship supplier',{exact:true}).selectOption(b.supplier.id);await form.getByLabel('Dropship item',{exact:true}).selectOption(b.item.id);for(const [label,value]of[['Dropship base quantity','2'],['Dropship customer unit price USD','10'],['Dropship supplier unit cost USD','4'],['Direct customer shipping address','40 Pier Road, Portland OR 97210'],['Requested supplier date','2026-11-01'],['Dropship reason','Customer requires direct supplier shipment']])await form.getByLabel(label,{exact:true}).fill(value);await h.shot(width,'dropship-entry');await h.saved(form,'Create linked sales demand and supplier PO')
    let drop:any;const s=await h.state();const order=s.orders.find((o:any)=>o.customerId===b.customer.id);drop=s.dropships.find((d:any)=>d.orderId===order.id);let po=s.purchaseOrders.find((p:any)=>p.id===drop.poId);await h.command('po.approve',{poId:po.id,version:po.version});po=await h.command('po.commit',{poId:po.id,version:po.version});await page.reload();await page.getByText('Direct supplier dropships',{exact:true}).click()
    form=h.panel('Record supplier confirmation');await form.getByLabel('Supplier confirmation reference',{exact:true}).fill(`${b.name}-confirm`);await form.getByLabel('Confirmed supplier ship date',{exact:true}).fill('2026-11-01');await h.saved(form,'Confirm direct supplier commitment');await h.shot(width,'dropship-confirmed')
    form=h.panel('Record direct supplier tracking');await form.getByLabel('Supplier shipment reference',{exact:true}).fill(`${b.name}-ship`);await form.getByLabel('Supplier carrier',{exact:true}).fill('Supplier carrier');await form.getByLabel('Supplier tracking',{exact:true}).fill(`${b.name}-tracking`);await form.getByLabel('Actual supplier ship day',{exact:true}).fill(new Date().toISOString().slice(0,10));await form.getByLabel('Direct shipped quantity 1',{exact:true}).fill('2');await h.saved(form,'Record direct shipment')
    form=h.panel(`Authorize customer credit · ${b.name}-ship`);await form.getByLabel('Direct shipment credit line',{exact:true}).selectOption(order.lines[0].id);await form.getByLabel('Direct customer credit quantity',{exact:true}).fill('1');await form.getByLabel('Direct customer credit reference',{exact:true}).fill(`${b.name}-credit`);await form.getByLabel('Direct customer credit reason',{exact:true}).fill('Supplier damage credited');await h.saved(form,'Authorize retained customer credit');await expect(page.getByText(/authorized customer credit.*not posted to books/).last()).toBeVisible();await h.command('book.connect',{baseUrl:pantry.origin,integrationToken:credential.token,inventoryAccountId:inventory.id,cogsAccountId:cogs.id,revenueAccountId:revenue.id,taxCode:'exempt'});await page.reload();await page.getByText('Direct supplier dropships',{exact:true}).click();await page.getByRole('button',{name:'Post customer credit to Pantry',exact:true}).last().click();
    await expect(page.locator('main')).toHaveAttribute('aria-busy','false');
    // Connecting starts asynchronous backfill. Follow the owner's public recovery
    // door until this explicitly authorized credit has a verified ledger outcome.
    await page.goto(`${h.base}/app#books`);await page.reload();
    await expect(page.getByRole('heading',{name:'Books',exact:true})).toBeVisible();
    await expect.poll(async()=>{
      const current=(await h.state()).customerCredits.find((cr:any)=>cr.reference===`${b.name}-credit`);
      if(current?.posting==='posted')return current.posting;
      await submit(page,page.locator('main'),'Sync now');
      return (await h.state()).customerCredits.find((cr:any)=>cr.id===current.id)?.posting;
    },{timeout:60_000,intervals:[1000]}).toBe('posted');
    const currentCredit=(await h.state()).customerCredits.find((cr:any)=>cr.reference===`${b.name}-credit`);
    const financial=(await pantry.view('sales')).invoices;
    const postedCredit=financial.find((invoice:any)=>invoice.id===currentCredit.books.creditId);
    expect(postedCredit.kind).toBe('credit');expect(postedCredit.total_cents).toBe(1000);
    expect(financial.find((invoice:any)=>invoice.id===postedCredit.credit_for).open_cents).toBe(1000);
    await page.goto(`${h.base}/app#sales`);await page.reload();await page.getByText('Direct supplier dropships',{exact:true}).click();await expect(page.getByText(/authorized customer credit.*Books: posted/).last()).toBeVisible();expect((await h.state()).movements).toEqual(before);await h.shot(width,'dropship-tracking-credit');await page.goto(`${h.base}/app#sales/${order.id}`);await page.reload();await expect(page.getByRole('heading',{name:'Supplier direct fulfilment',exact:true})).toBeVisible();await h.shot(width,'dropship-order')
  }
  } finally { await pantry.close() }
} },
{ title: 'live answers and editable bulk purchase reviews retain exact human commands on desktop', run: async ({ page, context }) => {
  const origin = await ownerEntry(page)
  const command = async (type: string, payload: object) => {
    const response = await context.request.post(origin + '/api/pier/commands', { headers: { origin }, data: { commandId: crypto.randomUUID(), type, payload } })
    const body = await response.json(); expect(body.ok, JSON.stringify(body)).toBe(true); return body.result
  }
  const item = await command('item.save', { sku: 'synthetic-pier-bulk', name: 'Bulk review item', unit: 'each', packSize: '1' })
  const supplier = await command('party.save', { name: 'Synthetic bulk supplier', kind: 'supplier' })
  await command('business.save', { name: 'Synthetic Pier', address: 'Synthetic dock' })
  await command('supplierItem.save', { supplierId: supplier.id, itemId: item.id, code: 'synthetic-pier-301', packSize: '1', minimum: '1', price: '2', leadDays: 6 })
  const bin = await command('location.save', { name: 'Bulk warehouse bin', warehouse: 'Bulk warehouse', kind: 'bin' })
  const customer = await command('party.save', { name: 'Synthetic promise customer', kind: 'customer', email: 'customer@example.test' })
  let opening = await command('po.draft', { supplierId: supplier.id, destinationWarehouse: 'Bulk warehouse', promiseDate: '2026-11-01', reason: 'Measured stock for comparisons', lines: [{ itemId: item.id, quantity: '4', price: '2' }] })
  await command('po.approve', { poId: opening.id, version: opening.version })
  opening = await command('po.commit', { poId: opening.id, version: opening.version })
  await command('receipt.create', { poId: opening.id, supplierReference: 'synthetic-pier-302', lines: [{ poLineId: opening.lines[0].id, locationId: bin.id, quantity: '4', cost: '2' }] })
  const donor = await command('order.create', { customerId: customer.id, warehouse: 'Bulk warehouse', lines: [{ itemId: item.id, quantity: '4', price: '1' }] })
  const short = await command('order.create', { customerId: customer.id, warehouse: 'Bulk warehouse', lines: [{ itemId: item.id, quantity: '3', price: '4' }] })
  let overdue = await command('po.draft', { supplierId: supplier.id, promiseDate: '2000-01-01', reason: 'Observed overdue supply', lines: [{ itemId: item.id, quantity: '1', price: '2' }] })
  await command('po.approve', { poId: overdue.id, version: overdue.version }); overdue = await command('po.commit', { poId: overdue.id, version: overdue.version })
  const memberContext = await context.browser()!.newContext()
  const memberPage = await memberContext.newPage()
  const privateEntry = new URL(process.env.PIER_OPEN!)
  const fragment = new URLSearchParams(privateEntry.hash.slice(1)); fragment.set('as', 'member'); privateEntry.hash = fragment.toString()
  try { await memberPage.goto(privateEntry.href); await memberPage.waitForURL(url => !url.hash.includes('rer-dev') && url.pathname === '/app') }
  catch { throw new Error('Native warehouse persona entry failed.') }
  const member = await (await memberContext.request.get(origin + '/auth/session')).json()
  await command('role.set', { operatorId: member.operator.id, role: 'warehouse', permissions: { warehouses: ['Bulk warehouse'], locationIds: [bin.id] } })
  try { for (const width of [1440]) {
    await page.setViewportSize({ width, height: 1000 })
    const drafts = []
    for (let i = 0; i < 2; i++) drafts.push(await command('po.draft', { supplierId: supplier.id, promiseDate: '2026-11-01', reason: 'Synthetic reviewed demand', lines: [{ itemId: item.id, quantity: '12', price: '2' }] }))
    await page.goto(origin + '/app#activity'); await page.reload()
    const question = section(page, 'Live operational questions')
    await question.getByLabel('Question item', { exact: true }).selectOption(item.id)
    await question.getByRole('button', { name: 'Ask current records', exact: true }).click()
    await expect(question.getByRole('status')).toContainText('Committed version')
    await expect(question).toContainText('No physical count is inferred.')
    const shotQuestion = async (name: string) => { if (shots) { await question.screenshot({ path: join(shots, width + '-question-' + name + '.png') }); await question.evaluate(node => node.scrollIntoView({ block: 'start' })); await page.screenshot({ path: join(shots, width + '-question-' + name + '-viewport.png') }) } }
    await shotQuestion('stock')
    await question.getByLabel('Question', { exact: true }).selectOption('late')
    await question.getByRole('button', { name: 'Ask current records', exact: true }).click()
    await expect(question.getByRole('status')).toContainText(overdue.id)
    await shotQuestion('late')
    await question.getByLabel('Question', { exact: true }).selectOption('shortage')
    await question.getByLabel('Question order', { exact: true }).selectOption(short.id)
    await question.getByRole('button', { name: 'Ask current records', exact: true }).click()
    await expect(question.getByRole('status')).toContainText('Remaining demand exceeds')
    await shotQuestion('shortage')
    await question.getByLabel('Question', { exact: true }).selectOption('margin')
    await question.getByLabel('Question order', { exact: true }).selectOption(donor.id)
    await question.getByRole('button', { name: 'Ask current records', exact: true }).click()
    await expect(question.getByRole('status')).toContainText('Loss on recorded goods revenue')
    await shotQuestion('margin')
    await question.getByLabel('Question', { exact: true }).selectOption('supplier')
    await question.getByLabel('Comparison purchase order', { exact: true }).selectOption(drafts[0].id)
    await question.getByLabel('Proposed purchase date', { exact: true }).fill('2026-11-05')
    await question.getByRole('button', { name: 'Ask current records', exact: true }).click()
    await expect(question.getByRole('status')).toContainText('No change to committed supply')
    await shotQuestion('supplier')
    await question.getByLabel('Question', { exact: true }).selectOption('allocation')
    await question.getByLabel('Allocation source order', { exact: true }).selectOption(donor.id)
    await question.getByLabel('Allocation destination order', { exact: true }).selectOption(short.id)
    await question.getByLabel('Question item', { exact: true }).selectOption(item.id)
    await question.getByLabel('Allocation quantity (base units)', { exact: true }).fill('2')
    await question.getByRole('button', { name: 'Ask current records', exact: true }).click()
    await expect(question.getByRole('status')).toContainText('The donor loses these reserved units')
    await shotQuestion('allocation')
    await memberPage.setViewportSize({ width, height: 1000 })
    await memberPage.goto(origin + '/app#activity'); await memberPage.reload()
    const scopedQuestion = section(memberPage, 'Live operational questions')
    await scopedQuestion.getByLabel('Question', { exact: true }).selectOption('shortage')
    await scopedQuestion.getByLabel('Question order', { exact: true }).selectOption(short.id)
    await scopedQuestion.getByRole('button', { name: 'Ask current records', exact: true }).click()
    await expect(scopedQuestion.getByRole('status')).toContainText('Remaining demand exceeds')
    await expect(scopedQuestion.getByRole('status')).not.toContainText(customer.id)
    await expect(scopedQuestion.getByLabel('Question', { exact: true }).locator('option[value="margin"],option[value="supplier"],option[value="allocation"],option[value="late"]')).toHaveCount(0)
    await assertNativeWidth(memberPage)
    if (shots) await scopedQuestion.screenshot({ path: join(shots, width + '-question-restricted.png') })
    const review = section(page, 'Review purchase changes')
    for (const draft of drafts) await review.getByLabel('Select ' + draft.reference, { exact: true }).check()
    await review.getByLabel('Proposed purchase date', { exact: true }).fill('2026-11-03')
    await review.getByLabel('Bulk review reason', { exact: true }).fill('Human reviewed delivery change')
    await submit(page, review, 'Preview selected changes')
    if (shots) await page.screenshot({ path: join(shots, width + '-bulk-preview.png'), fullPage: true })
    await expect(page.getByRole('heading', { name: /^Bulk review / })).toHaveCount(0)
    await expect(page.getByText(/mapping undefined/)).toHaveCount(0)
    await review.getByLabel('Proposed purchase date', { exact: true }).fill('2026-11-04')
    await submit(page, review, 'Update plan date')
    await expect(review).toContainText('2026-11-01 → 2026-11-04')
    const detail = review.getByText('Exact rows and impact', { exact: true }).first()
    await detail.click()
    await expect(review).toContainText('draft; separate purchase approval required')
    await submit(page, review, 'Approve ' + drafts[0].reference)
    await expect(review).toContainText('Applied command')
    const appliedLink = review.getByRole('link', { name: 'Activity', exact: true }).last()
    const appliedCommand = (await appliedLink.getAttribute('href'))!.split('/').at(-1)!
    await appliedLink.click()
    await expect(page.getByLabel('Document identity filter', { exact: true })).toHaveValue(appliedCommand)
    await expect(section(page, 'Decision and input history')).toContainText(appliedCommand)
    await page.getByRole('link', { name: 'Activity', exact: true }).first().click()
    const orders = []
    for (let i = 0; i < 2; i++) orders.push(await command('order.create', { customerId: customer.id, warehouse: 'Bulk warehouse', promiseDate: '2026-11-01', lines: [{ itemId: item.id, quantity: '2', price: '4' }] }))
    await page.reload()
    const promises = section(page, 'Review customer promises')
    for (const order of orders) await promises.getByLabel('Select promise ' + order.reference, { exact: true }).check()
    await promises.getByLabel('Promise review reason', { exact: true }).fill('Review exact estimated dates and recipient')
    await promises.getByLabel('Approve exact customer recipients and calculated dates', { exact: true }).check()
    const beforePreview = await (await context.request.get(origin + '/api/pier/state')).json()
    await submit(page, promises, 'Preview customer promises')
    const afterPreview = await (await context.request.get(origin + '/api/pier/state')).json()
    expect(afterPreview.correspondence).toEqual(beforePreview.correspondence)
    await promises.getByLabel('Recipient for ' + orders[0].reference, { exact: true }).fill('reviewed@example.test')
    await submit(page, promises, 'Update promise plan')
    await expect(promises).toContainText('Recipient: reviewed@example.test')
    await submit(page, promises, 'Approve ' + orders[0].reference)
    await expect(promises).toContainText('Applied command')
    if (shots) await promises.screenshot({ path: join(shots, width + '-promise-applied.png') })
    const approved = await (await context.request.get(origin + '/api/pier/state')).json()
    expect(approved.correspondence.some((message: any) => message.recordId === orders[0].id && message.recipient === 'reviewed@example.test')).toBe(true)
    await expect(page.getByRole('heading', { name: /^Bulk review / })).toHaveCount(0)
    await expect(page.getByText(/mapping undefined/)).toHaveCount(0)
    const changed = await command('item.save', { ...item, name: 'Changed live evidence ' + width })
    item.version = changed.version
    await review.getByLabel('Bulk review reason', { exact: true }).fill('Review remaining purchase against changed evidence')
    await submit(page, review, 'Approve ' + drafts[1].reference, false)
    await expect(page.getByRole('alert')).toContainText('Business inputs changed')
    await submit(page, promises, 'Approve ' + orders[1].reference, false)
    await expect(page.getByRole('alert')).toContainText('Business inputs changed')
    // The touched Activity surface and shared shell have visible text labels.
    expect(await page.locator('button,a').evaluateAll(nodes => nodes.filter(node => !node.textContent?.trim() && node.querySelector('svg')).length)).toBe(0)
    await assertNativeWidth(page)
    if (shots) { await mkdir(shots, { recursive: true }); await page.evaluate(() => window.scrollTo(0, 0)); await page.screenshot({ path: join(shots, width + '-bulk-review.png'), fullPage: true }) }
    const state = await (await context.request.get(origin + '/api/pier/state')).json()
    expect(state.purchaseOrders.find((po: any) => po.id === drafts[0].id).promiseDate).toBe('2026-11-04')
    expect(state.purchaseOrders.find((po: any) => po.id === drafts[1].id).promiseDate).toBe('2026-11-01')
  }
  } finally { await memberContext.close() }
} },
{ title: 'native authenticator enrollment, required sessions and owner recovery are usable', run: async ({page,browser}) => {
  const base=await ownerEntry(page);
  await page.setViewportSize({width:1440,height:1000});
  const capture=async(label:string)=>{if(!shots)return;for(const width of [1440]){await page.setViewportSize({width,height:1000});await page.screenshot({path:join(shots,`${width}-native-security-${label}.png`),fullPage:true,mask:[page.locator('[data-factor-secret]')]});}await page.setViewportSize({width:1440,height:1000});};
  await page.goto(base+'/security');await expect(page.getByRole('heading',{name:'Security',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Start enrollment',exact:true}).click();
  const secret=await page.locator('[data-factor-secret]').textContent();expect(secret).toBeTruthy();const enrolledCode=authenticatorCode(secret);
  await capture('enrollment');
  await page.getByLabel('Authenticator code').fill(enrolledCode);await page.getByRole('button',{name:'Verify code',exact:true}).click();
  await expect(page.getByText('This session is verified.',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Require two-factor authentication',exact:true}).click();
  await expect(page.getByText('Authenticator verification is required for every private session.',{exact:true})).toBeVisible();
  await page.getByLabel('Authenticator code').fill(enrolledCode);await page.getByRole('button',{name:'Verify code',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('already been used');await capture('replay-refusal');
  const other=await browser.newContext({viewport:{width:1440,height:1000}});
  try {
    const blocked=await other.newPage();await blocked.goto(process.env.PIER_OPEN!);await blocked.waitForURL(url=>url.pathname==='/security');
    const denied=await other.request.get(base+'/api/pier/state');expect(denied.status()).toBe(403);
    await expect(blocked.getByText('This session needs verification.',{exact:true})).toBeVisible();
    if(shots)for(const width of [1440]){await blocked.setViewportSize({width,height:1000});await blocked.screenshot({path:join(shots,`${width}-native-security-required.png`),fullPage:true});}
    await blocked.goto(base+'/auth/dev/enter?as=member');await blocked.waitForURL(url=>url.pathname==='/security');
    await blocked.setViewportSize({width:1440,height:1000});
    await blocked.getByRole('button',{name:'Start enrollment',exact:true}).click();
    const staffSecret=await blocked.locator('[data-factor-secret]').textContent();
    await blocked.getByLabel('Authenticator code').fill(authenticatorCode(staffSecret));await blocked.getByRole('button',{name:'Verify code',exact:true}).click();
    await expect(blocked.getByText('This session is verified.',{exact:true})).toBeVisible();
    const staffSession=await(await other.request.get(base+'/auth/session')).json();
    const delegated=await browser.newContext({viewport:{width:1440,height:1000}});
    try {
      const admin=await delegated.newPage();await admin.goto(process.env.PIER_OPEN!);await admin.waitForURL(url=>url.pathname==='/security');await admin.goto(base+'/auth/dev/enter?as=admin');await admin.waitForURL(url=>url.pathname==='/security');
      await admin.getByRole('button',{name:'Start enrollment',exact:true}).click();
      const adminSecret=await admin.locator('[data-factor-secret]').textContent();
      await admin.getByLabel('Authenticator code').fill(authenticatorCode(adminSecret));await admin.getByRole('button',{name:'Verify code',exact:true}).click();
      const adminSession=await(await delegated.request.get(base+'/auth/session')).json();
      await page.goto(base+'/security');
      const grant=page.locator('form').filter({has:page.getByRole('button',{name:'Grant security access',exact:true})});
      await grant.locator('select[name="delegateId"]').selectOption(adminSession.operator.id);
      await grant.locator('select[name="operatorId"]').selectOption(staffSession.operator.id);
      await grant.getByLabel('Duration in minutes',{exact:true}).fill('60');await grant.getByRole('button',{name:'Grant security access',exact:true}).click();
      await expect(page.getByRole('status')).toContainText('Security change saved.');
      await capture('human-grant');
      await admin.goto(base+'/security');await expect(admin.getByRole('heading',{name:'Delegated security controls',exact:true})).toBeVisible();
      const revoke=admin.locator('form').filter({has:admin.getByRole('button',{name:'Revoke target sessions',exact:true})});
      await revoke.getByLabel('Reason',{exact:true}).fill('synthetic-pier-1');await revoke.getByRole('button',{name:'Revoke target sessions',exact:true}).click();
      await expect(admin.getByRole('status')).toContainText('Security change saved.');
      expect((await other.request.get(base+'/api/pier/state')).status()).toBe(401);
      expect((await delegated.request.post(base+'/auth/strong-auth/require',{headers:{origin:base},data:{}})).status()).toBe(403);
      if(shots)for(const width of [1440]){await admin.setViewportSize({width,height:1000});await admin.screenshot({path:join(shots,`${width}-native-security-delegated.png`),fullPage:true});}
      await admin.setViewportSize({width:1440,height:1000});
      const ungrant=page.locator('form').filter({has:page.getByRole('button',{name:'Revoke security grant',exact:true})});
      await ungrant.getByRole('button',{name:'Revoke security grant',exact:true}).click();
      const stale=admin.locator('form').filter({has:admin.getByRole('button',{name:'Reset target factor',exact:true})});
      await stale.getByLabel('Reason',{exact:true}).fill('synthetic-pier-2');await stale.getByRole('button',{name:'Reset target factor',exact:true}).click();
      await expect(admin.getByRole('alert')).toContainText('Current authority changed');
      await expect(admin.getByRole('heading',{name:'Delegated security controls',exact:true})).toHaveCount(0);
      if(shots)for(const width of [1440]){await admin.setViewportSize({width,height:1000});await admin.screenshot({path:join(shots,`${width}-native-security-delegated-refusal.png`),fullPage:true});}
    } finally {await delegated.close();}
    await page.goto(base+'/security');
    const recovery=page.locator('form').filter({has:page.getByRole('button',{name:'Authorize recovery',exact:true})});
    await recovery.locator('select[name="operatorId"]').selectOption(staffSession.operator.id);await recovery.getByLabel('Reason',{exact:true}).fill('Owner reviewed lost staff device');
    await recovery.getByRole('button',{name:'Authorize recovery',exact:true}).click();
    await expect(page.getByRole('status')).toContainText('Security change saved.');
    await expect(page.getByText('Owner reviewed lost staff device',{exact:false})).toBeVisible();
    expect((await other.request.get(base+'/api/pier/state')).status()).toBe(401);
    await capture('recovery-audit');
  } finally {await other.close();}
  const response=await page.request.get(base+'/auth/strong-auth/status');const status=await response.json();
  const sessionResponse=await page.request.get(base+'/auth/session');const session=await sessionResponse.json();
  const self=page.locator('form').filter({has:page.getByRole('button',{name:'Authorize recovery',exact:true})});
  await self.locator('select[name="operatorId"]').selectOption(session.operator.id);await self.getByLabel('Reason',{exact:true}).fill('Owner recovery refusal proof');
  await self.getByRole('button',{name:'Authorize recovery',exact:true}).click();await expect(page.getByRole('alert')).toContainText('Another assured native owner');
  expect(status.audit.some((row:any)=>row.action==='factor.required')).toBe(true);
  await capture('owner-controls');
  const nativeOwner=page.locator('form').filter({has:page.getByRole('button',{name:'Prepare recovery owner',exact:true})});
  await nativeOwner.locator('select[name="operatorId"]').selectOption({label:'Dev admin'});
  await nativeOwner.getByRole('checkbox',{name:'Grant full native owner authority',exact:true}).check();
  await nativeOwner.getByRole('button',{name:'Prepare recovery owner',exact:true}).click();
  await expect(page.getByRole('status')).toContainText('Security change saved.');
  const prepared=await(await page.request.get(base+'/auth/strong-auth/status')).json();
  expect(prepared.operators.some((operator:any)=>operator.display_name==='Dev admin'&&operator.role==='owner')).toBe(true);
  await capture('recovery-readiness');
} },
{ title: 'buyers compare reviewed replenishment scenarios and follow selected receipts to current ledger evidence', run: async ({ page, context }) => {
  const h = await salesHarness(page, context), b = await h.fixture(1440);
  await page.setViewportSize({ width: 1440, height: 1000 });
  const source = await h.command('location.save', { name: `${b.name} reserve`, warehouse: `${b.name} reserve`, kind: 'bin' });
  const transit = await h.command('location.save', { name: `${b.name} transit`, warehouse: b.name, kind: 'transit' });
  let reservePo = await h.command('po.draft', { supplierId: b.supplier.id, destinationWarehouse: source.warehouse, promiseDate: '2026-11-01', reason: 'Transfer reserve', lines: [{ itemId: b.item.id, quantity: '40', price: '2' }] });
  await h.command('po.approve', { poId: reservePo.id, version: reservePo.version }); reservePo = await h.command('po.commit', { poId: reservePo.id, version: reservePo.version });
  await h.command('receipt.create', { poId: reservePo.id, supplierReference: `${b.name} reserve stock`, lines: [{ poLineId: reservePo.lines[0].id, locationId: source.id, quantity: '40', cost: '2' }] });
  const sold = await h.command('order.create', { customerId: b.customer.id, warehouse: b.name, lines: [{ itemId: b.item.id, quantity: '100', price: '8' }] });
  await h.command('dispatch.create', { orderId: sold.id, shipmentReference: `${b.name} captured sales`, lines: [{ orderLineId: sold.lines[0].id, quantity: '100' }] });
  await h.command('supplierItem.save', { supplierId: b.supplier.id, itemId: b.item.id, code: b.name, packSize: '6', minimum: '12', price: '2', leadDays: 6 });
  await h.command('replenishment.save', { version: 0, itemId: b.item.id, warehouse: b.name, supplierId: b.supplier.id, method: 'fixed', safetyStock: '0', leadDays: 6, windowDays: 30, reviewDays: 10, reorderPoint: '20', reorderQuantity: '30' });
  await h.command('replenishment.save', { version: 0, itemId: b.item.id, warehouse: source.warehouse, supplierId: b.supplier.id, method: 'fixed', safetyStock: '5', leadDays: 6, windowDays: 30, reviewDays: 10, reorderPoint: '0', reorderQuantity: '1' });
  await page.goto(`${h.base}/app#purchasing`); await page.reload();
  const row = h.panel('Demand and replenishment').getByRole('row').filter({ hasText: b.item.sku }).filter({ hasText: b.name }).filter({ has: page.getByRole('button', { name: 'Review policy', exact: true }) });
  await row.filter({ hasNotText: source.warehouse }).getByRole('button', { name: 'Review policy', exact: true }).click();
  let settings = h.panel('Replenishment policy');
  await settings.getByText('Forecast settings', { exact: true }).click();
  await settings.getByLabel('Use reviewed forecast factors', { exact: true }).check();
  for (const [factor, expected, high] of [['Seasonality', '1.5', '2'], ['Promotion', '2', '3']]) {
    await settings.getByLabel(`${factor} expected`, { exact: true }).fill(expected);
    await settings.getByLabel(`${factor} high`, { exact: true }).fill(high);
    await settings.getByLabel(`${factor} source`, { exact: true }).fill(`${b.name} reviewed ${factor.toLowerCase()}`);
  }
  await h.saved(settings, 'Save buyer policy');
  const policy = (await h.state()).replenishmentPolicies.find((p: any) => p.itemId === b.item.id && p.warehouse === b.name);
  expect(policy.forecastAssumptions.seasonality.expected).toBe('1.5'); expect(policy.forecastAssumptions.promotion.expected).toBe('2');
  const form = h.panel('Compare cash and service plans');
  await form.getByLabel('Include a reviewed transfer', { exact: true }).check();
  await form.getByLabel('Transfer source bin', { exact: true }).selectOption(source.id);
  await form.getByLabel('Transfer destination bin', { exact: true }).selectOption(b.bin.id);
  await form.getByLabel('Transfer transit location', { exact: true }).selectOption(transit.id);
  await form.getByLabel('Reviewed arrival date', { exact: true }).fill(new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10));
  await form.getByLabel('Transport estimate USD', { exact: true }).fill('-1');
  await form.getByLabel('Transport estimate source', { exact: true }).fill('Reviewed internal transport estimate');
  await submit(page, form, 'Compare current options', false);
  await expect(page.getByRole('alert')).toContainText('decimal');
  await form.getByLabel('Transport estimate USD', { exact: true }).fill('10');
  await h.saved(form, 'Compare current options');
  const comparison = h.panel('Current replenishment comparison');
  await expect(comparison).toContainText('Forecast expected'); await expect(comparison).toContainText('300');
  await expect(comparison).toContainText('600'); await expect(comparison).toContainText('Held-out backtest');
  await expect(comparison).toContainText(`Transfer from ${source.warehouse}`);
  await expect(comparison.getByRole('button', { name: 'Dispatch cash transfer', exact: true })).toBeEnabled();
  const capture = async (name: string, target: Locator) => {
    if (shots) for (const width of [1440]) {
      await page.setViewportSize({ width, height: 1000 });
      await target.scrollIntoViewIfNeeded();
      await target.screenshot({ path: join(shots, `${width}-${name}-detail.png`) });
      await page.screenshot({ path: join(shots, `${width}-${name}-viewport.png`) });
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
  };
  await capture('replenishment-comparison', comparison);
  await comparison.getByRole('button', { name: 'Draft cash purchase', exact: true }).click();
  await expect(page.locator('main')).toHaveAttribute('aria-busy', 'false');
  const state = await h.state(), po = state.purchaseOrders.find((p: any) => p.replenishment?.evidence.some((e: any) => e.itemId === b.item.id));
  expect(po.lines[0].quantity).toBe('48'); expect(po.replenishment.evidence[0].forecast.expected).toBe('300');
  await page.goto(`${h.base}/app#purchasing/${po.id}`); await page.reload();
  let review = h.panel('Forecast versus actual');
  await review.getByRole('button', { name: 'Review current receipt and ledger', exact: true }).click();
  await expect(review).toContainText('Remaining goods'); await expect(review).toContainText('48');
  await expect(review).toContainText('Not reconciled');
  await h.command('po.approve', { poId: po.id, version: po.version });
  const committed = await h.command('po.commit', { poId: po.id, version: po.version });
  await h.command('receipt.create', { poId: committed.id, supplierReference: `${b.name} actual arrival`, lines: [{ poLineId: po.lines[0].id, locationId: b.bin.id, quantity: '48', cost: '2' }] });
  await page.reload(); review = h.panel('Forecast versus actual');
  await review.getByRole('button', { name: 'Review current receipt and ledger', exact: true }).click();
  await expect(review).toContainText('96.00'); await expect(review).toContainText('Open');
  await expect(review.getByRole('row').filter({ hasText: b.item.sku })).toContainText('48');
  await expect(review).toContainText('absolute error'); await expect(review).toContainText('paid receipt obligations');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await capture('replenishment-follow-through', review);
} },
 ];
}

export async function catalogue(width = 1440) {
const { expect } = await import('@playwright/test');
const { mkdir, readFile } = await import('node:fs/promises');
const { join } = await import('node:path');
const { ownerEntry } = await import('./session');
const { catalogueCsv, catalogueJourney } = await import('../api/catalogue-fixtures.mjs');

return [
{ title: 'CAT-001: catalogue references, barcode search, metadata editing and bulk review on desktop', run: async ({ page, context }) => {
  const origin = await ownerEntry(page)
  const h = {
    command: async (type: string, payload: object) => {
      const response = await context.request.post(`${origin}/api/pier/commands`, { headers: { origin }, data: { commandId: crypto.randomUUID(), type, payload } })
      const body = await response.json(); expect(body.ok, JSON.stringify(body)).toBe(true); return body.result
    },
    preview: async (csv: string) => (await context.request.post(`${origin}/api/pier/catalogue/preview`, { headers: { origin }, data: { csv } })).json(),
  }
  const b = await catalogueJourney(h), blue = b.items[0]
  await h.command('item.save', { ...b.items[1], archived: true })
  const shots = process.env.PIER_SCREENSHOTS
  if (shots) await mkdir(shots, { recursive: true })
  for (const width of [1440]) {
    const shot = async (name: string) => { if (shots) await page.screenshot({ path: join(shots, `${width}-catalogue-${name}.png`), fullPage: true }) }
    await page.setViewportSize({ width, height: 1000 })
    await page.goto(`${origin}/app`); await page.reload()
    await page.getByRole('navigation', { name: 'Stock operations' }).getByRole('link', { name: 'Stock', exact: true }).click()
    await page.getByRole('group', { name: 'Warehouse', exact: true }).getByRole('button', { name: 'All', exact: true }).click()
    const search = page.getByRole('textbox', { name: 'Search product, barcode or SKU', exact: true })
    for (const code of ['MUG-BLUE', '036000291452', '10036000291459', 'INNER-BLUE', 'SUP-BLUE', 'PC-BLUE', 'CAFE-B']) {
      await search.fill(code)
      await expect(page.locator('.stock-table').getByRole('row').filter({ hasText: 'Blue stoneware mug' })).toHaveCount(1)
      await expect(page.locator('.stock-table').getByRole('row').filter({ hasText: 'White stoneware mug' })).toHaveCount(0)
    }
    await search.fill('PC-SHARED')
    await expect(page.locator('.stock-table tbody').getByRole('row')).toHaveCount(2)
    await page.getByLabel('Archive filter', { exact: true }).selectOption('archived')
    await expect(page.locator('.stock-table tbody').getByRole('row')).toHaveCount(1)
    await expect(page.locator('.stock-table')).toContainText('White stoneware mug')
    await page.getByLabel('Archive filter', { exact: true }).selectOption('')
    await search.fill('CAFE-B')
    await page.getByLabel('Category filter', { exact: true }).selectOption('Drinkware')
    await page.getByLabel('Variant family filter', { exact: true }).selectOption('Stoneware mugs')
    await shot('search')
    await page.getByRole('button', { name: 'Blue stoneware mug', exact: true }).click()
    await page.getByText('Catalogue details · MUG-BLUE', { exact: true }).click()
    await expect(page.getByText('4 × 3 × 4.5 in', { exact: true })).toBeVisible()
    await expect(page.getByText('CAFE-B', { exact: true })).toBeVisible()
    await shot('details')
    await page.getByRole('button', { name: 'Edit item', exact: true }).click()
    const editor = page.locator('#item-editor')
    await expect(editor.getByLabel('Variant family', { exact: true })).toHaveValue('Stoneware mugs')
    await editor.getByLabel('Weight (lb)', { exact: true }).fill(width === 1440 ? '0.8' : '0.75')
    await shot('editor')
    await editor.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(editor).toHaveCount(0)
    await page.getByText('Bulk import or edit catalogue CSV', { exact: true }).click()
    const file = page.getByLabel('Catalogue CSV file', { exact: true })
    const bad = catalogueCsv([{ sku: 'COLLISION', name: 'Duplicate code', unit: 'each', packSize: '1', barcode: '0036000291452' }])
    await file.setInputFiles({ name: 'collision.csv', mimeType: 'text/csv', buffer: Buffer.from(bad) })
    await page.getByRole('button', { name: 'Preview catalogue changes', exact: true }).click()
    await expect(page.getByRole('alert').filter({ hasText: 'COLLISION' })).toContainText('MUG-BLUE')
    await expect(page.getByRole('button', { name: 'Approve and apply catalogue changes', exact: true })).toBeDisabled()
    await shot('collision')
    const csv = catalogueCsv([{ sku: blue.sku, name: 'Blue stoneware mug', unit: 'each', packSize: '12', category: 'Drinkware', weight: width === 1440 ? '0.85' : '0.9' }])
    await file.setInputFiles({ name: 'catalogue-update.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) })
    await page.getByRole('button', { name: 'Preview catalogue changes', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Review catalogue changes', exact: true })).toBeVisible()
    await page.getByText('Inspect proposed item', { exact: true }).click()
    await shot('preview')
    await page.getByRole('button', { name: 'Approve and apply catalogue changes', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Review catalogue changes', exact: true })).toHaveCount(0)
    const savedState = await (await context.request.get(`${origin}/api/pier/state`)).json()
    expect(savedState.items.find((item: any) => item.id === blue.id).weight).toBe(width === 1440 ? '0.85' : '0.9')
    await shot('applied')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)
  }
  let routing = await h.command('routing.save', {source:'manual',mode:'fixed',shortage:'hold',eligible:['Dallas']})
  routing = await h.command('routing.preview',{ruleId:routing.id,version:routing.version}); await h.command('routing.activate',{ruleId:routing.id,version:routing.version})
  let po = await h.command('po.draft', { supplierId: b.supplier.id, destinationWarehouse: 'Dallas', promiseDate: '2026-11-01', reason: 'Shared BOL return journey', lines: [{ itemId: blue.id, quantity: '6', price: '2.5' }] })
  await h.command('po.approve', { poId: po.id, version: po.version })
  po = await h.command('po.commit', { poId: po.id, version: po.version })
  await h.command('receipt.create', { poId: po.id, supplierReference: 'Catalogue delivery', lines: [{ poLineId: po.lines[0].id, locationId: b.location.id, quantity: '6', cost: '2.5' }] })
  for (let index = 0; index < 2; index++) {
    const order = await h.command('order.create', { customerId: b.customer.id, warehouse: 'Dallas', promiseDate: '2026-11-01', lines: [{ itemId: blue.id, quantity: '1', price: '5' }] })
    await h.command('dispatch.create', { orderId: order.id, shipmentReference: 'CONSOLIDATED-BOL', lines: [{ orderLineId: order.lines[0].id, quantity: '1' }] })
  }
  for (const width of [1440]) {
    await page.setViewportSize({ width, height: 1000 })
    await page.goto(`${origin}/app`)
    await page.getByRole('navigation', { name: 'Stock operations' }).getByRole('link', { name: 'Floor', exact: true }).click()
    await page.getByRole('navigation', { name: 'Floor steps' }).getByRole('link', { name: 'Returns', exact: true }).click()
    const scan = page.getByRole('textbox', { name: 'Scan order label or returned item', exact: true })
    const shipment = (await (await context.request.get(`${origin}/api/pier/state`)).json()).shipments.find((row: any) => row.reference === 'CONSOLIDATED-BOL')
    await scan.fill(shipment.barcode); await scan.press('Enter')
    await expect(page.getByRole('heading', { name: 'Confirm scanned return', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Use this dispatch', exact: true })).toHaveCount(0)
    if (shots) await page.screenshot({ path: join(shots, `${width}-catalogue-shipment-barcode.png`), fullPage: true })
    await page.reload()
    await scan.fill('CONSOLIDATED-BOL'); await scan.press('Enter')
    await expect(page.getByRole('button', { name: 'Use this dispatch', exact: true })).toHaveCount(2)
    await expect(page.getByRole('heading', { name: 'Confirm scanned return', exact: true })).toHaveCount(0)
    if (shots) await page.screenshot({ path: join(shots, `${width}-catalogue-shared-bol-choose.png`), fullPage: true })
    await page.getByRole('button', { name: 'Use this dispatch', exact: true }).first().click()
    await expect(page.getByRole('heading', { name: 'Confirm scanned return', exact: true })).toBeVisible()
    if (shots) await page.screenshot({ path: join(shots, `${width}-catalogue-shared-bol-selected.png`), fullPage: true })
  }
  expect((await (await context.request.get(`${origin}/api/pier/state`)).json()).returns).toHaveLength(0)
  await page.getByLabel('Return bin', { exact: true }).selectOption(b.location.id)
  await page.getByLabel('Return reason', { exact: true }).fill('Customer returned the supplier half-unit pack')
  await page.getByRole('textbox', { name: 'Scan order label or returned item', exact: true }).fill('SUP-BLUE')
  await page.getByRole('textbox', { name: 'Scan order label or returned item', exact: true }).press('Enter')
  await expect(page.getByRole('heading', { name: 'Confirm scanned return', exact: true })).toHaveCount(0)
  const returned = (await (await context.request.get(`${origin}/api/pier/state`)).json()).returns
  expect(returned).toHaveLength(1)
  expect(returned[0].quantity).toBe('0.5')

} },
{ title: 'owner typed-field controls define, edit, import and filter every record type with custody refusal on desktop', run: async ({ page, context, browser }) => {
  const origin = await ownerEntry(page)
  const command = async (type: string, payload: object) => {
    const response = await context.request.post(origin + '/api/pier/commands', { headers: { origin }, data: { commandId: crypto.randomUUID(), type, payload } })
    const body = await response.json(); expect(body.ok, JSON.stringify(body)).toBe(true); return body.result
  }
  const suffix = crypto.randomUUID().slice(0,8)
  await command('location.save', { name: 'Typed fields ' + suffix, warehouse: 'Dallas', kind: 'bin' })
  const item = await command('item.save', { sku: 'synthetic-pier-fields-' + suffix, name: 'Typed field item', unit: 'each', packSize: '1' })
  const customer = await command('party.save', { kind: 'customer', name: 'Typed field customer' })
  const supplier = await command('party.save', { kind: 'supplier', name: 'Typed field supplier' })
  const order = await command('order.create', { customerId: customer.id, warehouse: 'Dallas', promiseDate: '2026-11-01', lines: [{ itemId: item.id, quantity: '1' }] })
  const shots = process.env.PIER_SCREENSHOTS
  if (shots) await mkdir(shots, { recursive: true })
  for (const width of [1440]) {
    const shot = async (name: string) => { if (shots) await page.screenshot({ path: join(shots, width + '-fields-' + name + '.png'), fullPage: true }) }
    await page.setViewportSize({ width, height: 1000 })
    await page.goto(origin + '/app#activity'); await page.getByRole('link', { name: 'Custom fields', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Custom fields', exact: true })).toBeVisible()
    for (const [kind, record, type, value] of [['item', item, 'text', 'synthetic-pier-private'], ['customer', customer, 'boolean', 'false'], ['supplier', supplier, 'number', '1.25'], ['order', order, 'date', '2026-11-02'], ['item', item, 'choice', 'blue']] as const) {
      const key = 'field_' + width + '_' + type + '_' + suffix
      await page.getByLabel('Record type', { exact: true }).selectOption(kind)
      await page.getByText('Define a custom field', { exact: true }).click()
      await page.getByLabel('Field key', { exact: true }).fill(key)
      await page.getByLabel('Field label', { exact: true }).fill(kind + ' ' + type + ' attribute ' + width + ' ' + suffix)
      await page.getByLabel('Field type', { exact: true }).selectOption(type)
      if (type === 'choice') await page.getByLabel('Choices (one per line)', { exact: true }).fill('blue\ngreen')
      await page.getByRole('button', { name: 'Define field', exact: true }).click()
      await expect(page.getByRole('button', { name: 'Define field', exact: true })).toBeEnabled()
      await page.getByLabel('Field record', { exact: true }).selectOption(record.id)
      const input = page.getByLabel(kind + ' ' + type + ' attribute ' + width + ' ' + suffix, { exact: true })
      if (type === 'boolean' || type === 'choice') await input.selectOption(value); else await input.fill(value)
      await page.getByRole('button', { name: 'Save field values', exact: true }).click()
      await expect(page.getByRole('button', { name: 'Save field values', exact: true })).toBeEnabled()
      await expect(input).toHaveValue(value)
      const saved = await (await context.request.get(origin + '/api/pier/state')).json()
      const savedRecord = (kind === 'item' ? saved.items : kind === 'order' ? saved.orders : saved.parties).find((r: any) => r.id === record.id)
      expect(savedRecord.customFields[key]).toBe(type === 'boolean' ? false : value)
      const definition = saved.customFieldDefinitions.find((d: any) => d.ownerType === kind && d.key === key)
      await page.getByLabel('Filter field', { exact: true }).selectOption(definition.id)
      const filter = page.getByLabel('Filter value', { exact: true })
      if (type === 'boolean' || type === 'choice') await filter.selectOption(value); else await filter.fill(value)
      await page.getByRole('button', { name: 'Filter records', exact: true }).click()
      await expect(page.getByText('1 matching records', { exact: true })).toBeVisible()
      await shot(kind + '-filtered')
      const upload = async (content: string) => page.getByLabel('Field JSON file', { exact: true }).setInputFiles({ name: 'synthetic-pier-fields.json', mimeType: ['application', 'json'].join('/'), buffer: Buffer.from(content) })
      await upload('{')
      await expect(page.getByRole('alert')).toBeVisible()
      const importedValue = type === 'boolean' ? true : type === 'number' ? '2.5' : type === 'date' ? '2026-11-03' : type === 'choice' ? 'green' : 'synthetic-pier-imported'
      await upload(JSON.stringify([{ ownerType: kind, recordId: record.id, version: savedRecord.version, values: { [key]: importedValue } }]))
      await expect(page.getByRole('heading', { name: 'Review field import', exact: true })).toBeVisible()
      await shot(kind + '-import-review')
      await page.getByRole('button', { name: 'Approve field import', exact: true }).click()
      await expect(page.getByRole('heading', { name: 'Review field import', exact: true })).toHaveCount(0)
      await expect(input).toHaveValue(String(importedValue))
      const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download field records', exact: true }).click()])
      const downloaded = JSON.parse(await readFile((await download.path())!, 'utf8'))
      expect(downloaded.find((r: any) => r.recordId === record.id).values[key]).toBe(importedValue)
      await page.getByText('Define a custom field', { exact: true }).click()
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
    }
    await page.goto(origin + '/app#activity')
    await page.getByText('Retention and erasure', { exact: true }).click()
    await page.getByLabel('Erasure subject kind', { exact: true }).selectOption('customer')
    await page.getByLabel('Erasure subject', { exact: true }).selectOption(customer.id)
    await page.getByRole('button', { name: 'Inspect erasure dependencies', exact: true }).click()
    await expect(page.getByRole('alert').filter({ hasText: 'Erasure refused: subject attribution' })).toBeVisible()
    await shot('erasure-refusal')
    const refusal = page.waitForResponse(response => response.url().endsWith('/api/pier/commands') && response.request().postDataJSON()?.type === 'privacy.eraseSubject')
    await page.getByRole('button', { name: 'Record erasure refusal', exact: true }).click()
    const refused = await refusal
    expect((await refused.json()).error.code).toBe('PRIVACY_DEPENDENCY')
    const commandId = refused.request().postDataJSON().commandId
    await expect(page.getByRole('alert').filter({ hasText: 'No content was deleted by this request.' }).first()).toBeVisible()
    await page.getByLabel('Document identity filter', { exact: true }).fill(commandId)
    await expect(page.getByRole('table').filter({ hasText: commandId })).toContainText('Refused')
    await shot('activity-refused')
  }
  const staff = await browser.newContext()
  try {
    const denied = await staff.newPage()
    await denied.goto(process.env.PIER_OPEN!.replace('as=owner', 'as=member'))
    await denied.waitForURL(url => url.pathname === '/app' && !url.hash.includes('rer-dev'))
    for (const width of [1440]) {
      await denied.setViewportSize({ width, height: 1000 }); await denied.goto(origin + '/app#activity' + '/custom-fields')
      await expect(denied.getByRole('status').filter({ hasText: 'Only the current owner' })).toBeVisible()
      await expect(denied.getByLabel('Field record', { exact: true })).toHaveCount(0)
      if (shots) await denied.screenshot({ path: join(shots, width + '-fields-denied.png'), fullPage: true })
    }
  } finally { await staff.close() }
} },
 ];
}

export async function warehouse_waves(width = 1440) {
const { expect } = await import('@playwright/test');
const { mkdir } = await import('node:fs/promises');
const { join } = await import('node:path');
const { ownerEntry } = await import('./session');


const commandResult = (page: Page, type: string) => page.waitForResponse(response => response.url().endsWith('/api/pier/commands') && response.request().postDataJSON()?.type === type)

async function settledResult(page: Page, pending: Promise<Response>, ok = true) {
  const body = await (await pending).json()
  expect(body.ok, JSON.stringify(body)).toBe(ok)
  await expect(page.getByRole('main')).toHaveAttribute('aria-busy', 'false')
  return body
}

async function scan(page: Page, label: string, code: string, type?: string) {
  await expect(page.getByRole('main')).toHaveAttribute('aria-busy', 'false')
  const saved = type ? commandResult(page, type) : undefined
  await page.getByLabel(label, { exact: true }).fill(code)
  await page.getByLabel(label, { exact: true }).press('Enter')
  if (saved) await settledResult(page, saved)
}
return [
{ title: `warehouse zone merge, ten order totes and overflow at ${width}px`, run: async ({ page, context }) => {

  await page.setViewportSize({ width, height: 1000 })
  const origin = await ownerEntry(page), seed = `synthetic-pier-401-${width}-${crypto.randomUUID().slice(0, 8)}`
  const command = async (type: string, payload: object) => {
    const response = await context.request.post(`${origin}/api/pier/commands`, { headers: { origin }, data: { commandId: crypto.randomUUID(), type, payload } })
    const body = await response.json(); expect(body.ok, JSON.stringify(body)).toBe(true); return body.result
  }
  const supplier = await command('party.save', { name: `${seed} supplier`, kind: 'supplier' }), customer = await command('party.save', { name: `${seed} customer`, kind: 'customer' })
  const prepare = async (suffix: string, names: string[], quantities: number[], zones?: string[]) => {
    const warehouse = `${seed}-${suffix}`, bins = []
    for (const [index, name] of names.entries()) bins.push(await command('location.save', { name, warehouse, kind: 'bin', zone: zones?.[index] || '' }))
    const item = await command('item.save', { sku: `${seed}-${suffix}`, name: `${suffix} warehouse unit`, barcode: `${seed}-${suffix}-code`, unit: 'each', packSize: '1' })
    let po = await command('po.draft', { supplierId: supplier.id, promiseDate: '2026-11-01', reason: 'Warehouse journey stock', lines: [{ itemId: item.id, quantity: String(quantities.reduce((a, b) => a + b, 0)), price: '1' }] })
    await command('po.approve', { poId: po.id, version: po.version }); po = await command('po.commit', { poId: po.id, version: po.version })
    await command('receipt.create', { poId: po.id, supplierReference: `${seed}-${suffix}`, lines: bins.map((bin, index) => ({ poLineId: po.lines[0].id, locationId: bin.id, quantity: String(quantities[index]), cost: '1' })) })
    const carrier = await command('carrier.save', { name: `${seed}-${suffix} pickup`, warehouse, dock: 'Dock A', cutoff: '23:59', timeZone: 'America/Chicago' })
    return { warehouse, bins, item, carrier }
  }
  const newOrder = async (fixture: any) => {
    const order = await command('order.create', { customerId: customer.id, warehouse: fixture.warehouse, lines: [{ itemId: fixture.item.id, quantity: '2', price: '3' }] })
    await command('order.carrier', { orderId: order.id, carrierId: fixture.carrier.id }); return order
  }
  const release = async (mode: string, count: number) => {
    await page.goto(`${origin}/app#floor/pick`); await page.reload()
    await page.getByLabel('Picking method', { exact: true }).selectOption(mode)
    const saved = commandResult(page, 'wave.release')
    await page.getByRole('button', { name: `Release wave · Dock A · ${count} ${count === 1 ? 'order' : 'orders'}`, exact: true }).click()
    const body = await settledResult(page, saved)
    const wave = body.result
    await page.locator('tr').filter({ hasText: `Wave ${wave.number} · Dock A` }).getByRole('button', { name: 'Open pick list', exact: true }).click()
    await expect(page.getByRole('heading', { name: `Pick list · Wave ${wave.number} · Dock A`, exact: true })).toBeVisible()
    return wave
  }
  const openPack = async (order: any) => {
    await page.goto(`${origin}/app#floor/pack`)
    await page.locator('tr').filter({ hasText: order.reference }).getByRole('button', { name: 'Pack this order', exact: true }).click()
    await expect(page.getByRole('heading', { name: `Pack ${order.reference}`, exact: true })).toBeVisible()
  }
  const measure = async (carton = 1) => {
    const form = page.getByRole('heading', { name: `Weigh and measure carton ${carton}`, exact: true }).locator('..')
    for (const [label, value] of [['Weight (lb)', '1'], ['Length (in)', '8'], ['Width (in)', '6'], ['Height (in)', '4']]) await form.getByLabel(label, { exact: true }).fill(value)
    const saved = commandResult(page, 'pack.measure'); await form.getByRole('button', { name: 'Save weight and size', exact: true }).click(); await settledResult(page, saved)
  }
  const closeAndDispatch = async (reference: string) => {
    let saved = commandResult(page, 'pack.close'); await page.getByRole('button', { name: 'Mark order packed', exact: true }).click(); await settledResult(page, saved)
    await page.getByLabel('Shipment reference', { exact: true }).fill(reference)
    saved = commandResult(page, 'pack.dispatch'); await page.getByRole('button', { name: 'Dispatch packed cartons', exact: true }).click(); await settledResult(page, saved)
  }
  const shot = async (name: string) => {
    if (process.env.PIER_SCREENSHOTS) { await mkdir(process.env.PIER_SCREENSHOTS, { recursive: true }); await page.screenshot({ path: join(process.env.PIER_SCREENSHOTS, `${width}-warehouse-${name}.png`), fullPage: true }) }
    const layout = await page.evaluate(() => ({ fits: document.documentElement.scrollWidth <= innerWidth + 1, overflow: [...document.querySelectorAll('main *')].map(el => ({ tag: el.tagName, class: el.className, width: el.getBoundingClientRect().width, right: el.getBoundingClientRect().right, text: (el.textContent || '').slice(0,80) })).filter(el => el.right > innerWidth + 1).slice(0,8) }))
    expect(layout.fits, JSON.stringify(layout.overflow)).toBe(true)
  }

  const zone = await prepare('zones', ['A-01', 'C-01'], [1, 1], ['East', 'West']), zonedOrder = await newOrder(zone)
  await page.goto(`${origin}/app#floor/pick`); await page.reload()
  await page.getByLabel('Bin to assign a zone', { exact: true }).selectOption(zone.bins[0].id)
  await page.getByLabel('Picking zone', { exact: true }).fill('East')
  let zoneSaved = commandResult(page, 'location.save'); await page.getByRole('button', { name: 'Save picking zone', exact: true }).click(); await settledResult(page, zoneSaved)
  const zonedWave = await release('zone', 1)
  await page.getByLabel('Pick zone', { exact: true }).selectOption('East')
  await expect(page.locator('.pick-task')).toContainText('A-01')
  await scan(page, 'Scan bin label', 'C-01'); await expect(page.getByRole('alert')).toContainText('Wrong bin')
  await expect(page.getByLabel('Scan item', { exact: true })).toHaveCount(0)
  await scan(page, 'Scan bin label', 'A-01')
  let rejected = commandResult(page, 'pick.scan'); await page.getByLabel('Scan item', { exact: true }).fill('C-01'); await page.getByLabel('Scan item', { exact: true }).press('Enter'); await settledResult(page, rejected, false)
  await scan(page, 'Scan item', zone.item.barcode, 'pick.scan')
  await shot('zone-selection')
  await openPack(zonedOrder); await scan(page, 'Scan item into carton 1', zone.item.barcode, 'pack.scan'); await measure()
  await expect(page.getByRole('button', { name: 'Mark order packed', exact: true })).toBeDisabled()
  await expect(page.getByRole('status').filter({ hasText: 'Waiting for zone contributions' })).toContainText('West')
  const popupEvent = page.waitForEvent('popup'); await page.getByRole('link', { name: 'Print packing slip', exact: true }).click()
  const slip = await popupEvent; await slip.waitForLoadState(); await expect(slip.locator('body')).toContainText(zonedOrder.reference)
  await expect(slip.locator('body')).toContainText('Packed: 1 each')
  await slip.getByRole('button', { name: 'Print packing slip', exact: true }).click()
  if (process.env.PIER_SCREENSHOTS) {
    await slip.screenshot({ path: join(process.env.PIER_SCREENSHOTS, `${width}-warehouse-packing-slip.png`), fullPage: true })
    await slip.pdf({ path: join(process.env.PIER_SCREENSHOTS, `${width}-warehouse-packing-slip.pdf`), format: 'Letter' })
  }
  await slip.close()
  await shot('zone-merge-waiting')
  await page.goto(`${origin}/app#floor/pick`)
  await page.locator('tr').filter({ hasText: `Wave ${zonedWave.number} · Dock A` }).getByRole('button', { name: 'Open pick list', exact: true }).click()
  await page.getByLabel('Pick zone', { exact: true }).selectOption('West')
  await scan(page, 'Scan bin label', 'C-01'); await scan(page, 'Scan item', zone.item.barcode, 'pick.scan')
  await openPack(zonedOrder)
  let newCarton = commandResult(page, 'pack.carton'); await page.getByRole('button', { name: 'Start carton 2', exact: true }).click(); await settledResult(page, newCarton)
  await scan(page, 'Scan item into carton 2', zone.item.barcode, 'pack.scan'); await measure(2)
  await expect(page.getByRole('cell').filter({ hasText: /^Ready to merge$/ })).toHaveCount(2)
  await shot('zone-merge-complete'); await closeAndDispatch(`${seed}-merged`)

  const batch = await prepare('batch', ['B-03', 'B-09'], [20, 2]), orders = []
  for (let n = 0; n < 10; n++) orders.push(await newOrder(batch))
  const wave = await release('batch', 10)
  let saved = commandResult(page, 'pick.short'); await page.getByRole('button', { name: 'Bin empty or short', exact: true }).click(); await settledResult(page, saved)
  await expect(page.locator(`#document-${wave.id}`)).toContainText('Overflow B-09')
  await shot('overflow-and-totes')
  for (let n = 1; n < 10; n++) {
    await scan(page, 'Scan bin label', 'B-03')
    await page.getByLabel('Quantity for this scan (optional)', { exact: true }).fill(n === 9 ? '1' : '2')
    await scan(page, 'Scan item', batch.item.barcode, 'pick.scan')
    if (n === 9) { saved = commandResult(page, 'pick.short'); await page.getByRole('button', { name: 'Bin empty or short', exact: true }).click(); await settledResult(page, saved) }
  }
  await scan(page, 'Scan bin label', 'B-09'); await page.getByLabel('Quantity for this scan (optional)', { exact: true }).fill('2'); await scan(page, 'Scan item', batch.item.barcode, 'pick.scan')
  await shot('ten-picked-one-short')
  for (const [index, order] of orders.entries()) {
    await openPack(order)
    await expect(page.locator('section').filter({ has: page.getByRole('heading', { name: `Pack ${order.reference}`, exact: true }) }).last()).toContainText(`tote ${wave.orders.find((row: any) => row.orderId === order.id).tote}`)
    for (let unit = 0; unit < (index === 9 ? 1 : 2); unit++) await scan(page, 'Scan item into carton 1', batch.item.barcode, 'pack.scan')
    await measure(); await closeAndDispatch(`${seed}-batch-${index}`)
  }
  const state = await (await context.request.get(`${origin}/api/pier/state`)).json()
  expect(state.orders.filter((order: any) => orders.some(o => o.id === order.id) && order.lines.some((line: any) => line.dispatched !== line.quantity)).map((order: any) => order.id)).toEqual([orders[9].id])
  const shipments = state.shipments.filter((shipment: any) => orders.some(o => o.id === shipment.orderId))
  expect(shipments).toHaveLength(10)
  for (const shipment of shipments) for (const line of shipment.lines) expect(orders.find(o => o.id === shipment.orderId).lines.some((own: any) => own.id === line.orderLineId)).toBe(true)
  await shot('ten-shipped-short-order-open')
  await command('order.reserve', { orderId: orders[9].id })
  const resumed = await release('batch', 1)
  await scan(page, 'Scan bin label', 'B-03'); await scan(page, 'Scan item', batch.item.barcode, 'pick.scan')
  await openPack(orders[9]); await scan(page, 'Scan item into carton 1', batch.item.barcode, 'pack.scan'); await measure(); await closeAndDispatch(`${seed}-short-remainder`)
  const completed = await (await context.request.get(`${origin}/api/pier/state`)).json()
  expect(completed.shipments.filter((row: any) => row.orderId === orders[9].id)).toHaveLength(2)
  expect(completed.orders.find((row: any) => row.id === orders[9].id).lines[0].dispatched).toBe('2')
  expect(resumed.orders[0].orderId).toBe(orders[9].id)
  await shot('split-shipment-completed')
} },
 ];
}

export async function warehouse_offline(width = 1440) {
const { expect } = await import('@playwright/test');
const { mkdir } = await import('node:fs/promises');
const { join } = await import('node:path');
const { ownerEntry } = await import('./session');

return [
{ title: 'warehouse interruptions retain exact task, reconcile stale allocations and recover stock once on desktop', run: async ({ page, context, browser }) => {
  const origin = await ownerEntry(page)
  const command = async (type: string, payload: object) => {
    const response = await context.request.post(`${origin}/api/pier/commands`, { headers: { origin }, data: { commandId: crypto.randomUUID(), type, payload } })
    const body = await response.json(); expect(body.ok, JSON.stringify(body)).toBe(true); return body.result
  }
  const state = async () => {
    const response = await context.request.get(`${origin}/api/pier/state`)
    expect(response.ok()).toBe(true); return response.json()
  }
  const idle = async () => { await expect(page.locator('main')).toHaveAttribute('aria-busy', 'false') }
  const scan = async (label: string, code: string) => {
    await page.getByRole('textbox', { name: label, exact: true }).fill(code)
    await page.getByRole('textbox', { name: label, exact: true }).press('Enter')
  }
  const openWave = async (wave: any) => {
    await page.goto(`${origin}/app#floor/pick`); await page.reload()
    await page.getByRole('row').filter({ hasText: `Wave ${wave.number} · ${wave.dock}` }).first().getByRole('button', { name: 'Open pick list' }).click()
    await expect(page.getByRole('heading', { name: `Pick list · Wave ${wave.number} · ${wave.dock}` })).toBeVisible()
  }
  let interrupted: { type: string; loseResponse: boolean } | null = null
  const observed: any[] = []
  await page.route('**/api/pier/commands', async route => {
    const request = route.request().postDataJSON(); observed.push(request)
    if (interrupted?.type !== request.type) { await route.continue(); return }
    const mode = interrupted; interrupted = null
    if (mode.loseResponse) {
      const response = await route.fetch()
      const body = await response.json()
      expect(body.ok, JSON.stringify(body)).toBe(true); expect(response.ok()).toBe(true)
    }
    await route.abort('internetdisconnected')
  })
  async function recover(type: string, action: () => Promise<void>) {
    const before = observed.length
    await action()
    const recovery = page.getByRole('heading', { name: 'Recover interrupted action', exact: true })
    await expect(recovery).toBeVisible(); await idle()
    const original = observed.slice(before).find(row => row.type === type)
    expect(original).toBeTruthy()
    await context.setOffline(true)
    await expect(page.getByText(/Network connection is unavailable/).first()).toBeVisible()
    if (shots) await page.screenshot({ path: join(shots, `${page.viewportSize()!.width}-warehouse-interrupted-${type}-${original.commandId}.png`), fullPage: true })
    await context.setOffline(false); await page.reload(); await idle()
    await expect(recovery).toBeVisible()
    if (type === 'pick.scan') await expect(page.locator(`#document-${original.payload.waveId}`)).toBeVisible()
    expect(observed).toHaveLength(before + 1) // Neither reconnect nor reload posts work.
    const replay = page.waitForRequest(request => request.url().endsWith('/api/pier/commands') && request.postDataJSON()?.commandId === original.commandId)
    await page.getByRole('button', { name: 'Retry this exact action', exact: true }).click()
    expect((await replay).postDataJSON()).toEqual(original)
    await expect(recovery).toHaveCount(0); await idle()
    return original
  }
  const shots = process.env.PIER_SCREENSHOTS
  if (shots) await mkdir(shots, { recursive: true })
  for (const width of [1440]) {
    await page.setViewportSize({ width, height: 1000 })
    const suffix = `synthetic-pier-501-${width}-${crypto.randomUUID().slice(0, 8)}`
    const item = await command('item.save', { sku: suffix, name: suffix, unit: 'each', barcode: suffix, packSize: '1' })
    const bin = await command('location.save', { name: `${suffix}-bin`, warehouse: suffix, kind: 'bin' })
    const supplier = await command('party.save', { name: suffix, kind: 'supplier' })
    const customer = await command('party.save', { name: suffix, kind: 'customer' })
    const po = await command('po.draft', { supplierId: supplier.id, promiseDate: '2026-11-01', reason: 'Synthetic warehouse recovery proof', lines: [{ itemId: item.id, quantity: '4', price: '1' }] })
    await command('po.approve', { poId: po.id, version: po.version }); await command('po.commit', { poId: po.id, version: po.version })
    await command('receipt.create', { poId: po.id, supplierReference: suffix, lines: [{ poLineId: po.lines[0].id, locationId: bin.id, quantity: '4', cost: '1' }] })
    const carrier = await command('carrier.save', { name: suffix, warehouse: suffix, dock: 'Dock A', cutoff: '23:59', timeZone: 'America/Chicago' })
    const makeOrder = () => command('order.create', { customerId: customer.id, warehouse: suffix, promiseDate: '2026-11-01', lines: [{ itemId: item.id, quantity: '2', price: '3' }] })
    const order = await makeOrder()
    const wave = await command('wave.release', { carrierId: carrier.id, orderIds: [order.id] })
    await openWave(wave); await scan('Scan bin label', bin.name)
    await expect(page.getByRole('textbox', { name: 'Scan item', exact: true })).toBeVisible()
    interrupted = { type: 'pick.scan', loseResponse: false }
    await recover('pick.scan', () => scan('Scan item', item.barcode))
    let current = await state()
    expect(current.waves.find((row: any) => row.id === wave.id).lines[0].picked).toBe('1')
    await expect(page.getByRole('textbox', { name: 'Scan item', exact: true })).toBeVisible()
    interrupted = { type: 'pick.scan', loseResponse: true }
    await recover('pick.scan', () => scan('Scan item', item.barcode))
    current = await state()
    expect(current.waves.find((row: any) => row.id === wave.id).lines[0].scans).toHaveLength(2)
    expect(current.positions.find((row: any) => row.itemId === item.id).quantity).toBe('4')

    const payload = { waveId: wave.id, orderId: order.id }
    await command('pack.scan', { ...payload, code: item.barcode }); await command('pack.scan', { ...payload, code: item.barcode })
    await command('pack.measure', { ...payload, carton: 1, weight: '2', length: '4', width: '4', height: '4' }); await command('pack.close', payload)
    await page.goto(`${origin}/app#floor/pack`); await page.reload()
    await page.getByRole('row').filter({ hasText: order.reference }).first().getByRole('button', { name: 'Pack this order' }).click()
    await page.getByLabel('Shipment reference', { exact: true }).fill(`${suffix}-shipment`)
    interrupted = { type: 'pack.dispatch', loseResponse: true }
    const dispatched = await recover('pack.dispatch', () => page.getByRole('button', { name: 'Dispatch packed cartons', exact: true }).click())
    current = await state()
    expect(current.movements.filter((row: any) => row.commandId === dispatched.commandId)).toHaveLength(1)
    expect(current.movements.find((row: any) => row.commandId === dispatched.commandId).quantity).toBe('-2000000')
    expect(current.shipments.filter((row: any) => row.orderId === order.id)).toHaveLength(1)
    expect(current.positions.find((row: any) => row.itemId === item.id).quantity).toBe('2')

    const staleOrder = await makeOrder(), recipient = await makeOrder()
    const staleWave = await command('wave.release', { carrierId: carrier.id, orderIds: [staleOrder.id] })
    await openWave(staleWave); await scan('Scan bin label', bin.name)
    interrupted = { type: 'pick.scan', loseResponse: false }
    await scan('Scan item', item.barcode)
    await expect(page.getByRole('heading', { name: 'Recover interrupted action', exact: true })).toBeVisible(); await idle()
    const other = await browser.newContext()
    try {
      const otherPage: Page = await other.newPage(); await ownerEntry(otherPage)
      const otherCommand = async (type: string, payload: object) => {
        const response = await other.request.post(`${origin}/api/pier/commands`, { headers: { origin }, data: { commandId: crypto.randomUUID(), type, payload } })
        const body = await response.json(); expect(body.ok, JSON.stringify(body)).toBe(true); return body.result
      }
      const proposal = await otherCommand('proposal.prepare', { kind: 'reallocation', assumptions: 'Synthetic second-session allocation change', evidence: [staleOrder.id, recipient.id], plan: { fromOrderId: staleOrder.id, toOrderId: recipient.id, itemId: item.id, quantity: '2' } })
      await otherCommand('proposal.approve', { proposalId: proposal.id, version: proposal.version }); await otherCommand('proposal.execute', { proposalId: proposal.id, version: proposal.version })
    } finally { await other.close() }
    const beforeStale = await state(), beforeWrites = observed.length
    await page.reload(); await idle()
    await page.getByRole('button', { name: 'Retry this exact action', exact: true }).click()
    await expect(page.getByText(/Warehouse task or availability changed/).first()).toBeVisible(); await idle()
    expect(observed).toHaveLength(beforeWrites)
    current = await state()
    expect(current.movements).toEqual(beforeStale.movements)
    expect(current.reservations).toEqual(beforeStale.reservations)
    expect(current.waves.find((row: any) => row.id === staleWave.id).lines[0].picked).toBe('0')
    await expect(page.getByRole('button', { name: 'Discard retained scans', exact: true })).toBeVisible()
    if (shots) await page.screenshot({ path: join(shots, `${width}-warehouse-stale-recovery.png`), fullPage: true })
    await page.getByRole('button', { name: 'Discard retained scans', exact: true }).click()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)
  }
} },
 ];
}

export async function warehouse_returns(width = 1440) {
const { expect } = await import('@playwright/test');
const { mkdir } = await import('node:fs/promises');
const { join } = await import('node:path');
const { ownerEntry } = await import('./session');
const { pantryInstallation } = await import('../api/pantry-installation.mjs');

return [
{ title: 'warehouse partial receiving, transfers, counts and authorized or quarantined return scans on desktop', run: async ({ page, context, browser }) => {

  const origin = await ownerEntry(page), pantry = await pantryInstallation()
  const shots = process.env.PIER_SCREENSHOTS
  if (shots) await mkdir(shots, { recursive: true })
  const command = async (type: string, payload: object) => {
    const response = await context.request.post(`${origin}/api/pier/commands`, { headers: { origin }, data: { commandId: crypto.randomUUID(), type, payload } })
    const body = await response.json(); expect(body.ok, JSON.stringify(body)).toBe(true); return body.result
  }
  const state = async () => (await context.request.get(`${origin}/api/pier/state`)).json()
  const action = async (p: Page, type: string, click: () => Promise<unknown>) => {
    const reply = p.waitForResponse(r => r.url().endsWith('/api/pier/commands') && r.request().postDataJSON()?.type === type)
    await click(); const body = await (await reply).json(); expect(body.ok).toBe(true)
    await expect(p.locator('main')).toHaveAttribute('aria-busy', 'false')
    return body.result
  }
  const shot = async (p: Page, width: number, name: string) => {
    expect(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
    if (shots) await p.screenshot({ path: join(shots, `${width}-warehouse-${name}.png`), fullPage: true })
  }
  let receiver
  let expectedDamageCents = 0
  try {
    await pantry.command('chart.start', {})
    const inventory = await pantry.command('account.save', { code: '1300', name: 'Inventory Asset', type: 'asset', subtype: 'other' })
    const cogs = await pantry.command('account.save', { code: '5000', name: 'Cost of Goods Sold', type: 'expense', subtype: 'other' })
    const damage = await pantry.command('account.save', { code: '5100', name: 'Damaged stock', type: 'expense', subtype: 'other' })
    const revenue = (await pantry.view('state')).accounts.find((a: any) => a.code === '4000')
    const grant = await pantry.command('integration.create', { name: 'Warehouse return journey', scopes: ['contacts:write','invoices:write','bills:write','journals:write','documents:write','payments:read','reports:read','post'] })
    // The runtime-issued integration grant remains in memory and is never logged.
    const connected = await context.request.post(`${origin}/api/pier/commands`, { headers: { origin }, data: { commandId: crypto.randomUUID(), type: 'book.connect', payload: { baseUrl: pantry.origin, integrationToken: grant.token, inventoryAccountId: inventory.id, cogsAccountId: cogs.id, revenueAccountId: revenue.id, writeOffAccountId: damage.id, taxCode: 'exempt' } } })
    expect(connected.ok()).toBe(true)
    expect((await connected.json()).ok).toBe(true)
    receiver = await browser.newContext()
    const receivePage = await receiver.newPage()
    await ownerEntry(receivePage)
    await receivePage.goto(`${origin}/auth/dev/enter?as=member`)
    await receivePage.waitForURL(url => url.pathname === '/app')
    const member = await (await receiver.request.get(`${origin}/auth/session`)).json()
    await command('role.set', { operatorId: member.operator.id, role: 'operator' })
    for (const width of [1440]) {
      await page.setViewportSize({ width, height: 1000 }); await receivePage.setViewportSize({ width, height: 1000 })
      const item = await command('item.save', { sku: `synthetic-pier-${width+600}`, name: `Warehouse return mug ${width}`, unit: 'each', packSize: '1', barcode: `synthetic-pier-${width+601}` })
      const source = await command('location.save', { name: `Receiving ${width}`, warehouse: `Warehouse ${width}`, kind: 'bin', barcode: `synthetic-pier-${width+602}` })
      const destination = await command('location.save', { name: `Returns ${width}`, warehouse: `Warehouse ${width}`, kind: 'bin', barcode: `synthetic-pier-${width+603}` })
      const transit = await command('location.save', { name: `Van ${width}`, warehouse: `Transfer ${width}`, kind: 'transit' })
      const supplier = await command('party.save', { name: `Warehouse supplier ${width}`, kind: 'supplier' })
      const customer = await command('party.save', { name: `Warehouse customer ${width}`, kind: 'customer' })
      let po = await command('po.draft', { supplierId: supplier.id, destinationWarehouse: source.warehouse, promiseDate: '2026-11-01', reason: 'Partial delivery', lines: [{ itemId: item.id, quantity: '8', price: '2' }] })
      await command('po.approve', { poId: po.id, version: po.version }); po = await command('po.commit', { poId: po.id, version: po.version })
      await page.goto(`${origin}/app#floor/receive`); await page.reload()
      await page.getByLabel('Purchase order', { exact: true }).selectOption(po.id)
      await page.getByLabel('Put away to bin', { exact: true }).selectOption(source.id)
      await action(page, 'receiving.start', () => page.getByRole('button', { name: 'Start receiving', exact: true }).click())
      await page.getByLabel('Times scanned', { exact: true }).fill('6')
      const scan = page.getByRole('textbox', { name: 'Scan item or bin', exact: true })
      await scan.fill(item.barcode); await action(page, 'receiving.scan', () => scan.press('Enter'))
      await page.getByLabel('Supplier delivery reference', { exact: true }).fill(`synthetic-pier-receipt-${width}`)
      await action(page, 'receiving.post', () => page.getByRole('button', { name: 'Post receipt into bins', exact: true }).click())
      expect((await state()).purchaseOrders.find((p: any) => p.id === po.id).lines[0].received).toBe('6')
      await shot(page, width, 'partial-receipt')
      const bill = await command('supplierBill.save', { poId: po.id, reference: `synthetic-pier-bill-${width}`, date: new Date().toISOString().slice(0,10), quantityTolerancePercent: '0', priceTolerancePercent: '0', lines: [{ poLineId: po.lines[0].id, quantity: '6', unitPrice: '2' }] })
      await command('supplierBill.approve', { id: bill.id, version: bill.version, receiptEvidence: bill.match.receiptEvidence })
      await page.goto(`${origin}/app#transfers`); await page.reload()
      const transferForm = page.getByRole('heading', { name: 'Dispatch available stock to transit', exact: true }).locator('..')
      for (const [name, value] of [['Item', item.id], ['Source bin', source.id], ['Destination bin', destination.id], ['Transit location', transit.id]]) await transferForm.getByLabel(name, { exact: true }).selectOption(value)
      await transferForm.getByLabel('Quantity (base units)', { exact: true }).fill('1'); await transferForm.getByLabel('Transfer reason', { exact: true }).fill('Move one mug to returns bench')
      await action(page, 'transfer.send', () => transferForm.getByRole('button', { name: 'Dispatch transfer', exact: true }).click())
      await action(page, 'transfer.receive', () => page.getByRole('button', { name: 'Confirm full destination receipt', exact: true }).click())
      await shot(page, width, 'transfer-received')
      await page.goto(`${origin}/app#counts`); await page.reload()
      const startCount = page.getByRole('heading', { name: 'Capture bin count frontier', exact: true }).locator('..')
      await startCount.getByLabel('Bin', { exact: true }).selectOption(destination.id)
      const captured = await action(page, 'count.capture', () => startCount.getByRole('button', { name: 'Begin count', exact: true }).click())
      const count = page.locator(`#document-${captured.id}`)
      const physical = count.getByRole('heading', { name: 'Record physical quantities', exact: true }).locator('..')
      await physical.getByLabel(`${item.name} · ${item.sku} · sellable (each)`, { exact: true }).fill('1')
      await physical.getByLabel('Count evidence / reason', { exact: true }).fill('Physical receiving handoff agrees with shelf')
      await action(page, 'count.record', () => physical.getByRole('button', { name: 'Save physical count for review', exact: true }).click())
      await action(page, 'count.approve', () => count.getByRole('button', { name: /^Approve version .* adjustment$/ }).click())
      await shot(page, width, 'cycle-count')
      const order = await command('order.create', { customerId: customer.id, warehouse: source.warehouse, lines: [{ itemId: item.id, quantity: '4', price: '3' }] })
      await command('dispatch.create', { orderId: order.id, shipmentReference: `synthetic-pier-shipment-${width}`, lines: [{ orderLineId: order.lines[0].id, quantity: '4' }] })
      await page.goto(`${origin}/app#floor/returns`); await page.reload()
      await page.getByLabel('Return reason', { exact: true }).fill('Customer returned an intact mug')
      const binScan = page.getByRole('textbox', { name: 'Scan return bin', exact: true })
      await binScan.fill(destination.barcode); await binScan.press('Enter')
      await expect(page.getByLabel('Return bin', { exact: true })).toHaveValue(destination.id)
      const returnedScan = page.getByRole('textbox', { name: 'Scan order label or returned item', exact: true })
      await returnedScan.fill(item.barcode); await action(page, 'return.scan', () => returnedScan.press('Enter'))
      await expect(page.getByRole('status').filter({ hasText: 'Returned stock is sellable' })).toBeVisible()
      let current = await state()
      expect(current.positions.find((p: any) => p.itemId === item.id && p.locationId === destination.id && p.status === 'sellable').quantity).toBe('2')
      await shot(page, width, 'restocked-one-scan')
      await page.getByLabel('Condition', { exact: true }).selectOption('damaged'); await page.getByLabel('Disposition', { exact: true }).selectOption('writeoff'); await page.locator('section.panel').filter({ has: page.getByRole('heading', { name: 'Returns bench', exact: true }) }).getByLabel('Approve this write-off above its mapped limit', { exact: true }).check()
      await page.getByLabel('Return reason', { exact: true }).fill('Crushed mug, approved damage write-off')
      await returnedScan.fill(item.barcode); await action(page, 'return.scan', () => returnedScan.press('Enter'))
      current = await state()
      const written = current.returns.find((r: any) => r.itemId === item.id && r.status === 'writtenoff')
      expect(written.writeOffAccountId).toBe(damage.id); expect(written.writeOffCostTotal).toBe('2.000000000000')
      expectedDamageCents += 200 // One physically inspected unit at the received cost of USD 2.
      await shot(page, width, 'mapped-writeoff')
      await receivePage.goto(`${origin}/app#floor/returns`); await receivePage.reload()
      for (const condition of ['sellable','damaged']) {
        await receivePage.getByLabel('Return bin', { exact: true }).selectOption(destination.id)
        await receivePage.getByLabel('Condition', { exact: true }).selectOption(condition)
        await receivePage.getByLabel('Disposition', { exact: true }).selectOption(condition === 'sellable' ? 'restock' : 'writeoff')
        await receivePage.getByLabel('Return reason', { exact: true }).fill(`Receiver intake ${condition}, needs inspector`)
        const input = receivePage.getByRole('textbox', { name: 'Scan order label or returned item', exact: true })
        await input.fill(item.barcode); await action(receivePage, 'return.scan', () => input.press('Enter'))
        await shot(receivePage, width, `unauthorized-${condition}`)
      }
      current = await state()
      const waiting = current.returns.filter((r: any) => r.itemId === item.id && r.receivedBy === member.operator.id)
      expect(waiting).toHaveLength(2); expect(waiting.every((r: any) => r.status === 'quarantine' && !r.inspectedBy && !r.writeOffAccountId)).toBe(true)
      // Read the ledger only after its retained write-off job has posted.
      await expect.poll(async () => Boolean((await command('book.sync', {})).busy), { timeout: 30_000 }).toBe(false)
      const jobs = (await state()).bookJobs
      expect(jobs.find((j: any) => j.key === `return-writeoff:${written.id}`).status).toBe('posted')
    }
    const ledger = await pantry.view('reports/trial-balance')
    expect(ledger.balanced).toBe(true)
    expect(ledger.rows.find((r: any) => r.id === damage.id).net).toBe(expectedDamageCents)
  } finally { await receiver?.close(); await pantry.close() }
} },
 ];
}

export async function slotting(width = 1440) {
const { expect } = await import('@playwright/test');
const { mkdir } = await import('node:fs/promises');
const { join } = await import('node:path');
const { ownerEntry } = await import('./session');

return [
{ title: 'WMS-002: configure capacity, review directions and confirm physical tasks on desktop', run: async ({ page, context }) => {
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
  for (const width of [1440]) {
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
} },
 ];
}

export async function supplier_bills(width = 1440) {
const { expect } = await import('@playwright/test');
const { mkdir } = await import('node:fs/promises');
const { join } = await import('node:path');
const { ownerEntry } = await import('./session');

return [
{ title: 'BUY-004: buyer corrects source packs, retains originals and approves on desktop', run: async ({ page, context }) => {
  const origin = await ownerEntry(page)
  const command = async (type: string, payload: object) => {
    const response = await context.request.post(`${origin}/api/pier/commands`, { headers: { origin }, data: { commandId: crypto.randomUUID(), type, payload } })
    const body = await response.json(); expect(body.ok, JSON.stringify(body)).toBe(true); return body.result
  }
  const supplier = await command('party.save', { name: 'Lakeview Ceramics', kind: 'supplier' })
  const location = await command('location.save', { name: 'Receiving A-14', warehouse: 'Dallas', kind: 'bin' })
  const shots = process.env.PIER_SCREENSHOTS
  if (shots) await mkdir(shots, { recursive: true })
  for (const width of [1440]) {
    const item = await command('item.save', { sku: `MUG-${width}`, name: 'Blue stoneware mug', unit: 'each', packSize: '12' })
    let po = await command('po.draft', { supplierId: supplier.id, destinationWarehouse: 'Dallas', promiseDate: '2026-11-01', reason: 'Autumn replenishment', freight: '12', lines: [{ itemId: item.id, quantity: '48', price: '4.2' }] })
    await command('po.approve', { poId: po.id, version: po.version })
    po = await command('po.commit', { poId: po.id, version: po.version })
    await command('receipt.create', { poId: po.id, supplierReference: `DELIVERY-${width}`, lines: [{ poLineId: po.lines[0].id, locationId: location.id, quantity: '24', cost: '4.2' }] })
    await page.setViewportSize({ width, height: 1000 })
    await page.goto(`${origin}/app#books`); await page.reload()
    await page.getByRole('button', { name: 'Record supplier invoice', exact: true }).click()
    const editor = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Record supplier invoice', exact: true }) })
    await editor.getByLabel('Committed purchase order', { exact: true }).selectOption(po.id)
    await editor.getByLabel('Supplier invoice reference', { exact: true }).fill(`LC-${width}`)
    await editor.getByLabel('Supplier invoice date', { exact: true }).fill('2026-10-21')
    await editor.getByLabel('Billed quantity · Blue stoneware mug', { exact: false }).fill('24')
    await editor.getByLabel('Supplier invoice freight (USD)', { exact: true }).fill('15')
    await editor.getByLabel('Retain Invoice source', { exact: true }).check()
    await editor.getByLabel('Invoice source reference', { exact: true }).fill(`LC-${width}`)
    await editor.getByLabel('Invoice original text', { exact: true }).fill('Invoice: two cases of twelve blue mugs, USD 4.20 each.')
    await editor.getByLabel('Invoice freight (USD)', { exact: true }).fill('15')
    await editor.getByLabel('Invoice document quantity · Blue stoneware mug', { exact: false }).fill('2')
    await editor.getByLabel('Invoice base units per pack · Blue stoneware mug', { exact: false }).fill('6')
    await editor.getByLabel('Retain BOL source', { exact: true }).check()
    await editor.getByLabel('BOL source reference', { exact: true }).fill(`BOL-${width}`)
    await editor.getByLabel('BOL original text', { exact: true }).fill('Delivery: two cases, twelve mugs per case, 24 each.')
    await editor.getByLabel('BOL freight (USD)', { exact: true }).fill('12')
    await editor.getByLabel('BOL document quantity · Blue stoneware mug', { exact: false }).fill('2')
    await editor.getByLabel('BOL base units per pack · Blue stoneware mug', { exact: false }).fill('12')
    if (shots) await page.screenshot({ path: join(shots, `${width}-supplier-invoice-entry.png`), fullPage: true })
    await editor.getByRole('button', { name: 'Save for matching review', exact: true }).click()
    await expect(editor).toHaveCount(0)
    await page.getByRole('row').filter({ hasText: `LC-${width}` }).getByRole('button', { name: 'Review invoice', exact: true }).click()
    const review = page.locator('section').filter({ has: page.getByRole('heading', { name: `Match supplier invoice LC-${width}`, exact: true }) })
    await expect(review.getByRole('button', { name: 'Approve exact invoice and differences', exact: true })).toBeDisabled()
    await expect(review.getByRole('alert').first()).toBeVisible()
    await expect(review).toContainText("Cumulative approved invoice freight exceeds the PO's 12 USD by 3 USD.")
    await expect(review).toContainText('BOL ' + `BOL-${width}` + ': freight 12 USD differs')
    if (shots) await page.screenshot({ path: join(shots, `${width}-supplier-invoice-blocked.png`), fullPage: true })
    await review.getByRole('button', { name: 'Revise invoice or tolerances', exact: true }).click()
    const revise = page.locator('section').filter({ has: page.getByRole('heading', { name: `Revise supplier invoice LC-${width}`, exact: true }) })
    await revise.getByLabel('Invoice base units per pack · Blue stoneware mug', { exact: false }).fill('12')
    await revise.getByLabel('Supplier invoice freight (USD)', { exact: true }).fill('12')
    await revise.getByLabel('Invoice freight (USD)', { exact: true }).fill('12')
    await revise.getByRole('button', { name: 'Save for matching review', exact: true }).click()
    await expect(revise).toHaveCount(0)
    await review.getByText(`Invoice · LC-${width}`, { exact: true }).click()
    await review.getByText(`BOL · BOL-${width}`, { exact: true }).click()
    await expect(review).toContainText('two cases of twelve')
    await expect(review.getByRole('button', { name: 'Approve exact invoice and differences', exact: true })).toBeEnabled()
    if (shots) await page.screenshot({ path: join(shots, `${width}-supplier-invoice-corrected.png`), fullPage: true })
    await review.getByRole('button', { name: 'Approve exact invoice and differences', exact: true }).click()
    await expect(review.getByRole('button', { name: 'Revise invoice or tolerances', exact: true })).toHaveCount(0)
    const state = await (await context.request.get(`${origin}/api/pier/state`)).json()
    const saved = state.supplierBills.find((bill: any) => bill.reference === `LC-${width}`)
    expect(saved.status).toBe('approved'); expect(saved.documentHistory[0].documents.invoice.lines[0].packSize).toBe('6')
    expect(saved.total).toBe('112.800000000000'); expect(saved.freight).toBe('12')
    expect(state.purchaseOrders.find((row: any) => row.id === po.id).lines[0].received).toBe('24')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)
    if (shots) await page.screenshot({ path: join(shots, `${width}-supplier-invoice-approved.png`), fullPage: true })
    // The same receipt carries a supplier inspection that feeds the scorecard.
    const receipt = state.receipts.find((row: any) => row.supplierReference === `DELIVERY-${width}`)
    await page.goto(`${origin}/app#purchasing`); await page.reload()
    await page.getByRole('button', { name: 'All', exact: true }).click()
    const record = page.locator(`#document-${receipt.id}`)
    const inspection = record.locator('section').filter({ has: page.getByRole('heading', { name: 'Record a supplier inspection', exact: true }) })
    await inspection.getByLabel('Received line', { exact: true }).selectOption({ index: 1 })
    await inspection.getByLabel('Inspected quantity', { exact: true }).fill('24')
    await inspection.getByLabel('Defective quantity', { exact: true }).fill('3')
    await inspection.getByLabel('Defect description (required when any are defective)', { exact: true }).fill('Glaze crazing')
    await inspection.getByRole('button', { name: 'Record inspection', exact: true }).click()
    await expect(record).toContainText('Glaze crazing')
    if (shots) await page.screenshot({ path: join(shots, `${width}-supplier-inspection.png`), fullPage: true })
    const card = await (await context.request.get(`${origin}/api/pier/supplier-performance`)).json()
    const scored = card.suppliers.find((row: any) => row.supplierId === supplier.id).items.find((row: any) => row.itemId === item.id)
    expect(scored.defectPercent).toBe('12.5')
  }
} },
 ];
}

export async function openness() {
  const { expect } = await import('@playwright/test')
  const { ownerEntry } = await import('./session')
  const { openJourney } = await import('../api/open-fixtures.mjs')
  return [{ title: 'Staff and warehouses reach every product area and review provider costs before activation', run: async ({ page, context }) => {
    const origin = await ownerEntry(page)
    await page.setViewportSize({ width: 1440, height: 1000 })
    const command = async (type: string, payload: object) => {
      const response = await context.request.post(origin + '/api/pier/commands', { headers: { origin }, data: { commandId: crypto.randomUUID(), type, payload } })
      const body = await response.json(); expect(body.ok).toBe(true); return body.result
    }
    await openJourney({ command, request: async (path: string, options: any) => context.request.post(origin + path, { headers: { origin }, data: options.body }).then(response => ({ status: response.status() })) })
    await page.goto(origin + '/app#activity'); await page.reload()
    await expect(page.getByRole('row').filter({ hasText: 'staff25@example.test' })).toBeVisible()
    for (const [tab, heading] of [['sales','Sales orders'],['stock','Stock'],['purchasing','Purchasing'],['floor','Floor'],['transfers','Transfers'],['counts','Counts'],['reports','Reports'],['imports','Imports'],['activity','Activity'],['channels','Channels'],['books','Books'],['edi','Retail EDI'],['ai','AI setup']]) {
      await page.goto(origin + '/app#' + tab)
      await expect(page.getByRole('heading', { name: heading, exact: true }).first()).toBeVisible()
      await expect(page.getByRole('dialog')).toHaveCount(0)
    }
    await expect(page.getByText(/OpenAI.*bill|bill.*OpenAI/i)).toBeVisible()
    await page.goto(origin + '/app#channels')
    for (const provider of ['Shopify','Amazon','WooCommerce','Stall']) {
      await page.getByRole('button', { name: 'Set up ' + provider, exact: true }).click()
      const editor = page.locator('#channel-connection-editor')
      const disclosure = editor.getByText('Provider costs.', { exact: true }).locator('..')
      await expect(disclosure).toBeVisible()
      await expect(disclosure).toContainText(new RegExp(provider, 'i'))
      await editor.getByRole('button', { name: 'Cancel', exact: true }).click()
    }
    for (const tab of ['books','edi','floor/shipping']) {
      await page.goto(origin + '/app#' + tab)
      if (tab === 'books') await page.getByRole('button', { name: 'Connect Pantry', exact: true }).click()
      if (tab === 'edi') await page.getByText('Retailer settings and item mappings', { exact: true }).click()
      await expect(page.getByText('Provider costs.', { exact: true }).first()).toBeVisible()
    }
    const before = await (await context.request.get(origin + '/api/pier/state')).json()
    expect(before.channels.every((row: any) => !row.enabled)).toBe(true)
    const paused = await command('channel.save', { name: 'Wholesale store paused', provider: 'woocommerce', baseUrl: 'https://store.example.test', warehouse: 'Dallas', enabled: false, credentials: { consumerKey: 'test-only-key', consumerSecret: 'test-only-secret' } })
    expect(paused.enabled).toBe(false)
    await page.goto(origin + '/app#channels'); await page.reload()
    const row = page.locator('.channel-setup-row').filter({ hasText: paused.name })
    await expect(row.getByRole('button', { name: 'Enable ' + paused.name, exact: true })).toBeVisible()
    await expect(row.getByText('Provider costs.', { exact: true })).toBeVisible()
  } }]
}
