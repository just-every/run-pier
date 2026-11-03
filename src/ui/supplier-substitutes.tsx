import { label, records, type PierState, type RunCommand } from './api'
import { Badge, Field, Form, Select, Table, text } from './controls'
import { person, reference, when } from './display'

const note = 'Recommendation only. Accepting changes no order line, stock, reservation, purchase, promise or message.'
export function SubstituteSettings({ state, run, busy }: { state: PierState; run: RunCommand; busy: boolean }) {
  if (state.actor.role !== 'owner') return null
  const items = records(state, 'items').filter(item => !item.archived)
  const mappings = records(state, 'substituteMappings')
  return <details className="supplier-substitutes"><summary>Substitute settings</summary><Form title="Exact substitute mapping" submit="Record exact mapping" note="Record only an exact alternative in the same base unit. Tracked items and kits are excluded." busy={busy} onSubmit={data => {
    const itemId = text(data, 'itemId'), alternativeItemId = text(data, 'alternativeItemId')
    const existing = mappings.find(mapping => mapping.itemId === itemId && mapping.alternativeItemId === alternativeItemId)
    return run('substitute.mappingSave', { itemId, alternativeItemId, version: existing?.version ?? 0, enabled: data.get('enabled') === 'on', reason: text(data, 'reason') })
  }}><Select label="Original SKU" name="itemId" rows={items} /><Select label="Exact alternative SKU" name="alternativeItemId" rows={items} /><Field label="Equivalence reason" name="reason" /><Field label="Mapping enabled" name="enabled" type="checkbox" required={false} defaultChecked /></Form>
    {mappings.map(mapping => <p key={mapping.id}>{label(items, mapping.itemId)} → {label(items, mapping.alternativeItemId)} · version {mapping.version} · {mapping.enabled ? 'Enabled' : 'Disabled'} · {mapping.reason}</p>)}
  </details>
}
export function SupplierSubstitutes({ state, run, busy }: { state: PierState; run: RunCommand; busy: boolean }) {
  if (state.actor.role !== 'owner') return null
  const comparisons = records(state, 'proposals').filter(proposal => proposal.kind === 'supplier-substitutes')
  const purchases = records(state, 'purchaseOrders').filter(po => po.status === 'committed' && po.confirmation && !po.pendingSupplierChange)
  return <div className="supplier-substitutes"><Form title="Compare supplier substitutes" submit="Prepare substitute comparison" busy={busy} note={note} onSubmit={data => {
    const po = purchases.find(po => po.id === text(data, 'poId'))
    return run('substitute.prepare', { poId: po?.id, version: po?.version })
  }}><Select label="Delayed confirmed purchase" name="poId" rows={purchases.map(po => ({ ...po, label: `${reference(po)} · confirmed ${po.confirmation.promiseDate}` }))} /></Form>
    {comparisons.map(proposal => <section className="panel" key={proposal.id} aria-label={`Substitute comparison ${proposal.id}`}>
      <h2>Substitute comparison <Badge>{proposal.status}</Badge></h2><p>{note}</p>
      <p>Prepared by {person(state, proposal.preparation.actorId)} · {when(proposal.preparation.at)} · PO version {proposal.poVersion} · movement version {proposal.movementVersion}</p>
      {!proposal.reviewCurrent && <p role="status">{proposal.status === 'prepared' ? 'Inputs or authority changed. Prepare again before review.' : 'Inputs have since changed. This is a retained historical recommendation.'}</p>}
      {proposal.lines.map((line: any) => <div key={line.orderLineId}>
        <h3>{reference(records(state, 'orders').find(order => order.id === line.orderId))} · {label(records(state, 'items'), line.itemId)}</h3>
        <p>Demand {line.demand} · promised {line.promiseDate} · supplier confirmed {line.supplierDate} · uncovered demand {line.uncovered}</p><p>{line.explanation}</p>
        {line.candidates.length > 0 && <Table headings={['Alternative', 'Proposed quantity', 'Warehouse and bin', 'On hand', 'Reserved', 'Protected hold', 'Available', 'Proposed from bin']} numeric={[1, 3, 4, 5, 6, 7]}>
          {line.candidates.flatMap((candidate: any) => candidate.allocations.map((allocation: any) => <tr key={`${candidate.mappingId}-${allocation.locationId}`}><td>{candidate.sku} · mapping version {candidate.mappingVersion}</td><td>{candidate.quantity} {candidate.unit}</td><td>{allocation.warehouse} · {label(records(state, 'locations'), allocation.locationId)}</td><td>{allocation.onHand}</td><td>{allocation.reserved}</td><td>{allocation.protectedHold}</td><td>{allocation.available}</td><td>{allocation.quantity}</td></tr>))}
        </Table>}{line.unavailable.map((entry: any) => <p key={entry.mappingId}>{entry.reason}</p>)}
      </div>)}
      <details><summary>Exact source evidence</summary><ul>{proposal.evidence.map((source: any, index: number) => <li key={index}><a href={source.href}>{source.collection} · {source.id} · version {source.version ?? 'retained identity'} · digest {source.digest}{source.entryId ? ` · ${source.field} ${source.entryId}` : ''}{source.orderLineId ? ` · line ${source.orderLineId}` : ''}{source.poLineId ? ` · purchase line ${source.poLineId}` : ''}</a></li>)}</ul><p>Source identities resolve in the current owner export. Retained versions and the input digest describe preparation; changed input requires a new comparison.</p></details>
      {proposal.status === 'prepared' && <><Form title="Review recommendation" submit="Record recommendation decision" busy={busy} onSubmit={data => run('substitute.review', { proposalId: proposal.id, version: proposal.version, poId: proposal.poId, decision: text(data, 'decision'), reason: text(data, 'reason'), confirm: data.get('confirm') === 'on' })}>
        <Select label="Recommendation decision" name="decision" rows={[{ id: 'accepted', version: 1, label: 'Accept recommendation only' }, { id: 'declined', version: 1, label: 'Decline recommendation' }]} /><Field label="Review reason" name="reason" /><Field label="Confirm recommendation only" name="confirm" type="checkbox" />
      </Form><button disabled={busy} onClick={() => { const po = records(state, 'purchaseOrders').find(po => po.id === proposal.poId); return run('substitute.prepare', { poId: po?.id, version: po?.version }) }}>Prepare again from current inputs</button></>}
      {proposal.decision && <p>Owner {person(state, proposal.decision.actorId)} {proposal.decision.outcome} this recommendation · {proposal.decision.reason} · {when(proposal.decision.at)}</p>}
    </section>)}
  </div>
}
