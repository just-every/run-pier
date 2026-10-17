import type { Bindings } from './auth.server'
import { execute } from './pier/api'
import type { Actor } from './pier/model'

/** Demo data for `rer demo` and the hosted demo (Base modules/demo runs it once,
 * after the owner exists, only under RER_DEMO=1): five weeks of a US hardware
 * and housewares distributor shipping from Reno and Newark. Every record goes through Pier's own commands as the owner
 * (the opening stock as a reviewed native CSV import), dated back from `now`, so
 * stock, documents, movements and activity agree exactly as they would in use.
 * It fills only an empty Pier, so a repeat changes nothing. */
export async function seedDemo(env: Bindings, { ownerEmail, now }: { ownerEmail: string; now: Date }): Promise<void> {
  if ((await env.DB.prepare('SELECT version FROM pier_meta WHERE id=1').first<{ version: number }>())?.version) return
  const owner = await env.DB.prepare("SELECT id,display_name AS name,version FROM oa_operators WHERE email=? AND role='owner' AND status='active'").bind(ownerEmail.toLowerCase()).first<{ id: string; name: string; version: number }>()
  if (!owner) throw new Error('The demo owner does not exist yet')
  // The owner claim names the owner "Owner"; the sample business is Maya Collins's.
  if (owner.name === 'Owner') {
    await env.DB.prepare("UPDATE oa_operators SET display_name='Maya Collins' WHERE id=? AND display_name='Owner'").bind(owner.id).run()
    owner.name = 'Maya Collins'
  }
  // The owner's team: native members who joined in the first week, and one
  // invitation still waiting to be accepted.
  for (const [key, name, email, , status] of team)
    await env.DB.prepare("INSERT INTO oa_operators(id,email,display_name,role,status,created_at) VALUES(?,?,?,'member',?,?) ON CONFLICT DO NOTHING").bind(`demo-${key}`, email, name, status, now.getTime() - (status === 'active' ? 34 : 2) * 86_400_000).run()
  // Pier admits every write only for a live native session of an active role,
  // so the seed holds one per acting operator (its token is never issued) and deletes them after.
  const sessions: string[] = []
  const actorFor = async (operator: { id: string; name: string; version: number }, role: string): Promise<Actor> => {
    const session = crypto.randomUUID(), token = crypto.randomUUID() + crypto.randomUUID()
    sessions.push(session)
    await env.DB.prepare("INSERT INTO oa_sessions(id,token_hash,operator_id,operator_version,kind,created_at,expires_at) VALUES(?,?,?,?,'native',?,?)").bind(session, token, operator.id, operator.version, Date.now(), Date.now() + 600_000).run()
    return { id: operator.id, name: operator.name, role, sessionId: session, operatorVersion: operator.version }
  }
  try {
    const actors: Cast = { owner: await actorFor(owner, 'owner') }
    for (const [key, name, , role, status] of team) if (status === 'active') actors[key] = await actorFor({ id: `demo-${key}`, name, version: 1 }, role)
    await story(env, actors, team, now)
    await env.DB.prepare('INSERT INTO oa_first_run (singleton, completed_by, completed_at) VALUES (1, ?, ?) ON CONFLICT(singleton) DO NOTHING').bind(owner.id, now.getTime()).run()
  } finally {
    for (const session of sessions) await env.DB.prepare('DELETE FROM oa_sessions WHERE id=?').bind(session).run()
  }
}

type Cast = Record<string, Actor>
// [key, name, email, Pier role, native status]
const team: [string, string, string, string, 'active' | 'invited'][] = [
  ['jordan', 'Jordan Lee', 'jordan.lee@example.com', 'operator', 'active'],
  ['sam', 'Sam Nguyen', 'sam.nguyen@example.com', 'warehouse', 'active'],
  ['priya', 'Priya Shah', 'priya.shah@example.com', 'buyer', 'active'],
  ['agent', 'Pier agent', 'agent@example.com', 'agent', 'active'],
  ['alex', 'Alex Romero', 'alex.romero@example.com', 'viewer', 'invited'],
]

const cell = (value: string) => /[",\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value
const csv = (rows: string[][]) => rows.map(row => row.map(cell).join(',')).join('\n') + '\n'
// [key, SKU, name, UPC-A, unit, pack, list price USD]
const catalogue: string[][] = [
  ['hm', 'HM-100', 'Hammer 16oz', '085012400116', 'each', '6', '12.50'],
  ['sc', 'SC-204', 'Screw #8 1"', '085012400185', 'each', '1000', '0.12'],
  ['blu', 'BM-12-BLU', 'Blue Mug 12oz', '085012400253', 'each', '24', '9.75'],
  ['nvy', 'BM-12-NVY', 'Navy Mug 12oz', '085012400321', 'each', '24', '10.25'],
  ['pl', 'PL-300', 'Planter Large', '085012400390', 'each', '4', '14.20'],
  ['tk', 'TK-001', 'Toolkit', '085012400468', 'each', '1', '28.00'],
  ['tm', 'TM-025', 'Tape Measure 25ft', '085012400536', 'each', '12', '9.20'],
  ['lv', 'LV-024', 'Level 24in', '085012400604', 'each', '6', '18.50'],
  ['wg', 'WG-L', 'Work Gloves L', '085012400673', 'pair', '12', '3.90'],
  ['dd', 'DD-18', 'Drill Driver 18V', '085012400741', 'each', '1', '89.00'],
  ['sh', 'SH-RP', 'Round Point Shovel', '085012400819', 'each', '1', '22.90'],
  ['pb', 'PB-200', 'Paint Brush 2in', '085012400888', 'each', '12', '3.40'],
]
const price = Object.fromEntries(catalogue.map(row => [row[0], row[6]]))
const unit = Object.fromEntries(catalogue.map(row => [row[0], row[4]]))
const code = Object.fromEntries(catalogue.map(row => [row[0], row[1]]))
// [bin, warehouse]: Reno DC's bins and Newark DC's; Q-01 Returns and the truck hold no opening stock.
const bins: [string, string][] = [...['A-01', 'A-03', 'A-05', 'A-14', 'A-15', 'B-03', 'B-07', 'C-02', 'D-01', 'D-02', 'D-04', 'E-02'].map(name => [name, 'Reno DC'] as [string, string]), ...['N-01', 'N-02', 'N-03', 'N-04'].map(name => [name, 'Newark DC'] as [string, string])]
const customers = ['Hartwell Hardware', 'Crescent Supply', 'Builders Warehouse', 'Lakeside Tools', 'Pine State Supply', 'Trinity Contractors', 'Granite City Supply', 'Riverside Building', 'Metro Materials', 'Summit Industrial', 'Valley Supply Co', 'Red Rock Hardware', 'Cobalt Construction', 'Frontier Supply', 'Sterling Builders', 'High Plains Supply']
const suppliers = ['Harbor Ceramics', 'Keystone Tool Co.', 'Pacific Fastener Supply', 'Sierra Garden Goods']
// [item, bin, quantity, unit cost USD]
const opening: [string, string, string, string][] = [
  ['hm', 'A-01', '400', '7.75'], ['sc', 'B-03', '6000', '0.07'], ['blu', 'A-14', '60', '6.24'], ['nvy', 'A-15', '146', '6.70'], ['pl', 'C-02', '180', '9.51'], ['tk', 'B-07', '150', '16.80'],
  ['tm', 'A-03', '220', '5.40'], ['lv', 'A-05', '90', '11.20'], ['wg', 'D-01', '800', '2.10'], ['dd', 'D-04', '12', '58.00'], ['sh', 'E-02', '80', '14.30'], ['pb', 'D-02', '600', '1.85'],
  ['hm', 'N-01', '120', '7.75'], ['tk', 'N-02', '40', '16.80'], ['nvy', 'N-03', '48', '6.70'], ['sc', 'N-04', '2000', '0.07'],
]
const warehouseOf = (bin: string) => bins.find(row => row[0] === bin)![1]
const cents = (value: string) => Math.round(Number(value) * 100)
/** The business's last inventory system was inFlow: its own export files, mapped
 * column by column, with the stock report's per-bin totals as independent controls. */
function inflowExport() {
  const controls = new Map<string, { bin: string; unit: string; quantity: number; cents: number }>()
  for (const [item, bin, quantity, cost] of opening) {
    const key = JSON.stringify([warehouseOf(bin), bin, unit[item]]), total = controls.get(key) ?? { bin, unit: unit[item], quantity: 0, cents: 0 }
    total.quantity += Number(quantity); total.cents += Number(quantity) * cents(cost); controls.set(key, total)
  }
  return [
    { name: 'products.csv', kind: 'items', csv: csv([['ProductName', 'Description', 'SKU', 'Uom', 'BarCode', 'Cost', 'CaseQuantity'], ...catalogue.map(([key, code, name, barcode, each, pack]) => [code, name, code, each, barcode, opening.find(row => row[0] === key)![3], pack])]), columns: { key: 'ProductName', sku: 'SKU', name: 'Description', unit: 'Uom', barcode: 'BarCode', openingCost: 'Cost', packSize: 'CaseQuantity' } },
    { name: 'stock-levels.csv', kind: 'positions', csv: csv([['ProductName', 'Location', 'Sublocation', 'Quantity'], ...opening.map(([item, bin, quantity]) => [code[item], warehouseOf(bin), bin, quantity])]), columns: { itemKey: 'ProductName', warehouse: 'Location', bin: 'Sublocation', quantity: 'Quantity' }, constants: { status: 'sellable' } },
    { name: 'locations.csv', kind: 'locations', csv: csv([['Key', 'Location', 'Sublocation', 'Kind'], ['reno-returns', 'Reno DC', 'Q-01 Returns', 'bin'], ['truck-4', 'Between warehouses', 'Truck 4', 'transit']]), columns: { key: 'Key', warehouse: 'Location', name: 'Sublocation', kind: 'Kind' } },
    { name: 'vendors.csv', kind: 'suppliers', csv: csv([['Name', 'CurrencyCode'], ...suppliers.map(name => [name, 'USD'])]), columns: { key: 'Name', name: 'Name' }, archivedColumns: { CurrencyCode: 'USD verified.' } },
    { name: 'customers.csv', kind: 'customers', csv: csv([['Name'], ...customers.map(name => [name])]), columns: { key: 'Name', name: 'Name' } },
    { name: 'stock-report-totals.csv', kind: 'controls', csv: csv([['Bin identity', 'Base unit', 'Units', 'USD value'], ...[...controls.values()].map(total => [JSON.stringify([warehouseOf(total.bin), total.bin]), total.unit, String(total.quantity), (total.cents / 100).toFixed(2)])]), columns: { locationKey: 'Bin identity', unit: 'Base unit', quantity: 'Units', value: 'USD value' } },
  ]
}

async function story(env: Bindings, cast: Cast, team: [string, string, string, string, string][], now: Date) {
  let sequence = 0
  const at = workingClock(now)
  const day = (days: number) => new Date(now.getTime() + days * 86_400_000).toISOString().slice(0, 10)
  // Who does what: Jordan takes sales orders, Sam runs the floor, Priya buys,
  // the agent prepares proposals; the owner reviews, approves and commits.
  const by: Record<string, string> = {
    'order.create': 'jordan', 'order.reserve': 'jordan', 'dispatch.create': 'sam', 'receipt.create': 'sam', 'transfer.send': 'sam', 'transfer.receive': 'sam',
    'count.capture': 'sam', 'count.record': 'sam', 'return.create': 'sam', 'carrier.save': 'sam', 'wave.release': 'sam', 'pick.scan': 'sam', 'po.draft': 'priya', 'replenishment.save': 'priya', 'proposal.prepare': 'agent',
    'edi.receive': 'jordan', 'edi.acknowledge': 'jordan',
  }
  const run = async (days: number, type: string, payload: Record<string, unknown>) => {
    const time = at(days)
    return (await execute(env, cast[by[type]] ?? cast.owner, `demo-seed-${String(++sequence).padStart(3, '0')}`, type, payload, () => time)).result
  }

  // Five weeks ago: the move from inFlow, staged from its export files and reviewed stage by stage.
  let batch = await run(35, 'import.stage', {
    provider: 'inflow', namespace: 'inflow:pier-demo-distributor', sourceVersion: 'inFlow export, Sep 2026', mappingRevision: 'reviewed-1', exportedAt: at(35.1), cutoffTimezone: 'America/Los_Angeles', currency: 'USD',
    filters: 'Active stocked products, untracked; per-bin totals from the separately run stock valuation report', files: inflowExport(),
  })
  for (const stage of ['mapped', 'reconciled', 'shadow', 'frozen'])
    batch = await run(35, 'import.review', { batchId: batch.id, version: batch.version, stage, reason: 'Checked against the shelf count taken on Friday and the inFlow valuation report' })
  await run(35, 'import.commit', { batchId: batch.id, version: batch.version })
  for (const [key, , , role] of team) await run(34, 'role.set', { operatorId: `demo-${key}`, role })

  const state = (await env.DB.prepare("SELECT kind,data FROM pier_records WHERE kind IN ('items','locations','parties')").all<{ kind: string; data: string }>()).results.map(row => JSON.parse(row.data))
  const id = (name: string) => state.find(row => row.sku === name || row.name === name)?.id ?? (() => { throw new Error(`Demo record ${name} is missing`) })()
  const sku = (key: string) => id(code[key])
  const bin = (name: string) => id(name)
  const [harbor, keystone, pacific, sierra] = suppliers.map(id)
  const [hartwell, crescent, builders, lakeside, pine, trinity, granite, riverside, metro, summit, valley, redrock, cobalt, frontier, sterling, plains] = customers.map(id)

  const terms: [string, string, string, string, string, string, number][] = [
    [harbor, 'blu', 'HC-BM12B', '24', '6.24', '240', 10], [harbor, 'nvy', 'HC-BM12N', '24', '6.70', '48', 10], [harbor, 'pl', 'HC-PL300', '4', '9.51', '40', 14],
    [keystone, 'hm', 'KT-H16', '6', '7.75', '60', 7], [keystone, 'tk', 'KT-TK1', '1', '16.80', '24', 7], [keystone, 'tm', 'KT-TM25', '12', '5.40', '48', 7], [keystone, 'lv', 'KT-LV24', '6', '11.20', '24', 7], [keystone, 'dd', 'KT-DD18', '1', '58.00', '6', 21],
    [pacific, 'sc', 'PF-S8-1', '1000', '0.07', '1000', 5], [sierra, 'sh', 'SG-RPS', '1', '14.30', '12', 9], [sierra, 'wg', 'SG-WGL', '12', '2.10', '120', 9], [sierra, 'pb', 'SG-PB2', '12', '1.85', '120', 9],
  ]
  for (const [supplierId, item, code, packSize, cost, minimum, leadDays] of terms)
    await run(34, 'supplierItem.save', { supplierId, itemId: sku(item), code, packSize, price: cost, minimum, leadDays })
  // Priya's reorder points and quantities at both warehouses, each with its supplier, so planning prices every suggestion.
  for (const [supplierId, item, , , , , ] of terms) {
    const [point, quantity] = reorderPolicy[item]
    for (const warehouse of ['Reno DC', 'Newark DC'])
      await run(34, 'replenishment.save', { itemId: sku(item), warehouse, supplierId, method: 'fixed', safetyStock: '0', reorderPoint: point, reorderQuantity: quantity, version: 0 })
  }
  // Two retailers send purchase orders as X12 850s; Pier maps their UPCs to its items.
  const retailers = { builders: await run(34, 'edi.partner.save', { name: 'Builders Warehouse', customerId: builders, warehouse: 'Newark DC', senderId: 'PIERDEMO', receiverId: 'BUILDERSWH', gs1Prefix: '0614141', ackMinutes: 1440, asnBeforeArrivalMinutes: 120, invoiceMinutes: 1440, transport: 'pending' }),
    summit: await run(34, 'edi.partner.save', { name: 'Summit Industrial', customerId: summit, warehouse: 'Reno DC', senderId: 'PIERDEMO', receiverId: 'SUMMITIND', gs1Prefix: '0614141', ackMinutes: 1440, asnBeforeArrivalMinutes: 120, invoiceMinutes: 1440, transport: 'pending' }) }
  for (const partner of Object.values(retailers)) for (const row of catalogue)
    await run(34, 'edi.mapping.save', { partnerId: partner.id, upc: row[3], itemId: sku(row[0]), unit: row[4] === 'pair' ? 'PR' : 'EA', packQuantity: '1' })
  let control = 0
  const ediOrder = async (days: number, partner: any, promise: number, shipTo: string[], lines: [string, string][]) => {
    const incoming = await run(days, 'edi.receive', { partnerId: partner.id, x12: purchaseOrder850(partner, ++control, at(days), day(promise), shipTo, lines.map(([item, quantity]) => ({ upc: catalogue.find(row => row[0] === item)![3], quantity, unit: unit[item] === 'pair' ? 'PR' : 'EA', price: price[item] }))) })
    await run(days, 'edi.acknowledge', { ediOrderId: incoming.id, version: incoming.version, lines: incoming.lines.map((line: any) => ({ lineId: line.id, decision: 'accept', quantity: line.quantity })) })
  }

  const sell = (days: number, customerId: string, promise: number, lines: [string, string][], warehouse = 'Reno DC') =>
    run(days, 'order.create', { customerId, promiseDate: day(promise), warehouse, lines: lines.map(([item, quantity]) => ({ itemId: sku(item), quantity, price: price[item] })) })
  const dispatch = (days: number, order: any, reference: string) =>
    run(days, 'dispatch.create', { orderId: order.id, shipmentReference: reference, lines: order.lines.map((line: any) => ({ orderLineId: line.id, quantity: line.quantity })) })
  const buy = async (days: number, supplierId: string, promise: number, reason: string, lines: [string, string, string][]) => {
    const draft = await run(days, 'po.draft', { supplierId, promiseDate: day(promise), destinationWarehouse: 'Reno DC', reason, lines: lines.map(([item, quantity, cost]) => ({ itemId: sku(item), quantity, price: cost })) })
    await run(days, 'po.approve', { poId: draft.id, version: draft.version })
    await run(days, 'po.commit', { poId: draft.id, version: draft.version })
    return draft
  }
  // [bin key, received quantity] per purchase-order line; a zero line stays open.
  const receive = (days: number, po: any, supplierReference: string, received: [string, string][]) =>
    run(days, 'receipt.create', { poId: po.id, supplierReference, lines: po.lines.map((line: any, index: number) => ({ poLineId: line.id, locationId: bin(received[index][0]), quantity: received[index][1], cost: line.price })).filter((line: any) => line.quantity !== '0') })

  // The month behind today: orders shipped, stock bought and received, a return, a transfer and a count.
  const screwPo = await buy(33, pacific, -27, 'Screws for the quarter', [['sc', '4000', '0.07']])
  const gardenPo = await buy(33, sierra, -26, 'Gloves, brushes and shovels for the season', [['wg', '400', '2.10'], ['pb', '200', '1.85'], ['sh', '40', '14.30']])
  const navyPo = await buy(32, harbor, -25, 'Navy mugs for the housewares reset', [['nvy', '96', '6.70']])
  const so1 = await sell(31, crescent, -29, [['hm', '48'], ['tk', '10'], ['tm', '24']])
  const sh1 = await dispatch(30, so1, 'UPS 1Z84F2W70312045521')
  const po1 = await buy(27, keystone, -20, 'Hammers, toolkits and drills for the spring contractor season', [['hm', '120', '7.75'], ['tk', '60', '16.80'], ['dd', '12', '58.00'], ['tm', '120', '5.40'], ['lv', '48', '11.20']])
  await receive(27, screwPo, 'Pacific Fastener invoice 7731', [['B-03', '4000']])
  await receive(26, gardenPo, 'Sierra Garden packing slip 5120', [['D-01', '400'], ['D-02', '200'], ['E-02', '40']])
  await receive(25, navyPo, 'Harbor Ceramics invoice 20412', [['A-15', '96']])
  const so2 = await sell(25, builders, -23, [['blu', '60'], ['pl', '24'], ['sh', '10']])
  const sh2 = await dispatch(24, so2, 'UPS 1Z84F2W70312047730')
  const back = await run(23, 'return.create', { shipmentId: sh2.id, shipmentLineId: sh2.lines[2].id, locationId: bin('Q-01 Returns'), quantity: '2', reason: 'Two shovels returned unused; cartons sealed' })
  await run(23, 'return.approve', { returnId: back.id, version: back.version })
  await run(22, 'return.restock', { returnId: back.id, version: back.version })
  await receive(21, po1, 'Keystone invoice 44812', [['A-01', '120'], ['B-07', '60'], ['D-04', '12'], ['A-03', '120'], ['A-05', '48']])
  const so3 = await sell(20, lakeside, -18, [['wg', '120'], ['pb', '48']])
  await dispatch(19, so3, 'UPS 1Z84F2W70312051184')
  const move = await run(18, 'transfer.send', { itemId: sku('tk'), fromLocationId: bin('B-07'), toLocationId: bin('N-02'), transitLocationId: bin('Truck 4'), quantity: '20', reason: 'Newark DC toolkits for the East Coast accounts' })
  await run(17, 'transfer.receive', { transferId: move.id })
  const count = await run(16, 'count.capture', { locationId: bin('A-05') })
  const recorded = await run(16, 'count.record', { countId: count.id, version: count.version, reason: 'Cycle count: two levels found with cracked vials', lines: count.lines.map((line: any) => ({ itemId: line.itemId, status: line.status, quantity: line.itemId === sku('lv') ? '88' : line.quantity })) })
  await run(16, 'count.approve', { countId: count.id, version: recorded.version })
  const so4 = await sell(14, pine, -12, [['hm', '36'], ['sc', '1000']], 'Newark DC')
  await dispatch(13, so4, 'FedEx 7789 4410 2265')
  await run(12, 'return.create', { shipmentId: sh1.id, shipmentLineId: sh1.lines[2].id, locationId: bin('Q-01 Returns'), quantity: '2', reason: 'Two tape measures returned with cracked cases' })
  const po2 = await buy(12, harbor, -2, 'Mugs and planters for the holiday housewares reset', [['blu', '500', '6.24'], ['pl', '100', '9.51']])
  await buy(11, pacific, 3, 'Screws for Valley Supply and the contractor accounts', [['sc', '5000', '0.07']])

  // The open queue: orders taken over the last ten days, most reserved in full.
  const cobaltOrder = await sell(9, cobalt, 11, [['blu', '148'], ['hm', '24'], ['pb', '60']])
  await sell(8, metro, 4, [['tk', '16'], ['lv', '12'], ['tm', '24']])
  const riversideOrder = await sell(7, riverside, 3, [['blu', '120'], ['nvy', '24'], ['pl', '36']])
  await sell(6, trinity, 2, [['dd', '30'], ['wg', '24']], 'Newark DC')
  const hartwellOrder = await sell(5, hartwell, 6, [['hm', '24'], ['sc', '200'], ['blu', '240'], ['pl', '48'], ['tk', '12'], ['tm', '36'], ['lv', '10'], ['wg', '48']])
  await sell(5, granite, 4, [['sh', '20'], ['wg', '96']])
  await sell(4, valley, 8, [['sc', '12000'], ['hm', '30']])
  await sell(3, redrock, 7, [['hm', '30'], ['tk', '8']])
  await sell(3, frontier, 8, [['wg', '60'], ['pb', '24'], ['sh', '6']])
  await sell(2, sterling, 9, [['lv', '20'], ['tm', '30']])
  await sell(2, plains, 10, [['hm', '18'], ['nvy', '36']])
  await ediOrder(2, retailers.builders, 4, ['Builders Warehouse DC 12', '0012', '400 Meadowlands Pkwy', 'Secaucus', 'NJ', '07094'], [['hm', '40'], ['sc', '800']])
  await ediOrder(1.5, retailers.summit, 12, ['Summit Industrial Boise', '0207', '2150 S Federal Way', 'Boise', 'ID', '83705'], [['pb', '72'], ['wg', '48']])
  const crescentOrder = await sell(1.2, crescent, 1, [['tk', '6'], ['hm', '12']])
  const pineOrder = await sell(1.1, pine, 2, [['nvy', '24']], 'Newark DC')
  await sell(0.6, lakeside, 13, [['sh', '12'], ['tm', '12']])

  // This morning: Harbor Ceramics' delivery arrives 20 mugs short; the mugs are
  // reserved in order of entry, so Hartwell Hardware's order is 28 short.
  await receive(0.15, po2, 'Harbor Ceramics invoice 20931', [['A-14', '480'], ['C-02', '100']])
  for (const order of [cobaltOrder, riversideOrder, hartwellOrder]) await run(0.14, 'order.reserve', { orderId: order.id })
  const ups = await run(0.13, 'carrier.save', { name: 'UPS Ground', warehouse: 'Reno DC', dock: 'Dock 2', cutoff: '16:00', timeZone: 'America/Los_Angeles' })
  await run(0.13, 'carrier.save', { name: 'FedEx Ground', warehouse: 'Newark DC', dock: 'Dock 1', cutoff: '17:00', timeZone: 'America/New_York' })
  const wave = await run(0.12, 'wave.release', { carrierId: ups.id, orderIds: [hartwellOrder.id, riversideOrder.id] })
  const picks = wave.lines.filter((line: any) => line.orderId === hartwellOrder.id && [sku('hm'), sku('sc'), sku('pl'), sku('tm')].includes(line.itemId))
  for (const [index, line] of picks.entries()) {
    const item = catalogue.find(row => sku(row[0]) === line.itemId)!, binName = bins.find(([name]) => bin(name) === line.locationId)![0]
    await run(0.07 - index * 0.004, 'pick.scan', { waveId: wave.id, lineId: line.id, binCode: binName, itemCode: item[3], quantity: line.quantity })
  }
  await dispatch(0.05, crescentOrder, 'UPS 1Z84F2W70312066402')
  await dispatch(0.045, pineOrder, 'FedEx 7789 4410 3391')

  // The agent's proposal, last so its evidence is current: reorder mugs to cover the shortfall.
  const reorder = await run(0.03, 'po.draft', { supplierId: harbor, promiseDate: day(10), destinationWarehouse: 'Reno DC', reason: 'Blue Mug 12oz short for Hartwell Hardware after the Harbor Ceramics delivery arrived 20 short', lines: [{ itemId: sku('blu'), quantity: '600', price: '6.24' }] })
  await run(0.02, 'proposal.prepare', { kind: 'replenishment', assumptions: `Hartwell Hardware's ${hartwellOrder.reference} is 28 Blue Mug 12oz short after ${po2.reference} arrived 20 short. Reorder 600 from Harbor Ceramics ($3,744.00, draft ${reorder.reference}) to cover open demand and restore the reorder point; re-promise ${hartwellOrder.reference} once the supplier confirms a date.`, evidence: [hartwellOrder.id, cobaltOrder.id, po2.id], plan: { poId: reorder.id } })
}

// [reorder point, reorder quantity] per item, at each warehouse.
const reorderPolicy: Record<string, [string, string]> = {
  blu: ['120', '480'], nvy: ['48', '96'], pl: ['40', '80'], hm: ['80', '120'], tk: ['24', '48'], tm: ['48', '96'],
  lv: ['24', '48'], dd: ['6', '12'], sc: ['2000', '5000'], sh: ['12', '24'], wg: ['240', '480'], pb: ['120', '240'],
}

/** Seeded instants: today's events keep their exact time; earlier ones fall on
 * their Reno calendar day in working hours, a little later for each event that day. */
function workingClock(now: Date) {
  const zone = 'America/Los_Angeles', perDay = new Map<string, number>()
  const wall = (time: number) => Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date(time)).filter(part => part.type !== 'literal').map(part => [part.type, Number(part.value)]))
  const dateKey = (time: number) => { const w = wall(time); return `${w.year}-${w.month}-${w.day}` }
  return (days: number) => {
    const time = now.getTime() - days * 86_400_000, key = dateKey(time)
    if (key === dateKey(now.getTime())) return new Date(time).toISOString()
    const n = perDay.get(key) ?? 0; perDay.set(key, n + 1)
    // Each day starts somewhere between 7:40 and 10:10, so days do not share a clock time.
    const seed = [...key].reduce((sum, char) => sum * 31 + char.charCodeAt(0), 7) % 151
    const w = wall(time), minutes = Math.min(7 * 60 + 40 + seed + n * 21 + (n * 7) % 11, 17 * 60 + 40)
    const guess = Date.UTC(w.year, w.month - 1, w.day, 0, minutes), seen = wall(guess)
    return new Date(guess - (Date.UTC(seen.year, seen.month - 1, seen.day, seen.hour, seen.minute) - guess)).toISOString()
  }
}

/** A retailer's X12 004010 850 purchase order to Pier, as its EDI translator writes it. */
function purchaseOrder850(partner: { senderId: string; receiverId: string }, control: number, sent: string, arrival: string, [name, code, street, city, state, zip]: string[], lines: { upc: string; quantity: string; unit: string; price: string }[]) {
  const pad = (value: string) => value.padEnd(15, ' '), compact = sent.slice(0, 10).replaceAll('-', ''), clock = sent.slice(11, 16).replace(':', '')
  const interchange = String(control).padStart(9, '0'), group = String(200 + control), transaction = String(control).padStart(4, '0')
  const body = [`ST*850*${transaction}`, `BEG*00*NE*${partner.receiverId.slice(0, 4)}-${String(48100 + control * 17)}**${compact}`, 'CUR*BY*USD', `DTM*002*${arrival.replaceAll('-', '')}`, `N1*ST*${name}*92*${code}`, `N3*${street}`, `N4*${city}*${state}*${zip}*US`,
    ...lines.map((line, index) => `PO1*${index + 1}*${line.quantity}*${line.unit}*${line.price}**UP*${line.upc}`), `CTT*${lines.length}`]
  return [`ISA*00*          *00*          *ZZ*${pad(partner.receiverId)}*ZZ*${pad(partner.senderId)}*${compact.slice(2)}*${clock}*U*00401*${interchange}*0*T*:`, `GS*PO*${partner.receiverId}*${partner.senderId}*${compact}*${clock}*${group}*X*004010`,
    ...body, `SE*${body.length + 1}*${transaction}`, `GE*1*${group}`, `IEA*1*${interchange}`].join('~') + '~'
}
