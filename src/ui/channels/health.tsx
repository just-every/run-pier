import type { RunCommand } from '../api'
import { useEffect, useState } from 'react'
import { Facts, Table } from '../controls'
import { when } from '../display'

export function IntegrationHealth({ revision, run, busy }: { revision: number; run: RunCommand; busy: boolean }) {
  const [data, setData] = useState<any>(null), [error, setError] = useState(''), [loading, setLoading] = useState(false)
  async function refresh() {
    setLoading(true)
    try {
      const response = await fetch('/api/pier/integrations', { credentials: 'same-origin', cache: 'no-store' })
      if (!response.ok) throw new Error('Connector health could not be loaded. Check your owner access and retry.')
      setData(await response.json()); setError('')
    } catch (failure) { setError((failure as Error).message); setData(null) }
    finally { setLoading(false) }
  }
  useEffect(() => { void refresh() }, [revision])
  return <section className="panel" aria-label="Integration health"><h2>Integration health</h2><p>Inspect retained work before using a connector’s recovery controls. Uncertain sends need provider reconciliation before another attempt.</p>
    <button disabled={loading} onClick={() => void refresh()}>{loading ? 'Loading health…' : 'Refresh health'}</button>
    {error && <p role="alert" className="error">{error}</p>}
    {data && <><p>Observed {when(data.observedAt)}</p>{data.connectors.map((connector: any) => <details key={connector.id}><summary>{connector.name} · {connector.status} · {connector.pending} pending · {connector.failed} failed · {connector.uncertain} uncertain</summary>
      <Facts values={[{ label: 'Scope', value: connector.scope }, { label: 'Last successful provider request', value: connector.lastSuccessfulRequest ? when(connector.lastSuccessfulRequest) : 'No successful provider request recorded' }, { label: 'Last completed sync', value: connector.lastSuccessfulSync ? when(connector.lastSuccessfulSync) : 'No completed sync recorded' }, { label: 'Lag', value: `${connector.lagSeconds} seconds` }, { label: 'Cursor', value: connector.cursor ?? 'Not established' }]} />
      <p>{connector.cursorMeaning}</p>{connector.id === 'shipping:easypost' && connector.enabled && <button disabled={busy} onClick={() => void run('shipping.disconnect', { version: connector.connectionVersion })}>Pause shipping</button>}<a href={connector.manage}>Open connector recovery</a>
      {connector.effects.length > 0 && <Table headings={['Effect', 'State', 'Document mapping', 'Recovery']}>{connector.effects.map((effect: any) => <tr key={effect.id}><td>{effect.inspect ? <a href={effect.inspect}>{effect.id}</a> : effect.id}</td><td>{effect.state}</td><td>{effect.mapping.join(' · ') || 'Not mapped'}</td><td>{effect.recovery ? <button disabled={busy} onClick={() => void run(effect.recovery.type, effect.recovery.payload)}>Reconcile effect</button> : 'Open connector recovery'}</td></tr>)}</Table>}
      <details><summary>Provider attempt history</summary>{connector.attempts.length ? <Table headings={['Operation', 'Outcome', 'Command']}>{connector.attempts.map((attempt: any) => <tr key={attempt.id}><td>{attempt.operation}</td><td>{attempt.outcome}</td><td><a href={`#activity/${encodeURIComponent(attempt.commandId)}`}>{attempt.commandId}</a></td></tr>)}</Table> : <p>No provider attempts recorded.</p>}</details>
    </details>)}</>}
  </section>
}
