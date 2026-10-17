import { useEffect, useState } from 'react'
import { records, type PierState, type RunCommand } from '../api'
import { day, person, when } from '../display'
import { Badge, Empty, Facts, Table } from '../controls'
import { browserZone, hours, today, zones } from './clock'

// The day's dispatch summary for one warehouse time zone, read from Pier as it
// stands, and the day close that keeps it and sends the owner a copy.

type Summary = { date: string; timeZone: string; ordersShipped: number; shipments: number; units: string; lastShipmentAt: string | null; latestCutoff: string | null; allOut: boolean; due: number; byCarrier: any[]; byDock: any[]; exceptions: any[] }

function exception(e: any) {
  if (e.kind === 'not shipped') return `${e.order} did not ship: ${e.reason}.`
  if (e.kind === 'partly shipped') return `${e.order} partly shipped: ${e.shipped} of ${e.ordered} units out; the rest is ${e.reason}.`
  if (e.kind === 'short pick') return `Wave ${e.wave}, ${e.order}: bin ${e.bin} short${e.overflow ? `, picked from overflow ${e.overflow}` : ''}${e.unfilled !== '0' ? `, ${e.unfilled} not filled` : ''}.`
  if (e.kind === 'late') return `${e.order} left at ${hours(e.at)}, after the ${e.carrier} cut-off ${hours(e.cutoff)}.`
  return `${e.purchaseOrder}: ${e.kind}, expected ${e.expected}, received ${e.received}.`
}

export function Dispatch({ state, run, busy }: { state: PierState; run: RunCommand; busy: boolean }) {
  const first = records(state, 'carriers')[0]?.timeZone
  const [zone, setZone] = useState(first || (zones.includes(browserZone()) ? browserZone() : 'America/Chicago')), [date, setDate] = useState(today(zone))
  const [summary, setSummary] = useState<Summary | null>(null), [failure, setFailure] = useState('')
  useEffect(() => {
    let live = true
    fetch(`/api/pier/dispatch-summary?date=${encodeURIComponent(date)}&timeZone=${encodeURIComponent(zone)}`, { credentials: 'same-origin', cache: 'no-store' })
      .then(async response => { const body: any = await response.json(); if (!response.ok) throw new Error(body?.error?.message || 'The summary could not be loaded.'); if (live) { setSummary(body); setFailure('') } })
      .catch(cause => live && setFailure(cause.message))
    return () => { live = false }
  }, [date, zone, state.version])
  const closed = records(state, 'dispatchDays').slice().sort((a, b) => String(b.closedAt).localeCompare(String(a.closedAt)))
  const headline = !summary ? '' : summary.allOut ? `All ${summary.ordersShipped} ${summary.ordersShipped === 1 ? 'order' : 'orders'} out by ${hours(summary.lastShipmentAt)}` : summary.ordersShipped ? `${summary.ordersShipped} ${summary.ordersShipped === 1 ? 'order' : 'orders'} shipped · last at ${hours(summary.lastShipmentAt)}` : 'Nothing shipped yet'
  return <>
    <section className="panel"><h2>Dispatch summary</h2><div className="form-grid dispatch-filters"><label className="field"><span>Day</span><input aria-label="Day" type="date" value={date} onChange={event => event.target.value && setDate(event.target.value)} /></label><label className="field"><span>Warehouse time zone</span><select aria-label="Warehouse time zone" value={zone} onChange={event => setZone(event.target.value)}>{[...new Set([zone, ...zones])].map(value => <option key={value}>{value}</option>)}</select></label></div>
      {failure && <p className="error" role="alert">{failure}</p>}
      {summary && <><p className="dispatch-headline">{headline}</p><Facts values={[{ label: 'Orders shipped', value: summary.ordersShipped }, { label: 'Shipments', value: summary.shipments }, { label: 'Units', value: summary.units }, { label: 'Due that day', value: summary.due }]} />
        <h3>By carrier</h3>{summary.byCarrier.length ? <Table numeric={[3, 4, 5]} headings={['Carrier', 'Dock', 'Cut-off', 'Orders', 'Units', 'After cut-off', 'Last out']}>{summary.byCarrier.map(row => <tr key={row.carrierId || 'none'}><td>{row.carrier}</td><td>{row.dock}</td><td>{hours(row.cutoff)}</td><td>{row.orders}</td><td>{row.units}</td><td>{row.late}</td><td>{hours(row.lastAt)}</td></tr>)}</Table> : <Empty>No shipments on {day(summary.date)}.</Empty>}
        {summary.byDock.length > 0 && <><h3>By dock</h3><Table numeric={[1, 2, 3]} headings={['Dock', 'Orders', 'Shipments', 'Units']}>{summary.byDock.map(row => <tr key={row.dock}><td>{row.dock}</td><td>{row.orders}</td><td>{row.shipments}</td><td>{row.units}</td></tr>)}</Table></>}
        <h3>Exceptions</h3>{summary.exceptions.length ? <ul className="exceptions">{summary.exceptions.map((row, index) => <li key={index}><Badge>{row.kind}</Badge> {exception(row)}</li>)}</ul> : <p className="muted">No exceptions.</p>}
        <div className="actions"><button className="primary" disabled={busy} onClick={() => run('dispatch.close', { date, timeZone: zone })}>Close {day(date)} and email the owner</button></div></>}
    </section>
    <section className="panel"><h2>Closed days</h2>{!closed.length ? <Empty>No days closed yet.</Empty> : <Table numeric={[1]} headings={['Day', 'Orders shipped', 'Closed', 'Owner’s copy']}>{closed.map(row => <tr key={row.id}><td>{day(row.date)}<small>{row.timeZone}</small></td><td>{row.summary.ordersShipped}</td><td><span className="nowrap">{when(row.closedAt)}</span><small>{person(state, row.closedBy)}</small></td><td><Badge>{row.delivery.status}</Badge>{row.delivery.detail && <small>{row.delivery.detail}</small>}</td></tr>)}</Table>}</section>
  </>
}
