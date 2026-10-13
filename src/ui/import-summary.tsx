import { unit, type PierState, type RecordData } from './api'
import { Empty, Facts, Table } from './controls'
import { money, reference, words } from './display'
import { difference } from './quantity'

const counted: [string, string][] = [['items', 'Items'], ['locations', 'Bins and locations'], ['parties', 'Customers and suppliers'], ['positions', 'Opening positions'], ['orders', 'Open order lines'], ['purchaseOrders', 'Open purchase order lines'], ['reservations', 'Reservations']]

/** The reconciliation and shadow result as people review it; the export keeps the full record. */
export function ImportSummary({ state, batch }: { state: PierState; batch: RecordData }) {
  const result = batch.reconciliation
  if (!result) return <Empty>No reconciliation yet. Correct the problems above and stage a revision.</Empty>
  const name = (id: string) => result.names?.[id] ?? 'Removed record'
  const each = (itemId: string) => result.units?.[itemId] ?? unit(state, itemId)
  const expected = (result.expectedReceipts || []).filter((po: any) => po.status === 'committed').flatMap((po: any) => po.lines.map((line: any) => ({ po, line, open: difference(line.quantity, line.received) }))).filter((row: any) => row.open !== '0')
  return <>
    <Facts values={[...counted.filter(([kind]) => kind !== 'reservations' || result.entityCounts?.reservations).map(([kind, label]) => ({ label, value: result.entityCounts?.[kind] ?? 0 })), { label: 'Distinct SKUs', value: result.distinctSkus }, { label: 'Unchanged rows', value: result.unchangedRows }]} />
    <h4>Stock after cutover</h4>
    {result.positions?.length ? <Table numeric={[3, 4, 5]} headings={['Item', 'Bin', 'Status', 'On hand', 'Reserved', 'Available']}>{result.positions.map((row: any) => <tr key={`${row.itemId}-${row.locationId}-${row.status}`}><td>{name(row.itemId)}</td><td>{name(row.locationId)}</td><td>{words(row.status)}</td><td>{row.quantity}</td><td>{row.reserved}</td><td>{row.available}</td></tr>)}</Table> : <Empty>No stock positions.</Empty>}
    <h4>Expected receipts</h4>
    {expected.length ? <Table numeric={[3]} headings={['Purchase order', 'Supplier', 'Item', 'Expected']}>{expected.map(({ po, line, open }: any) => <tr key={line.id}><td>{reference(po)}</td><td>{name(po.supplierId)}</td><td>{name(line.itemId)}</td><td>{open} {each(line.itemId)}</td></tr>)}</Table> : <Empty>No expected receipts.</Empty>}
    <h4>Opening cost evidence</h4>
    {result.costEvidence?.length ? <Table numeric={[2, 3]} headings={['Source row', 'Item / bin', 'Quantity', 'Unit cost AUD']}>{result.costEvidence.map((row: any) => <tr key={row.sourceKey}><td>{row.sourceKey}</td><td>{name(row.itemId)}<small>{name(row.locationId)}</small></td><td>{row.quantity} {each(row.itemId)}</td><td>{money(row.cost)}</td></tr>)}</Table> : <Empty>No opening costs in this batch.</Empty>}
  </>
}

/** Staging problems in words, with the file row each one names. */
export function ImportProblems({ batch }: { batch: RecordData }) {
  const problems = (batch.errors || []).filter((error: any) => error.code !== 'REVISION_REVIEW')
  if (!problems.length) return <p className="muted">No problems found. Every row passed validation.</p>
  return <Table headings={['Problem', 'File and row', 'Source row key']}>{problems.map((error: any, index: number) => <tr key={index}><td>{error.message}</td><td>{error.location ? `${error.location.artifact}, row ${error.location.row}` : '—'}</td><td>{error.sourceId ?? error.details?.key ?? '—'}</td></tr>)}</Table>
}
