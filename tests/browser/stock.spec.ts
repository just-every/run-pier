import { test, expect } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { ownerEntry } from './session'
// @ts-expect-error Worker/D1 fixture uses only authenticated public commands.
import { stockJourney } from '../api/stock-fixtures.mjs'

test('STOCK-001: stock totals, empty items and SKU/barcode/bin/status/warehouse filters at desktop and phone widths', async ({ page, context }) => {
  const origin = await ownerEntry(page)
  await stockJourney({ command: async (type: string, payload: object) => {
    const response = await context.request.post(`${origin}/api/pier/commands`, { headers: { origin }, data: { commandId: crypto.randomUUID(), type, payload } })
    const body = await response.json(); expect(body.ok, JSON.stringify(body)).toBe(true); return body.result
  } })
  const state = await (await context.request.get(`${origin}/api/pier/state`)).json()
  const item = state.items.find((row: any) => row.sku === 'BOLT')
  const shots = process.env.PIER_SCREENSHOTS
  if (shots) await mkdir(shots, { recursive: true })
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 })
    await page.goto(`${origin}/app#stock`)
    await page.reload()
    await page.getByRole('group', { name: 'Warehouse', exact: true }).getByRole('button', { name: 'All', exact: true }).click()
    const totals = page.getByRole('region', { name: 'Stock totals', exact: true })
    await expect(totals.getByRole('row').filter({ hasText: 'South' })).toContainText('13 each')
    for (const row of [...state.warehouseStocks, ...state.companyStocks.map((r: any) => ({ ...r, warehouse: 'Company total' }))]) {
      const shown = totals.getByRole('row').filter({ hasText: row.warehouse })
      const cells = shown.getByRole('cell')
      for (const [offset, field] of ['onHand', 'reserved', 'available', 'quarantine', 'transit', 'expected'].entries()) await expect(cells.nth(offset + 2)).toHaveText(`${row[field]} each`)
    }
    await expect(page.locator('.stock-table').getByRole('row').filter({ hasText: 'Unstocked steel washer' })).toContainText('No positions')
    for (const search of ['BOLT', '10001', 'Brass bolt']) {
      await page.getByRole('textbox', { name: 'Search product, barcode or SKU', exact: true }).fill(search)
      await expect(page.locator('.stock-table').getByRole('row').filter({ hasText: 'Brass bolt' })).toHaveCount(state.stockPositions.filter((p: any) => p.itemId === item.id).length)
      await expect(page.locator('.stock-table').getByRole('row').filter({ hasText: 'Unstocked steel washer' })).toHaveCount(0)
    }
    await page.getByLabel('Status filter', { exact: true }).selectOption('quarantine')
    await expect(page.locator('.stock-table').getByRole('row').filter({ hasText: 'Brass bolt' })).toHaveCount(1)
    await expect(page.locator('.stock-table').getByRole('row').filter({ hasText: 'Brass bolt' })).toContainText('0.5 each')
    await page.getByLabel('Status filter', { exact: true }).selectOption('')
    await page.getByLabel('Bin filter', { exact: true }).selectOption(state.locations.find((l: any) => l.name === 'A2').id)
    await expect(page.locator('.stock-table').getByRole('row').filter({ hasText: 'Brass bolt' })).toHaveCount(1)
    await page.getByLabel('Bin filter', { exact: true }).selectOption('')
    await page.getByRole('group', { name: 'Warehouse', exact: true }).getByRole('button', { name: 'South', exact: true }).click()
    await expect(totals.getByRole('row').filter({ hasText: 'North' })).toHaveCount(0)
    await expect(page.locator('.stock-table').getByRole('row').filter({ hasText: 'Brass bolt' })).toHaveCount(2)
    if (shots) await page.screenshot({ path: join(shots, `${width}-stock-south.png`), fullPage: true })
    await page.getByRole('group', { name: 'Warehouse', exact: true }).getByRole('button', { name: 'All', exact: true }).click()
    await page.getByRole('button', { name: 'Brass bolt', exact: true }).first().click()
    await expect(page.getByRole('region', { name: 'Selected item details' })).toContainText('In transit')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)
    if (shots) await page.screenshot({ path: join(shots, `${width}-stock-all.png`), fullPage: true })
  }
})

test('KIT-001: define, assemble, pick, pack, print and inspect kits at 1440 and 390', async ({ page, context }) => {
  const origin=await ownerEntry(page)
  // @ts-expect-error Authenticated HTTP fixture, shared with the warehouse API journey.
  const { kitStock }=await import('../api/kits-fixture.mjs')
  const h={command:async(type:string,payload:object)=>{const response=await context.request.post(`${origin}/api/pier/commands`,{headers:{origin},data:{commandId:crypto.randomUUID(),type,payload}});const body=await response.json();expect(body.ok,JSON.stringify(body)).toBe(true);return body.result}}
  const b=await kitStock(h), shots=process.env.PIER_SCREENSHOTS
  if(shots) await mkdir(shots,{recursive:true})
  for(const width of [1440,390]) {
    await page.setViewportSize({width,height:1000})
    const shot=async(name:string)=>{expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1)).toBe(true);if(shots)await page.screenshot({path:join(shots,`${width}-kits-${name}.png`),fullPage:true})}
    await page.goto(`${origin}/app#stock/${b.assortment.id}`);await page.reload()
    await expect(page.getByText(`Kits and assembly · ${b.assortment.sku}`,{exact:true})).toBeVisible()
    const definition=page.getByRole('heading',{name:'Revise kit definition',exact:true}).locator('..')
    await definition.getByLabel('Item 1',{exact:true}).selectOption(b.components[0].id)
    await definition.getByLabel('Quantity (base units)',{exact:true}).fill('2')
    await definition.getByRole('button',{name:'+ Add line',exact:true}).click()
    await definition.getByLabel('Item 2',{exact:true}).selectOption(b.components[1].id)
    await definition.getByLabel('Quantity (base units)',{exact:true}).nth(1).fill('1')
    await definition.getByLabel('Definition reason',{exact:true}).fill(`Reviewed case assortment at ${width}`)
    await definition.getByRole('button',{name:'Save kit definition',exact:true}).click()
    await expect(page.getByText(`Definition ${width===1440?2:3} · Backorder whole kits`,{exact:true})).toBeVisible()
    await shot('definition')
    const order=await h.command('order.create',{customerId:b.customer.id,warehouse:'North',lines:[{itemId:b.assortment.id,quantity:'2',price:'10'}]})
    const carrier=await h.command('carrier.save',{name:`Kit pickup ${width}`,warehouse:'North',dock:'Kit dock',cutoff:'23:59',timeZone:'America/Chicago'})
    const wave=await h.command('wave.release',{carrierId:carrier.id,orderIds:[order.id]})
    await page.goto(`${origin}/app#floor/pick`);await page.reload()
    await expect(page.getByRole('heading',{name:`Pick list · Wave ${wave.number} · Kit dock`,exact:true})).toBeVisible()
    await shot('pick-list')
    for(const line of wave.lines) {
      const bin=page.getByRole('textbox',{name:'Scan bin label',exact:true})
      await bin.fill(b.bin.barcode);await bin.press('Enter')
      await page.getByLabel('Quantity for this scan (optional)',{exact:true}).fill(line.quantity)
      const scan=page.getByRole('textbox',{name:'Scan item',exact:true})
      await scan.fill(b.components.find((part:any)=>part.id===line.itemId).barcode);await scan.press('Enter')
      await expect(page.getByRole('textbox',{name:'Scan item',exact:true})).toHaveCount(0)
    }
    await page.goto(`${origin}/app#floor/pack`);await page.reload()
    await expect(page.getByRole('heading',{name:`Pack ${order.reference}`,exact:true})).toBeVisible()
    for(const line of wave.lines) for(let n=0;n<Number(line.quantity);n++) {
      const input=page.getByRole('textbox',{name:'Scan item into carton 1',exact:true})
      await input.fill(b.components.find((part:any)=>part.id===line.itemId).barcode);await input.press('Enter');await expect(input).toHaveValue('')
    }
    await shot('pack-components')
    for(const [name,value] of [['Weight (lb)','5'],['Length (in)','10'],['Width (in)','10'],['Height (in)','10']])await page.getByLabel(name,{exact:true}).fill(value)
    await page.getByRole('button',{name:'Save weight and size',exact:true}).click()
    await expect(page.getByRole('button',{name:'Save weight and size',exact:true})).toHaveCount(0)
    await page.getByRole('button',{name:'Mark order packed',exact:true}).click()
    await page.getByLabel('Shipment reference',{exact:true}).fill(`synthetic-pier-browser-${width}`)
    await page.getByRole('button',{name:'Dispatch packed cartons',exact:true}).click()
    await expect(page.getByRole('heading',{name:`Pack ${order.reference}`,exact:true})).toHaveCount(0)
    await page.goto(`${origin}/api/pier/orders/${order.id}/packing-slip`)
    await expect(page.getByRole('heading',{name:`Packing slip · ${order.reference}`,exact:true})).toBeVisible()
    await expect(page.getByText('Component picks and bins',{exact:true})).toBeVisible()
    await shot('packing-slip')
    await page.goto(`${origin}/app#stock/${b.display.id}`);await page.reload()
    const task=page.getByRole('heading',{name:'Plan assembly or disassembly',exact:true}).locator('..')
    await task.getByLabel('Kit quantity',{exact:true}).fill('5')
    await task.getByLabel('Kit bin',{exact:true}).selectOption(b.bin.id)
    for(const part of b.components)await task.getByLabel(`Component bin · ${part.name}`,{exact:true}).selectOption(b.bin.id)
    await task.getByLabel('Kitting reason',{exact:true}).fill(`Five display kits ${width}`)
    await task.getByRole('button',{name:'Prepare kitting review',exact:true}).click()
    await page.getByRole('button',{name:'Approve exact kitting task',exact:true}).click()
    await page.getByRole('button',{name:'Confirm physical kitting',exact:true}).click()
    await expect(page.getByRole('button',{name:'Confirm physical kitting',exact:true})).toHaveCount(0)
    await shot('assembly-posted')
    const displayOrder=await h.command('order.create',{customerId:b.customer.id,warehouse:'North',lines:[{itemId:b.display.id,quantity:'2',price:'12'}]})
    const shipment=await h.command('dispatch.create',{orderId:displayOrder.id,shipmentReference:`synthetic-pier-display-${width}`,lines:[{orderLineId:displayOrder.lines[0].id,quantity:'2'}]})
    await page.reload()
    await page.getByLabel('Kit dispatch',{exact:true}).selectOption(shipment.lines[0].id)
    await page.getByLabel('Returned kit quantity',{exact:true}).fill('1')
    await page.getByLabel('Returned kit bin',{exact:true}).selectOption(b.bin.id)
    await page.getByLabel('Kit return reason',{exact:true}).fill('Inspect display returned by customer')
    for(const part of b.components) await page.getByLabel(`Inspection · ${part.name}`,{exact:true}).fill('Component checked intact')
    await shot('component-inspection')
    await page.getByRole('button',{name:'Receive inspected kit into quarantine',exact:true}).click()
    await expect(page.getByLabel('Returned kit quantity',{exact:true})).toHaveValue('')
    await page.goto(`${origin}/app#reports`);await page.reload()
    await expect(page.getByRole('heading',{name:'Net kit margin',exact:true})).toBeVisible()
    await shot('net-margin')
    const quote=await h.command('quote.create',{customerId:b.customer.id,warehouse:'North',lines:[{itemId:b.assortment.id,quantity:'1',price:'10'}]})
    await page.goto(`${origin}/app#sales/${quote.id}`);await page.reload()
    await expect(page.getByRole('heading',{name:'Reserved quote',exact:true})).toBeVisible()
    await shot('reserved-quote')
    await page.getByRole('button',{name:'Accept quote',exact:true}).click()
    await expect(page.getByRole('button',{name:'Accept quote',exact:true})).toHaveCount(0)
    await h.command('order.cancel',{orderId:quote.id,reason:'End quote proof'})
  }
})
