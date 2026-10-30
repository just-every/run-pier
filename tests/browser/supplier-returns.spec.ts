// @ts-expect-error Real sibling Worker fixture accessed through GitHub's API.
import { pantryInstallation } from '../api/pantry-installation.mjs'
import { test, expect } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { ownerEntry } from './session'

test('BUY-003: staff quarantine, authorize, dispatch and reconcile supplier evidence with connector recovery', async ({ page, context }) => {
  let mismatchCredit=false, creditCreates=0, mismatchedReads=0
  const pantry=await pantryInstallation({revision:'e987ba0a2270a81c62d399c44c6e05d3b504bb07',async networkEdge(request:Request,response:Response){
    if(request.method==='POST'&&new URL(request.url).pathname.endsWith('/vendor-credits'))creditCreates++
    if(mismatchCredit&&response.ok&&new URL(request.url).pathname.endsWith('/vendor-credits')){
      const body=await response.json(),credits=request.method==='GET'?body.vendorCredits:[body]
      for(const credit of credits)credit.amount_cents+=1
      if(credits.length)mismatchedReads++
      return Response.json(body,{status:response.status})
    }
    return response
  }})
  test.setTimeout(240_000)
  try {
  await pantry.command('chart.start',{})
  const inventory=await pantry.command('account.save',{code:'1300',name:'Inventory',type:'asset',subtype:'other'}),cogs=await pantry.command('account.save',{code:'5000',name:'Cost of goods',type:'expense',subtype:'other'}),freight=await pantry.command('account.save',{code:'5100',name:'Freight and duty',type:'expense',subtype:'other'}),revenue=(await pantry.view('state')).accounts.find((a:any)=>a.code==='4000')
  const bank=await pantry.command('bank-account.save',{name:'Return checking',institution:'Synthetic',accountId:(await pantry.view('state')).accounts.find((a:any)=>a.code==='1000').id,numberLast4:'0001',openingDate:'2026-01-01',openingBalance:'0.00'})
  const origin = process.env.PIER_BOOTSTRAP ? process.env.PIER_BASE_URL! : await ownerEntry(page)
  if (process.env.PIER_BOOTSTRAP) {
    const response = await context.request.post(`${origin}/auth/bootstrap`, { headers: { origin }, data: { token: process.env.PIER_BOOTSTRAP, displayName: 'Owner' }, maxRedirects: 0 })
    expect(response.status()).toBe(303)
    await page.goto(`${origin}/app`)
    if (new URL(page.url()).pathname === '/setup') { await page.getByRole('checkbox').check(); await page.getByRole('button', { name: 'Finish setup', exact: true }).click(); await page.waitForURL(url => url.pathname === '/app') }
  }
  const command = async (type: string, payload: object) => {
    const response = await context.request.post(`${origin}/api/pier/commands`, { headers: { origin }, data: { commandId: crypto.randomUUID(), type, payload } })
    const body = await response.json(); expect(body.ok, JSON.stringify(body)).toBe(true); return body.result
  }
  const supplier = await command('party.save', { name: 'Return journey supplier', kind: 'supplier' })
  const bin = await command('location.save', { name: 'Return bench', warehouse: 'Dallas', kind: 'bin' })
  const shots = process.env.PIER_SCREENSHOTS
  if (shots) await mkdir(shots, { recursive: true })
  for (const width of [1440, 390]) {
    const item = await command('item.save', { sku: `RETURN-${width}`, name: `Return mugs ${width}`, unit: 'each', packSize: '1' })
    let po = await command('po.draft', { supplierId: supplier.id, promiseDate: '2026-11-01', reason: 'Return journey', lines: [{ itemId: item.id, quantity: '10', price: '0.25' }] })
    await command('po.approve', { poId: po.id, version: po.version })
    po = await command('po.commit', { poId: po.id, version: po.version })
    await command('receipt.create', { poId: po.id, supplierReference: `DEL-${width}`, landedCost:{freight:'0.80',duty:'0.08',insurance:'0.08',other:'0.08',allocation:'quantity'}, lines: [{ poLineId: po.lines[0].id, locationId: bin.id, quantity: '8', cost: '0.25' }] })
    const credential=await pantry.command('integration.create',{name:`Pier returns ${width}`,scopes:['contacts:write','invoices:write','bills:write','journals:write','documents:write','payments:read','reports:read','vendor-credits:read','vendor-credits:write','post']})
    await command('book.connect',{baseUrl:pantry.origin,integrationToken:credential.token,inventoryAccountId:inventory.id,cogsAccountId:cogs.id,revenueAccountId:revenue.id,landedCostAccountId:freight.id,taxCode:'exempt'})
    const bill=await command('supplierBill.save',{poId:po.id,reference:`synthetic-pier-${width}`,date:new Date().toISOString().slice(0,10),quantityTolerancePercent:'0',priceTolerancePercent:'0',lines:[{poLineId:po.lines[0].id,quantity:'8',unitPrice:'0.25'}]})
    await command('supplierBill.approve',{id:bill.id,version:bill.version,receiptEvidence:bill.match.receiptEvidence})
    for(const doc of (await pantry.view('documents')).documents.filter((d:any)=>d.duplicate_of&&!d.duplicate_decision))await pantry.command('document.duplicate-decide',{id:doc.id,decision:'keep',reason:'Owner reviewed original invoice and separate receipt-state evidence'})
    await command('book.sync',{})
    await page.setViewportSize({ width, height: 1000 })
    await page.goto(`${origin}/app#purchasing`); await page.reload()
    await page.getByRole('button', { name: 'All', exact: true }).click()
    const reject = page.locator('section').filter({ has: page.getByRole('heading', { name: `Reject goods · DEL-${width}`, exact: true }) }).last()
    await reject.getByLabel('Receipt line to return', { exact: true }).selectOption({ index: 1 })
    await reject.getByLabel('Rejected quantity', { exact: true }).fill('3')
    await reject.getByLabel('Rejection reason', { exact: true }).fill(`Cracked handles ${width}`)
    if (shots) await reject.screenshot({ path: join(shots, `${width}-return-entry.png`) })
    await reject.getByRole('button', { name: 'Quarantine rejected goods', exact: true }).click()
    const returned = page.locator('article.record').filter({ hasText: `Cracked handles ${width}` })
    await expect(returned).toContainText('Awaiting supplier')
    if (shots) await returned.screenshot({ path: join(shots, `${width}-return-quarantined.png`) })
    await returned.getByLabel('Supplier authorization reference', { exact: true }).fill(`RMA-${width}`)
    await returned.getByLabel('Supplier authorization evidence', { exact: true }).fill('Supplier email approves return of three mugs')
    await returned.getByRole('button', { name: 'Authorize exact return', exact: true }).click()
    await expect(returned).toContainText(`RMA-${width}`)
    if (shots) await returned.screenshot({ path: join(shots, `${width}-return-authorized.png`) })
    await returned.getByLabel('Return dispatch reference', { exact: true }).fill(`OUT-${width}`)
    await returned.getByRole('button', { name: 'Record return dispatch', exact: true }).click()
    await expect(returned).toContainText(`OUT-${width}`)
    if (shots) await returned.screenshot({ path: join(shots, `${width}-return-dispatched.png`) })
    const credit = returned.locator('section').filter({ has: page.getByRole('heading', { name: 'Record supplier credit evidence', exact: true }) })
    await credit.getByLabel('Returned line', { exact: true }).selectOption({ index: 1 })
    await credit.getByLabel('Resolved quantity', { exact: true }).fill('1')
    await credit.getByLabel('Supplier resolution reference', { exact: true }).fill(`CM-${width}`)
    await credit.getByLabel('Supplier resolution evidence', { exact: true }).fill('Supplier credit memo for one mug')
    await credit.getByLabel('Supplier credit amount (USD)', { exact: true }).fill('0.25')
    await credit.getByRole('button', { name: 'Record credit evidence', exact: true }).click()
    await expect(returned).toContainText('Not posted to books')
    const replacement = returned.locator('section').filter({ has: page.getByRole('heading', { name: 'Receive replacement goods', exact: true }) })
    await replacement.getByLabel('Returned line', { exact: true }).selectOption({ index: 1 })
    await replacement.getByLabel('Resolved quantity', { exact: true }).fill('2')
    await replacement.getByLabel('Supplier resolution reference', { exact: true }).fill(`REPL-${width}`)
    await replacement.getByLabel('Supplier resolution evidence', { exact: true }).fill('Two replacements inspected and received')
    await replacement.getByLabel('Replacement receiving bin', { exact: true }).selectOption(bin.id)
    await replacement.getByRole('button', { name: 'Record replacement receipt', exact: true }).click()
    await expect(returned).toContainText('Reconciled')
    await expect(returned).toContainText('Replacement received')
    await page.reload(); await page.getByRole('button', { name: 'All', exact: true }).click()
    await expect(returned).toContainText(`CM-${width}`)
    const post=returned.locator('section').filter({has:page.getByRole('heading',{name:`Post supplier credit · CM-${width}`,exact:true})})
    await post.getByLabel('Matched supplier payable',{exact:true}).selectOption(bill.id)
    const payable=(await pantry.view('sales')).bills.find((b:any)=>b.reference===`PIER-SB-${bill.id.replaceAll('-','').slice(0,24)}`)
    expect(payable.open_cents).toBe(200)
    const payment=await pantry.command('payment.record',{direction:'paid',contactId:payable.vendor_id,date:new Date().toISOString().slice(0,10),amount:'1.76',bankAccountId:bank.id,method:'check',reference:`synthetic-pier-payment-${width}`,allocations:[{targetId:payable.id,amount:'1.76'}]})
    const createsBefore=creditCreates

    await post.getByRole('button',{name:'Post supplier credit to Pantry',exact:true}).click()
    const state=async()=> (await (await context.request.get(`${origin}/api/pier/state`)).json())
    await expect.poll(async()=> {await command('book.sync',{});return (await state()).supplierReturns.find((r:any)=>r.reason===`Cracked handles ${width}`)?.resolutions[0]?.posting},{timeout:30_000,intervals:[1000]}).toBe('review')
    await page.reload();await page.getByRole('button',{name:'All',exact:true}).click()
    await expect(returned).toContainText('Books: review')
    const clearing=returned.getByRole('region',{name:'Return clearing',exact:true})
    await clearing.getByText('Clearing source records',{exact:true}).click()
    await expect(clearing).toContainText('insufficient open balance')
    expect(creditCreates).toBe(createsBefore)
    if(shots)await returned.screenshot({path:join(shots,`${width}-return-insufficient.png`)})
    await pantry.command('journal.reverse',{id:payment.journal_id,date:new Date().toISOString().slice(0,10),memo:'Synthetic payment reversed after owner review'})
    mismatchCredit=true
    await clearing.getByRole('button',{name:'Check supplier credit',exact:true}).click()
    await expect(clearing).toContainText('different amounts, accounts or lines',{timeout:25_000})
    await expect(clearing).toContainText('Clearing needs review')
    await expect(clearing).not.toContainText('Non-credited cost:')
    await command('book.sync',{})
    expect((await state()).supplierReturns.find((r:any)=>r.reason===`Cracked handles ${width}`).resolutions[0].posting).toBe('review')
    expect(creditCreates).toBe(createsBefore+1)
    expect(mismatchedReads).toBeGreaterThan(0)
    if(shots)await returned.screenshot({path:join(shots,`${width}-return-review.png`)})
    mismatchCredit=false
    await page.reload();await page.getByRole('button',{name:'All',exact:true}).click()
    await clearing.getByText('Clearing source records',{exact:true}).click()
    await clearing.getByRole('button',{name:'Check supplier credit',exact:true}).click()
    // The UI retry schedules a background sync. It can still hold the 60 s
    // lease, and Pantry shares a 120-request UTC-minute budget across syncs.
    // A posted credit precedes the final report read and connector health update.
    // Observe a successful sync after its readback; back off across either window.
    const recoveredPosting=async()=>{
      const current=await state()
      const resolution=current.supplierReturns.find((r:any)=>r.reason===`Cracked handles ${width}`)?.resolutions[0]
      const connection=current.bookConnections.find((c:any)=>c.enabled)
      return !connection?.problem&&connection?.lastSuccessfulSync>=resolution?.books?.checkedAt ? resolution?.posting : null
    }
    await expect.poll(async()=>{
      const posting=await recoveredPosting()
      if(posting==='posted')return posting
      await command('book.sync',{})
      return recoveredPosting()
    },{timeout:90_000,intervals:[1000,2000,5000]}).toBe('posted')
    await page.reload();await page.getByRole('button',{name:'All',exact:true}).click();await expect(returned).toContainText('Books: posted')
    await expect(clearing).toContainText('Dispatched cost: USD 1.14')
    await expect(clearing).toContainText('Replacements: USD 0.76')
    await expect(clearing).toContainText('Accepted supplier credit: USD 0.25')
    await expect(clearing).toContainText('Non-credited cost: USD 0.13')
    await expect(clearing).toContainText('No supplier refund is recorded')
    await clearing.getByText('Clearing source records',{exact:true}).click()
    await expect(clearing.getByRole('link',{name:`Replacement receipt REPL-${width}`,exact:true})).toHaveAttribute('href',/^#purchasing\//)
    expect(creditCreates).toBe(createsBefore+1)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)
    if (shots) await returned.screenshot({ path: join(shots, `${width}-return-reconciled.png`) })
    const beforeRecovery = await pantry.view('sales')
    await page.goto(`${origin}/app#channels`)
    const health = page.getByRole('region',{name:'Integration health',exact:true})
    await health.locator('summary').filter({hasText:'Pantry books'}).click()
    await expect(health).toContainText('Pantry books · active')
    const resolved = health.getByRole('row').filter({hasText:'resolved'}).filter({has:page.getByRole('button',{name:'Reconcile effect',exact:true})}).first()
    await expect(resolved).toBeVisible()
    await resolved.getByRole('button',{name:'Reconcile effect',exact:true}).click()
    await expect(page.getByRole('status').filter({hasText:'Saved.'})).toBeVisible()
    await expect(health.getByRole('button',{name:'Refresh health',exact:true})).toBeEnabled()
    const afterRecovery = await pantry.view('sales')
    expect(afterRecovery.invoices.map((row:any)=>row.id)).toEqual(beforeRecovery.invoices.map((row:any)=>row.id))
    expect(afterRecovery.bills.map((row:any)=>row.id)).toEqual(beforeRecovery.bills.map((row:any)=>row.id))
    const projection = await (await context.request.get(`${origin}/api/pier/integrations`)).json()
    const connection = projection.connectors.find((row:any)=>row.id==='pantry')
    expect(connection.lastSuccessfulSync).toBeTruthy()
    expect(connection.attempts.some((attempt:any)=>attempt.outcome==='accepted')).toBe(true)
    expect(JSON.stringify(projection)).not.toContain(credential.token)
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1)).toBe(true)
    if (shots) {
      await page.screenshot({ path: join(shots, `${width}-integration-health-resolved.png`), fullPage: true })
    }
    await command('book.disconnect',{})

  }
  } finally { await pantry.close() }
})
