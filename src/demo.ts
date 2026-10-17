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
const items = [['key', 'sku', 'name', 'barcode', 'unit', 'packSize'], ...catalogue.map(row => row.slice(0, 6))]
const price = Object.fromEntries(catalogue.map(row => [row[0], row[6]]))
const locations = [
  ['key', 'name', 'warehouse', 'kind'],
  ...['A-01', 'A-03', 'A-05', 'A-14', 'A-15', 'B-03', 'B-07', 'C-02', 'D-01', 'D-02', 'D-04', 'E-02', 'Q-01 Returns'].map(name => [name.toLowerCase().replace(/[^a-z0-9]+/g, ''), name, 'Reno DC', 'bin']),
  ...['N-01', 'N-02', 'N-03', 'N-04'].map(name => [name.toLowerCase().replace('-', ''), name, 'Newark DC', 'bin']),
  ['truck', 'Truck 4', 'Between warehouses', 'transit'],
]
const customers = ['Hartwell Hardware', 'Crescent Supply', 'Builders Warehouse', 'Lakeside Tools', 'Pine State Supply', 'Trinity Contractors', 'Granite City Supply', 'Riverside Building', 'Metro Materials', 'Summit Industrial', 'Valley Supply Co', 'Red Rock Hardware', 'Cobalt Construction', 'Frontier Supply', 'Sterling Builders', 'High Plains Supply']
const suppliers = ['Harbor Ceramics', 'Keystone Tool Co.', 'Pacific Fastener Supply', 'Sierra Garden Goods']
const parties = [['key', 'name', 'kind'], ...suppliers.map((name, index) => [`s${index}`, name, 'supplier']), ...customers.map((name, index) => [`c${index}`, name, 'customer'])]
const unit = Object.fromEntries(items.slice(1).map(row => [row[0], row[4]]))
// [item, bin key, quantity, unit cost USD]
const opening: [string, string, string, string][] = [
  ['hm', 'a01', '400', '7.75'], ['sc', 'b03', '6000', '0.07'], ['blu', 'a14', '60', '6.24'], ['nvy', 'a15', '146', '6.70'], ['pl', 'c02', '180', '9.51'], ['tk', 'b07', '150', '16.80'],
  ['tm', 'a03', '220', '5.40'], ['lv', 'a05', '90', '11.20'], ['wg', 'd01', '800', '2.10'], ['dd', 'd04', '12', '58.00'], ['sh', 'e02', '80', '14.30'], ['pb', 'd02', '600', '1.85'],
  ['hm', 'n01', '120', '7.75'], ['tk', 'n02', '40', '16.80'], ['nvy', 'n03', '48', '6.70'], ['sc', 'n04', '2000', '0.07'],
]
const positions = [['key', 'itemKey', 'locationKey', 'status', 'quantity', 'unit', 'cost'], ...opening.map(([item, bin, quantity, cost]) => [`${item}-${bin}`, item, bin, 'sellable', quantity, unit[item], cost])]

async function story(env: Bindings, cast: Cast, team: [string, string, string, string, string][], now: Date) {
  let sequence = 0
  const at = (days: number) => new Date(now.getTime() - days * 86_400_000).toISOString()
  const day = (days: number) => at(-days).slice(0, 10)
  // Who does what: Jordan takes sales orders, Sam runs the floor, Priya buys,
  // the agent prepares proposals; the owner reviews, approves and commits.
  const by: Record<string, string> = {
    'order.create': 'jordan', 'order.reserve': 'jordan', 'dispatch.create': 'sam', 'receipt.create': 'sam', 'transfer.send': 'sam', 'transfer.receive': 'sam',
    'count.capture': 'sam', 'count.record': 'sam', 'return.create': 'sam', 'carrier.save': 'sam', 'wave.release': 'sam', 'pick.scan': 'sam', 'po.draft': 'priya', 'proposal.prepare': 'agent',
  }
  const run = async (days: number, type: string, payload: Record<string, unknown>) =>
    (await execute(env, cast[by[type]] ?? cast.owner, `demo-seed-${String(++sequence).padStart(3, '0')}`, type, payload, () => at(days))).result

  // Five weeks ago: the opening stock sheet, imported and reviewed stage by stage.
  // Native CSV is AUD-only today (src/pier/imports.ts), so its opening costs stay
  // unvalued; the USD purchase orders received below carry the valued stock.
  let batch = await run(35, 'import.stage', {
    namespace: 'opening-stock', sourceVersion: 'stock-sheet-v3', exportedAt: at(35.1), filters: 'all active lines', cutoffTimezone: 'America/Los_Angeles', currency: 'AUD', mappingRevision: '1',
    files: [{ name: 'items.csv', kind: 'items', csv: csv(items) }, { name: 'locations.csv', kind: 'locations', csv: csv(locations) }, { name: 'parties.csv', kind: 'parties', csv: csv(parties) }, { name: 'positions.csv', kind: 'positions', csv: csv(positions) }],
  })
  for (const stage of ['mapped', 'reconciled', 'shadow', 'frozen'])
    batch = await run(35, 'import.review', { batchId: batch.id, version: batch.version, stage, reason: 'Checked against the shelf count taken on Friday' })
  await run(35, 'import.commit', { batchId: batch.id, version: batch.version })
  for (const [key, , , role] of team) await run(34, 'role.set', { operatorId: `demo-${key}`, role })

  const state = (await env.DB.prepare("SELECT kind,data FROM pier_records WHERE kind IN ('items','locations','parties')").all<{ kind: string; data: string }>()).results.map(row => JSON.parse(row.data))
  const id = (name: string) => state.find(row => row.sku === name || row.name === name)?.id ?? (() => { throw new Error(`Demo record ${name} is missing`) })()
  const sku = (key: string) => id(catalogue.find(row => row[0] === key)![1])
  const bin = (key: string) => id(locations.find(row => row[0] === key)![1])
  const [harbor, keystone, pacific, sierra] = suppliers.map(id)
  const [hartwell, crescent, builders, lakeside, pine, trinity, granite, riverside, metro, summit, valley, redrock, cobalt, frontier, sterling, plains] = customers.map(id)

  const terms: [string, string, string, string, string, string, number][] = [
    [harbor, 'blu', 'HC-BM12B', '24', '6.24', '240', 10], [harbor, 'nvy', 'HC-BM12N', '24', '6.70', '48', 10], [harbor, 'pl', 'HC-PL300', '4', '9.51', '40', 14],
    [keystone, 'hm', 'KT-H16', '6', '7.75', '60', 7], [keystone, 'tk', 'KT-TK1', '1', '16.80', '24', 7], [keystone, 'tm', 'KT-TM25', '12', '5.40', '48', 7], [keystone, 'lv', 'KT-LV24', '6', '11.20', '24', 7], [keystone, 'dd', 'KT-DD18', '1', '58.00', '6', 21],
    [pacific, 'sc', 'PF-S8-1', '1000', '0.07', '1000', 5], [sierra, 'sh', 'SG-RPS', '1', '14.30', '12', 9], [sierra, 'wg', 'SG-WGL', '12', '2.10', '120', 9], [sierra, 'pb', 'SG-PB2', '12', '1.85', '120', 9],
  ]
  for (const [supplierId, item, code, packSize, cost, minimum, leadDays] of terms)
    await run(34, 'supplierItem.save', { supplierId, itemId: sku(item), code, packSize, price: cost, minimum, leadDays })

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
  await receive(27, screwPo, 'Pacific Fastener invoice 7731', [['b03', '4000']])
  await receive(26, gardenPo, 'Sierra Garden packing slip 5120', [['d01', '400'], ['d02', '200'], ['e02', '40']])
  await receive(25, navyPo, 'Harbor Ceramics invoice 20412', [['a15', '96']])
  const so2 = await sell(25, builders, -23, [['blu', '60'], ['pl', '24'], ['sh', '10']])
  const sh2 = await dispatch(24, so2, 'UPS 1Z84F2W70312047730')
  const back = await run(23, 'return.create', { shipmentId: sh2.id, shipmentLineId: sh2.lines[2].id, locationId: bin('q01returns'), quantity: '2', reason: 'Two shovels returned unused; cartons sealed' })
  await run(23, 'return.approve', { returnId: back.id, version: back.version })
  await run(22, 'return.restock', { returnId: back.id, version: back.version })
  await receive(21, po1, 'Keystone invoice 44812', [['a01', '120'], ['b07', '60'], ['d04', '12'], ['a03', '120'], ['a05', '48']])
  const so3 = await sell(20, lakeside, -18, [['wg', '120'], ['pb', '48']])
  await dispatch(19, so3, 'UPS 1Z84F2W70312051184')
  const move = await run(18, 'transfer.send', { itemId: sku('tk'), fromLocationId: bin('b07'), toLocationId: bin('n02'), transitLocationId: bin('truck'), quantity: '20', reason: 'Newark DC toolkits for the East Coast accounts' })
  await run(17, 'transfer.receive', { transferId: move.id })
  const count = await run(16, 'count.capture', { locationId: bin('a05') })
  const recorded = await run(16, 'count.record', { countId: count.id, version: count.version, reason: 'Cycle count: two levels found with cracked vials', lines: count.lines.map((line: any) => ({ itemId: line.itemId, status: line.status, quantity: line.itemId === sku('lv') ? '88' : line.quantity })) })
  await run(16, 'count.approve', { countId: count.id, version: recorded.version })
  const so4 = await sell(14, pine, -12, [['hm', '36'], ['sc', '1000']], 'Newark DC')
  await dispatch(13, so4, 'FedEx 7789 4410 2265')
  await run(12, 'return.create', { shipmentId: sh1.id, shipmentLineId: sh1.lines[2].id, locationId: bin('q01returns'), quantity: '2', reason: 'Two tape measures returned with cracked cases' })
  const po2 = await buy(12, harbor, -2, 'Mugs and planters for the holiday housewares reset', [['blu', '500', '6.24'], ['pl', '100', '9.51']])
  await buy(11, pacific, 3, 'Screws for Valley Supply and the contractor accounts', [['sc', '5000', '0.07']])

  // The open queue: orders taken over the last ten days, most reserved in full.
  const cobaltOrder = await sell(9, cobalt, 11, [['blu', '148'], ['hm', '24'], ['pb', '60']])
  await sell(8, metro, 4, [['tk', '16'], ['lv', '12'], ['tm', '24']])
  const riversideOrder = await sell(7, riverside, 3, [['blu', '120'], ['nvy', '24'], ['pl', '36']])
  await sell(6, trinity, 2, [['dd', '30'], ['wg', '24']])
  const hartwellOrder = await sell(5, hartwell, 6, [['hm', '24'], ['sc', '200'], ['blu', '240'], ['pl', '48'], ['tk', '12'], ['tm', '36'], ['lv', '10'], ['wg', '48']])
  await sell(5, granite, 4, [['sh', '20'], ['wg', '96']])
  await sell(4, valley, 8, [['sc', '12000'], ['hm', '30']])
  await sell(3, redrock, 7, [['hm', '30'], ['tk', '8']])
  await sell(3, frontier, 8, [['wg', '60'], ['pb', '24'], ['sh', '6']])
  await sell(2, sterling, 9, [['lv', '20'], ['tm', '30']])
  await sell(2, plains, 10, [['hm', '18'], ['nvy', '36']])
  await sell(2, builders, 4, [['hm', '40'], ['sc', '800']], 'Newark DC')
  await sell(1.5, summit, 12, [['pb', '72'], ['wg', '48']])
  const crescentOrder = await sell(1.2, crescent, 1, [['tk', '6'], ['hm', '12']])
  const pineOrder = await sell(1.1, pine, 2, [['nvy', '24']], 'Newark DC')
  await sell(0.6, lakeside, 13, [['sh', '12'], ['tm', '12']])

  // This morning: Harbor Ceramics' delivery arrives 20 mugs short; the mugs are
  // reserved in order of entry, so Hartwell Hardware's order is 28 short.
  await receive(0.15, po2, 'Harbor Ceramics invoice 20931', [['a14', '480'], ['c02', '100']])
  for (const order of [cobaltOrder, riversideOrder, hartwellOrder]) await run(0.14, 'order.reserve', { orderId: order.id })
  const ups = await run(0.13, 'carrier.save', { name: 'UPS Ground', warehouse: 'Reno DC', dock: 'Dock 2', cutoff: '16:00', timeZone: 'America/Los_Angeles' })
  await run(0.13, 'carrier.save', { name: 'FedEx Ground', warehouse: 'Newark DC', dock: 'Dock 1', cutoff: '17:00', timeZone: 'America/New_York' })
  const wave = await run(0.12, 'wave.release', { carrierId: ups.id, orderIds: [hartwellOrder.id, riversideOrder.id] })
  const picks = wave.lines.filter((line: any) => line.orderId === hartwellOrder.id && [sku('hm'), sku('sc'), sku('pl'), sku('tm')].includes(line.itemId))
  for (const [index, line] of picks.entries()) {
    const item = catalogue.find(row => sku(row[0]) === line.itemId)!, binName = locations.slice(1).find(row => bin(row[0]) === line.locationId)![1]
    await run(0.07 - index * 0.004, 'pick.scan', { waveId: wave.id, lineId: line.id, binCode: binName, itemCode: item[3], quantity: line.quantity })
  }
  await dispatch(0.05, crescentOrder, 'UPS 1Z84F2W70312066402')
  await dispatch(0.045, pineOrder, 'FedEx 7789 4410 3391')

  // The agent's proposal, last so its evidence is current: reorder mugs to cover the shortfall.
  const reorder = await run(0.03, 'po.draft', { supplierId: harbor, promiseDate: day(10), destinationWarehouse: 'Reno DC', reason: 'Blue Mug 12oz short for Hartwell Hardware after the Harbor Ceramics delivery arrived 20 short', lines: [{ itemId: sku('blu'), quantity: '600', price: '6.24' }] })
  await run(0.02, 'proposal.prepare', { kind: 'replenishment', assumptions: `Hartwell Hardware's ${hartwellOrder.reference} is 28 Blue Mug 12oz short after ${po2.reference} arrived 20 short. Reorder 600 from Harbor Ceramics ($3,744.00, draft ${reorder.reference}) to cover open demand and restore the reorder point; re-promise ${hartwellOrder.reference} once the supplier confirms a date.`, evidence: [hartwellOrder.id, cobaltOrder.id, po2.id], plan: { poId: reorder.id } })
}
