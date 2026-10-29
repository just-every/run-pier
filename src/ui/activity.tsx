import { useEffect, useState } from 'react'
import { label, records, unit, type PierState, type RecordData, type RunCommand } from './api'
import { actionName, ItemName, money, person, sourceDocument, when, words } from './display'
import { fromMillionths } from './quantity'
import { Empty, Select, Table, Evidence, Field } from './controls'
import { Proposals } from './proposals'
import { LiveWork } from './item-agent/bulk'
import { CustomFields } from './custom-fields'
import { PrivacyReview } from './privacy'
import { OperationalExceptions } from './operational-exceptions'
import { CaseSettings } from './case-settings'
import { Operators } from './operators'
import { Onboarding } from './onboarding'

export function Activity({ state, run, busy, itemId, documentId, refresh }: { state: PierState; run: RunCommand; busy: boolean; itemId: string; documentId: string; refresh: () => Promise<void> }) {
  const [filter, setFilter] = useState(itemId)
  const [document, setDocument] = useState(documentId), [user, setUser] = useState(''), [connector, setConnector] = useState('')
  useEffect(() => { setDocument(documentId) }, [documentId])
  const events = records(state, 'auditEvents').filter(event => (!filter || event.itemIds.includes(filter)) && (!document || (event.documentIds.includes(document) || event.commandId === document)) && (!user || event.actorId === user) && (!connector || event.connectorId === connector))
  const connectorOptions = [...new Set(records(state, 'auditEvents').map(event => event.connectorId).filter(Boolean))].map(id => ({ id, version: 0, name: records(state, 'channels').find(channel => channel.id === id)?.name ?? words(id) }));
  const importName = (id: string) => records(state, 'imports').find(batch => batch.id === id)?.namespace
  // Movements carry no cost of their own: a receipt line or an opening-stock row records it.
  const cost = (movement: RecordData) => records(state, 'receipts').flatMap(receipt => receipt.lines).find((line: any) => line.movementId === movement.id)?.cost
    ?? records(state, 'imports').find(batch => batch.id === movement.importId)?.costEvidence?.find((row: any) => row.itemId === movement.itemId && row.locationId === movement.locationId)?.cost
  const movements = records(state, 'movements').filter(movement => (!filter || movement.itemId === filter) && (!document || [movement.id, movement.documentId, movement.commandId, movement.reversalId].includes(document)))
  if (documentId === 'onboarding') return <Onboarding state={state} />
  return documentId === 'custom-fields' ? <CustomFields state={state} run={run} busy={busy} /> : <><div className="page-title"><h1>Activity</h1><a className="button" href="/api/pier/export" download>Export records, costs and provenance</a></div><Select label="Item filter" rows={records(state, 'items')} value={filter} onChange={setFilter} required={false} /><button className="link" onClick={() => setFilter('')}>All items</button>
    {!movements.length ? <Empty>No movements for this selection.</Empty> : <Table numeric={[3, 6]} headings={['When', 'Item', 'Position', 'Signed quantity', 'Source / correction', 'Actor / reason', 'Unit cost']}>{movements.map(movement => { const source = sourceDocument(state, movement.documentId); return <tr id={`document-${movement.id}`} key={movement.id}><td><span className="nowrap">{when(movement.createdAt)}</span></td><td><ItemName state={state} id={movement.itemId} /></td><td>{label(records(state, 'locations'), movement.locationId)}<small>{words(movement.status)}</small></td><td>{fromMillionths(String(movement.quantity))} {unit(state, movement.itemId)}</td><td><a href={`#${source.tab}/${movement.documentId}`}>{source.name}</a>{movement.reversalId && <small><a href={`#activity/${movement.reversalId}`}>Reverses an earlier movement</a></small>}{movement.importId && movement.importId !== movement.documentId && <small>Import {importName(movement.importId)}</small>}</td><td>{person(state, movement.actorId)}<small>{movement.reason}</small></td><td>{cost(movement) === undefined ? '—' : `$${money(cost(movement))}`}</td></tr> })}</Table>}
    <section className="panel" id={documentId && events.some(event => event.commandId === documentId) ? `document-${documentId}` : undefined}><h2>Decision and input history</h2><p className="muted">Durable command changes, accepted and refused scans, and recorded connector outcomes. Input devices are client-reported; no physical device certification is inferred.</p>
      <div className="form-grid"><Field label="Document identity filter" required={false} value={document} onChange={setDocument} /><Select label="User filter" rows={records(state, 'people')} value={user} onChange={setUser} required={false} /><Select label="Connector filter" rows={connectorOptions} value={connector} onChange={setConnector} required={false} /></div>
      {!events.length ? <Empty>No recorded decisions for this selection.</Empty> : <Table headings={['When', 'Action / outcome', 'Actor / input', 'Source / changes']}>{events.slice().reverse().map(event => <tr key={event.id}><td>{when(event.at)}</td><td>{actionName(event.type)}<small>{words(event.outcome)}{event.reason ? ` · ${words(event.reason)}` : ''}</small></td><td>{person(state, event.actorId)}{event.code && <small>{event.code} · {event.device}</small>}{event.connectorId && <small>{event.connectorId} · {event.direction || 'recorded outcome'}</small>}</td><td><small>Command {event.commandId} · version {event.version}</small><details><summary>Recorded change details</summary><Evidence value={{ custody: event.custody, fieldOperation: event.fieldOperation, resolution: event.resolution, changes: event.changes, sourceIds: event.documentIds, rule: event.rule, phase: event.phase, attemptId: event.attemptId, requestId: event.requestId, providerAttemptId: event.providerAttemptId, externalIds: event.externalIds, sourceVersions: event.sourceVersions, approval: event.approval, authority: event.authority, ordinaryCommand: event.ordinaryCommand }} /></details></td></tr>)}</Table>}
    </section>
    {state.actor.role === 'owner' && <PrivacyReview state={state} run={run} busy={busy} />}
    <section className="panel" aria-label="Settings"><h2>Settings</h2>{state.actor.role === 'owner' && <p><a href={'#activity' + '/onboarding'}>Onboarding diagnostic</a></p>}<a href={'#activity' + '/custom-fields'}>Custom fields</a><CaseSettings state={state} run={run} busy={busy} /></section>
    <OperationalExceptions state={state} run={run} busy={busy} />
    <LiveWork state={state} run={run} busy={busy} />
    <Proposals state={state} run={run} busy={busy} />
    {state.actor.role === 'owner' && <Operators state={state} run={run} busy={busy} refresh={refresh} />}
    <section className="panel"><details className="technical-log"><summary>Technical log</summary><p className="muted">The latest commands. Durable command identities make exact retries recover their original result.</p><Table headings={['Recorded', 'Actor', 'Command identity']}>{records(state, 'commands').map(command => <tr key={command.id}><td><span className="nowrap">{when(command.createdAt)}</span></td><td>{person(state, command.actorId)}</td><td><small>{command.id}</small></td></tr>)}</Table></details></section>
  </>
}
