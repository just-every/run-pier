import { records } from '../api'
import { Empty, Table } from '../controls'
import { when } from '../display'
import { connections, type ChannelOrder, type ChannelProps } from './model'

export function ChannelOrders({ state }: ChannelProps) {
  const rows = records(state, 'channelOrders') as ChannelOrder[], channels = connections(state)
  const queued = rows.filter(row => !row.orderId).length
  return <section className="channel-orders" aria-labelledby="channel-orders-title"><div className="channel-section-heading"><h2 id="channel-orders-title"><span className="channel-diamond" aria-hidden="true" />Channel orders</h2><span className="muted">{queued} waiting for reservation</span></div>
    {!rows.length ? <Empty>No channel orders received yet.</Empty> : <Table headings={['Channel', 'Order', 'Reservation', 'Reason / result']}>{rows.map(row => <tr key={row.id}><td>{channels.find(channel => channel.id === row.channelId)?.name ?? 'Removed connection'}</td><td>{row.orderId ? <a href={`#sales/${encodeURIComponent(row.orderId)}`}>{row.reference || row.externalId}</a> : row.reference || row.externalId}</td><td>{row.reservedAt ? when(row.reservedAt) : 'Queued · not reserved'}</td><td>{row.problem ? <span className="channel-problem">{row.problem}</span> : row.orderId ? 'Linked to Pier order' : 'Waiting for matching and stock checks'}</td></tr>)}</Table>}
  </section>
}
