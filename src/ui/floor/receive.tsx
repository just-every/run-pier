import { label, records, unit, type PierState, type RecordData, type RunCommand } from '../api'
import { ItemName, person, reference, when } from '../display'
import { Badge, Empty, Field, Form, Select, Table, text } from '../controls'
import { difference, sum } from '../quantity'
import { Refusal, ScanBox } from './scanner'

// Scan-to-receive: one open tally per purchase order. Scans count on the
// server as they happen; posting the tally receives it into the scanned bins
// and keeps every line's over or short on the receipt.

const tally = (receiving: RecordData, poLineId: string) => sum(receiving.scans.filter((scan: any) => scan.poLineId === poLineId).map((scan: any) => scan.quantity))
const open = (line: any) => { const value = difference(line.quantity, line.received); return value.startsWith('-') ? '0' : value }

export function Receive({ state, run, busy, error }: { state: PierState; run: RunCommand; busy: boolean; error: string }) {
  const pos = records(state, 'purchaseOrders').filter(po => po.status === 'committed'), bins = records(state, 'locations').filter(location => location.kind === 'bin')
  const tallies = records(state, 'receivings').filter(row => row.status === 'open')
  const scanned = records(state, 'receipts').filter(receipt => receipt.receivingId).slice().reverse()
  const waiting = pos.filter(po => !tallies.some(row => row.poId === po.id) && po.lines.some((line: any) => open(line) !== '0'))
  return <>
    {waiting.length ? <Form title="Receive a purchase order by scanning" submit="Start receiving" busy={busy} note="Scan each unit or case barcode as it comes off the truck. Scan a bin label to put the next scans away there." onSubmit={data => run('receiving.start', { poId: text(data, 'poId'), locationId: text(data, 'locationId') })}><Select label="Purchase order" name="poId" rows={waiting.map(po => ({ ...po, label: `${reference(po)} · ${label(records(state, 'parties'), po.supplierId)}` }))} /><Select label="Put away to bin" name="locationId" rows={bins.map(bin => ({ ...bin, label: `${bin.name} · ${bin.warehouse}` }))} /></Form> : !tallies.length && <Empty>No committed purchase orders are waiting to be received.</Empty>}
    {tallies.map(receiving => { const po = pos.find(row => row.id === receiving.poId) || records(state, 'purchaseOrders').find(row => row.id === receiving.poId)!; const lines: { line: any; now: string; gap: string }[] = po.lines.map((line: any) => { const now = tally(receiving, line.id), gap = difference(now, open(line)); return { line, now, gap } }); const over = lines.some(row => row.gap !== '0' && !row.gap.startsWith('-'))
      return <section className="panel" id={`document-${receiving.id}`} key={receiving.id}><h2>Receiving {reference(po)}</h2><p className="muted">{label(records(state, 'parties'), po.supplierId)} · putting away to <strong>{label(bins, receiving.locationId)}</strong> · started {when(receiving.createdAt)} by {person(state, receiving.startedBy)}</p>
        <ScanBox label="Scan item or bin" hint="A case barcode receives the whole case. Times repeats one code, for example 24 cases." count busy={busy} onScan={(code, count) => run('receiving.scan', { receivingId: receiving.id, code, ...(count ? { count } : {}) })} />
        <Refusal error={error} />
        <Table numeric={[1, 2, 3, 4]} headings={['Item', 'Ordered', 'Still expected', 'Scanned now', 'Over / short']}>{lines.map(({ line, now, gap }) => <tr key={line.id}><td><ItemName state={state} id={line.itemId} /></td><td>{line.quantity} {unit(state, line.itemId)}</td><td>{open(line)} {unit(state, line.itemId)}</td><td>{now} {unit(state, line.itemId)}</td><td>{gap === '0' ? <Badge>Matches</Badge> : gap.startsWith('-') ? <Badge>{`Short ${gap.slice(1)}`}</Badge> : <Badge>{`Over ${gap}`}</Badge>}</td></tr>)}</Table>
        {receiving.scans.length > 0 && <details><summary>{receiving.scans.length} scans</summary><Table numeric={[2]} headings={['Scanned', 'Item', 'Quantity', 'Bin', '']}>{receiving.scans.slice().reverse().map((scan: any) => <tr key={scan.id}><td><span className="nowrap">{when(scan.at)}</span><small>{scan.code} · {scan.kind}</small></td><td><ItemName state={state} id={scan.itemId} /></td><td>{scan.quantity} {unit(state, scan.itemId)}</td><td>{label(bins, scan.locationId)}</td><td><button className="link" disabled={busy} onClick={() => run('receiving.remove', { receivingId: receiving.id, scanId: scan.id })}>Remove</button></td></tr>)}</Table></details>}
        <Form key={`${receiving.id}-${over}`} title="Post this receipt" submit="Post receipt into bins" busy={busy} disabled={!receiving.scans.length} note="Short lines stay expected on the purchase order. Over-received units post with the reason you give." onSubmit={data => run('receiving.post', { receivingId: receiving.id, version: receiving.version, supplierReference: text(data, 'supplierReference'), overReason: text(data, 'overReason') })}><Field label="Supplier delivery reference" name="supplierReference" hint="Packing slip, ASN or bill of lading number." />{over && <Field label="Reason to accept the over-receipt" name="overReason" />}</Form>
      </section> })}
    <section className="panel"><h2>Scanned receipts</h2>{!scanned.length ? <Empty>No scanned receipts yet.</Empty> : <Table headings={['Receipt', 'Purchase order', 'Over / short']}>{scanned.map(receipt => { const po = records(state, 'purchaseOrders').find(row => row.id === receipt.poId); const off = (receipt.variance || []).filter((row: any) => row.over !== '0' || row.short !== '0'); return <tr key={receipt.id}><td><a href={`#purchasing/${receipt.id}`}>{receipt.supplierReference}</a><small>{when(receipt.createdAt)}</small></td><td>{reference(po)}</td><td>{off.length ? off.map((row: any) => <small key={row.poLineId}><ItemName state={state} id={row.itemId} /> · {row.over !== '0' ? `over ${row.over}` : `short ${row.short}`} {unit(state, row.itemId)} (expected {row.expected}, received {row.received})</small>) : 'As expected'}{receipt.overReason && <small>Over-receipt accepted: {receipt.overReason}</small>}</td></tr> })}</Table>}</section>
  </>
}
