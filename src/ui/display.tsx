import { records, type PierState, type RecordData } from './api'

// How saved values read to people: local times without seconds, money to the
// cent, states in words, people by name and documents by their own reference.
// Exports keep every exact value and identity; these only change the screen.

const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const pad = (value: number) => String(value).padStart(2, '0')
function instant(value: unknown) {
  const date = new Date(String(value))
  if (Number.isNaN(date.getTime())) throw new Error('Invalid saved time in records')
  return date
}
/** A clock time the US way: 4:05 AM. */
const clock = (date: Date) => `${date.getHours() % 12 || 12}:${pad(date.getMinutes())} ${date.getHours() < 12 ? 'AM' : 'PM'}`
/** A saved instant in this browser's timezone: "Oct 14, 2026, 4:00 AM". */
export const when = (value: unknown) => { const date = instant(value); return `${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}, ${clock(date)}` }
/** A calendar date ("2026-10-16") or the day of an instant: "Oct 16, 2026". */
export function day(value: unknown) {
  const calendar = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value))
  if (calendar) return `${months[Number(calendar[2]) - 1]} ${Number(calendar[3])}, ${calendar[1]}`
  const date = instant(value)
  return `${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`
}

/** An exact USD decimal shown to the cent, rounded half away from zero: "108.000000" reads "108.00". */
export function money(value: unknown) {
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(String(value))
  if (!match) throw new Error('Invalid saved amount in records')
  const [, sign, whole, fraction = ''] = match
  const cents = BigInt(whole + fraction.padEnd(2, '0').slice(0, 2)) + ((fraction[2] ?? '0') >= '5' ? 1n : 0n)
  const digits = cents.toString().padStart(3, '0')
  return `${sign && cents ? '-' : ''}${digits.slice(0, -2).replace(/\B(?=(\d{3})+$)/g, ',')}.${digits.slice(-2)}`
}

const labels: Record<string, string> = {
  review: 'In review', cancelled: 'Canceled', transit: 'In transit', bin: 'Warehouse bin', shadow: 'Shadow checked', inactive: 'Inactive',
  reallocation: 'Shortage reallocation', 'count-drift': 'Count drift correction', migration: 'Migration mapping and reconciliation',
}
/** A saved state or kind in words: committed reads "Committed", review "In review". */
export const words = (value: unknown) => { const key = String(value ?? ''); return labels[key] ?? (key.charAt(0).toUpperCase() + key.slice(1)).replace(/[_-]/g, ' ') }

/** Who recorded a change, by the name their operator account carries. */
export const person = (state: PierState, id: unknown) => records(state, 'people').find(row => row.id === id)?.name ?? 'Former operator'

/** An item as people read it; the SKU never breaks across lines. */
export function ItemName({ state, id }: { state: PierState; id: string }) {
  const item = records(state, 'items').find(row => row.id === id)
  if (!item) return <>Removed item</>
  return <>{item.name} · <span className="nowrap">{item.sku}</span></>
}

const locationName = (state: PierState, id: string) => records(state, 'locations').find(row => row.id === id)?.name ?? 'Removed location'
const itemName = (state: PierState, id: string) => records(state, 'items').find(row => row.id === id)?.name ?? 'Removed item'
/** An order or purchase order's own reference: SO-0001, PO-0001. */
export const reference = (row: RecordData | undefined) => row?.reference ?? (row ? `created ${when(row.createdAt)}` : 'Removed document')

const documents: [string, string, (state: PierState, row: RecordData) => string][] = [
  ['orders', 'sales', (_, row) => `Order ${reference(row)}`],
  ['shipments', 'sales', (_, row) => `Shipment ${row.shipmentReference || row.reference}`],
  ['returns', 'sales', (state, row) => `Return · ${itemName(state, row.itemId)}`],
  ['purchaseOrders', 'purchasing', (_, row) => `Purchase order ${reference(row)}`],
  ['receipts', 'purchasing', (_, row) => `Receipt ${row.supplierReference}`],
  ['transfers', 'transfers', (state, row) => `Transfer ${locationName(state, row.fromLocationId)} → ${locationName(state, row.toLocationId)}`],
  ['counts', 'counts', (state, row) => `Count ${locationName(state, row.locationId)}`],
  ['imports', 'imports', (_, row) => `Import ${row.namespace}`],
]
/** The document a movement came from: where it opens and what it is called. */
export function sourceDocument(state: PierState, id: string) {
  for (const [kind, tab, name] of documents) { const row = records(state, kind).find(value => value.id === id); if (row) return { tab, name: name(state, row) } }
  return { tab: 'activity', name: 'Removed document' }
}
