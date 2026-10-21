import { SlowStock } from './slow-stock'
import { useEffect, useState, type ReactNode } from 'react'
import { label, records, unit, type PierState, type RunCommand } from './api'
import { Amount, Empty, Facts, Field, Form, Select, Table, text } from './controls'
import { day, ItemName, person, reference, when, words } from './display'

type AmountValue = string | null
type MarginGroup = { key: string; quantity: string; revenue: AmountValue; cost: AmountValue; margin: AmountValue }
type Report = {
  kitMargins: MarginGroup[];
  lowStock: any[];
  overdueOrders: { rows: any[]; closedDays: any[] };
  currency: 'USD'; asOf: string; method: 'fifo' | 'average'
  methodHistory: { id: string; method: string; createdAt: string; reason: string; actorId: string }[]
  valuation: {
    rows: { itemId: string; locationId: string; status: string; quantity: string; value: AmountValue; unvaluedQuantity: string }[]
    total: AmountValue; unvaluedQuantity: string
    reconciliation: { receipts: AmountValue; openings: AmountValue; returns: AmountValue; adjustments: AmountValue; cogs: AmountValue; closing: AmountValue; difference: AmountValue }
  }
  margin: {
    rows: { shipmentId: string; orderId: string; itemId: string; customerId: string; channel: string; date: string; quantity: string; revenue: AmountValue; cost: AmountValue; margin: AmountValue }[]
    bySku: MarginGroup[]; byChannel: MarginGroup[]; byCustomer: MarginGroup[]
    revenue: AmountValue; cost: AmountValue; margin: AmountValue; unpricedLines: number; unvaluedLines: number
  }
  deadStock: { days: number; rows: { itemId: string; locationId: string; quantity: string; value: AmountValue; lastSale: string | null; lastMovement: string | null }[]; total: AmountValue }
}

const methodName = (method: string) => method === 'fifo' ? 'FIFO' : 'Moving average'
const today = () => new Date().toISOString().slice(0, 10)

// Keep exact decimal text in exports. Quoting handles delimiters; the prefix
// protects names/channel text from spreadsheet formula interpretation.
function downloadCsv(name: string, rows: object[], parameters: object) {
  const data = rows.map(row => ({ ...parameters, ...row }))
  if (!data.length) return
  const keys = Object.keys(data[0])
  const cell = (value: unknown) => {
    let valueText = value === null ? 'Unknown' : typeof value === 'object' ? JSON.stringify(value) : String(value ?? '')
    if (/^[=+@\-\t\r]/.test(valueText) && !/^-?\d+(?:\.\d+)?$/.test(valueText)) valueText = `'${valueText}`
    return `"${valueText.replace(/"/g, '""')}"`
  }
  const csv = [keys.map(cell).join(','), ...data.map(row => keys.map(key => cell((row as Record<string, unknown>)[key])).join(','))].join('\r\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a'); link.href = url; link.download = `${name}.csv`; link.click(); URL.revokeObjectURL(url)
}

function MarginGroups({ title, rows, name, exportRows }: { title: string; rows: MarginGroup[]; name: (key: string) => ReactNode; exportRows: () => void }) {
  return <section className="panel"><h2>{title}</h2>{!rows.length ? <Empty>No shipped sales in this period.</Empty> : <><button onClick={exportRows}>Download CSV</button><Table numeric={[1, 2, 3, 4]} headings={['Group', 'Shipped quantity (base units)', 'Revenue USD', 'COGS USD', 'Margin USD']}>{rows.map(row => <tr key={row.key}><td>{name(row.key)}</td><td>{row.quantity}</td><td><Amount value={row.revenue} unknown="Unpriced" /></td><td><Amount value={row.cost} /></td><td><Amount value={row.margin} unknown="Incomplete" /></td></tr>)}</Table></>}</section>
}

export function Reports({ state, run, busy }: { state: PierState; run: RunCommand; busy: boolean }) {
  const [query, setQuery] = useState(() => ({ asOf: today(), from: `${today().slice(0, 8)}01`, to: today(), days: String(records(state, 'slowStockPolicies')[0]?.deadDays ?? 180) }))
  const [report, setReport] = useState<Report | null>(null), [loading, setLoading] = useState(false), [error, setError] = useState('')
  const locations = records(state, 'locations'), customers = records(state, 'parties'), orders = records(state, 'orders'), shipments = records(state, 'shipments')
  useEffect(() => {
    const controller = new AbortController()
    setLoading(true); setError(''); setReport(null)
    void (async () => {
      try {
        const response = await fetch(`/api/pier/reports?${new URLSearchParams(query)}`, { credentials: 'same-origin', cache: 'no-store', signal: controller.signal })
        const result = await response.json() as Report & { error?: { message?: string } }
        if (!response.ok) throw new Error(result.error?.message || 'Reports could not be loaded.')
        if (!controller.signal.aborted) setReport(result as Report)
      } catch (cause) {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Reports could not be loaded.')
      } finally { if (!controller.signal.aborted) setLoading(false) }
    })()
    return () => controller.abort()
  }, [query, state.version])
  const parameters = report ? { currency: report.currency, asOf: report.asOf, timezone: 'UTC', method: report.method, from: query.from, to: query.to, deadStockDays: report.deadStock.days, revenueBasis: 'Actual shipments; excludes tax and financial refunds' } : {}
  const exportRows = (name: string, rows: object[]) => downloadCsv(`pier-${name}-${report?.asOf}`, rows, parameters)
  const warningPolicy = records(state, 'slowStockPolicies')[0]
  useEffect(() => { if (warningPolicy) setQuery(q => ({ ...q, days: String(warningPolicy.deadDays) })) }, [warningPolicy?.version])
  return <><div className="page-title"><h1>Reports</h1></div>
    <SlowStock state={state} run={run} busy={busy} />
    <Form title="Report dates" submit="Run reports" busy={loading} note="As-of stock is reconstructed at the end of the selected UTC day. The sales period includes both dates and ends no later than the as-of date." onSubmit={data => setQuery({ asOf: text(data, 'asOf'), from: text(data, 'from'), to: text(data, 'to'), days: text(data, 'days') })}>
      <Field label="As of (UTC)" name="asOf" type="date" defaultValue={query.asOf} max={today()} /><Field label="Sales from (UTC)" name="from" type="date" defaultValue={query.from} /><Field label="Sales through (UTC)" name="to" type="date" defaultValue={query.to} /><Field label="Dead stock inactivity (days)" name="days" type="number" min="1" max="36500" step="1" defaultValue={query.days} />
    </Form>
    {error && <p className="error" role="alert">{error}</p>}{loading && <p role="status">Loading reports…</p>}
    {report && <>
      <section className="panel"><h2>Report basis</h2><Facts values={[{ label: 'As of UTC day', value: day(report.asOf) }, { label: 'Cost method', value: methodName(report.method) }, { label: 'Currency', value: report.currency }, { label: 'Sales period (UTC)', value: `${day(query.from)} – ${day(query.to)}` }]} /><p className="muted">Revenue is recognized from actual shipments at saved order prices; COGS uses the stock costs consumed by those shipments. Tax and financial refunds are excluded; financial credit notes are not built. This is operational reporting, without general-ledger reconciliation. Unknown prices and costs make affected totals incomplete; they are never treated as zero. Amounts display to cents; CSV downloads retain exact decimals.</p></section>
      <section className="panel"><h2>Current low-stock report</h2><p>Current planning scope and position; this list follows the reorder list even when the valuation date is historical.</p><button onClick={() => exportRows('low-stock', report.lowStock)}>Download low-stock CSV</button><Table headings={['SKU', 'Destination', 'Position', 'Reorder point', 'Suggestion']}>{report.lowStock.map(row => <tr key={`${row.itemId}-${row.warehouse}`}><td><ItemName state={state} id={row.itemId} /></td><td>{row.scope === 'company' ? 'Company-wide → ' : ''}{row.warehouse}</td><td>{row.position}</td><td>{row.applied.reorderPoint}</td><td>{row.suggestedQuantity}</td></tr>)}</Table></section>
      <section className="panel"><h2>Overdue orders</h2><p className="muted">Unfinished orders due before the as-of day, with retained day-close misses for reconciliation. Current fulfillment state is shown; closed-day records preserve the state at closing.</p><button onClick={() => exportRows('overdue-orders', report.overdueOrders.rows)}>Download overdue orders CSV</button>{report.overdueOrders.rows.length ? <Table headings={['Order', 'Warehouse', 'Due', 'Current state', 'Reason']}>{report.overdueOrders.rows.map(row => <tr key={row.orderId}><td><a href={`#sales/${row.orderId}`}>{row.order}</a></td><td>{row.warehouse || 'Unassigned'}</td><td>{day(row.dueDate)}</td><td>{row.state}</td><td>{row.reason}</td></tr>)}</Table> : <Empty>No overdue orders.</Empty>}<h3>Retained dispatch closes</h3><button onClick={() => exportRows('dispatch-closes', report.overdueOrders.closedDays)}>Download dispatch closes CSV</button>{report.overdueOrders.closedDays.map(close => <article key={close.id}><h4>{day(close.date)} · {close.warehouse || 'All warehouses'}</h4><p>{close.ordersShipped} orders · {close.units} units · last out {close.lastShipmentAt || 'None'} ({close.timeZone})</p>{close.missed.map((miss: any) => <p key={miss.orderId}>{miss.order}: {miss.boardReason || miss.reason}</p>)}</article>)}</section>
      <section className="panel"><h2>Stock valuation</h2><p className="muted">Remaining FIFO layers or moving-average cost by SKU, location and status. Includes all owned sellable, quarantine and in-transit stock; reservations remain owned stock. Unknown cost quantities are listed separately.</p><Facts values={[{ label: 'Inventory value USD', value: <Amount value={report.valuation.total} unknown="Incomplete" /> }, { label: 'Unvalued quantity (base units)', value: report.valuation.unvaluedQuantity }]} />{!report.valuation.rows.length ? <Empty>No owned stock at this cutoff.</Empty> : <><button onClick={() => exportRows('valuation', report.valuation.rows)}>Download valuation CSV</button><Table numeric={[3, 4, 5]} headings={['Item', 'Location', 'Status', 'Quantity', 'Value USD', 'Unvalued quantity']}>{report.valuation.rows.map(row => <tr key={`${row.itemId}-${row.locationId}-${row.status}`}><td><ItemName state={state} id={row.itemId} /></td><td>{label(locations, row.locationId)}</td><td>{words(row.status)}</td><td>{row.quantity} {unit(state, row.itemId)}</td><td><Amount value={row.value} /></td><td>{row.unvaluedQuantity} {unit(state, row.itemId)}</td></tr>)}</Table></>}
        <h3>Operational value reconciliation</h3><p className="muted">Openings + receipts + returns + signed adjustments − COGS = closing inventory. Differences and unknown amounts need review.</p><button onClick={() => exportRows('reconciliation', [report.valuation.reconciliation])}>Download reconciliation CSV</button><Facts values={Object.entries(report.valuation.reconciliation).map(([key, value]) => ({ label: `${key === 'cogs' ? 'COGS' : words(key)} USD`, value: <Amount value={value} unknown="Incomplete" /> }))} />
      </section>
      <section className="panel"><h2>Shipment sales and gross margin</h2><Facts values={[{ label: 'Revenue USD', value: <Amount value={report.margin.revenue} unknown="Incomplete — unpriced" /> }, { label: 'COGS USD', value: <Amount value={report.margin.cost} unknown="Incomplete — unvalued" /> }, { label: 'Gross margin USD', value: <Amount value={report.margin.margin} unknown="Incomplete" /> }, { label: 'Unpriced / unvalued lines', value: `${report.margin.unpricedLines} / ${report.margin.unvaluedLines}` }]} />{!report.margin.rows.length ? <Empty>No shipped sales in this period.</Empty> : <><button onClick={() => exportRows('shipment-margin', report.margin.rows)}>Download shipment margin CSV</button><Table numeric={[6, 7, 8, 9]} headings={['Shipment', 'Order', 'Item', 'Customer', 'Channel', 'Date (UTC)', 'Shipped quantity', 'Revenue USD', 'COGS USD', 'Margin USD']}>{report.margin.rows.map((row, index) => <tr key={`${row.shipmentId}-${row.itemId}-${index}`}><td><a href={`#sales/${row.shipmentId}`}>{shipments.find(shipment => shipment.id === row.shipmentId)?.reference || row.shipmentId}</a></td><td><a href={`#sales/${row.orderId}`}>{reference(orders.find(order => order.id === row.orderId))}</a></td><td><ItemName state={state} id={row.itemId} /></td><td>{label(customers, row.customerId)}</td><td>{row.channel}</td><td>{day(row.date.slice(0, 10))}</td><td>{row.quantity} {unit(state, row.itemId)}</td><td><Amount value={row.revenue} unknown="Unpriced" /></td><td><Amount value={row.cost} /></td><td><Amount value={row.margin} unknown="Incomplete" /></td></tr>)}</Table></>}</section>
      <section className="panel"><h2>Kit margin after physical returns</h2><p>Operational kit sales at saved order prices less physically returned kits, with their actual component or assembly cost reversed. Financial tax and credit-note reconciliation remains in Books.</p></section>
      <MarginGroups title="Net kit margin" rows={report.kitMargins} name={key=><ItemName state={state} id={key}/>} exportRows={()=>exportRows('net-kit-margin',report.kitMargins)}/>
      <MarginGroups title="Margin by SKU" rows={report.margin.bySku} name={key => <ItemName state={state} id={key} />} exportRows={() => exportRows('margin-by-sku', report.margin.bySku)} />
      <MarginGroups title="Margin by channel" rows={report.margin.byChannel} name={key => key} exportRows={() => exportRows('margin-by-channel', report.margin.byChannel)} />
      <MarginGroups title="Margin by customer" rows={report.margin.byCustomer} name={key => label(customers, key)} exportRows={() => exportRows('margin-by-customer', report.margin.byCustomer)} />
      <section className="panel"><h2>Dead stock</h2><p className="muted">SKU/bin positions with owned stock and no sale shipment, kitting consumption or transfer out within {report.deadStock.days} days before the UTC cutoff, across all owned statuses. New stock ages from its first arrival; a sale shipment, kitting consumption or transfer out resets the inactivity clock. Receipts and physical returns do not reset an existing clock. Last movement includes any stock movement; imported sales history is not available.</p><Facts values={[{ label: 'Dead stock value USD', value: <Amount value={report.deadStock.total} unknown="Incomplete" /> }, { label: 'Inactivity threshold', value: `${report.deadStock.days} days` }]} />{!report.deadStock.rows.length ? <Empty>No stock meets this inactivity definition.</Empty> : <><button onClick={() => exportRows('dead-stock', report.deadStock.rows)}>Download dead stock CSV</button><Table numeric={[2, 3]} headings={['Item', 'Location', 'Owned quantity', 'Value USD', 'Last sale (UTC)', 'Last movement (UTC)']}>{report.deadStock.rows.map(row => <tr key={`${row.itemId}-${row.locationId}`}><td><ItemName state={state} id={row.itemId} /></td><td>{label(locations, row.locationId)}</td><td>{row.quantity} {unit(state, row.itemId)}</td><td><Amount value={row.value} /></td><td>{row.lastSale ? day(row.lastSale.slice(0, 10)) : 'No recorded sale'}</td><td>{row.lastMovement ? <a href="#activity">{day(row.lastMovement.slice(0, 10))}</a> : 'No recorded movement'}</td></tr>)}</Table></>}</section>
      <section className="panel"><h2>Cost method history</h2><p className="muted">Dated owner decisions. Changes use the server’s current date; backdating is unavailable. Historical reports use the method effective at their cutoff.</p>{!report.methodHistory.length ? <Empty>No cost method change recorded.</Empty> : <Table headings={['Effective date', 'Method', 'Recorded by', 'Reason']}>{report.methodHistory.map(row => <tr key={row.id}><td>{when(row.createdAt)}</td><td>{methodName(row.method)}</td><td>{person(state, row.actorId)}</td><td>{row.reason}</td></tr>)}</Table>}</section>
      {state.actor.role === 'owner' && <Form title="Change costing method" submit="Confirm current-date method change" busy={busy} note="This owner decision takes effect today on the server. Review the method and reason before confirming." onSubmit={data => run('costing.method', { method: text(data, 'method'), reason: text(data, 'reason'), confirm: data.get('confirm') === 'on' })}>
        <Select label="Costing method" name="method" rows={[{ id: 'fifo', version: 1, label: 'FIFO' }, { id: 'average', version: 1, label: 'Moving average' }]} /><Field label="Reason for method change" name="reason" /><label className="field"><span><input type="checkbox" name="confirm" required /> I confirm this current-date costing decision.</span></label>
      </Form>}
    </>}
  </>
}
