import { useEffect, useState } from 'react'
import { records, type PierState, type RunCommand } from '../api'
import { day, person, when } from '../display'
import { Badge, Empty, Facts, Table } from '../controls'
import { browserZone, hours, today, zones } from './clock'

// The day's dispatch summary for one warehouse time zone, read from Pier as it
// stands, and the day close that keeps it and sends the owner a copy.

type Summary = { warehouse: string | null; counts: Record<string, number>; orders: any[]; pickups: any[]; riskBasis: string; date: string; timeZone: string; ordersShipped: number; shipments: number; units: string; lastShipmentAt: string | null; latestCutoff: string | null; allOut: boolean; due: number; byCarrier: any[]; byDock: any[]; exceptions: any[] }

function download(name: string, value: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }))
  const link = document.createElement('a'); link.href = url; link.download = `${name}.json`; link.click(); URL.revokeObjectURL(url)
}

function exception(e: any) {
  if (e.kind === 'not shipped') return `${e.order} did not ship: ${e.reason}.`
  if (e.kind === 'partly shipped') return `${e.order} partly shipped: ${e.shipped} of ${e.ordered} units out; the rest is ${e.reason}.`
  if (e.kind === 'short pick') return `Wave ${e.wave}, ${e.order}: bin ${e.bin} short${e.overflow ? `, picked from overflow ${e.overflow}` : ''}${e.unfilled !== '0' ? `, ${e.unfilled} not filled` : ''}.`
  if (e.kind === 'late') return `${e.order} left at ${hours(e.at)}, after the ${e.carrier} cut-off ${hours(e.cutoff)}.`
  return `${e.purchaseOrder}: ${e.kind}, expected ${e.expected}, received ${e.received}.`
}

export function Dispatch({ state, run, busy }: { state: PierState; run: RunCommand; busy: boolean }) {
  const warehouses = [...new Set([...records(state, 'locations'), ...records(state, 'carriers')].map(r => String(r.warehouse || '')).filter(Boolean))]
  const [warehouse, setWarehouse] = useState(warehouses[0] || '')
  const first = records(state, 'carriers').find(c => c.warehouse === warehouse)?.timeZone
  const [zone, setZone] = useState(first || (zones.includes(browserZone()) ? browserZone() : 'America/Chicago')), [date, setDate] = useState(today(zone))
  const [summary, setSummary] = useState<Summary | null>(null), [failure, setFailure] = useState('')
  useEffect(() => {
    let live = true
    setSummary(null)
    fetch(`/api/pier/dispatch-summary?date=${encodeURIComponent(date)}&timeZone=${encodeURIComponent(zone)}&warehouse=${encodeURIComponent(warehouse)}`, { credentials: 'same-origin', cache: 'no-store' })
      .then(async response => { const body: any = await response.json(); if (!response.ok) throw new Error(body?.error?.message || 'The summary could not be loaded.'); if (live) { setSummary(body); setFailure('') } })
      .catch(cause => live && setFailure(cause.message))
    return () => { live = false }
  }, [date, zone, warehouse, state.version])
  useEffect(() => { if (first) { setZone(first); setDate(today(first)) } }, [warehouse, first])
  const closed = records(state, 'dispatchDays').slice().sort((a, b) => String(b.closedAt).localeCompare(String(a.closedAt)))
  const headline = !summary ? '' : summary.allOut ? `All ${summary.ordersShipped} ${summary.ordersShipped === 1 ? 'order' : 'orders'} out by ${hours(summary.lastShipmentAt)}` : summary.ordersShipped ? `${summary.ordersShipped} ${summary.ordersShipped === 1 ? 'order' : 'orders'} shipped · last at ${hours(summary.lastShipmentAt)}` : 'Nothing shipped yet'
  return <>
    <section className="panel"><h2>Dispatch board</h2><div className="form-grid dispatch-filters"><label className="field"><span>Warehouse</span><select aria-label="Warehouse" value={warehouse} onChange={event => setWarehouse(event.target.value)}>{warehouses.map(value => <option key={value}>{value}</option>)}</select></label><label className="field"><span>Day</span><input aria-label="Day" type="date" value={date} onChange={event => event.target.value && setDate(event.target.value)} /></label><label className="field"><span>Warehouse time zone</span><select aria-label="Warehouse time zone" value={zone} onChange={event => setZone(event.target.value)}>{[...new Set([zone, ...zones])].map(value => <option key={value}>{value}</option>)}</select></label></div>
      {failure && <p className="error" role="alert">{failure}</p>}
      {summary && <><p className="dispatch-headline">{headline}</p><Facts values={[{ label: 'Orders shipped', value: summary.ordersShipped }, { label: 'Shipments', value: summary.shipments }, { label: 'Units', value: summary.units }, { label: 'Due that day', value: summary.due }]} />
        <h3>Due orders by state</h3><Facts values={Object.entries(summary.counts).map(([label, value]) => ({ label, value }))} /><p className="muted">{summary.riskBasis}</p>
        {summary.orders.length ? <Table headings={['Order', 'State', 'Carrier / cut-off', 'Risk / next step']}>{summary.orders.map(order => <tr key={order.orderId}><td><a href={`#sales/${order.orderId}`}>{order.order}</a></td><td><Badge>{order.state}</Badge></td><td>{order.carrier}<small>{hours(order.cutoff)} {order.timeZone}</small></td><td>{order.atRisk ? <><Badge>{order.beforeCutoff ? 'At risk before cut-off' : 'At risk'}</Badge><small>{order.riskReason}</small></> : 'Dispatched'}</td></tr>)}</Table> : <Empty>No orders due this day.</Empty>}
        <h3>Pickup schedule</h3><Table headings={['Carrier', 'Dock', 'Cut-off', 'Time zone']}>{summary.pickups.map(pickup => <tr key={pickup.carrierId}><td>{pickup.carrier}</td><td>{pickup.dock}</td><td>{hours(pickup.cutoff)}</td><td>{pickup.timeZone}</td></tr>)}</Table>
        <button onClick={() => download(`pier-dispatch-${date}`, summary)}>Download board JSON</button>
        <h3>By carrier</h3>{summary.byCarrier.length ? <Table numeric={[3, 4, 5]} headings={['Carrier', 'Dock', 'Cut-off', 'Orders', 'Units', 'After cut-off', 'Last out']}>{summary.byCarrier.map(row => <tr key={row.carrierId || 'none'}><td>{row.carrier}</td><td>{row.dock}</td><td>{hours(row.cutoff)}</td><td>{row.orders}</td><td>{row.units}</td><td>{row.late}</td><td>{hours(row.lastAt)}</td></tr>)}</Table> : <Empty>No shipments on {day(summary.date)}.</Empty>}
        {summary.byDock.length > 0 && <><h3>By dock</h3><Table numeric={[1, 2, 3]} headings={['Dock', 'Orders', 'Shipments', 'Units']}>{summary.byDock.map(row => <tr key={row.dock}><td>{row.dock}</td><td>{row.orders}</td><td>{row.shipments}</td><td>{row.units}</td></tr>)}</Table></>}
        <h3>Exceptions</h3>{summary.exceptions.length ? <ul className="exceptions">{summary.exceptions.map((row, index) => <li key={index}><Badge>{row.kind}</Badge> {exception(row)}</li>)}</ul> : <p className="muted">No exceptions.</p>}
        <div className="actions"><button className="primary" disabled={busy} onClick={() => run('dispatch.close', { date, timeZone: zone, warehouse })}>Close {day(date)} and email the owner</button></div></>}
    </section>
    <section className="panel"><h2>Closed days</h2>{!closed.length ? <Empty>No days closed yet.</Empty> : <Table numeric={[1]} headings={['Day / warehouse', 'Orders shipped', 'Closed', 'Owner’s copy', 'Retained record']}>{closed.map(row => <tr key={row.id}><td>{day(row.date)}<small>{row.warehouse || 'All warehouses'} · {row.timeZone}</small></td><td>{row.summary.ordersShipped}</td><td><span className="nowrap">{when(row.closedAt)}</span><small>{person(state, row.closedBy)}</small></td><td><Badge>{row.delivery.status}</Badge>{row.delivery.detail && <small>{row.delivery.detail}</small>}</td><td><button onClick={() => download(`pier-dispatch-close-${row.date}`, row)}>Download day-close JSON</button><small>{row.summary.units} units · last out {hours(row.summary.lastShipmentAt)}</small>{row.summary.exceptions.filter((e: any) => ['not shipped', 'partly shipped'].includes(e.kind)).map((e: any) => <small key={e.orderId}>{exception(e)}</small>)}</td></tr>)}</Table>}</section>
  </>
}
