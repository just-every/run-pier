import type { Bindings } from './auth.server'
import { execute } from './pier/api'
import type { Actor } from './pier/model'

/** Demo data for `rer demo` and the hosted demo (Base modules/demo runs it once,
 * after the owner exists, only under RER_DEMO=1): five weeks of a Brisbane café
 * supply wholesaler. Every record goes through Pier's own commands as the owner
 * (the opening stock as a reviewed native CSV import), dated back from `now`, so
 * stock, documents, movements and activity agree exactly as they would in use.
 * It fills only an empty Pier, so a repeat changes nothing. */
export async function seedDemo(env: Bindings, { ownerEmail, now }: { ownerEmail: string; now: Date }): Promise<void> {
  if ((await env.DB.prepare('SELECT version FROM pier_meta WHERE id=1').first<{ version: number }>())?.version) return
  const owner = await env.DB.prepare("SELECT id,display_name AS name,version FROM oa_operators WHERE email=? AND role='owner' AND status='active'").bind(ownerEmail.toLowerCase()).first<{ id: string; name: string; version: number }>()
  if (!owner) throw new Error('The demo owner does not exist yet')
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
  ['alex', 'Alex Romero', 'alex.romero@example.com', 'viewer', 'invited'],
]

const cell = (value: string) => /[",\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value
const csv = (rows: string[][]) => rows.map(row => row.map(cell).join(',')).join('\n') + '\n'
const items = [
  ['key', 'sku', 'name', 'barcode', 'unit', 'packSize'],
  ['eth', 'BEAN-ETH-1KG', 'Ethiopia Yirgacheffe roasted beans 1 kg', '9312345000011', 'bag', '1'],
  ['col', 'BEAN-COL-1KG', 'Colombia Huila roasted beans 1 kg', '9312345000028', 'bag', '1'],
  ['dec', 'BEAN-DEC-1KG', 'Swiss Water decaf beans 1 kg', '9312345000035', 'bag', '1'],
  ['grn', 'GRN-BRZ', 'Brazil Cerrado green beans', '9312345000042', 'kg', '60'],
  ['oat', 'OAT-1L', 'Barista oat milk 1 L', '9312345000059', 'each', '12'],
  ['syr', 'SYR-VAN', 'Vanilla syrup 750 ml', '9312345000066', 'each', '6'],
  ['cup8', 'CUP-08', 'Compostable cup 8 oz (sleeve of 50)', '9312345000073', 'sleeve', '1'],
  ['cup12', 'CUP-12', 'Compostable cup 12 oz (sleeve of 50)', '9312345000080', 'sleeve', '1'],
  ['lid', 'LID-80', 'Sip lid 80 mm (sleeve of 100)', '9312345000097', 'sleeve', '1'],
  ['filt', 'FILT-CB', 'Cold brew filter bags (pack of 25)', '9312345000103', 'pack', '1'],
  ['tamp', 'TAMP-58', 'Stainless tamper 58 mm', '9312345000110', 'each', '1'],
  ['knock', 'KNOCK-BOX', 'Knock box, large', '9312345000127', 'each', '1'],
]
const locations = [
  ['key', 'name', 'warehouse', 'kind'],
  ['a01', 'A-01', 'Brisbane DC', 'bin'], ['a02', 'A-02', 'Brisbane DC', 'bin'], ['b01', 'B-01 Bulk', 'Brisbane DC', 'bin'],
  ['q01', 'Q-01 Returns', 'Brisbane DC', 'bin'], ['gc1', 'GC-01', 'Gold Coast store', 'bin'], ['van', 'Van 2', 'Between warehouses', 'transit'],
]
const parties = [
  ['key', 'name', 'kind'],
  ['roast', 'Mountain Ridge Roasters', 'supplier'], ['pack', 'Greenline Packaging', 'supplier'],
  ['oatco', 'Riverbend Plant Milks', 'supplier'], ['tools', 'Barista Tools Direct', 'supplier'],
  ['lane', 'Laneway Espresso', 'customer'], ['tram', 'The Morning Tram Café', 'customer'], ['bay', 'Bayside Bakehouse', 'customer'],
  ['kettle', 'Kettle & Crumb', 'customer'], ['hub', 'Northside Co-working', 'customer'],
]
const unit = Object.fromEntries(items.slice(1).map(row => [row[0], row[4]]))
const opening: [string, string, string, string][] = [
  ['eth', 'a01', '40', '24.5'], ['col', 'a01', '35', '22.8'], ['dec', 'a01', '12', '26.4'], ['grn', 'b01', '182.5', '9.35'],
  ['oat', 'a02', '144', '2.65'], ['syr', 'a02', '30', '7.9'], ['filt', 'a02', '20', '11.5'], ['tamp', 'a02', '6', '38'],
  ['knock', 'a02', '2', '54'], ['cup8', 'b01', '60', '4.2'], ['cup12', 'b01', '45', '5.1'], ['lid', 'b01', '50', '3.6'],
  ['eth', 'gc1', '8', '24.5'], ['cup8', 'gc1', '10', '4.2'],
]
const positions = [['key', 'itemKey', 'locationKey', 'status', 'quantity', 'unit', 'cost'], ...opening.map(([item, bin, quantity, cost]) => [`${item}-${bin}`, item, bin, 'sellable', quantity, unit[item], cost])]

async function story(env: Bindings, cast: Cast, team: [string, string, string, string, string][], now: Date) {
  let sequence = 0
  const at = (days: number) => new Date(now.getTime() - days * 86_400_000).toISOString()
  const day = (days: number) => at(-days).slice(0, 10)
  // Who does what: Jordan takes sales orders, Sam runs the floor, Priya buys;
  // the owner reviews, approves and commits.
  const by: Record<string, string> = {
    'order.create': 'jordan', 'dispatch.create': 'sam', 'receipt.create': 'sam', 'transfer.send': 'sam', 'transfer.receive': 'sam',
    'count.capture': 'sam', 'count.record': 'sam', 'return.create': 'sam', 'po.draft': 'priya', 'proposal.prepare': 'priya',
  }
  const run = async (days: number, type: string, payload: Record<string, unknown>) =>
    (await execute(env, cast[by[type]] ?? cast.owner, `demo-seed-${String(++sequence).padStart(3, '0')}`, type, payload, () => at(days))).result

  // Five weeks ago: the opening stock sheet, imported and reviewed stage by stage.
  let batch = await run(35, 'import.stage', {
    namespace: 'opening-stock', sourceVersion: 'stock-sheet-v3', exportedAt: at(35.1), filters: 'all active lines', cutoffTimezone: 'Australia/Brisbane', currency: 'AUD', mappingRevision: '1',
    files: [{ name: 'items.csv', kind: 'items', csv: csv(items) }, { name: 'locations.csv', kind: 'locations', csv: csv(locations) }, { name: 'parties.csv', kind: 'parties', csv: csv(parties) }, { name: 'positions.csv', kind: 'positions', csv: csv(positions) }],
  })
  for (const stage of ['mapped', 'reconciled', 'shadow', 'frozen'])
    batch = await run(35, 'import.review', { batchId: batch.id, version: batch.version, stage, reason: 'Checked against the shelf count taken on Friday' })
  await run(35, 'import.commit', { batchId: batch.id, version: batch.version })
  for (const [key, , , role] of team) await run(34, 'role.set', { operatorId: `demo-${key}`, role })

  const state = (await env.DB.prepare("SELECT kind,data FROM pier_records WHERE kind IN ('items','locations','parties')").all<{ kind: string; data: string }>()).results.map(row => JSON.parse(row.data))
  const id = (name: string) => state.find(row => row.sku === name || row.name === name)?.id ?? (() => { throw new Error(`Demo record ${name} is missing`) })()
  const sku = (key: string) => id(items.find(row => row[0] === key)![1])
  const [a01, a02, b01, q01, gc1, van] = ['A-01', 'A-02', 'B-01 Bulk', 'Q-01 Returns', 'GC-01', 'Van 2'].map(id)
  const [roast, pack, oatco, tools, lane, tram, bay, kettle, hub] = parties.slice(1).map(row => id(row[1]))

  const terms: [string, string, string, string, string, string, number][] = [
    [roast, 'eth', 'MRR-ETH', '1', '24.5', '10', 4], [roast, 'col', 'MRR-COL', '1', '22.8', '10', 4], [roast, 'dec', 'MRR-DEC', '1', '26.4', '5', 7],
    [pack, 'cup8', 'GP-C08', '1', '4.2', '20', 10], [pack, 'cup12', 'GP-C12', '1', '5.1', '20', 10], [pack, 'lid', 'GP-L80', '1', '3.6', '20', 10],
    [oatco, 'oat', 'RPM-OAT1L', '12', '2.65', '48', 3], [tools, 'tamp', 'BTD-T58', '1', '38', '1', 14], [tools, 'knock', 'BTD-KBL', '1', '54', '1', 14],
  ]
  for (const [supplierId, item, code, packSize, price, minimum, leadDays] of terms)
    await run(34, 'supplierItem.save', { supplierId, itemId: sku(item), code, packSize, price, minimum, leadDays })

  const sell = (days: number, customerId: string, promise: number, lines: [string, string][]) =>
    run(days, 'order.create', { customerId, promiseDate: day(promise), lines: lines.map(([item, quantity]) => ({ itemId: sku(item), quantity })) })
  const dispatch = (days: number, order: any, reference: string) =>
    run(days, 'dispatch.create', { orderId: order.id, shipmentReference: reference, lines: order.lines.map((line: any) => ({ orderLineId: line.id, quantity: line.quantity })) })
  const buy = async (days: number, supplierId: string, promise: number, reason: string, lines: [string, string, string][]) => {
    const draft = await run(days, 'po.draft', { supplierId, promiseDate: day(promise), reason, lines: lines.map(([item, quantity, price]) => ({ itemId: sku(item), quantity, price })) })
    await run(days, 'po.approve', { poId: draft.id, version: draft.version })
    await run(days, 'po.commit', { poId: draft.id, version: draft.version })
    return draft
  }
  const receive = (days: number, po: any, supplierReference: string, bin: string, received: string[]) =>
    run(days, 'receipt.create', { poId: po.id, supplierReference, lines: po.lines.map((line: any, index: number) => ({ poLineId: line.id, locationId: bin, quantity: received[index], cost: line.price })).filter((line: any) => line.quantity !== '0') })

  const so1 = await sell(31, lane, -29, [['eth', '12'], ['oat', '48'], ['cup8', '20']])
  const sh1 = await dispatch(29, so1, 'AusPost 33PL0921')
  const po1 = await buy(27, roast, -22, 'Roast for the next four weeks of café orders', [['eth', '40', '24.5'], ['col', '30', '22.8'], ['dec', '10', '26.4']])
  const so2 = await sell(25, tram, -23, [['col', '10'], ['cup12', '15'], ['lid', '15'], ['syr', '6']])
  await dispatch(24, so2, 'Own van run 14')
  const back = await run(23, 'return.create', { shipmentId: sh1.id, shipmentLineId: sh1.lines[2].id, locationId: q01, quantity: '2', reason: 'Over-ordered; sleeves returned unopened' })
  await run(23, 'return.approve', { returnId: back.id, version: back.version })
  await run(22, 'return.restock', { returnId: back.id, version: back.version })
  await receive(22, po1, 'MRR invoice 5512', a01, ['40', '30', '10'])
  const move = await run(20, 'transfer.send', { itemId: sku('eth'), fromLocationId: a01, toLocationId: gc1, transitLocationId: van, quantity: '10', reason: 'Gold Coast weekend trade' })
  await run(19, 'transfer.receive', { transferId: move.id })
  const so3 = await sell(18, bay, -16, [['dec', '6'], ['oat', '36'], ['filt', '4']])
  const sh3 = await dispatch(17, so3, 'AusPost 33PL1187')
  const po2 = await buy(15, pack, -6, 'Cups and lids before the school holidays', [['cup8', '40', '4.2'], ['cup12', '40', '5.1'], ['lid', '40', '3.6']])
  const count = await run(14, 'count.capture', { locationId: a02 })
  const recorded = await run(14, 'count.record', { countId: count.id, version: count.version, reason: 'Monthly cycle count: two vanilla syrups found behind the oat milk', lines: count.lines.map((line: any) => ({ itemId: line.itemId, status: line.status, quantity: line.itemId === sku('syr') ? '26' : line.quantity })) })
  await run(14, 'count.approve', { countId: count.id, version: recorded.version })
  await run(12, 'return.create', { shipmentId: sh3.id, shipmentLineId: sh3.lines[1].id, locationId: q01, quantity: '2', reason: 'Two cartons crushed in transit' })
  const so4 = await sell(10, kettle, 2, [['eth', '15'], ['col', '10'], ['knock', '3']])
  await receive(9, po2, 'Greenline delivery 88213', b01, ['40', '20', '0'])
  await buy(6, tools, 8, 'Knock boxes for Kettle & Crumb and spare tampers', [['tamp', '4', '38'], ['knock', '6', '54']])
  const so5 = await sell(5, hub, 3, [['oat', '60'], ['cup12', '30'], ['lid', '30']])
  const so6 = await sell(3, lane, 1, [['eth', '12'], ['oat', '48'], ['cup8', '20']])
  await run(2, 'transfer.send', { itemId: sku('cup8'), fromLocationId: b01, toLocationId: gc1, transitLocationId: van, quantity: '10', reason: 'Gold Coast cups running low' })
  await run(1, 'count.capture', { locationId: b01 })
  const po4 = await run(0.2, 'po.draft', { supplierId: oatco, promiseDate: day(3), reason: 'Oat milk short for Laneway Espresso and Northside Co-working', lines: [{ itemId: sku('oat'), quantity: '96', price: '2.65' }] })
  await run(0.1, 'proposal.prepare', { kind: 'replenishment', assumptions: 'Open orders SO-0005 and SO-0006 need 108 cartons against 60 on hand; Riverbend delivers in 3 days.', evidence: [so5.id, so6.id, so4.id], plan: { poId: po4.id } })
}
