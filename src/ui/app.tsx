import { useEffect, useState } from 'react'
import { usePier } from './api'
import { Evidence } from './controls'
import { words } from './display'
import { Stock } from './stock'
import { Sales } from './sales'
import { Purchasing } from './purchasing'
import { Reports } from './reports'
import { Counts, Transfers } from './warehouse'
import { Imports } from './imports'
import { Activity } from './activity'
import { Floor } from './floor'
import { Books } from './books'
import { Channels } from './channels'
import { AISetup } from './item-agent'
import './style'

const tabs = [{ id: 'stock', title: 'Stock' }, { id: 'sales', title: 'Sales orders' }, { id: 'purchasing', title: 'Purchasing' }, { id: 'floor', title: 'Floor' }, { id: 'transfers', title: 'Transfers' }, { id: 'counts', title: 'Counts' }, { id: 'imports', title: 'Imports' }, { id: 'channels', title: 'Channels' }, { id: 'books', title: 'Books' }, { id: 'reports', title: 'Reports' }, { id: 'activity', title: 'Activity' }, { id: 'ai', title: 'AI setup' }]
export function PierApp() {
  const [tab, setTab] = useState('stock'), [historyItem, setHistoryItem] = useState(''), [documentId, setDocumentId] = useState(''), [sessionError, setSessionError] = useState('')
  const { state, run, refresh, error, details, notice, busy, recoverable, recover } = usePier()
  useEffect(() => { const update = () => { const [selected, id = ''] = window.location.hash.slice(1).split('/'); setDocumentId(id); if (selected === 'activity' && id) setHistoryItem(''); setTab(tabs.some(row => row.id === selected) ? selected : 'stock') }; update(); window.addEventListener('hashchange', update); return () => window.removeEventListener('hashchange', update) }, [])
  useEffect(() => { if (documentId) requestAnimationFrame(() => document.getElementById(`document-${documentId}`)?.scrollIntoView({ block: 'start' })) }, [documentId, tab, state])
  function history(itemId: string) { setHistoryItem(itemId); window.location.hash = 'activity'; setTab('activity') }
  async function signOut() {
    try { const response = await fetch('/auth/signout', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: '{}' }); if (!response.ok) throw new Error(); window.location.href = '/signin' }
    catch { setSessionError('Sign out could not be confirmed. Reload or sign in again.') }
  }
  return <div className="pier-app"><header className="app-header"><a className="wordmark" href="#stock"><img src="/brand/mark.svg" alt="" width="34" height="34" /><span data-rer-name>Pier</span></a><nav aria-label="Stock operations">{tabs.map(row => <a key={row.id} href={`#${row.id}`} aria-current={row.id === tab ? 'page' : undefined}>{row.title}</a>)}</nav><div className="account"><span title={state?.actor.name}>{state?.actor.name || 'Your session'}</span>{state && words(state.actor.role).toLowerCase() !== state.actor.name?.trim().toLowerCase() && <small>{words(state.actor.role)}</small>}<button onClick={() => void signOut()}>Sign out</button></div></header><main className="app-main" data-view={tab} aria-busy={busy}>
    {error && <section className="error" role="alert"><strong>Action needs attention</strong><p>{error}</p>{details !== null && <Evidence value={details} />}<button onClick={() => void refresh().catch(() => {})}>Reload current records</button><a href="/signin?returnTo=%2Fapp">Sign in again</a></section>}
    {sessionError && <p className="error" role="alert">{sessionError} <a href="/signin?returnTo=%2Fapp">Sign in</a></p>}
    {notice && <p className="notice" role="status">{notice}</p>}
    {recoverable && <section className="panel"><h2>Recover interrupted action</h2><p>{recoverable.type} · command {recoverable.commandId}</p>{['channel.save','book.connect','ai.save'].includes(recoverable.type) ? <p>Connection credentials are kept only for this interrupted action in this tab.</p> : <Evidence value={recoverable.payload} />}<button disabled={busy} onClick={() => recover()}>Retry this exact action</button><p className="muted">The recorded identity recovers an existing result when the action already committed.</p></section>}
    {!state ? <p role="status">{error ? 'Records have not loaded.' : 'Loading your stock records…'}</p> : <>{tab === 'stock' && <Stock state={state} run={run} busy={busy} history={history} />}{tab === 'sales' && <Sales state={state} run={run} busy={busy} documentId={documentId} />}{tab === 'purchasing' && <Purchasing state={state} run={run} busy={busy} documentId={documentId} />}{tab === 'floor' && <Floor state={state} run={run} busy={busy} error={error} step={documentId} />}{tab === 'transfers' && <Transfers state={state} run={run} busy={busy} />}{tab === 'counts' && <Counts state={state} run={run} busy={busy} />}{tab === 'imports' && <Imports state={state} run={run} busy={busy} />}{tab === 'channels' && <Channels state={state} run={run} busy={busy} />}{tab === 'books' && <Books state={state} run={run} busy={busy} />}{tab === 'ai' && <AISetup state={state} run={run} busy={busy} />}{tab === 'reports' && <Reports state={state} run={run} busy={busy} />}{tab === 'activity' && <Activity key={historyItem} state={state} run={run} busy={busy} itemId={historyItem} refresh={refresh} />}</>}
  </main></div>
}
