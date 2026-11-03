import { useEffect, useState } from 'react'
import { usePier } from './api'
import { RecoveryReview } from './recovery-review'
import { Stock } from './stock'
import { Sales } from './orders'
import { TaxSettings } from './orders/tax-settings'
import { Purchasing } from './purchasing'
import { Reports } from './reports'
import { Counts, Transfers } from './warehouse'
import { Imports } from './imports'
import { Activity } from './activity'
import { Floor } from './floor'
import { Books } from './books'
import { Edi } from './edi'
import { Channels } from './channels'
import { AISetup } from './item-agent'
import { Rail, TopBar, tabs } from './shell'
import { openingWarehouse } from './orders/model'
import './style'

// The chosen warehouse is a per-browser convenience; the app works the same without it.
// Nothing saved (null) opens on the warehouse that needs attention; '' is a saved choice of All.
const savedWarehouse = () => { try { return localStorage.getItem('pier.warehouse') } catch { return null } }

export function PierApp() {
  const [tab, setTab] = useState('sales'), [historyItem, setHistoryItem] = useState(''), [documentId, setDocumentId] = useState(''), [sessionError, setSessionError] = useState(''), [warehouse, setWarehouseState] = useState<string | null>(null), [picked, setPicked] = useState(false)
  const { state, run, refresh, error, details, notice, busy, recoverable, recover, dismiss } = usePier()
  useEffect(() => { let first = true; const update = () => { if (!first) dismiss(); first = false; const [selected, id = ''] = window.location.hash.slice(1).split('/'); setDocumentId(id); if (selected === 'activity' && id) setHistoryItem(''); setTab(tabs.some(row => row.id === selected) ? selected : 'sales') }; update(); { const saved = savedWarehouse(); setWarehouseState(saved); setPicked(saved !== null) } window.addEventListener('hashchange', update); return () => window.removeEventListener('hashchange', update) }, [dismiss])
  useEffect(() => { if (state && warehouse === null) setWarehouseState(openingWarehouse(state)) }, [state, warehouse])
  useEffect(() => { if (documentId) requestAnimationFrame(() => document.getElementById(`document-${documentId}`)?.scrollIntoView({ block: 'start' })) }, [documentId, tab, state])
  // Only a warehouse the user picked prefills new orders; the opening view is just where the queue starts.
  function setWarehouse(value: string) { setWarehouseState(value); setPicked(true); try { localStorage.setItem('pier.warehouse', value) } catch { /* the choice lasts this visit */ } }
  function history(itemId: string) { setHistoryItem(itemId); window.location.hash = 'activity'; setTab('activity') }
  async function signOut() {
    try { const response = await fetch('/auth/signout', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: '{}' }); if (!response.ok) throw new Error(); window.location.href = '/signin' }
    catch { setSessionError('Sign out could not be confirmed. Reload or sign in again.') }
  }
  const known = !warehouse || (state && !state.locations?.some((row: any) => row.warehouse === warehouse)) ? '' : warehouse
  return <div className="pier-app"><TopBar state={state} warehouse={known} setWarehouse={setWarehouse} signOut={() => void signOut()} /><div className="app-body"><Rail tab={tab} state={state} warehouse={known} /><main className="app-main" data-view={tab} aria-busy={busy}>
    {error && <section className="error" role="alert"><strong>Action needs attention</strong><p>{error}</p>{details !== null && <p>Reload the current records and review this action before trying again.</p>}{(recoverable || !state) && <><button onClick={() => void refresh().catch(() => {})}>Reload current records</button><a href="/signin?returnTo=%2Fapp">Sign in again</a></>}</section>}
    {sessionError && <p className="error" role="alert">{sessionError} <a href="/signin?returnTo=%2Fapp">Sign in</a></p>}
    {notice && <p className="notice" role="status">{notice}</p>}
    {recoverable && <section className="panel"><h2>Recover interrupted action</h2><RecoveryReview state={state} type={recoverable.type} payload={recoverable.payload} />{['channel.save','book.connect','ai.save', 'shipping.save'].includes(recoverable.type) ? <p>Connection credentials are kept only for this interrupted action in this tab.</p> : null}<button disabled={busy} onClick={() => recover()}>Retry this exact action</button><p className="muted">The recorded identity recovers an existing result when the action already committed.</p></section>}
    {!state ? <p className="loading" role="status">{error ? 'Records have not loaded.' : 'Loading your stock records…'}</p> : <>{tab === 'settings' && <TaxSettings state={state} run={run} busy={busy} />}{tab === 'stock' && <Stock state={state} run={run} busy={busy} history={history} warehouse={known} itemId={documentId} />}{tab === 'sales' && <Sales state={state} run={run} busy={busy} documentId={documentId} warehouse={known} orderWarehouse={picked ? known : ''} />}{tab === 'purchasing' && <Purchasing state={state} run={run} busy={busy} documentId={documentId} />}{tab === 'floor' && <Floor state={state} run={run} busy={busy} error={error} step={documentId} />}{tab === 'transfers' && <Transfers state={state} run={run} busy={busy} />}{tab === 'counts' && <Counts state={state} run={run} busy={busy} />}{tab === 'imports' && <Imports state={state} run={run} busy={busy} />}{tab === 'channels' && <Channels state={state} run={run} busy={busy} />}{tab === 'books' && <Books state={state} run={run} busy={busy} section={documentId} />}{tab === 'edi' && <Edi state={state} run={run} busy={busy} />}{tab === 'ai' && <AISetup state={state} run={run} busy={busy} />}{tab === 'reports' && <Reports state={state} run={run} busy={busy} />}{tab === 'activity' && <Activity key={historyItem} state={state} run={run} busy={busy} itemId={historyItem} documentId={documentId} refresh={refresh} />}</>}
  </main></div></div>
}
