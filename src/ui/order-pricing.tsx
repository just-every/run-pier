// Price a sales order whose lines arrived without prices (a channel order, or one
// entered before a customer price existed). Saved prices never change here.
import { itemLabel, records, unit, type PierState, type RunCommand } from './api'
import { Field, Form, text } from './controls'

export function OrderPricing({ state, order, run, busy }: { state: PierState; order: any; run: RunCommand; busy: boolean }) {
  const open = order.lines.filter((line: any) => line.price === null)
  if (!open.length) return null
  const channelOrder = records(state, 'channelOrders').find(row => row.orderId === order.id)
  const sku = (itemId: string) => records(state, 'items').find(item => item.id === itemId)?.sku
  const charged = (itemId: string): string | undefined => channelOrder?.source?.lines?.find((line: any) => line.sku === sku(itemId))?.price
  return <Form title="Price this order" submit="Save prices" busy={busy} note="The sales invoice for its shipments posts to Books once every line has a price. Enter the unit price the customer paid, before tax and shipping." onSubmit={data => run('order.price', { orderId: order.id, version: order.version, lines: open.map((line: any) => ({ orderLineId: line.id, price: text(data, line.id) })) })}>
    {open.map((line: any) => <Field key={line.id} label={`${itemLabel(state, line.itemId)} · unit price (USD per ${unit(state, line.itemId)})`} name={line.id} inputMode="decimal" defaultValue={charged(line.itemId) ?? ''} hint={charged(line.itemId) ? `The channel charged ${charged(line.itemId)} USD each.` : `Ordered ${line.quantity} ${unit(state, line.itemId)}.`} />)}
  </Form>
}
