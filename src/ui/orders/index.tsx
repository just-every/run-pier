import { useEffect, useState } from 'react'
import { records, type PierState, type RunCommand } from '../api'
import { Field, Form, Lines, Select, text } from '../controls'
import { AgentDock } from './agent'
import { useUnitCosts } from './costs'
import { OrderCard } from './detail'
import { Fulfil } from './fulfil'
import { needsAttention } from './model'
import { Queue, visibleOrders, type QueueFilter } from './queue'
import { Pricing, Quarantine, Shipments } from './records'

// Sales orders, as the owner-picked workbench: the queue on the left, the open
// order on the right with its shortage and the agent docked beneath, then
// fulfilment, entry and the sales records.

export function Sales({ state, run, busy, documentId = '', warehouse = '' }: { state: PierState; run: RunCommand; busy: boolean; documentId?: string; warehouse?: string }) {
  const [selected, setSelected] = useState(documentId), [filter, setFilter] = useState<QueueFilter>({ chip: 'open', channel: '', carrier: '', sort: 'promise' }), [prefill, setPrefill] = useState(false)
  const [lines, setLines] = useState<{ itemId: string; quantity: string; price?: string }[]>([])
  const orders = records(state, 'orders'), items = records(state, 'items').filter(item => !item.archived), parties = records(state, 'parties'), locations = records(state, 'locations').filter(location => location.kind === 'bin')
  const costs = useUnitCosts(state.version)
  useEffect(() => { if (documentId) { const shipment = records(state, 'shipments').find(row => row.id === documentId); setSelected(shipment?.orderId || documentId) } }, [documentId, state])
  const visible = visibleOrders(state, warehouse, filter)
  const order = orders.find(row => row.id === selected) ?? visible.find(needsAttention) ?? visible[0]
  function open(id: string) { setSelected(id); setPrefill(false); window.location.hash = `sales/${id}` }
  function resolve(choice: string) {
    if (!order) return
    if (choice === 'split') setPrefill(true)
    requestAnimationFrame(() => { const target = document.getElementById(`${choice === 'split' ? 'dispatch' : 'promise'}-${order.id}`); target?.scrollIntoView({ block: 'start', behavior: 'smooth' }); target?.querySelector<HTMLInputElement>('input:not([type=checkbox])')?.focus({ preventScroll: true }) })
  }
  return <>
    <div className="page-title"><h1>Sales orders</h1><div className="actions"><a className="button primary" href="#new-order" onClick={event => { event.preventDefault(); document.getElementById('new-order')?.scrollIntoView({ block: 'start', behavior: 'smooth' }) }}>New sales order</a></div></div>
    <div className="workbench">
      <Queue state={state} warehouse={warehouse} filter={filter} setFilter={setFilter} selected={order?.id ?? ''} open={open} />
      <div className="workbench-side">
        {order ? <OrderCard state={state} order={order} run={run} busy={busy} costs={costs} resolve={resolve} /> : <section className="order-card order-none"><h2>No order open</h2><p className="muted">Enter an order below or choose one from the queue.</p></section>}
        <AgentDock state={state} run={run} busy={busy} />
        {order && <Fulfil state={state} order={order} run={run} busy={busy} prefill={prefill} />}
      </div>
    </div>
    <div id="new-order"><Form title="New sales order" submit="Create and reserve available stock" busy={busy} note="Available stock reserves atomically. Unmet demand becomes backorder." onSubmit={data => run('order.create', { customerId: text(data, 'customerId'), promiseDate: text(data, 'promiseDate'), channel: text(data, 'channel'), warehouse: text(data, 'warehouse'), lines: lines.map(({ price, ...line }) => ({ ...line, ...(price?.trim() ? { price } : {}) })) })}><Select label="Customer" name="customerId" rows={parties.filter(party => party.kind === 'customer')} /><Field label="Promise date" name="promiseDate" type="date" required={false} /><Select label="Order warehouse" name="warehouse" rows={[...new Set(locations.map(l => l.warehouse))].map(w => ({ id: w, version: 1, label: w }))} required={false} defaultValue={warehouse || undefined} /><Field label="Channel" name="channel" defaultValue="manual" /><Lines items={items} price optionalPrice onChange={setLines} /></Form></div>
    <div className="split sales-records"><Shipments state={state} run={run} busy={busy} orderId={selected} /><Quarantine state={state} run={run} busy={busy} /></div>
    <Pricing state={state} run={run} busy={busy} />
  </>
}
