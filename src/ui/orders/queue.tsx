import { label, records, type PierState, type RecordData } from '../api'
import { Amount } from '../controls'
import { Icon } from '../icons'
import { ChannelMark } from './channel'
import { WordClip } from './clip'
import { channelName, inWarehouse, isOpen, needsAttention, orderStatus, orderWarehouses, shipDay } from './model'

// The order queue: filter chips over one dense row per order, newest promise
// first by default. A row opens its order in the detail panel beside it.

export type QueueFilter = { chip: string; channel: string; carrier: string; sort: string }
const today = () => new Date().toLocaleDateString('en-CA')
const shippedToday = (state: PierState, order: RecordData) => records(state, 'shipments').some(row => row.orderId === order.id && new Date(row.createdAt).toLocaleDateString('en-CA') === today())
export const chips: { id: string; title: string; test: (state: PierState, order: RecordData) => boolean }[] = [
  { id: 'open', title: 'Open', test: (_, order) => isOpen(order) },
  { id: 'backorder', title: 'Backorder', test: (_, order) => isOpen(order) && order.lines.some((line: any) => line.backorder !== '0') },
  { id: 'attention', title: 'Needs attention', test: (_, order) => needsAttention(order) },
  { id: 'shipped', title: 'Shipped today', test: shippedToday },
  { id: 'all', title: 'All', test: () => true },
]

export function visibleOrders(state: PierState, warehouse: string, filter: QueueFilter) {
  const chip = chips.find(row => row.id === filter.chip) ?? chips[0]
  const rows = records(state, 'orders').filter(order => inWarehouse(state, order, warehouse) && chip.test(state, order) && (!filter.channel || (order.channel || 'manual') === filter.channel) && (!filter.carrier || order.carrierId === filter.carrier))
  const promise = (order: RecordData) => order.promiseDate || '9999-12-31'
  return filter.sort === 'reference' ? rows.slice().reverse() : rows.slice().sort((a, b) => promise(a).localeCompare(promise(b)) || String(a.reference).localeCompare(String(b.reference)))
}

export function Pill({ order }: { order: RecordData }) {
  const status = orderStatus(order), attention = needsAttention(order)
  const tone = attention ? 'attention' : status === 'Backorder' ? 'backorder' : status === 'Closed' ? 'closed' : 'open'
  return <span className={`pill pill-${tone}`}>{attention ? 'Needs attention' : status}</span>
}

export function Queue({ state, warehouse, filter, setFilter, selected, open }: { state: PierState; warehouse: string; filter: QueueFilter; setFilter: (filter: QueueFilter) => void; selected: string; open: (id: string) => void }) {
  const parties = records(state, 'parties'), carriers = records(state, 'carriers')
  const scoped = records(state, 'orders').filter(order => inWarehouse(state, order, warehouse))
  const rows = visibleOrders(state, warehouse, filter), channels = [...new Set(records(state, 'orders').map(order => String(order.channel || 'manual')))]
  const late = (order: RecordData) => isOpen(order) && order.promiseDate && order.promiseDate <= today()
  return <div className="queue">
    <div className="chips" role="group" aria-label="Order status">{chips.map(chip => { const count = scoped.filter(order => chip.test(state, order)).length; return <button key={chip.id} type="button" className={`chip chip-${chip.id}`} aria-pressed={filter.chip === chip.id} onClick={() => setFilter({ ...filter, chip: chip.id })}>{chip.title}<b>{count}</b></button> })}</div>
    <div className="queue-tools"><Icon name="filter" />
      <select aria-label="Channel" value={filter.channel} onChange={event => setFilter({ ...filter, channel: event.target.value })}><option value="">All channels</option>{channels.map(value => <option key={value} value={value}>{channelName(value)}</option>)}</select>
      <select aria-label="Carrier" value={filter.carrier} onChange={event => setFilter({ ...filter, carrier: event.target.value })}><option value="">All carriers</option>{carriers.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select>
      <select aria-label="Sort orders" value={filter.sort} onChange={event => setFilter({ ...filter, sort: event.target.value })}><option value="promise">Ship by date</option><option value="reference">Newest order</option></select>
    </div>
    {!rows.length ? <p className="queue-empty">{scoped.length ? 'No orders match these filters.' : warehouse ? `No sales orders ship from ${warehouse}.` : 'No sales orders. Add a customer and items in Stock, then enter an order.'}</p> :
    <table className="queue-table"><thead><tr><th scope="col">Order</th><th scope="col" className="q-customer">Customer</th>{!warehouse && <th scope="col">Warehouse</th>}<th scope="col">Channel</th>{!!warehouse && <th scope="col" className="num">Lines</th>}<th scope="col" className="num">Order total</th><th scope="col">Ship by</th><th scope="col">Status</th></tr></thead>
      <tbody>{rows.map(order => <tr key={order.id} className={order.id === selected ? 'selected' : undefined} onClick={event => { if (!(event.target as HTMLElement).closest('button')) open(order.id) }}>
        <td className="q-ref"><button type="button" className="link" aria-label={`Open order ${order.reference}`} aria-current={order.id === selected ? 'true' : undefined} onClick={() => open(order.id)}>{order.reference}</button></td>
        <WordClip className="q-customer" text={label(parties, order.customerId)} />
        {!warehouse && <td className="q-where" title={orderWarehouses(state, order).join(', ')}>{orderWarehouses(state, order).join(', ') || '—'}</td>}
        <td className="q-channel"><ChannelMark channel={order.channel} /></td>
        {!!warehouse && <td className="q-lines num">{order.lines.length}<span className="q-unit"> lines</span></td>}
        <td className="q-total num"><Amount value={order.total} unknown="Unpriced" dollars /></td>
        <td className={late(order) ? 'q-ship late' : 'q-ship'}>{order.promiseDate ? shipDay(order.promiseDate) : 'No date'}</td>
        <td className="q-status"><Pill order={order} /></td>
      </tr>)}</tbody></table>}
  </div>
}
