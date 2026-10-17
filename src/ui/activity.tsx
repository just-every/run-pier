import { useState } from 'react'
import { label, records, unit, type PierState, type RecordData, type RunCommand } from './api'
import { ItemName, money, person, sourceDocument, when, words } from './display'
import { fromMillionths } from './quantity'
import { Empty, Select, Table } from './controls'
import { Proposals } from './proposals'
import { Operators } from './operators'

export function Activity({ state, run, busy, itemId, refresh }: { state: PierState; run: RunCommand; busy: boolean; itemId: string; refresh: () => Promise<void> }) {
  const [filter, setFilter] = useState(itemId)
  const importName = (id: string) => records(state, 'imports').find(batch => batch.id === id)?.namespace
  // Movements carry no cost of their own: a receipt line or an opening-stock row records it.
  const cost = (movement: RecordData) => records(state, 'receipts').flatMap(receipt => receipt.lines).find((line: any) => line.movementId === movement.id)?.cost
    ?? records(state, 'imports').find(batch => batch.id === movement.importId)?.costEvidence?.find((row: any) => row.itemId === movement.itemId && row.locationId === movement.locationId)?.cost
  const movements = records(state, 'movements').filter(movement => !filter || movement.itemId === filter)
  return <><div className="page-title"><h1>Activity</h1><a className="button" href="/api/pier/export" download>Export records, costs and provenance</a></div><Select label="Item filter" rows={records(state, 'items')} value={filter} onChange={setFilter} required={false} /><button className="link" onClick={() => setFilter('')}>All items</button>
    {!movements.length ? <Empty>No movements for this selection.</Empty> : <Table numeric={[3, 6]} headings={['When', 'Item', 'Position', 'Signed quantity', 'Source / correction', 'Actor / reason', 'Unit cost']}>{movements.map(movement => { const source = sourceDocument(state, movement.documentId); return <tr id={`document-${movement.id}`} key={movement.id}><td><span className="nowrap">{when(movement.createdAt)}</span></td><td><ItemName state={state} id={movement.itemId} /></td><td>{label(records(state, 'locations'), movement.locationId)}<small>{words(movement.status)}</small></td><td>{fromMillionths(String(movement.quantity))} {unit(state, movement.itemId)}</td><td><a href={`#${source.tab}/${movement.documentId}`}>{source.name}</a>{movement.reversalId && <small><a href={`#activity/${movement.reversalId}`}>Reverses an earlier movement</a></small>}{movement.importId && movement.importId !== movement.documentId && <small>Import {importName(movement.importId)}</small>}</td><td>{person(state, movement.actorId)}<small>{movement.reason}</small></td><td>{cost(movement) === undefined ? '—' : `$${money(cost(movement))}`}</td></tr> })}</Table>}
    <Proposals state={state} run={run} busy={busy} />
    {state.actor.role === 'owner' && <Operators state={state} run={run} busy={busy} refresh={refresh} />}
    <section className="panel"><details className="technical-log"><summary>Technical log</summary><p className="muted">The latest commands. Durable command identities make exact retries recover their original result.</p><Table headings={['Recorded', 'Actor', 'Command identity']}>{records(state, 'commands').map(command => <tr key={command.id}><td><span className="nowrap">{when(command.createdAt)}</span></td><td>{person(state, command.actorId)}</td><td><small>{command.id}</small></td></tr>)}</Table></details></section>
  </>
}
