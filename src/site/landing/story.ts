// One purchase order, PO-1048 for 500 Blue Mug 12oz (BM-12) from Hillside Ceramics, followed through a
// wholesaler's Columbus, OH warehouse from the reorder (Tue Oct 6, 2026) to the books (Mon Nov 9) and the
// stock card to Mon Nov 16. Every section reads its figures from here, so they agree with each other:
// selling 16 a day, lead time 28 days, safety stock 12 days, FIFO at $4.20 a unit, freight $86.00.
// The desk's arithmetic is in evidence/desk-pier/page-s1/STRUCTURE.md ("The numbers, checked end to end").

// A separator stays with its words: " · " and " → " take no-break spaces on both sides, so no line of a
// card starts or ends with one; a date keeps its day ("Nov\u00a09") and a code its hyphen ("PO\u20111048").
// `glue` applies that to every string of a record.
export const SEP = '\u00a0·\u00a0'
const glueText = (text: string) => text.replaceAll(' · ', SEP).replaceAll(' → ', '\u00a0→\u00a0')
  .replace(/\b(Oct|Nov|Dec) (?=\d)/g, '$1\u00a0').replace(/(?<=[A-Za-z0-9])-(?=[A-Za-z0-9])/g, '\u2011')
const glue = <T,>(value: T): T => (typeof value === 'string' ? glueText(value)
  : Array.isArray(value) ? value.map(glue)
  : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, glue(entry)]))
  : value) as T

export const ITEM = { name: 'Blue Mug 12oz', sku: 'BM-12', warehouse: 'Columbus, OH' }
export const SUPPLIER = 'Hillside Ceramics'

/** Oct 6: 660 on hand runs out Nov 16; with 28 days' lead and 12 days' safety the order goes by Oct 7. */
export const REORDER = glue({
  facts: ['660 on hand · selling 16 a day', 'Runs out Nov 16 · lead time 28 days'],
  advice: 'Order 500 by Oct 7 · 12 days safety',
  po: { title: 'PO-1048 · Hillside Ceramics', cost: '500 × $4.20 · $2,100.00', sent: 'Sent Oct 7 · 7:02 am', confirmed: 'Confirmed Oct 8 · ships Oct 21' },
})

/** Oct 21: the supplier's ship notice drops to 480; Fernwood's 40 still ship Nov 5 from stock. */
export const SHIP_NOTICE = glue({
  sub: 'PO-1048 · shipped Oct 21',
  ordered: '500',
  shipping: '480',
  followOn: '20 follow on PO-1048-B · due Nov 12',
  order: { title: 'Fernwood Market · SO-2318', sub: '40 × Blue Mug 12oz · due Nov 5', kept: '40 ship Nov 5 from stock · promise kept', checked: 'Open orders checked · none late', chip: 'No customer date moved' },
})

/** Nov 3: 24 cartons of 20 scanned at dock 2. */
export const RECEIVING = glue({ title: 'Receiving · PO-1048', scanned: 'Carton 24 of 24 scanned', received: `480 of 500 received · ${SUPPLIER}`, short: '20 short → PO-1048-B · due Nov 12' })

/** Nov 3–4 on the handhelds: put away into A-14 and A-15, the count that disagrees, the recount. */
export const HANDHELDS = glue({
  putAway: { time: '7:58', where: 'Pier · Dock 2', title: 'Put away', sub: 'PO-1048 · 480 received', bins: [{ bin: 'A-14', from: '212', to: '452', note: 'Pick face · full', add: '+240' }, { bin: 'A-15', from: '0', to: '240', note: 'Overflow', add: '+240' }], cartons: ['Cartons of 20', '24 of 24 scanned'], done: '480 put away' },
  count: { time: '8:15', where: 'Pier · Aisle A', title: 'Cycle count', sub: 'CC-0412 · Nov 4', expected: ['452', '22 cartons + 12 loose'], counted: ['432', '21 cartons + 12 loose'], note: '20 off, one carton. Nothing moves from A-14 until a second count.', last: ['Last count', 'Oct 2 · matched'], action: 'Recount sent to aisle A' },
  recount: { time: '8:31', where: 'Pier · Aisle A', title: 'Recount', sub: 'CC-0412 · Nov 4', expected: ['452', '22 cartons + 12 loose'], counted: ['452', '22 cartons + 12 loose'], note: '1 carton on top shelf', adjustment: ['Adjustment', 'None · 452 stands'], done: 'Count matches' },
})

/** Nov 4: six orders reserve 121 of 692 on hand; 571 goes back out to the four store channels. */
export const ORDERS_IN: { tone: string; source: string; ref: string; qty: string }[] = glue([
  { tone: 'shopify', source: 'Shopify', ref: '#4471', qty: '2' },
  { tone: 'amazon', source: 'Amazon', ref: '113-4402', qty: '6' },
  { tone: 'target', source: 'Target EDI 850', ref: 'PO 4471-0093', qty: '48' },
  { tone: 'faire', source: 'Faire', ref: '7KQ2M9', qty: '24' },
  { tone: 'stall', source: 'Stall', ref: 'S-882', qty: '1' },
  { tone: 'wholesale', source: 'Wholesale', ref: 'SO-2318 Fernwood', qty: '40' },
])
export const COUNT = glue({ available: '571', onHand: '692', reserved: '121', reservedLabel: 'reserved for these 6 orders', ack: '855 acknowledged to Target · 9:41 am' })
export const CHANNELS_OUT = ['Shopify', 'Amazon', 'Faire', 'Stall']

/** Nov 5, 6 am to 4 pm: each event at its real time on a linear day. `side` puts it above or below the line. */
export type DayEvent = { at: string; minutes: number; title: string; note: string; tone: 'done' | 'fixed' | 'failed' | 'out'; side: 'above' | 'below' }
export const SHIP_DAY: DayEvent[] = glue([
  { at: '6:40 am', minutes: 40, title: 'Wave 14 picked', note: '38 orders', tone: 'done', side: 'above' },
  { at: '9:15 am', minutes: 195, title: 'Packed', note: '61 cartons', tone: 'done', side: 'above' },
  { at: '11:20 am', minutes: 320, title: 'EDI 856 sent', note: 'Target DC 0593', tone: 'done', side: 'above' },
  { at: '1:05 pm', minutes: 425, title: 'Address corrected', note: '1420 E Main St', tone: 'fixed', side: 'below' },
  { at: '2:10 pm', minutes: 490, title: 'UPS label failed', note: 'Weight missing', tone: 'failed', side: 'above' },
  { at: '2:14 pm', minutes: 494, title: 'Re-weighed', note: 'Label printed', tone: 'done', side: 'below' },
  { at: '3:55 pm', minutes: 595, title: '214 orders out', note: 'Tracking sent', tone: 'out', side: 'above' },
])
export const DAY_TICKS: [number, string][] = [[0, '6 am'], [120, '8'], [240, '10'], [360, '12'], [480, '2 pm'], [600, '4 pm']]
export const RATE_SHOP = glue({
  title: 'Rate shop · SO-2291',
  sub: '3 cartons · 41 lb · Columbus, OH to Denver, CO',
  rates: [{ tone: 'ups', service: 'UPS Ground', price: '$38.12', chosen: false }, { tone: 'fedex', service: 'FedEx Ground', price: '$36.40', chosen: true }, { tone: 'usps', service: 'USPS Ground Advantage', price: '$44.90', chosen: false }],
})

/** Nov 6–9: the bill for 500 against 480 received, the credit, the payment and landed cost. */
export const MATCH = glue({
  sub: `Bill 7731 · ${SUPPLIER}`,
  docs: [{ icon: 'box', title: 'PO-1048', sub: '500 × $4.20', tone: '' }, { icon: 'truck', title: 'Received', sub: '480', tone: '' }, { icon: 'doc', title: 'Bill 7731', sub: '500 · $2,100.00', tone: 'flag' }],
  held: '20 units not received · $84.00 held',
  steps: [{ agent: true, text: 'Agent requested a credit · Nov 6' }, { agent: false, text: 'Credit memo CM-311 · $84.00 · Nov 9' }, { agent: false, text: 'Paid $2,016.00 for 480 · Nov 9' }, { agent: false, text: 'Landed cost $4.38 a unit · freight $86.00 included' }],
  posted: 'Posted to QuickBooks Online',
})

/** The stock card, Oct 6 to Nov 16, FIFO in USD. A range breaks, if it must, only after its dash and
 * before a whole date; a word joiner after the dash (which may otherwise break before a no-break space) keeps
 * "Nov 6 – 8" from leaving "8" alone on a line (BUILD-NOTES 08 at 390). */
export type CardRow = { date: string; movement: string; reference: string; qty: string; onHand: string; value: string; dot?: 'count'; reorder?: string }
export const STOCK_CARD: CardRow[] = glue([
  { date: 'Oct 6', movement: 'Opening balance', reference: '', qty: '', onHand: '660', value: '$2,772.00' },
  { date: 'Oct\u00a06\u00a0– Nov\u00a02', movement: 'Sold, 6 channels', reference: '41 orders', qty: '−448', onHand: '212', value: '$890.40' },
  { date: 'Nov 3', movement: 'Received 480 of 500', reference: 'PO-1048', qty: '+480', onHand: '692', value: '$2,906.40' },
  { date: 'Nov 4', movement: 'Counted A-14, recounted', reference: 'CC-0412', qty: '0', onHand: '692', value: '$2,906.40', dot: 'count' },
  { date: 'Nov 4', movement: 'Reorder suggested', reference: 'PO-1061', qty: '+600 on order', onHand: '692', value: '', reorder: '571 available = 36 days; 40 needed (28 lead + 12 safety)' },
  { date: 'Nov 5', movement: 'Shipped', reference: 'Wave 14 · 6 of 38 orders', qty: '−121', onHand: '571', value: '$2,398.20' },
  { date: 'Nov\u00a06\u00a0–\u2060\u00a08', movement: 'Sold, 6 channels', reference: '9 orders', qty: '−48', onHand: '523', value: '$2,196.60' },
  { date: 'Nov 9', movement: 'Landed cost applied', reference: 'Bill 7731 · CM-311', qty: '', onHand: '523', value: '$2,282.60' },
  { date: 'Nov\u00a09\u00a0–\u2060\u00a011', movement: 'Sold, 6 channels', reference: '8 orders', qty: '−48', onHand: '475', value: '$2,080.10' },
  { date: 'Nov 12', movement: 'Received follow-on', reference: 'PO-1048-B', qty: '+20', onHand: '495', value: '$2,164.10' },
  { date: 'Nov\u00a012\u00a0–\u2060\u00a016', movement: 'Sold, 6 channels', reference: '15 orders', qty: '−80', onHand: '415', value: '$1,813.77' },
])

/** Move in: what came across from Cin7 Core (187 open sales orders, unrelated to ship day's 214). */
export const IMPORTED: { name: string; value: string; done: boolean }[] = glue([
  { name: 'Items', value: '4,812', done: true },
  { name: 'Bins', value: '1,206', done: true },
  { name: 'Stock on hand', value: '318,440 units · matched', done: true },
  { name: 'Open sales orders', value: '187', done: true },
  { name: 'Open purchase orders', value: '37', done: true },
  { name: 'Amazon', value: '2 listings awaiting SKU match', done: false },
])

/** The closing's two tags: the reorder the agent suggested on Nov 4, sent, and ship day's count. */
export const CLOSING_TAGS = glue({ po: 'PO-1061 sent · 600 Blue Mug 12oz', out: '214 orders out' })
