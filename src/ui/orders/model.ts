import { records, type PierState, type RecordData } from '../api'
import { difference, sum } from '../quantity'

// What the order workbench reads from saved records: each order's status in
// the code's own words, where it ships from, its picks and its first shortage.

export type OrderStatus = 'Reserved' | 'Backorder' | 'Partly shipped' | 'Closed'
export const orderStatus = (order: RecordData): OrderStatus => order.lines.every((line: any) => difference(sum([line.dispatched, line.cancelled]), line.quantity) === '0') ? 'Closed' : order.lines.some((line: any) => line.dispatched !== '0') ? 'Partly shipped' : order.lines.some((line: any) => line.backorder !== '0') ? 'Backorder' : 'Reserved'
export const isOpen = (order: RecordData) => orderStatus(order) !== 'Closed'
/** A backordered order that will not fill by its promise: the expected fill date is later, or there is none. */
export const needsAttention = (order: RecordData) => isOpen(order) && order.lines.some((line: any) => line.backorder !== '0') && !!order.backorderPlan?.late

/** The warehouses an order draws on: its own, else the bins its reservations and shipments name. */
export function orderWarehouses(state: PierState, order: RecordData): string[] {
  if (order.warehouse) return [order.warehouse]
  const locations = records(state, 'locations')
  const ids = [...records(state, 'reservations').filter(row => row.orderId === order.id).map(row => row.locationId), ...records(state, 'shipments').filter(row => row.orderId === order.id).flatMap(row => row.lines.flatMap((line: any) => (line.reservations || []).map((source: any) => source.locationId)))]
  return [...new Set(ids.map(id => locations.find(row => row.id === id)?.warehouse).filter(Boolean))] as string[]
}
export const warehouses = (state: PierState) => [...new Set(records(state, 'locations').filter(row => row.kind === 'bin' && row.warehouse !== 'Between warehouses').map(row => String(row.warehouse)))].sort()
export const inWarehouse = (state: PierState, order: RecordData, warehouse: string) => !warehouse || orderWarehouses(state, order).includes(warehouse)
/** Where a first visit opens: the warehouse with the most orders needing attention, then the most open orders; All when nothing is open. */
export function openingWarehouse(state: PierState) {
  const open = records(state, 'orders').filter(isOpen)
  const rank = warehouses(state).map(name => { const here = open.filter(order => orderWarehouses(state, order).includes(name)); return { name, attention: here.filter(needsAttention).length, open: here.length } })
    .filter(row => row.open > 0).sort((a, b) => b.attention - a.attention || b.open - a.open || a.name.localeCompare(b.name))
  return rank[0]?.name ?? ''
}

/** The wave lines that pick this order, in bin order. */
export const pickLines = (state: PierState, order: RecordData) => records(state, 'waves').flatMap(wave => wave.lines.filter((line: any) => line.orderId === order.id).map((line: any) => ({ ...line, waveId: wave.id, carrierId: wave.carrierId })))

/** The order's first short line: what is short, against which stock and inbound purchase order. */
export function shortage(state: PierState, order: RecordData) {
  const line = order.lines.find((row: any) => row.backorder !== '0')
  if (!line) return null
  const plan = order.backorderPlan?.lines.find((row: any) => row.orderLineId === line.id)
  const source = plan?.sources?.[0], po = source && records(state, 'purchaseOrders').find(row => row.id === source.poId)
  const poLine = po?.lines.find((row: any) => row.itemId === line.itemId)
  return { line, plan, po, poLine, expectedDate: plan?.expectedDate || order.backorderPlan?.expectedDate || null, estimated: !!(plan?.estimated ?? order.backorderPlan?.estimated) }
}

/** Sellable stock of an item, optionally within one warehouse. */
export function onHand(state: PierState, itemId: string, warehouse = '') {
  const locations = records(state, 'locations')
  const rows = records(state, 'positions').filter(row => row.itemId === itemId && row.status === 'sellable' && (!warehouse || locations.find(location => location.id === row.locationId)?.warehouse === warehouse))
  return { quantity: sum(rows.map(row => row.quantity)), available: sum(rows.map(row => row.available)) }
}

/** A saved instant as US time of day: "10:24 AM". */
export const clock = (value: unknown) => new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(new Date(String(value)))
/** How long ago an instant was, in the largest whole unit: "2 min ago", "3 hr ago". */
export function ago(value: unknown, now = Date.now()) {
  const minutes = Math.max(0, Math.round((now - new Date(String(value)).getTime()) / 60000))
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} hr ago`
  const days = Math.round(hours / 24)
  return days === 1 ? '1 day ago' : `${days} days ago`
}
/** A calendar date with its weekday, the US way: "Fri Oct 23". */
export function shipDay(value: string, withYear = false) {
  const [year, month, date] = value.slice(0, 10).split('-').map(Number)
  const day = new Date(Date.UTC(year, month - 1, date))
  return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric', ...(withYear ? { year: 'numeric' } : {}) }).format(day).replace(',', '')
}

/** An order's channel in words. */
export const channelName = (value: string) => ({ manual: 'Entered in Pier', shopify: 'Shopify', amazon: 'Amazon', woocommerce: 'WooCommerce', stall: 'Stall', edi: 'EDI' } as Record<string, string>)[value] ?? value
