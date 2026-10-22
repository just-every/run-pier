import { SalesIntake } from './commercial'
import { useEffect, useState } from 'react'
import { records, type PierState, type RunCommand } from '../api'
import { Field, Form, Lines, Select, text } from '../controls'
import { AgentDock } from './agent'
import { useLineCosts } from './costs'
import { OrderCard } from './detail'
import { Fulfil } from './fulfil'
import { needsAttention } from './model'
import { Queue, visibleOrders, type QueueFilter } from './queue'
import { Pricing, Quarantine, Shipments } from './records'

// Sales orders, as the owner-picked workbench: the queue on the left, the open
// order on the right with its shortage and the agent docked beneath, then
// fulfilment, entry and the sales records.

export function Sales({ state, run, busy, documentId = '', warehouse = '', orderWarehouse = '' }: { state: PierState; run: RunCommand; busy: boolean; documentId?: string; warehouse?: string; orderWarehouse?: string }) {
  const [documentType,setDocumentType]=useState('order')
  const [selected, setSelected] = useState(documentId), [filter, setFilter] = useState<QueueFilter>({ chip: 'open', channel: '', carrier: '', sort: 'promise' }), [prefill, setPrefill] = useState(false)
  const [lines, setLines] = useState<{ itemId: string; quantity: string; price?: string }[]>([])
  const orders = records(state, 'orders'), items = records(state, 'items').filter(item => !item.archived), parties = records(state, 'parties'), locations = records(state, 'locations').filter(location => location.kind === 'bin')
  const costs = useLineCosts(state.version)
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
    {/* All adds a Warehouse column; workbench-all gives the customer name that room back. */}
    <div className={warehouse ? 'workbench' : 'workbench workbench-all'}>
      <Queue state={state} warehouse={warehouse} filter={filter} setFilter={setFilter} selected={order?.id ?? ''} open={open} />
      <div className="workbench-side">
        {order ? <OrderCard state={state} order={order} run={run} busy={busy} costs={costs} resolve={resolve} /> : <section className="order-card order-none"><h2>No order open</h2><p className="muted">Enter an order below or choose one from the queue.</p></section>}
        <AgentDock state={state} run={run} busy={busy} />
        {order && <Fulfil state={state} order={order} run={run} busy={busy} prefill={prefill} />}
      </div>
    </div>
    <div id="new-order"><Form title="New sales order" submit="Create and reserve available stock" busy={busy} note="Available stock reserves atomically. Unmet demand becomes backorder." onSubmit={data => run(text(data,'documentType') === 'quote' ? 'quote.create' : 'order.create', { customerId: text(data, 'customerId'), promiseDate: text(data, 'promiseDate'), channel: text(data, 'channel'), warehouse: text(data, 'warehouse'), ...(documentType==='quote'?{shipTo:{state:text(data,'state').toUpperCase(),country:'US',postalCode:text(data,'postalCode')},validUntil:text(data,'validUntil'),discountPercent:text(data,'discountPercent')} : {}),lines: lines.map(({ price, ...line }) => ({ ...line, ...(price?.trim() ? { price } : {}),...(documentType==='quote'?{unit:text(data,'quoteUnit')||undefined}:{}) })) })}><label className="field"><span>Document type</span><select name="documentType" aria-label="Document type" value={documentType} onChange={e=>setDocumentType(e.target.value)}><option value="order">Sales order</option><option value="quote">Versioned quote</option></select></label><Select label="Customer" name="customerId" rows={parties.filter(party => party.kind === 'customer')} /><Field label="Promise date" name="promiseDate" type="date" required={false} /><Select label="Order warehouse" name="warehouse" rows={[...new Set(locations.map(l => l.warehouse))].map(w => ({ id: w, version: 1, label: w }))} required={false} defaultValue={orderWarehouse || undefined} /><Field label="Channel" name="channel" defaultValue="manual" />{documentType==='quote'&&<><Field label="Quote valid through" name="validUntil" type="date" defaultValue={new Date(Date.now()+30*86400000).toISOString().slice(0,10)}/><Field label="Quote discount percent" name="discountPercent" defaultValue="0"/><Field label="Quote destination state" name="state"/><Field label="Quote destination ZIP" name="postalCode"/><label className="field"><span>Quote quantity unit</span><select name="quoteUnit" aria-label="Quote quantity unit"><option value="">Item base units</option><option value="case">Cases</option></select></label></>}<Lines items={items} price optionalPrice onChange={setLines} /></Form></div>
    <div className="split sales-records"><Shipments state={state} run={run} busy={busy} orderId={selected} /><Quarantine state={state} run={run} busy={busy} /></div>
    <SalesIntake state={state} run={run} busy={busy} />
    <Pricing state={state} run={run} busy={busy} />
  </>
}
