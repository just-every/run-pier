// @ts-expect-error Real sibling Worker fixture accessed through GitHub's API.
import { pantryInstallation } from '../api/pantry-installation.mjs'
// @ts-expect-error Real Worker and D1; only the external relay response is simulated.
import { managedMailInstallation, managedPurchase, supplierRecipient, expectedManagedText } from '../api/managed-mail-fixture.mjs'
import { ownerEntry } from './session'
import { test, expect } from './installed'
import type { Page, Locator } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'


// The installation fixture publishes its address before each scenario.
let origin = ''
test.beforeEach(() => { origin = process.env.PIER_BASE_URL! })
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

test.describe('owners dry-run and activate routing and review an audited reroute at 1440 and 390',()=>{
  for(const width of[1440,390]){
  test(`routing, shortage policies and audited refusals at ${width}px`,async({page,context})=>{
    // Each complete viewport journey owns its timeout and authenticated context.
    // The shortage cases and their screenshots can exceed two minutes on hosted CI.
    test.setTimeout(240_000)
    const h=await salesHarness(page,context)
    await page.setViewportSize({width,height:1000});const b=await h.fixture(width),other=await h.command('location.save',{name:`Other ${b.name}`,warehouse:`West ${b.name}`,kind:'bin'});await h.sales();await page.getByText('Warehouse routing rules',{exact:true}).click()
    const form=h.panel('Prepare a warehouse routing rule');await form.getByLabel('Routing order source',{exact:true}).selectOption('manual');await form.getByLabel('Routing mode',{exact:true}).selectOption('rules');await form.getByLabel(`Default warehouse priority · ${b.name}`,{exact:true}).check();await form.getByLabel('Zone name 1',{exact:true}).fill('Western destinations');await form.getByLabel('ZIP prefixes, comma separated (900-961 allowed) 1',{exact:true}).fill('900-961');await form.getByLabel('US states, comma separated 1',{exact:true}).fill('OR,WA');await form.getByLabel(`Zone 1 warehouse priority · ${other.warehouse}`,{exact:true}).check();await form.getByLabel(`Zone 1 warehouse priority · ${b.name}`,{exact:true}).check();await h.shot(width,'routing-draft');await h.saved(form,'Save routing draft')
    let rule=(await h.state()).routingRules.filter((r:any)=>r.source==='manual').sort((a:any,b:any)=>b.revision-a.revision)[0];let review=h.panel(`Manual orders · routing revision ${rule.revision}`);await review.getByRole('button',{name:'Dry-run last 30 days',exact:true}).click();await expect(review.getByRole('table')).toBeVisible();await review.getByRole('button',{name:'Activate reviewed rule',exact:true}).click();await expect(review.getByText(/Activated/)).toBeVisible();await h.shot(width,'routing-reviewed')
    let order=await h.command('order.create',{customerId:b.customer.id,shipTo:{state:'OR',postalCode:'94107',country:'US'},lines:[{itemId:b.item.id,quantity:'2',price:'3'}]});expect(order.warehouse).toBe(other.warehouse);await page.goto(`${h.base}/app#sales/${order.id}`);await page.reload();const reroute=h.panel('Reroute an unpicked order');await reroute.getByLabel('New eligible warehouse',{exact:true}).selectOption(b.name);await reroute.getByLabel('Warehouse reroute reason',{exact:true}).fill('Owner reviewed warehouse change');await h.saved(reroute,'Review and reroute');order=(await h.state()).orders.find((o:any)=>o.id===order.id);expect(order.warehouse).toBe(b.name);expect(order.lines[0].reserved).toBe('2');expect(order.routingHistory.at(-1).reason).toBe('Owner reviewed warehouse change');await h.shot(width,'routing-order');const address=h.panel('Change ship-to before picking');for(const [label,value]of[['New ship-to address','40 Pier Road'],['New ship-to state','NY'],['New ship-to ZIP','10001'],['New ship-to country','US'],['Ship-to change reason','Customer reviewed a new destination']])await address.getByLabel(label,{exact:true}).fill(value);await h.saved(address,'Review address and reroute');expect((await h.state()).orders.find((o:any)=>o.id===order.id).routing.zone).toBe('Default');await h.shot(width,'routing-address-change');await page.goto(`${h.base}/app#channels`);await expect(page.getByText(/Stall reads its eligible warehouses net of reservations, holds and this connection’s buffer/)).toBeVisible();await page.getByRole('button',{name:'Set up Stall',exact:true}).click();await expect(page.getByLabel('Stock buffer (base units)',{exact:true})).toBeVisible();await h.shot(width,'channel-routing-scope')
    const fba = await h.command('location.save', { name: `FBA bin ${b.name}`, warehouse: `FBA ${b.name}`, kind: 'bin' })
    let stock = await h.command('po.draft', { supplierId: b.supplier.id, promiseDate: '2026-11-01', reason: 'Shortage journey stock', lines: [{ itemId: b.item.id, quantity: '52', price: '1' }] })
    await h.command('po.approve', { poId: stock.id, version: stock.version })
    stock = await h.command('po.commit', { poId: stock.id, version: stock.version })
    await h.command('receipt.create', { poId: stock.id, supplierReference: b.name, lines: [{ poLineId: stock.lines[0].id, locationId: other.id, quantity: '2', cost: '1' }, { poLineId: stock.lines[0].id, locationId: fba.id, quantity: '50', cost: '1' }] })
    const activateShortage = async (shortage: string) => {
      await h.sales()
      await page.getByText('Warehouse routing rules', { exact: true }).click()
      const draft = h.panel('Prepare a warehouse routing rule')
      await draft.getByLabel('Routing order source', { exact: true }).selectOption('manual')
      await draft.getByLabel('Routing mode', { exact: true }).selectOption('rules')
      await draft.getByLabel('Shortage policy', { exact: true }).selectOption(shortage)
      await draft.getByLabel(`Default warehouse priority · ${b.name}`, { exact: true }).check()
      await draft.getByLabel('Zone name 1', { exact: true }).fill('Western destinations')
      await draft.getByLabel('ZIP prefixes, comma separated (900-961 allowed) 1', { exact: true }).fill('900-961')
      await draft.getByLabel(`Zone 1 warehouse priority · ${other.warehouse}`, { exact: true }).check()
      await draft.getByLabel(`Zone 1 warehouse priority · ${b.name}`, { exact: true }).check()
      await h.saved(draft, 'Save routing draft')
      const current = (await h.state()).routingRules.filter((r: any) => r.source === 'manual').sort((a: any, z: any) => z.revision - a.revision)[0]
      const review = h.panel(`Manual orders · routing revision ${current.revision}`)
      await review.getByRole('button', { name: 'Dry-run last 30 days', exact: true }).click()
      await expect(review.getByRole('table')).toBeVisible()
      await review.getByRole('button', { name: 'Activate reviewed rule', exact: true }).click()
      await expect(review.getByText(/Activated/)).toBeVisible()
      await h.shot(width, `routing-${shortage}-control`)
    }
    const createShortageOrder = async () => {
      const prior = (await h.state()).orders.map((o: any) => o.id)
      const entry = h.panel('New sales order')
      await entry.getByLabel('Customer', { exact: true }).selectOption(b.customer.id)
      await entry.getByLabel('Ship-to state', { exact: true }).fill('CA')
      await entry.getByLabel('Ship-to ZIP', { exact: true }).fill('94107')
      await entry.getByLabel('Ship-to country', { exact: true }).fill('US')
      await entry.getByLabel('Item 1', { exact: true }).selectOption(b.item.id)
      await entry.getByLabel('Quantity (base units)', { exact: true }).fill('5')
      await entry.getByLabel('Unit price (USD)', { exact: true }).fill('3')
      await h.saved(entry, 'Create and reserve available stock')
      const created = (await h.state()).orders.find((o: any) => !prior.includes(o.id))
      await page.goto(`${h.base}/app#sales/${created.id}`)
      await page.reload()
      return created
    }
    const sources = () => page.locator('section.panel').filter({ has: page.getByRole('heading', { name: 'Reserved sources for physical picking', exact: true }) })
    const allocation = async (bin: any, quantity: string) => {
      const row = sources().getByRole('row').filter({ hasText: bin.name })
      await expect(row.getByRole('cell').nth(1)).toContainText(bin.name)
      await expect(row.getByRole('cell').nth(2)).toHaveText(`${quantity} each`)
    }
    const assertWhole = async (created: any) => {
      expect([created.warehouse, created.lines[0].reserved, created.lines[0].backorder]).toEqual([b.name, '5', '0'])
      await allocation(b.bin, '5')
      await expect(sources().locator('tbody').getByRole('row')).toHaveCount(1)
      await expect(h.panel('Pick and dispatch reserved lines').getByText('Reserved 5; backorder 0', { exact: true })).toBeVisible()
      await expect(h.panel('Warehouse routing')).toContainText(b.name)
    }
    const cancel = async () => {
      const form = h.panel('Cancel remaining demand')
      await form.getByLabel('Cancellation reason', { exact: true }).fill('Finish independent shortage case')
      await h.saved(form, 'Cancel unshipped demand and release reservations')
    }
    const business = async () => {
      const state = await h.state(), exported = await (await context.request.get(`${h.base}/api/pier/export`)).json()
      return { positions: state.positions, movements: state.movements, reservations: state.reservations,
        orders: state.orders, shipments: state.shipments, waves: state.waves, commands: exported.commands }
    }
    await activateShortage('hold')
    let shortageOrder = await createShortageOrder()
    expect([shortageOrder.warehouse, shortageOrder.lines[0].reserved, shortageOrder.lines[0].backorder]).toEqual([other.warehouse, '2', '3'])
    await allocation(other, '2')
    await expect(h.panel('Pick and dispatch reserved lines').getByText('Reserved 2; backorder 3', { exact: true })).toBeVisible()
    await h.shot(width, 'routing-hold-outcome')
    const reason = `Owner reviewed shortage reroute ${width}`
    const staleForm = h.panel('Reroute an unpicked order')
    await staleForm.getByLabel('New eligible warehouse', { exact: true }).selectOption(b.name)
    await staleForm.getByLabel('Warehouse reroute reason', { exact: true }).fill(reason)
    const eligibleOptions = await staleForm.getByLabel('New eligible warehouse', { exact: true }).locator('option').allTextContents()
    expect(eligibleOptions).not.toContain(fba.warehouse)
    await h.command('order.reroute', { orderId: shortageOrder.id, version: shortageOrder.version, warehouse: b.name, reason })
    let beforeRefusal = await business()
    await submit(page, staleForm, 'Review and reroute', false)
    await expect(page.getByRole('alert')).toContainText('The record changed. Reload and review this version.')
    expect(await business()).toEqual(beforeRefusal)
    await h.shot(width, 'routing-stale-refusal')
    // The refusal refreshes current records; the fresh review is the recovery door.
    const recovery = h.panel('Reroute an unpicked order')
    await recovery.getByLabel('New eligible warehouse', { exact: true }).selectOption(other.warehouse)
    await recovery.getByLabel('Warehouse reroute reason', { exact: true }).fill('Reviewed return to routed warehouse')
    await h.saved(recovery, 'Review and reroute')
    await allocation(other, '2')
    await h.shot(width, 'routing-refusal-recovered')
    await page.goto(`${h.base}/app#activity/${shortageOrder.id}`)
    await page.reload()
    const eventRow = page.getByRole('row').filter({ hasText: reason })
    await expect(eventRow).toContainText('Owner')
    await eventRow.getByText('Recorded change details', { exact: true }).click()
    await expect(eventRow).toContainText('reservations')
    await expect(eventRow).toContainText(other.id)
    await expect(eventRow).toContainText(b.bin.id)
    const auditedQuantities = eventRow.getByText('quantity (base units)', { exact: true }).locator('..').locator('dd')
    await expect(auditedQuantities).toHaveText(['2', '5'])
    await h.shot(width, 'routing-audit-allocations')
    await page.goto(`${h.base}/app#sales/${shortageOrder.id}`)
    await page.reload()
    await cancel()
    await activateShortage('next')
    shortageOrder = await createShortageOrder()
    await assertWhole(shortageOrder)
    await h.shot(width, 'routing-next-outcome')
    await cancel()
    await activateShortage('split')
    shortageOrder = await createShortageOrder()
    await assertWhole(shortageOrder)
    await h.shot(width, 'routing-missing-permission-outcome')
    await cancel()
    let customer = (await h.state()).parties.find((p: any) => p.id === b.customer.id)
    customer = await h.command('customer.splitPolicy', { customerId: customer.id, version: customer.version, allowSplit: false, reason: 'Customer declines separate warehouse shipments' })
    await page.reload()
    shortageOrder = await createShortageOrder()
    await assertWhole(shortageOrder)
    await h.shot(width, 'routing-no-split-outcome')
    await cancel()
    await h.command('customer.splitPolicy', { customerId: customer.id, version: customer.version, allowSplit: true, reason: 'Customer explicitly accepts separate warehouse shipments' })
    await page.reload()
    shortageOrder = await createShortageOrder()
    expect([shortageOrder.lines[0].reserved, shortageOrder.lines[0].backorder]).toEqual(['5', '0'])
    await allocation(other, '2')
    await allocation(b.bin, '3')
    await h.shot(width, 'routing-split-allocations')
    for (const [warehouse, quantity, suffix] of [[other.warehouse, '2', 'west'], [b.name, '3', 'east']]) {
      const dispatch = h.panel('Pick and dispatch reserved lines')
      await dispatch.getByLabel('Dispatch warehouse', { exact: true }).selectOption(warehouse)
      await dispatch.getByLabel('Shipment reference', { exact: true }).fill(`${b.name}-${suffix}`)
      await dispatch.getByLabel(`${b.item.name} · ${b.item.sku} · dispatch (each)`, { exact: true }).fill(quantity)
      await h.saved(dispatch, 'Confirm partial dispatch')
      const shipment = page.locator('.record').filter({ has: page.getByRole('heading', { name: `Shipment ${b.name}-${suffix}`, exact: true }) })
      await expect(shipment.getByRole('cell').nth(1)).toHaveText(`${quantity} each`)
      await expect(shipment).toContainText(suffix === 'west' ? other.name : b.bin.name)
    }
    const state = await h.state()
    expect(state.shipments.filter((row: any) => row.orderId === shortageOrder.id).map((row: any) => [row.warehouse, row.lines[0].quantity]).sort()).toEqual([[other.warehouse, '2'], [b.name, '3']].sort())
    expect(state.positions.find((p: any) => p.locationId === fba.id).quantity).toBe('50')
    expect(state.reservations.some((r: any) => r.locationId === fba.id)).toBe(false)
    await h.shot(width, 'routing-split-shipments')
    const shippedReroute = h.panel('Reroute an unpicked order')
    await shippedReroute.getByLabel('New eligible warehouse', { exact: true }).selectOption(b.name)
    await shippedReroute.getByLabel('Warehouse reroute reason', { exact: true }).fill('Refuse rerouting shipped work')
    beforeRefusal = await business()
    await submit(page, shippedReroute, 'Review and reroute', false)
    await expect(page.getByRole('alert')).toContainText('Only an unpicked, unshipped order can be rerouted.')
    expect(await business()).toEqual(beforeRefusal)
    await h.shot(width, 'routing-shipped-refusal')

  })
  }
})

test('receipt FX, weight allocation, late bills and mapped write-off settings remain reviewable at 1440 and 390', async ({ page, context }) => {
  test.setTimeout(600_000)
  const h = await salesHarness(page, context), pantry = await pantryInstallation()
  const settleBooks = async () => {
    // Real commands return before their background ledger work. Take refusal snapshots only after it finishes.
    await expect.poll(async () => (await h.command('book.sync', {})).busy === true,
      { timeout: 60_000, intervals: [250, 500, 1000] }).toBe(false)
    // An older command can start its waitUntil work just after this sync releases its lease.
    // Require the complete business snapshot to stay quiet for the full Worker
    // waitUntil window (30 seconds). A two-second gap can precede delayed CI readback.
    // wrangler.jsonc also runs Books on every minute, even in the real dev
    // runtime. Leave 20 seconds before that next scheduled sync for the UI
    // refusal and its full before/after comparison; quietness alone can end
    // just before a new cron starts and legitimately changes jobs and commands.
    let previous = JSON.stringify(await business()), quietSince = Date.now()
    await expect.poll(async () => {
      const current = JSON.stringify(await business())
      if (current !== previous) { previous = current; quietSince = Date.now() }
      const now = Date.now(), untilNextCron = 60_000 - now % 60_000
      return untilNextCron >= 20_000 ? now - quietSince : 0
    }, { timeout: 120_000, intervals: [250] }).toBeGreaterThanOrEqual(30_000)
  }
  const business = async () => {
    const state = await h.state(), response = await context.request.get(`${h.base}/api/pier/export`)
    expect(response.ok()).toBe(true)
    const exported = await response.json()
    return { returns: state.returns, movements: state.movements, positions: state.positions,
      jobs: state.bookJobs, commands: exported.commands }
  }
  const scanned = async (scan: Locator, success: boolean) => {
    const posted = page.waitForResponse(r => r.url() === `${h.base}/api/pier/commands` && r.request().postDataJSON()?.type === 'return.scan')
    await scan.press('Enter')
    const body = await (await posted).json()
    expect(body.ok).toBe(success)
    await expect(page.locator('main')).toHaveAttribute('aria-busy', 'false')
    return body
  }
  try {
    await pantry.command('chart.start', {})
    const inventory = await pantry.command('account.save', {code:'1300',name:'Inventory Asset',type:'asset',subtype:'other'})
    const cogs = await pantry.command('account.save', {code:'5000',name:'Cost of Goods Sold',type:'expense',subtype:'other'})
    const damage = await pantry.command('account.save', {code:'5100',name:'Damaged stock',type:'expense',subtype:'other'})
    const freight = await pantry.command('account.save', {code:'5200',name:'Freight and duty',type:'expense',subtype:'other'})
    const revenue = (await pantry.view('state')).accounts.find((a:any)=>a.code==='4000')
    const grant = await pantry.command('integration.create', {name:'Cost acceptance',scopes:['contacts:write','invoices:write','bills:write','journals:write','documents:write','payments:read','reports:read','post']})
    const connection = {baseUrl:pantry.origin,inventoryAccountId:inventory.id,cogsAccountId:cogs.id,revenueAccountId:revenue.id,writeOffAccountId:damage.id,taxCode:'exempt'}
    const initial = await h.command('book.connect', {...connection,integrationToken:grant.token})
    expect(initial.writeOffReasons).toEqual([expect.objectContaining({code:'damaged',accountId:damage.id,approvalLimit:'0'})])
    const baseline = await h.fixture(1440)
    const baselinePO = await h.command('po.draft', {supplierId:baseline.supplier.id,promiseDate:'2026-11-01',reason:'Freight account review',lines:[{itemId:baseline.item.id,quantity:'4',price:'2'}]})
    await h.command('po.approve',{poId:baselinePO.id,version:baselinePO.version});await h.command('po.commit',{poId:baselinePO.id,version:baselinePO.version})
    const baselineReceipt = await h.command('receipt.create',{poId:baselinePO.id,supplierReference:'synthetic-pier-224',landedCost:{freight:'4',allocation:'quantity'},lines:[{poLineId:baselinePO.lines[0].id,locationId:baseline.bin.id,quantity:'4',cost:'2'}]})
    const refuseLate = async (receipt:any,width:number,message:RegExp,name:string) => {
      await page.goto(`${h.base}/app#purchasing/${receipt.id}`);await page.reload()
      const form = page.locator(`[id="document-${receipt.id}"]`).locator('section.panel').filter({has:page.getByRole('heading',{name:'Approve a late landed-cost bill',exact:true})})
      await expect(form).toContainText('adjustments without a mapping require review')
      await form.getByLabel('Late bill reference',{exact:true}).fill('synthetic-pier-225')
      await form.getByLabel('Late freight USD',{exact:true}).fill('4')
      await form.getByLabel('Late cost allocation',{exact:true}).selectOption('quantity')
      await form.getByLabel('Late bill approval reason',{exact:true}).fill('Owner reviewed supplemental cost')
      const before = (await h.state()).receipts.find((r:any)=>r.id===receipt.id)
      const response = page.waitForResponse(r=>r.url()===`${h.base}/api/pier/commands`&&r.request().postDataJSON()?.type==='receipt.landed')
      await form.getByRole('button',{name:'Approve late bill and allocation',exact:true}).click()
      const result = await (await response).json();expect(result.ok).toBe(false);expect(result.error.code).toBe('COST_REVIEW')
      await expect(page.locator('main')).toHaveAttribute('aria-busy','false')
      await expect(page.getByRole('alert')).toContainText(message)
      expect((await h.state()).receipts.find((r:any)=>r.id===receipt.id)).toEqual(before)
      await page.getByRole('alert').scrollIntoViewIfNeeded();await h.shot(width,name)
    }
    for (const width of [1440,390]) {
      await page.setViewportSize({width,height:1000})
      await refuseLate(baselineReceipt,width,/Resolve the original cost posting reviews/,'cost-unbuilt-baseline-refusal')
      // Command follow-up runs under waitUntil. An earlier sync may still own
      // the lease, so request sync until this receipt's review is durable before
      // loading the Books snapshot; the UI does not poll background job state.
      await expect.poll(async () => {
        await h.command('book.sync', {})
        return (await h.state()).bookJobs.find((job:any)=>job.key===`landed:${baselineReceipt.id}`)?.reason
      }, {timeout:30_000}).toContain('This receipt carries freight or duty.')
      await page.goto(`${h.base}/app#books`);await page.reload()
      const review = page.getByRole('row').filter({hasText:'This receipt carries freight or duty.'})
      await expect(review).toContainText('Choose the Freight and duty account in Books settings')
      await expect(review).toContainText('Reconnect Pantry')
      await review.scrollIntoViewIfNeeded();await h.shot(width,'cost-baseline-review-guidance')
    }
    const accounts = {...connection,landedCostAccountId:freight.id}
    await h.command('book.connect', accounts)
    for (const width of [1440, 390]) {
      await page.setViewportSize({width,height:1000})
      if (width === 390) await h.command('book.connect', accounts)
      const suffix = crypto.randomUUID().slice(0,6), tag = `synthetic-pier-${width}-${suffix}`
      const item = await h.command('item.save', {sku:tag,name:tag,barcode:tag,unit:'each',packSize:'1',weight:'1'})
      const second = await h.command('item.save', {sku:tag+'-2',name:tag+'-2',unit:'each',packSize:'1',weight:'3'})
      const bin = await h.command('location.save', {name:tag+' bin',warehouse:tag,kind:'bin'})
      const supplier = await h.command('party.save', {name:tag+' supplier',kind:'supplier'})
      const customer = await h.command('party.save', {name:tag+' customer',kind:'customer'})
      const po = await h.command('po.draft', {supplierId:supplier.id,promiseDate:'2026-11-01',reason:'Reviewed source currency',lines:[{itemId:item.id,quantity:'4',price:'2'},{itemId:second.id,quantity:'2',price:'4'}]})
      await h.command('po.approve',{poId:po.id,version:po.version});await h.command('po.commit',{poId:po.id,version:po.version})
      await page.goto(`${h.base}/app#purchasing/${po.id}`);await page.reload()
      let form = h.panel('Partial receipt into bins')
      await form.getByLabel('Supplier receipt reference',{exact:true}).fill(tag)
      await form.getByLabel('Receipt source currency',{exact:true}).fill('AUD')
      await form.getByLabel('Receipt USD rate (one source unit)',{exact:true}).fill('0.5')
      await form.getByLabel('Receipt freight (USD)',{exact:true}).fill('0.05')
      await form.getByLabel('Receipt duty (USD)',{exact:true}).fill('0.02')
      await form.getByLabel('Allocate landed costs by',{exact:true}).selectOption('weight')
      for (let i=0;i<2;i++) {
        await form.getByLabel('Destination bin',{exact:true}).nth(i).selectOption(bin.id)
        await form.getByLabel('Received (each)',{exact:true}).nth(i).fill(i?'2':'4')
        await form.getByLabel('Receipt unit cost (source currency)',{exact:true}).nth(i).fill(i?'8':'4')
      }
      await form.scrollIntoViewIfNeeded();await h.shot(width,'cost-receipt-review');await h.saved(form,'Record receipt')
      let state = await h.state(), receipt = state.receipts.find((r:any)=>r.poId===po.id)
      expect(receipt.sourceCurrency).toBe('AUD');expect(receipt.usdRate).toBe('0.5');expect(receipt.landedCost.total).toBe('16.070000000000')
      const bill = await h.command('supplierBill.save',{poId:po.id,reference:tag,date:new Date().toISOString().slice(0,10),quantityTolerancePercent:'0',priceTolerancePercent:'0',lines:po.lines.map((l:any,i:number)=>({poLineId:l.id,quantity:l.quantity,unitPrice:i?'4':'2'}))})
      await h.command('supplierBill.approve',{id:bill.id,version:bill.version,receiptEvidence:bill.match.receiptEvidence})
      const order = await h.command('order.create',{customerId:customer.id,warehouse:tag,lines:[{itemId:item.id,quantity:'2',price:'10'}]})
      const shipment = await h.command('dispatch.create',{orderId:order.id,shipmentReference:tag+' shipped',lines:[{orderLineId:order.lines[0].id,quantity:'2'}]})
      await h.command('return.scan',{code:item.barcode,shipmentId:shipment.id,shipmentLineId:shipment.lines[0].id,quantity:'1',locationId:bin.id,condition:'sellable',disposition:'restock',reason:'Inspected sellable return'})
      await page.goto(`${h.base}/app#purchasing/${receipt.id}`);await page.reload()
      form = page.locator(`[id="document-${receipt.id}"]`).locator('section.panel').filter({has:page.getByRole('heading',{name:'Approve a late landed-cost bill',exact:true})})
      await form.getByLabel('Late bill reference',{exact:true}).fill(tag+' late')
      await form.getByLabel('Late freight USD',{exact:true}).fill('6')
      await form.getByLabel('Late cost allocation',{exact:true}).selectOption('weight')
      await form.getByLabel('Late bill approval reason',{exact:true}).fill('Reviewed freight after partial shipment and return')
      await form.scrollIntoViewIfNeeded();await h.shot(width,'cost-late-bill-review');await h.saved(form,'Approve late bill and allocation')
      state = await h.state();receipt=state.receipts.find((r:any)=>r.id===receipt.id)
      expect(receipt.lateBills[0].impacts).toEqual({inventory:'5.400000000000',cogs:'0.600000000000',expense:'0.000000000000'})
      await page.locator(`[id="document-${receipt.id}"]`).scrollIntoViewIfNeeded();await h.shot(width,'cost-retained-receipt')
      await settleBooks()
      await page.goto(`${h.base}/app#floor/returns`);await page.reload()
      await page.getByLabel('Return bin',{exact:true}).selectOption(bin.id)
      await page.getByLabel('Condition',{exact:true}).selectOption('damaged');await page.getByLabel('Disposition',{exact:true}).selectOption('writeoff')
      await page.getByLabel('Write-off reason code',{exact:true}).selectOption('damaged')
      await page.getByLabel('Return reason',{exact:true}).fill('   ')
      let scan = page.getByLabel('Scan order label or returned item',{exact:true})
      await scan.fill(item.barcode)
      let before = await business()
      await scan.press('Enter')
      await expect(page.getByRole('alert')).toContainText('record the inspection reason')
      expect(await business()).toEqual(before)
      await page.getByLabel('Return reason',{exact:true}).fill('Owner reviewed actual damaged unit')
      await scan.fill(item.barcode)
      before = await business()
      expect((await scanned(scan,false)).error.code).toBe('WRITE_OFF_APPROVAL')
      await expect(h.panel('Returns bench').getByRole('alert')).toContainText('explicit owner approval')
      expect(await business()).toEqual(before)
      await h.shot(width,'cost-default-zero-refusal')
      await page.goto(`${h.base}/app#books/settings`);await page.reload()
      await page.getByRole('button',{name:'Check Pantry and load accounts',exact:true}).click()
      await expect(page.getByLabel('Write-off reason code',{exact:true})).toBeVisible()
      await page.getByLabel('Write-off reason code',{exact:true}).fill(tag+' damaged')
      await page.getByLabel('Write-off owner approval limit USD',{exact:true}).fill('0.10')
      await page.getByLabel('Write-off reason code',{exact:true}).scrollIntoViewIfNeeded();await h.shot(width,'cost-reason-settings')
      await page.getByRole('button',{name:'Save and reconnect',exact:true}).click();await expect(page.locator('main')).toHaveAttribute('aria-busy','false')
      await page.goto(`${h.base}/app#floor/returns`);await page.reload()
      await page.getByLabel('Return bin',{exact:true}).selectOption(bin.id)
      await page.getByLabel('Condition',{exact:true}).selectOption('damaged');await page.getByLabel('Disposition',{exact:true}).selectOption('writeoff')
      await page.getByLabel('Write-off reason code',{exact:true}).selectOption(tag+' damaged')
      await page.locator('section.panel').filter({has:page.getByRole('heading',{name:'Returns bench',exact:true})}).getByLabel('Approve this write-off above its mapped limit',{exact:true}).check()
      await page.getByLabel('Return reason',{exact:true}).fill('Owner reviewed actual damaged unit')
      scan=page.getByLabel('Scan order label or returned item',{exact:true});await scan.fill(item.barcode)
      const posted=page.waitForResponse(r=>r.url()===`${h.base}/api/pier/commands`&&r.request().postDataJSON()?.type==='return.scan');await scan.press('Enter');expect((await(await posted).json()).ok).toBe(true)
      await expect(page.locator('main')).toHaveAttribute('aria-busy','false');state=await h.state()
      const written=state.returns.find((r:any)=>r.shipmentId===shipment.id&&r.status==='writtenoff');expect(written.writeOffReason.code).toBe(tag+' damaged');expect(written.writeOffReason.accountId).toBe(damage.id)
      await h.shot(width,'cost-approved-writeoff')
      // The second SKU's USD 4 cost receives 4 cents of initial charges and USD 3.60 late freight across two units.
      const equalOrder = await h.command('order.create',{customerId:customer.id,warehouse:tag,lines:[{itemId:second.id,quantity:'1',price:'10'}]})
      const equalShipment = await h.command('dispatch.create',{orderId:equalOrder.id,shipmentReference:tag+' equality',lines:[{orderLineId:equalOrder.lines[0].id,quantity:'1'}]})
      const waiting = await h.command('return.scan',{code:equalShipment.reference,shipmentId:equalShipment.id,shipmentLineId:equalShipment.lines[0].id,quantity:'1',locationId:bin.id,condition:'damaged',disposition:'quarantine',reason:'Damaged unit awaiting inspection'})
      await page.goto(`${h.base}/app#books/settings`);await page.reload()
      await page.getByRole('button',{name:'Check Pantry and load accounts',exact:true}).click()
      await page.getByLabel('Write-off reason code',{exact:true}).fill(tag+' damaged')
      await page.getByLabel('Write-off owner approval limit USD',{exact:true}).fill('5.82')
      await page.getByRole('button',{name:'Save and reconnect',exact:true}).click();await expect(page.locator('main')).toHaveAttribute('aria-busy','false')
      await settleBooks()
      await page.goto(`${h.base}/app#floor/returns`);await page.reload()
      form = h.panel(`Inspect returned ${second.sku}`)
      await form.getByLabel('Inspection disposition',{exact:true}).selectOption('writeoff')
      await form.getByLabel('Inspection write-off reason code',{exact:true}).selectOption(tag+' damaged')
      await form.getByLabel('Inspection reason',{exact:true}).fill('   ')
      before = await business()
      const inspectionPost = page.waitForResponse(r => r.url() === `${h.base}/api/pier/commands` && r.request().postDataJSON()?.type === 'return.inspect')
      await form.getByRole('button',{name:'Post inspection decision',exact:true}).click()
      const refusal = await (await inspectionPost).json()
      expect(refusal.ok).toBe(false);expect(refusal.error.code).toBe('INPUT')
      await expect(page.locator('main')).toHaveAttribute('aria-busy','false')
      await expect(h.panel('Returns bench').getByRole('alert')).toContainText('Inspection reason is required')
      expect(await business()).toEqual(before)
      await form.scrollIntoViewIfNeeded();await h.shot(width,'cost-inspection-reason-refusal')
      await form.getByLabel('Inspection reason',{exact:true}).fill('Inspected damaged unit at the inclusive limit')
      await expect(form.getByLabel('Approve this write-off above its mapped limit',{exact:true})).not.toBeChecked()
      await submit(page,form,'Post inspection decision')
      state = await h.state()
      const equal = state.returns.find((r:any)=>r.id===waiting.id)
      expect(equal.status).toBe('writtenoff');expect(equal.writeOffCostTotal).toBe('5.820000000000')
      expect(equal.writeOffReason.approvalLimit).toBe('5.82');expect(equal.writeOffReason.accountId).toBe(damage.id)
      expect(state.returns.find((r:any)=>r.id===written.id).writeOffReason.approvalLimit).toBe('0.1')
      await h.shot(width,'cost-inclusive-limit-writeoff')
      let count = await h.command('count.capture',{locationId:bin.id})
      count = await h.command('count.record',{countId:count.id,version:count.version,reason:'Reviewed missing unit without an expense mapping',lines:count.lines.map((line:any)=>({...line,quantity:line.itemId===second.id?'0':line.quantity}))})
      await h.command('count.approve',{countId:count.id,version:count.version})
      await refuseLate(receipt,width,/prior stock adjustment without a mapped expense account/,'cost-unmapped-adjustment-refusal')
      await page.goto(`${h.base}/app#reports`);await page.reload();await expect(page.getByRole('heading',{name:'Reports',exact:true})).toBeVisible();await h.shot(width,'cost-valuation-report')
    }
  } finally { await pantry.close() }
})

test('purchase approval names spend authority and exposes supplier re-approval at 1440 and 390', async ({ page, context }) => {
  test.setTimeout(240_000)
  await ownerEntry(page)
  const command = async (type: string, payload: object) => {
    const response = await context.request.post(`${origin}/api/pier/commands`, { headers: { origin }, data: { commandId: crypto.randomUUID(), type, payload } })
    const body = await response.json(); expect(body.ok, JSON.stringify(body)).toBe(true); return body.result
  }
  const state = async () => (await context.request.get(`${origin}/api/pier/state`)).json()
  const ownerId = (await state()).actor.id
  await command('business.save', { name: 'Harbor Wholesale', address: '40 Pier Road' })
  if (shots) await mkdir(shots, { recursive: true })
  for (const width of [1440, 390]) {
    const supplier = await command('party.save', { kind: 'supplier', name: `Approval supplier ${width}` })
    const item = await command('item.save', { sku: `APPROVAL-${width}`, name: `Approval mugs ${width}`, unit: 'each', packSize: '1' })
    const old = (await state()).purchaseApprovalPolicies[0]
    let policy = await command('purchaseApproval.save', { version: old?.version ?? 0, limits: [
      { supplierId: null, exceptionType: 'any', maxSpend: '2', approverId: ownerId, escalationId: ownerId },
      { supplierId: null, exceptionType: 'any', maxSpend: '33.50', approverId: ownerId, escalationId: ownerId },
    ] })
    let po = await command('po.draft', { supplierId: supplier.id, promiseDate: '2026-11-01', reason: 'Reviewed spend route', freight: '1.25', duty: '0.75', tax: '1.50', lines: [{ itemId: item.id, quantity: '10', price: '3' }] })
    await page.setViewportSize({ width, height: 1000 })
    await page.goto(`${origin}/app#purchasing/${po.id}`); await page.reload()
    await expect(page.getByRole('heading', { name: 'Purchasing', exact: true })).toBeVisible({ timeout: 30_000 })
    const detail = page.locator(`#document-${po.id}`)
    await expect(detail.getByText('Required approver', { exact: true })).toBeVisible()
    await expect(detail.locator('dl').first()).toContainText('Owner')
    await expect(detail.locator('dl').first()).toContainText('33.50')
    await expect(detail.locator('dl').first()).toContainText('Routed spend USD')
    if (shots) await detail.screenshot({ path: join(shots, `${width}-purchase-approval-route.png`) })
    await submit(page, detail, `Approve exact version ${po.version}`)
    await submit(page, detail, 'Commit approved order')
    po = (await state()).purchaseOrders.find((row: any) => row.id === po.id)
    const sendForm = section(page, 'Approve one agent send')
    await sendForm.getByLabel('Agent send recipient', { exact: true }).fill(['supplier', 'example.test'].join('@'))
    await expect(sendForm.getByLabel('Maximum landed spend (USD)', { exact: true })).toHaveValue('33.5')
    await sendForm.getByLabel('Send authority expires (your local time)', { exact: true }).fill('2099-01-01T12:00')
    await sendForm.getByLabel('Agent maximum chases', { exact: true }).fill('0')
    await sendForm.getByRole('checkbox').check()
    await submit(page, sendForm, 'Authorize exact PO for agent')
    await expect(detail).toContainText('Waiting for agent')
    policy = await command('purchaseApproval.save', { version: policy.version, limits: policy.limits })
    await page.reload()
    await expect(detail).toContainText('Purchase approval policy changed. Review a new authority.')
    await expect(detail.getByRole('button', { name: 'Run approved agent send', exact: true })).toHaveCount(0)
    if (shots) await detail.screenshot({ path: join(shots, `${width}-purchase-policy-stopped.png`) })
    po = (await state()).purchaseOrders.find((row: any) => row.id === po.id)
    const initialSend = section(page, 'Send purchase order to supplier')
    await initialSend.getByLabel('Supplier email', { exact: true }).fill('supplier@example.test')
    await initialSend.getByLabel('Chase every (days)', { exact: true }).fill('1')
    await initialSend.getByLabel('Maximum confirmation chases', { exact: true }).fill('2')
    await initialSend.getByRole('checkbox').check()
    await submit(page, initialSend, 'Approve recipient and send PO')
    const queued = await state()
    const chases = queued.correspondence.filter((message: any) => message.recordId === po.id && message.kind === 'supplier-chase')
    expect(chases).toHaveLength(2)
    expect(chases.every((message: any) => !queued.deliveries.some((delivery: any) => delivery.correspondenceId === message.id))).toBe(true)
    const correspondence = section(page, 'Correspondence')
    const chaseRows = correspondence.getByRole('row').filter({ hasText: 'Confirmation requested:' })
    await expect(chaseRows).toHaveCount(2)
    await expect(chaseRows.getByText('Waits for the first email', { exact: true })).toHaveCount(2)
    po = (await state()).purchaseOrders.find((row: any) => row.id === po.id)
    const originalLines = structuredClone(po.lines)
    po = await command('po.supplierChange', { poId: po.id, version: po.version, source: `synthetic-pier-${width}`, body: 'Supplier price rises and the delivery date changes', promiseDate: '2026-11-20', lines: po.lines.map((line: any) => ({ poLineId: line.id, quantity: line.quantity, price: '4' })) })
    await page.reload()
    await expect(detail).toContainText('Re-approval required; sending stopped')
    expect(po.lines).toEqual(originalLines)
    expect(po.promiseDate).toBe('2026-11-01')
    expect(po.pendingSupplierChange.source).toBe(`synthetic-pier-${width}`)
    expect(po.pendingSupplierChange.lines[0].price).toBe('4')
    expect(po.chasePolicy.enabled).toBe(false)
    await expect(detail.getByRole('button', { name: 'Stop supplier chases', exact: true })).toBeDisabled()
    await expect(chaseRows.getByText('Stopped', { exact: true })).toHaveCount(2)
    const form = section(page, 'Send purchase order to supplier')
    await form.getByLabel('Supplier email', { exact: true }).fill('supplier@example.test')
    await form.getByRole('checkbox').check()
    await submit(page, form, 'Approve recipient and send PO', false)
    await expect(page.getByRole('alert')).toContainText('Review the retained supplier change')
    if (shots) await detail.screenshot({ path: join(shots, `${width}-purchase-supplier-review.png`) })
    policy = await command('purchaseApproval.save', { version: policy.version, limits: policy.limits.map((limit: any) => ({ ...limit, maxSpend: limit.maxSpend === '2' ? '2' : '100' })) })
    po = (await state()).purchaseOrders.find((row: any) => row.id === po.id)
    po = await command('po.reviewSupplierChange', { poId: po.id, version: po.version, confirm: true })
    expect(po.lines[0].price).toBe('4')
    expect(po.supplierChanges[0].previous.lines).toEqual(originalLines)
    expect(po.chasePolicy.enabled).toBe(false)
    await page.reload()
    await expect(detail).toContainText('No pending change')
    await expect(detail.locator('dl').first()).toContainText('Nov 20, 2026')
    await expect(chaseRows.getByText('Stopped', { exact: true })).toHaveCount(2)
    await expect(detail.getByRole('button', { name: 'Stop supplier chases', exact: true })).toBeDisabled()
    expect((await state()).correspondence.filter((message: any) => chases.some((chase: any) => chase.id === message.id))).toEqual(chases)
    expect(await page.locator('main button:visible').evaluateAll(buttons => buttons.filter(button => !button.textContent?.trim()).length)).toBe(0)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)
    if (shots) await detail.screenshot({ path: join(shots, `${width}-purchase-reapproved.png`) })
  }
})

test('Managed supplier mail shows approved text, PDF refusal and retained uncertainty', async ({ page, context }) => {
  await ownerEntry(page)
  const h = await managedMailInstallation()
  // Forward the real interface's business requests to the real Managed test
  // installation with its native owner session. No application response is
  // invented: the Worker executes every read and command against persistent D1.
  const forward = async (route: import('@playwright/test').Route) => {
    const request = route.request(), url = new URL(request.url())
    const response = await h.request(url.pathname + url.search, { method: request.method(),
      ...(request.postData() ? { body: JSON.parse(request.postData()!) } : {}) })
    const headers = Object.fromEntries(response.headers)
    for (const name of ['content-length', 'content-encoding', 'transfer-encoding']) delete headers[name]
    await route.fulfill({ status: response.status, headers, body: Buffer.from(await response.arrayBuffer()) })
  }
  await page.route('**/api/pier/**', forward)
  try {
    await page.setViewportSize({ width: 1440, height: 1000 })
    if (shots) await mkdir(shots, { recursive: true })
    const capture = async (panel: Locator, name: string) => {
      if (!shots) return
      for (const width of [1440, 390]) {
        await page.setViewportSize({ width, height: 1000 })
        await panel.screenshot({ path: join(shots, `${width}-managed-${name}.png`) })
      }
      await page.setViewportSize({ width: 1440, height: 1000 })
    }
    const save = async (panel: Locator, button: string, success = true) => {
      const response = page.waitForResponse(response => response.url() === `${origin}/api/pier/commands` && response.request().method() === 'POST')
      await panel.getByRole('button', { name: button, exact: true }).click()
      const body = await (await response).json()
      expect(body.ok).toBe(success)
      await expect(page.locator('main')).toHaveAttribute('aria-busy', 'false')
      return body
    }
    const po = await managedPurchase(h)
    h.ambiguous()
    await page.goto(`${origin}/app#purchasing/${po.id}`)
    await page.reload()
    const send = section(page, 'Send purchase order to supplier')
    await send.getByLabel('Supplier email', { exact: true }).fill(supplierRecipient)
    await send.getByRole('checkbox').check()
    await save(send, 'Approve recipient and send PO')
    expect(h.calls).toEqual([{ to: supplierRecipient, subject: `Synthetic Pier warehouse purchase order ${po.reference}`, text: expectedManagedText(po.reference) }])
    const correspondence = section(page, 'Correspondence')
    await expect(correspondence.getByText('Uncertain', { exact: true })).toBeVisible()
    const initial = correspondence.getByRole('row').filter({ has: page.getByText('PDF attachment unavailable. This Managed relay sends text only; the retained purchase PDF has not been delivered.', { exact: true }) })
    await expect(initial).toHaveCount(1)
    await expect(initial).toBeVisible()
    await initial.getByText('Read approved message', { exact: true }).click()
    await expect(initial.locator('details p')).toHaveText(expectedManagedText(po.reference))
    await capture(correspondence, 'approved-text')
    const retained = await h.state(), message = retained.correspondence.find((m: any) => m.kind === 'purchase-order')
    const claim = retained.deliveries.find((d: any) => d.correspondenceId === message.id)
    await save(correspondence, 'Process due approved emails')
    await h.restart()
    await h.command('mail.process', {})
    await page.reload()
    await expect(correspondence.getByText('Uncertain', { exact: true })).toBeVisible()
    await expect(correspondence).toContainText('Review before approving another send')
    await capture(correspondence, 'uncertain-after-restart')
    expect((await h.state()).deliveries.filter((d: any) => d.correspondenceId === message.id)).toEqual([claim])
    expect(h.calls).toHaveLength(1)

    await page.goto(`${origin}/app#sales`)
    await page.getByText('Business documents and templates', { exact: true }).click()
    await page.getByLabel('Business document kind', { exact: true }).selectOption('purchase-order')
    const generate = section(page, 'Generate a retained business PDF')
    await generate.getByLabel('Business document source', { exact: true }).selectOption(po.id)
    const generated = (await save(generate, 'Generate exact PDF')).result
    const pdf = await h.request(`/api/pier/sales-documents/${generated.id}.pdf`)
    expect(pdf.status).toBe(200)
    expect(Buffer.from(await pdf.arrayBuffer())).toEqual(Buffer.from(generated.pdf, 'base64'))
    const form = section(page, 'Email a retained business PDF')
    await form.getByLabel('Retained business PDF', { exact: true }).selectOption(generated.id)
    await form.getByLabel('Business PDF recipient', { exact: true }).fill(supplierRecipient)
    const before = await h.state()
    expect((await save(form, 'Approve recipient and send retained PDF', false)).error.code).toBe('DOCUMENT_MAIL')
    await expect(form.getByRole('alert')).toContainText('This Managed relay cannot attach PDFs')
    await capture(form, 'pdf-refusal')
    const after = await h.state()
    for (const key of ['purchaseOrders', 'correspondence', 'salesDocuments', 'deliveries', 'movements', 'reservations', 'commands']) expect(after[key]).toEqual(before[key])
    expect(h.calls).toHaveLength(1)
  } finally { await page.unroute('**/api/pier/**', forward); await h.close() }
})
