import { records } from '../api'
import { Empty, Field, Select, text } from '../controls'
import { ItemName } from '../display'
import { warehouses, type ChannelProps, type Hold } from './model'

export function TransferHolds({ state, run, busy }: ChannelProps) {
  const rows = (records(state, 'channelHolds') as Hold[]).filter(row => !row.releasedAt)
  const items = records(state, 'items').filter(row => !row.archived), warehouseRows = warehouses(state)
  return <section className="panel channel-holds"><h2><span className="channel-diamond" aria-hidden="true" />Global FBA transfer holds</h2>
    <p className={rows.length ? 'channel-hold-notice' : 'muted'}>{rows.length ? `${rows.length} active ${rows.length === 1 ? 'hold' : 'holds'}. Held stock is unavailable to all channels and new reservations in its warehouse until released.` : 'No stock is held for transfer.'}</p>
    {rows.length > 0 && <ul className="channel-hold-list">{rows.map(row => <li key={row.id}><div><strong><ItemName state={state} id={row.itemId} /></strong><small>{row.warehouse} · {row.quantity} {records(state, 'items').find(item => item.id === row.itemId)?.unit ?? 'base units'}</small><p>{row.reason}</p></div>{state.actor.role === 'owner' && <button disabled={busy} onClick={() => void run('channel.release', { holdId: row.id, version: row.version })} aria-label={`Release hold for ${records(state, 'items').find(item => item.id === row.itemId)?.sku ?? row.itemId}`}>Release</button>}</li>)}</ul>}
    {state.actor.role === 'owner' && <details className="channel-hold-editor"><summary>Add transfer hold</summary>{!items.length || !warehouseRows.length ? <Empty>Create a stock item and a warehouse bin before adding a hold.</Empty> : <form onSubmit={async event => {
      event.preventDefault(); if (busy) return
      const form = event.currentTarget, data = new FormData(form)
      if (await run('channel.hold', { itemId: text(data, 'itemId'), warehouse: text(data, 'warehouse'), quantity: text(data, 'quantity'), reason: text(data, 'reason') })) form.reset()
    }}><div className="form-grid"><Select label="Item to hold" name="itemId" rows={items} /><Select label="Hold warehouse" name="warehouse" rows={warehouseRows} defaultValue={warehouseRows.length === 1 ? warehouseRows[0].id : ''} /><Field label="Hold quantity (base units)" name="quantity" inputMode="decimal" pattern="[0-9]+([.][0-9]{1,6})?" disabled={busy} /><Field label="Hold reason" name="reason" disabled={busy} /></div><div className="form-actions"><button type="submit" className="primary" disabled={busy}>Hold stock</button></div></form>}</details>}
  </section>
}
