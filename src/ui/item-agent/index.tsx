import { records, type PierState, type RecordData, type RunCommand } from '../api'
import { ItemReview } from './review'
import './style.css'
export { AISetup } from './setup'

export function ItemAgent({ item, state, run, busy }: { item: RecordData; state: PierState; run: RunCommand; busy: boolean }) {
  const reviews = records(state, 'proposals').filter(p => p.kind === 'item-review' && p.itemId === item.id).reverse()
  const canCheck = ['owner', 'buyer', 'operator', 'warehouse', 'agent'].includes(state.actor.role)
  return <section className="panel item-agent" aria-label="Item checks"><div className="item-agent-head"><div><h2>Work this item</h2><p className="muted">Check stock against orders and purchases, costs against receipts, and reorder points against sell-through.</p></div>{canCheck && <button className="primary" disabled={busy} onClick={() => void run('itemAgent.check', { itemId: item.id })}>{busy ? 'Working…' : 'Run item checks'}</button>}</div>
    {!reviews.length && <p>Run checks to prepare evidence-backed changes for review. No AI key is required. <a href="#ai">AI setup</a></p>}
    {reviews[0] && <ItemReview proposal={reviews[0]} state={state} run={run} busy={busy} />}
    {reviews.length > 1 && <details><summary>Earlier item reviews ({reviews.length - 1})</summary>{reviews.slice(1).map(review => <details key={review.id}><summary>Review from {new Date(review.createdAt).toLocaleString()}</summary><ItemReview proposal={review} state={state} run={run} busy={busy} /></details>)}</details>}
  </section>
}
