import { useEffect, useState } from 'react'
import type { OnboardingDiagnostic } from '../pier/onboarding'
import type { PierState } from './api'
import { Badge, Facts, Table } from './controls'
import { when, words } from './display'

export function Onboarding({ state }: { state: PierState }) {
  const [data, setData] = useState<OnboardingDiagnostic | null>(null), [error, setError] = useState(''), [loading, setLoading] = useState(true), [reload, setReload] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    setData(null); setError(''); setLoading(true)
    if (state.actor.role !== 'owner') { setLoading(false); return }
    void (async () => {
      try {
        const response = await fetch('/api/pier/onboarding', { credentials: 'same-origin', cache: 'no-store', signal: controller.signal })
        if (!response.ok) throw new Error('Onboarding could not be loaded. Check current owner access, then reload or sign in again.')
        const body = await response.json() as OnboardingDiagnostic
        if (!controller.signal.aborted) setData(body)
      } catch (cause) { if (!controller.signal.aborted) { setData(null); setError((cause as Error).message) } }
      finally { if (!controller.signal.aborted) setLoading(false) }
    })()
    return () => controller.abort()
  }, [state.version, state.actor.id, state.actor.role, reload])
  if (state.actor.role !== 'owner') return <section className="panel"><h1>Onboarding</h1><p role="status">Only the current owner can inspect setup and native cutovers.</p></section>
  return <><div className="page-title"><h1>Onboarding</h1><a href="#activity">Back to Settings</a></div>
    <section className="panel" aria-label="Onboarding diagnostic"><h2>Setup and native cutover</h2>
      <p>This read-only view uses retained settings and native import records. Opening or reloading it makes no provider request and changes no business records.</p>
      <button disabled={loading} onClick={() => setReload(value => value + 1)}>{loading ? 'Loading onboarding…' : 'Reload onboarding'}</button>
      {error && <p className="error" role="alert">{error} <a href="/signin?returnTo=%2Fapp%23activity%2Fonboarding">Sign in again</a></p>}
      {data && <><p role="status">{data.empty ? 'Empty installation. No business records or native captures retained.' : 'Retained installation records.'}</p>
        <h3>Next native action</h3><a href={data.nextAction.href}>{data.nextAction.label}</a>
        <Facts values={[{ label: 'Business details', value: data.business.profile.configured ? `Recorded · version ${data.business.profile.version}` : 'Not configured' }, { label: 'Items', value: data.business.counts.items }, { label: 'Locations', value: data.business.counts.locations }, { label: 'Stock movements', value: data.business.counts.movements }]} />
        <a href={data.business.profile.href}>Inspect business settings</a>
        <h3>Native captures</h3><p>Each capture retains its own status and source identity. Corrected captures do not erase earlier problems. Review the latest intended capture; a recorded commit proves only that cutover.</p>
        {!data.batches.length && <p>No native CSV captured. <a href="#imports">Open Imports</a></p>}
        {data.batches.map(batch => <section className="panel" aria-label={`Native capture ${batch.id}`} key={batch.id}>
          <h4>{batch.namespace} · {batch.sourceVersion} <Badge>{words(batch.status)}</Badge></h4>
          <Facts values={[{ label: 'Capture', value: when(batch.createdAt) }, { label: 'Version', value: batch.version }, { label: 'Review stage', value: words(batch.stage) }, { label: 'Mapping revision', value: batch.mappingRevision }]} />
          {batch.stale && <p>Business inputs changed after preview. Stage a fresh reconciliation before further review or commitment.</p>}
          {batch.problems.length > 0 && <Table headings={['Problem', 'Source row', 'Review']}>{batch.problems.map((problem, index) => <tr key={index}><td>{problem.code}<small>{problem.message}</small></td><td>{problem.sourceId ?? 'Not identified'}{problem.artifact && <small>{problem.artifact}, row {problem.row}</small>}</td><td><a href={problem.href}>Inspect source problem</a></td></tr>)}</Table>}
          <p>{batch.reviews.length} explicit review stages retained{batch.committedVersion !== null ? ` · committed at business revision ${batch.committedVersion}` : ''}.</p>
          <a href={batch.href}>{batch.nextAction}</a>
        </section>)}
        <h3>Connections</h3><p>Configuration and retained outcomes only. No live health check, provider qualification, measured capacity or deployment readiness is established here. Choose only connections your business needs; enabling one requires its existing explicit approval.</p>
        <Table headings={['Connection', 'Retained state', 'Provider evidence', 'Inspect']}>{data.connections.map(connection => <tr key={connection.id}><td>{connection.name}</td><td>{words(connection.status)}<small>{connection.pending} pending · {connection.failed} failed · {connection.uncertain} uncertain</small></td><td>{connection.lastSuccessfulRequest ? `Last accepted request ${when(connection.lastSuccessfulRequest)}` : 'No successful provider request recorded'}{connection.lastSuccessfulSync && <small>Last retained sync {when(connection.lastSuccessfulSync)}</small>}</td><td><a href={connection.href}>Inspect connection</a></td></tr>)}</Table>
      </>}
    </section></>
}
