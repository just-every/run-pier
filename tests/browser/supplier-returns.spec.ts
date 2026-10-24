// @ts-expect-error Real sibling Worker fixture accessed through GitHub's API.
import { pantryInstallation } from '../api/pantry-installation.mjs'
import { test, expect } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { ownerEntry } from './session'

test('BUY-003: staff quarantine, authorize, dispatch and reconcile supplier evidence at 1440 and 390', async ({ page, context }) => {
  const pantry=await pantryInstallation()
  try {
  await pantry.command('chart.start',{})
  const inventory=await pantry.command('account.save',{code:'1300',name:'Inventory',type:'asset',subtype:'other'}),cogs=await pantry.command('account.save',{code:'5000',name:'Cost of goods',type:'expense',subtype:'other'}),revenue=(await pantry.view('state')).accounts.find((a:any)=>a.code==='4000')
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
    let po = await command('po.draft', { supplierId: supplier.id, promiseDate: '2026-11-01', reason: 'Return journey', lines: [{ itemId: item.id, quantity: '10', price: '4' }] })
    await command('po.approve', { poId: po.id, version: po.version })
    po = await command('po.commit', { poId: po.id, version: po.version })
    await command('receipt.create', { poId: po.id, supplierReference: `DEL-${width}`, lines: [{ poLineId: po.lines[0].id, locationId: bin.id, quantity: '8', cost: '4' }] })
    const credential=await pantry.command('integration.create',{name:`Pier returns ${width}`,scopes:['contacts:write','invoices:write','bills:write','journals:write','documents:write','payments:read','reports:read','vendor-credits:read','vendor-credits:write','post']})
    await command('book.connect',{baseUrl:pantry.origin,integrationToken:credential.token,inventoryAccountId:inventory.id,cogsAccountId:cogs.id,revenueAccountId:revenue.id,taxCode:'exempt'})
    const bill=await command('supplierBill.save',{poId:po.id,reference:`synthetic-pier-${width}`,date:new Date().toISOString().slice(0,10),quantityTolerancePercent:'0',priceTolerancePercent:'0',lines:[{poLineId:po.lines[0].id,quantity:'8',unitPrice:'4'}]})
    await command('supplierBill.approve',{id:bill.id,version:bill.version,receiptEvidence:bill.match.receiptEvidence})
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
    await credit.getByLabel('Supplier credit amount (USD)', { exact: true }).fill('4')
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
    await post.getByRole('button',{name:'Post supplier credit to Pantry',exact:true}).click()
    await expect.poll(async()=>{const response=await context.request.get(`${origin}/api/pier/state`);return (await response.json()).supplierReturns.find((r:any)=>r.reason===`Cracked handles ${width}`)?.resolutions[0]?.posting}).toBe('posted')
    await page.reload();await page.getByRole('button',{name:'All',exact:true}).click();await expect(returned).toContainText('Books: posted')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)
    if (shots) await returned.screenshot({ path: join(shots, `${width}-return-reconciled.png`) })
  }
  } finally { await pantry.close() }
})
