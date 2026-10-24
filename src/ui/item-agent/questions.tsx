import { useEffect, useRef, useState } from 'react'
import { records, type PierState, type RecordData } from '../api'
import { Evidence, Field, Select } from '../controls'

type Question = 'stock' | 'late' | 'shortage' | 'margin' | 'supplier' | 'allocation'
const questions: { id: Question; label: string; global?: boolean }[] = [
  { id: 'stock', label: 'What stock is available?' },
  { id: 'shortage', label: 'Why is an order short?' },
  { id: 'late', label: 'Which purchases are late?', global: true },
  { id: 'margin', label: 'Which orders lose margin?', global: true },
  { id: 'supplier', label: 'What would changing supplier or purchase date do?', global: true },
  { id: 'allocation', label: 'What would reallocating reserved stock do?', global: true },
]

export function LiveQuestions({ state }: { state: PierState }) {
  const restricted = state.actor.role !== 'owner' && (state.actor as { permissions?: unknown }).permissions !== undefined
  const [kind, setKind] = useState<Question>('stock'), [itemId, setItemId] = useState(''), [orderId, setOrderId] = useState('')
  const [orders, setOrders] = useState<RecordData[]>([]), [choicesBusy, setChoicesBusy] = useState(false), [choicesProblem, setChoicesProblem] = useState('')
  const [poId, setPoId] = useState(''), [supplierId, setSupplierId] = useState(''), [promiseDate, setPromiseDate] = useState('')
  const [fromOrderId, setFromOrderId] = useState(''), [toOrderId, setToOrderId] = useState(''), [quantity, setQuantity] = useState('')
  const [answer, setAnswer] = useState<unknown>(null), [busy, setBusy] = useState(false), [problem, setProblem] = useState('')
  const inFlight = useRef(false), request = useRef<AbortController | null>(null)
  const drafts = records(state, 'purchaseOrders').filter(po => po.status === 'draft' && !po.dropshipId)
  const suppliers = records(state, 'parties').filter(party => party.kind === 'supplier')
  // The scoped state intentionally contains no commercial order collection.
  // Fetch only the minimal warehouse-authorized choices from the question door.
  useEffect(() => {
    const controller = new AbortController()
    request.current?.abort(); setAnswer(null); setOrders([]); setChoicesBusy(true); setChoicesProblem('')
    void fetch('/api/pier/questions?kind=orders', { credentials: 'same-origin', cache: 'no-store', signal: controller.signal }).then(async response => {
      const body = await response.json()
      if (!response.ok) throw new Error(body.error?.message ?? 'Order choices could not be loaded.')
      if (!controller.signal.aborted) setOrders(body.orders.map((order: RecordData) => ({ ...order, label: `${order.reference ?? order.id} · ${order.warehouse ?? 'Unassigned warehouse'}` })))
    }).catch(cause => { if (!controller.signal.aborted) setChoicesProblem((cause as Error).message) }).finally(() => { if (!controller.signal.aborted) setChoicesBusy(false) })
    return () => { controller.abort(); request.current?.abort() }
  }, [state.version, state.actor.id, restricted])

  function changeQuestion(value: Question) { request.current?.abort(); setKind(value); setAnswer(null); setProblem('') }
  async function ask() {
    if (inFlight.current) return
    inFlight.current = true; setBusy(true); setProblem(''); setAnswer(null)
    const controller = new AbortController(); request.current = controller
    const params = new URLSearchParams({ kind })
    if (kind === 'stock') params.set('itemId', itemId)
    if (kind === 'shortage' || (kind === 'margin' && orderId)) params.set('orderId', orderId)
    if (kind === 'supplier') { params.set('poId', poId); params.set('supplierId', supplierId); params.set('promiseDate', promiseDate) }
    if (kind === 'allocation') { params.set('fromOrderId', fromOrderId); params.set('toOrderId', toOrderId); params.set('itemId', itemId); params.set('quantity', quantity) }
    try {
      const response = await fetch('/api/pier/questions?' + params, { credentials: 'same-origin', cache: 'no-store', signal: controller.signal })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error?.message ?? 'Question could not be answered.')
      if (!controller.signal.aborted) setAnswer(body)
    } catch (cause) { if (!controller.signal.aborted) setProblem((cause as Error).message) }
    finally { inFlight.current = false; setBusy(false) }
  }
  const missing = kind === 'stock' ? !itemId : kind === 'shortage' ? !orders.some(order => order.id === orderId) : kind === 'supplier' ? !poId || !supplierId || !promiseDate : kind === 'allocation' ? !fromOrderId || !toOrderId || fromOrderId === toOrderId || !itemId || !quantity : false
  return <section className="panel"><h2>Live operational questions</h2>
    <div className="form-grid">
      <label className="field"><span>Question</span><select aria-label="Question" value={kind} onChange={event => changeQuestion(event.target.value as Question)}>{questions.filter(question => !restricted || !question.global).map(question => <option key={question.id} value={question.id}>{question.label}</option>)}</select></label>
      {(kind === 'stock' || kind === 'allocation') && <Select label="Question item" rows={records(state, 'items')} value={itemId} onChange={setItemId} />}
      {(kind === 'shortage' || kind === 'margin') && <Select label="Question order" rows={orders} value={orderId} onChange={setOrderId} required={kind === 'shortage'} />}
      {kind === 'supplier' && <>
        <Select label="Comparison purchase order" rows={drafts.map(po => ({ ...po, label: po.reference }))} value={poId} onChange={id => { setPoId(id); const po = drafts.find(row => row.id === id); setSupplierId(po?.supplierId ?? ''); setPromiseDate(po?.promiseDate ?? '') }} />
        <Select label="Proposed supplier" rows={suppliers} value={supplierId} onChange={setSupplierId} />
        <Field label="Proposed purchase date" type="date" value={promiseDate} onChange={setPromiseDate} />
      </>}
      {kind === 'allocation' && <>
        <Select label="Allocation source order" rows={orders} value={fromOrderId} onChange={setFromOrderId} />
        <Select label="Allocation destination order" rows={orders.filter(order => order.id !== fromOrderId)} value={toOrderId} onChange={setToOrderId} />
        <Field label="Allocation quantity (base units)" value={quantity} onChange={setQuantity} inputMode="decimal" />
      </>}
    </div>
    {kind === 'margin' && <p>Leave the order blank to compare all orders. Missing prices or retained costs remain unknown.</p>}
    {kind === 'shortage' && choicesBusy && <p role="status">Loading permitted orders…</p>}
    {choicesProblem && ['shortage', 'margin', 'allocation'].includes(kind) && <p role="alert">{choicesProblem}</p>}
    {kind === 'shortage' && !choicesBusy && !choicesProblem && !orders.length && <p>No order is available within your current warehouse authority.</p>}
    {['supplier', 'allocation'].includes(kind) && <p>Compare current records without changing stock, purchases, customer promises or messages. Applying a change requires its ordinary human review.</p>}
    <button disabled={busy || missing || (restricted && questions.find(question => question.id === kind)?.global)} onClick={() => void ask()}>{busy ? 'Reading current records…' : 'Ask current records'}</button>
    {problem && <p role="alert">{problem}</p>}{answer !== null && <div role="status"><Evidence value={answer} /></div>}
  </section>
}
