import { useCallback, useEffect, useRef, useState } from 'react'
import { readReply, readState } from './wire'
import { bindFloorActor, durableCommand, floorCommand, floorFrontier, scanLink, settleScan, type ScanLink } from './floor/task-storage'

export type RecordData = { id: string; version: number; [key: string]: any }
export type PierState = { version: number; actor: { id: string; name: string; role: string }; [key: string]: any }
// `onRefused` keeps a refused command's message beside the control that sent it instead of the page banner.
export type Refusal = { code: string; message: string }
export type RunCommand = (type: string, payload: object, options?: { onRefused?: (refusal: Refusal) => void }) => Promise<boolean>

type PendingCommand = { signature: string; commandId: string; actorId?: string; frontier?: string; scan?: ScanLink }
const pendingKey = 'pier.pending-command'
const disconnected = 'Network connection is unavailable. Warehouse work is retained in this tab. Reconnect, then explicitly recover the interrupted action before scanning again.'

export function usePier() {
  const [state, setState] = useState<PierState | null>(null)
  const [error, setError] = useState('')
  const [details, setDetails] = useState<unknown>(null)
  const [busy, setBusy] = useState(false)
  const inFlight = useRef(false)
  const [notice, setNotice] = useState('')
  const [networkError, setNetworkError] = useState('')
  const [connected, setConnected] = useState(() => navigator.onLine)
  const [recoverable, setRecoverable] = useState<{ type: string; payload: object; commandId: string } | null>(null)
  // A lost response keeps the identity for the exact request. Editing any input
  // produces a new request; a retry cannot post the same command twice.
  const pending = useRef<PendingCommand | null>(null)
  const refresh = useCallback(async (commandId?: string) => {
    try {
      const response = await fetch('/api/pier/state' + (commandId ? `?commandId=${encodeURIComponent(commandId)}` : ''), { credentials: 'same-origin', cache: 'no-store' })
      const body = await response.json()
      if (!response.ok) { const failure = readReply(body); throw Object.assign(new Error(!failure.ok ? failure.error.message : 'Stock could not be loaded. Sign in again or retry.'), { status: response.status }) }
      const current = readState(body)
      try { bindFloorActor(current.actor.id) } catch { /* A write will refuse if its exact intent cannot be retained. */ }
      setState(current); setConnected(true); setNetworkError('')
      return current
    } catch (cause) {
      if (!(cause as { status?: number }).status) { setConnected(false); setNetworkError(disconnected) }
      throw cause
    }
  }, [])
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(pendingKey)
      if (saved) {
        const value = JSON.parse(saved), command = JSON.parse(value.signature)
        if (typeof value.commandId !== 'string' || typeof command.type !== 'string' || !command.payload || !durableCommand(command.type)) throw new Error('Invalid retained command')
        pending.current = value; setRecoverable({ ...command, commandId: value.commandId })
      }
    } catch { sessionStorage.removeItem(pendingKey) }
    // Without a session the app has nothing to show: go to sign-in and come back here.
    refresh().catch(cause => { if (cause.status === 401) window.location.replace('/signin?returnTo=%2Fapp'); else setError(cause.message) })
    const offline = () => { setConnected(false); setNetworkError(disconnected) }
    const online = () => { void refresh().then(() => setNotice('Connection restored. Review retained work and recover it explicitly; no queued action was sent.')).catch(() => {}) }
    window.addEventListener('offline', offline); window.addEventListener('online', online)
    const timer = window.setInterval(() => { if (!inFlight.current) void refresh().catch(() => {}) }, 15000)
    return () => { window.clearInterval(timer); window.removeEventListener('offline', offline); window.removeEventListener('online', online) }
  }, [refresh])
  const run: RunCommand = async (type, payload, options) => {
    if (type.endsWith('.scan') && !Object.hasOwn(payload, "device")) payload = { ...payload, device: navigator.userAgent.slice(0, 120) }
    if (inFlight.current) { settleScan(scanLink(), false); return false }
    const signature = JSON.stringify({ type, payload })
    if (pending.current && signature !== pending.current.signature) {
      settleScan(scanLink(), false)
      setError('Recover the interrupted action first so its outcome is known before starting another command.')
      return false
    }
    inFlight.current = true
    setBusy(true); setError(''); setDetails(null); setNotice('')
    try {
      if (pending.current?.signature !== signature) pending.current = { signature, commandId: crypto.randomUUID(), actorId: state?.actor.id, scan: scanLink(), ...(state && floorCommand(type) ? { frontier: await floorFrontier(state) } : {}) }
      if (durableCommand(type)) sessionStorage.setItem(pendingKey, JSON.stringify(pending.current))
      // Reload before every retained floor action. A changed task cannot silently
      // retarget a scan to a new reservation. Existing results still replay by ID.
      if (floorCommand(type)) {
        const current = await refresh(pending.current.commandId)
        if (pending.current.actorId && pending.current.actorId !== current.actor.id) {
          setError('This interrupted action belongs to another operator. Sign in as that operator to reconcile its outcome.')
          setRecoverable({ type, payload, commandId: pending.current.commandId })
          return false
        }
        const recorded = current.commands.some((command: RecordData) => command.id === pending.current!.commandId)
        if (!recorded && pending.current.frontier !== await floorFrontier(current)) {
          settleScan(pending.current.scan, false)
          pending.current = null; sessionStorage.removeItem(pendingKey); setRecoverable(null)
          setError('Warehouse task or availability changed. The retained action was not sent. Review current allocations and scan the task again.')
          return false
        }
      }
      if (!navigator.onLine) throw new Error('Network connection is unavailable')
      const response = await fetch('/api/pier/commands', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ commandId: pending.current.commandId, type, payload }) })
      const body = readReply(await response.json())
      if (body.ok && !response.ok) throw new Error('The server response did not confirm the command outcome.')
      if (!body.ok) {
        if ((recoverable && [401, 403].includes(response.status)) || response.status >= 500 || ['TRANSACTION', 'UNCONFIRMED', 'BUSY', 'IMPORT_PUBLICATION'].includes(body.error.code)) {
          setRecoverable({ type, payload, commandId: pending.current.commandId })
          setError(body.error?.message || 'The transaction outcome is unconfirmed. Recover this exact command before starting another action.')
          setDetails(body.error?.details)
          return false
        }
        settleScan(pending.current.scan, false)
        pending.current = null
        sessionStorage.removeItem(pendingKey); setRecoverable(null)
        if (options?.onRefused) options.onRefused({ code: body.error?.code ?? '', message: body.error?.message || 'This action could not be completed.' })
        else { setError(body.error?.message || 'This action could not be completed.'); setDetails(body.error?.details) }
        await refresh(); return false
      }
      settleScan(pending.current.scan, true)
      pending.current = null
      sessionStorage.removeItem(pendingKey); setRecoverable(null)
      setNotice('Saved. Stock and document history are up to date.')
      try { await refresh() } catch { setError('The command saved successfully, but current records could not reload. Reload records before taking another action.') }
      return true
    } catch (cause) {
      if (cause instanceof TypeError || !navigator.onLine) { setConnected(false); setNetworkError(disconnected) }
      if (pending.current) setRecoverable({ type, payload, commandId: pending.current.commandId })
      setError(`${cause instanceof Error ? cause.message : 'Connection interrupted'}. Retry the same action to recover its recorded outcome.`)
      return false
    } finally { inFlight.current = false; setBusy(false) }
  }
  const recover = () => {
    if (!recoverable) return Promise.resolve(false)
    if (!pending.current) return Promise.resolve(false)
    return run(recoverable.type, recoverable.payload)
  }
  // Messages belong to the page that raised them; an interrupted command keeps its banner until recovered.
  const dismiss = useCallback(() => { if (pending.current) return; setError(''); setDetails(null); setNotice('') }, [])
  const reload = useCallback(async () => { await refresh() }, [refresh])
  return { state, run, refresh: reload, error: networkError || error, details, busy, notice, recoverable, recover, dismiss, connected }
}

export const records = (state: PierState, key: string): RecordData[] => Array.isArray(state[key]) ? state[key] : []
export const label = (rows: RecordData[], id: string) => { const row = rows.find(value => value.id === id); return row ? String(row.name || row.sku || row.reference || row.id) : id }
export const itemLabel = (state: PierState, id: string) => { const item = records(state, 'items').find(value => value.id === id); return item ? `${item.name} · ${item.sku}` : id }
export const unit = (state: PierState, id: string) => records(state, 'items').find(value => value.id === id)?.unit || ''
export const documentCommands = (state: PierState, id: string) => [...new Set(records(state, 'movements').filter(movement => movement.documentId === id).map(movement => String(movement.commandId)))].join(', ')
