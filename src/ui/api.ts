import { useCallback, useEffect, useRef, useState } from 'react'
import { readReply, readState } from './wire'

export type RecordData = { id: string; version: number; [key: string]: any }
export type PierState = { version: number; actor: { id: string; name: string; role: string }; [key: string]: any }
export type RunCommand = (type: string, payload: object) => Promise<boolean>

export function usePier() {
  const [state, setState] = useState<PierState | null>(null)
  const [error, setError] = useState('')
  const [details, setDetails] = useState<unknown>(null)
  const [busy, setBusy] = useState(false)
  const inFlight = useRef(false)
  const [notice, setNotice] = useState('')
  const [recoverable, setRecoverable] = useState<{ type: string; payload: object; commandId: string } | null>(null)
  // A lost response keeps the identity for the exact request. Editing any input
  // produces a new request; a retry cannot post the same command twice.
  const pending = useRef<{ signature: string; commandId: string } | null>(null)
  const refresh = useCallback(async () => {
    const response = await fetch('/api/pier/state', { credentials: 'same-origin', cache: 'no-store' })
    const body = await response.json()
    if (!response.ok) { const failure = readReply(body); throw new Error(!failure.ok ? failure.error.message : 'Stock could not be loaded. Sign in again or retry.') }
    setState(readState(body))
  }, [])
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem('pier.pending-command')
      if (saved) { const value = JSON.parse(saved); pending.current = value; setRecoverable({ ...JSON.parse(value.signature), commandId: value.commandId }) }
    } catch { sessionStorage.removeItem('pier.pending-command') }
    refresh().catch(cause => setError(cause.message))
    const timer = window.setInterval(() => { if (!inFlight.current) void refresh().catch(() => {}) }, 15000)
    return () => window.clearInterval(timer)
  }, [refresh])
  const run: RunCommand = async (type, payload) => {
    if (inFlight.current) return false
    const signature = JSON.stringify({ type, payload })
    if (recoverable && signature !== JSON.stringify({ type: recoverable.type, payload: recoverable.payload })) {
      setError('Recover the interrupted action first so its outcome is known before starting another command.')
      return false
    }
    inFlight.current = true
    setBusy(true); setError(''); setDetails(null); setNotice('')
    try {
      if (pending.current?.signature !== signature) pending.current = { signature, commandId: crypto.randomUUID() }
      if (!['channel.save','book.connect','ai.save'].includes(type)) sessionStorage.setItem('pier.pending-command', JSON.stringify(pending.current))
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
        pending.current = null
        sessionStorage.removeItem('pier.pending-command'); setRecoverable(null)
        setError(body.error?.message || 'This action could not be completed.'); setDetails(body.error?.details)
        await refresh(); return false
      }
      pending.current = null
      sessionStorage.removeItem('pier.pending-command'); setRecoverable(null)
      setNotice('Saved. Stock and document history are up to date.')
      try { await refresh() } catch { setError('The command saved successfully, but current records could not reload. Reload records before taking another action.') }
      return true
    } catch (cause) {
      if (pending.current) setRecoverable({ type, payload, commandId: pending.current.commandId })
      setError(`${cause instanceof Error ? cause.message : 'Connection interrupted'}. Retry the same action to recover its recorded outcome.`)
      return false
    } finally { inFlight.current = false; setBusy(false) }
  }
  const recover = () => {
    if (!recoverable) return Promise.resolve(false)
    pending.current = { signature: JSON.stringify({ type: recoverable.type, payload: recoverable.payload }), commandId: recoverable.commandId }
    return run(recoverable.type, recoverable.payload)
  }
  return { state, run, refresh, error, details, busy, notice, recoverable, recover }
}

export const records = (state: PierState, key: string): RecordData[] => Array.isArray(state[key]) ? state[key] : []
export const label = (rows: RecordData[], id: string) => { const row = rows.find(value => value.id === id); return row ? String(row.name || row.sku || row.reference || row.id) : id }
export const itemLabel = (state: PierState, id: string) => { const item = records(state, 'items').find(value => value.id === id); return item ? `${item.name} · ${item.sku}` : id }
export const unit = (state: PierState, id: string) => records(state, 'items').find(value => value.id === id)?.unit || ''
export const documentCommands = (state: PierState, id: string) => [...new Set(records(state, 'movements').filter(movement => movement.documentId === id).map(movement => String(movement.commandId)))].join(', ')
