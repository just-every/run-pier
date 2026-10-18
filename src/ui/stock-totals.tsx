import { records, type PierState, type RecordData } from './api'
import { Table } from './controls'

export function StockTotals({ state, items, warehouse }: { state: PierState; items: RecordData[]; warehouse: string }) {
  const rows: (RecordData & { item: RecordData })[] = items.flatMap(item => [
    ...(!warehouse ? records(state, 'companyStocks').filter(row => row.itemId === item.id).map(row => ({ ...row, warehouse: 'Company total' })) : []),
    ...records(state, 'warehouseStocks').filter(row => row.itemId === item.id && (!warehouse || row.warehouse === warehouse)),
  ].map(row => ({ ...row, item })))
  if (!rows.length) return null
  return <section className="panel" aria-label="Stock totals"><h2>Stock totals</h2><p>All bins and statuses in each warehouse. Reserved includes protected channel holds. Incoming purchases are expected at their receiving warehouse, not at a bin. Company totals include every warehouse and transit location.</p><Table headings={['Product', 'Scope', 'On hand', 'Reserved', 'Available', 'Quarantine', 'In transit', 'Expected']} numeric={[2, 3, 4, 5, 6, 7]}>{rows.map(row => <tr key={`${row.itemId}-${row.warehouse}`}><td>{row.item.name}<small>{row.item.sku}</small></td><td>{row.warehouse}</td>{['onHand', 'reserved', 'available', 'quarantine', 'transit', 'expected'].map(field => <td key={field}>{row[field]} {row.item.unit}</td>)}</tr>)}</Table></section>
}
