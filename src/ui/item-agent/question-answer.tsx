import { records, type PierState } from '../api'
import { Amount, Evidence, Facts, Table } from '../controls'
import { day, when } from '../display'

export function QuestionAnswer({ state, answer }: { state: PierState; answer: any }) {
  const item = (id: string) => records(state, 'items').find(row => row.id === id)?.name ?? 'Removed item'
  const unit = (id: string) => records(state, 'items').find(row => row.id === id)?.unit ?? ''
  const bin = (id: string) => records(state, 'locations').find(row => row.id === id)?.name ?? 'Removed bin'
  const po = (id: string) => records(state, 'purchaseOrders').find(row => row.id === id)?.reference ?? id
  const value = (amount: unknown) => <Amount value={amount} dollars unknown="Unknown" />
  const date = (value: string | null) => value ? day(value) : 'Not set'
  return <>
    {answer.kind === 'stock' && <><h3>{item(answer.itemId)}</h3><Facts values={[
      { label: `On hand (${answer.unit})`, value: answer.answer.onHand }, { label: `Reserved (${answer.unit})`, value: answer.answer.reserved }, { label: `Available (${answer.unit})`, value: answer.answer.available },
    ]} /><Table headings={['Bin', 'Condition', 'On hand', 'Reserved', 'Available']}>{answer.evidence.map((row: any, i: number) => <tr key={i}><td>{bin(row.locationId)}</td><td>{row.status}</td><td>{row.quantity}</td><td>{row.reserved}</td><td>{row.available}</td></tr>)}</Table></>}
    {answer.kind === 'shortage' && <><h3>{answer.order.reference} · {answer.order.warehouse}</h3>{answer.lines.map((line: any) => <div key={line.orderLineId}><h4>{item(line.itemId)}</h4><Facts values={[
      { label: `Remaining (${line.unit})`, value: line.remaining }, { label: `Reserved (${line.unit})`, value: line.reserved }, { label: `Backordered (${line.unit})`, value: line.backorder },
    ]} /><p>{line.explanation}</p><Table headings={['Bin', 'Condition', 'On hand', 'Reserved', 'Available']}>{line.stock.map((row: any, i: number) => <tr key={i}><td>{bin(row.locationId)}</td><td>{row.status}</td><td>{row.quantity}</td><td>{row.reserved}</td><td>{row.available}</td></tr>)}</Table></div>)}</>}
    {answer.kind === 'late' && <><h3>{answer.evidence.length ? 'Outstanding late purchases' : 'No recorded late purchases'}</h3><Table headings={['Purchase', 'Requested', 'Outstanding quantity']}>{answer.evidence.map((row: any) => <tr key={row.id}><td><a href={`#purchasing/${row.id}`}>{po(row.id)}</a></td><td>{date(row.promiseDate)}</td><td>{row.lines.filter((line: any) => Number(line.remaining) > 0).map((line: any) => <div key={line.itemId}>{item(line.itemId)} · {line.remaining} {unit(line.itemId)}</div>)}</td></tr>)}</Table></>}
    {answer.kind === 'margin' && <><h3>Recorded goods margin · USD</h3>{answer.orders.map((order: any) => <div key={order.orderId}><h4>{order.reference}</h4><p>{order.assessment}</p><Facts values={[{ label: 'Goods revenue', value: value(order.revenue) }, { label: 'Retained goods cost', value: value(order.cost) }, { label: 'Margin', value: value(order.margin) }]} /><Table headings={['Item', 'Quantity', 'Costed', 'Unknown cost quantity', 'Goods margin']}>{order.lines.map((line: any) => <tr key={line.orderLineId}><td>{item(line.itemId)}</td><td>{line.quantity} {line.unit}</td><td>{line.costedQuantity}</td><td>{line.uncostedQuantity}</td><td>{value(line.margin)}</td></tr>)}</Table></div>)}</>}
    {answer.kind === 'supplier' && <><h3>{po(answer.before.poId)} · proposed supplier {answer.supplier.name}</h3><Facts values={[{ label: 'Current landed cash', value: value(answer.before.cash.total) }, { label: 'Proposed landed cash', value: value(answer.after.cash.total) }, { label: 'Cash change (USD)', value: value(answer.cashDelta) }, { label: 'Requested date', value: `${date(answer.before.promiseDate)} → ${date(answer.after.promiseDate)}` }]} />
      <Table headings={['Item', 'Quantity', 'Current unit price', 'Proposed unit price', 'Lead days']}>{answer.after.lines.map((line: any, i: number) => <tr key={line.itemId}><td>{item(line.itemId)}</td><td>{line.quantity} {unit(line.itemId)}</td><td>{value(answer.before.lines[i].price)}</td><td>{value(line.price)}</td><td>{line.leadDays ?? 'Unknown'}</td></tr>)}</Table>
      {answer.affectedPromises.map((plan: any) => <p key={plan.orderId}>{records(state, 'orders').find(order => order.id === plan.orderId)?.reference ?? plan.orderId}: {plan.effect}</p>)}
    </>}
    {answer.kind === 'allocation' && <><h3>Compare {answer.quantity} {answer.unit} of {item(answer.itemId)}</h3><Table headings={['Order', 'Reserved before', 'Reserved after', 'Backorder before', 'Backorder after']}>{answer.before.flatMap((before: any, i: number) => before.lines.filter((line: any) => line.itemId === answer.itemId).map((line: any) => {
      const after = answer.after[i].lines.find((next: any) => next.orderLineId === line.orderLineId)
      return <tr key={line.orderLineId}><td>{before.order.reference}</td><td>{line.reserved}</td><td>{after.reserved}</td><td>{line.backorder}</td><td>{after.backorder}</td></tr>
    }))}</Table></>}
    <p>{answer.uncertainty}</p>
    <p>Committed version {answer.stateVersion} · observed {when(answer.observedAt)}</p>
    <details><summary>Cited records and exact comparison</summary><p>{answer.basis}</p><Evidence value={answer} /></details>
  </>
}
