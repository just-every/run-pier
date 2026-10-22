import { useState, type Dispatch, type SetStateAction } from 'react'
import type { PierState } from '../api'

const prefix = 'pier.floor.'
export type ScanIntent = { id: string; code: string; count: string; status: 'waiting' | 'sending' | 'refused' }
export type ScanLink = { key: string; id: string }
let activeScan: ScanLink | undefined

export function readTask<T>(key: string, initial: T): T {
  try { const value = sessionStorage.getItem(prefix + key); return value ? JSON.parse(value) as T : initial } catch { return initial }
}
export function writeTask(key: string, value: unknown) { sessionStorage.setItem(prefix + key, JSON.stringify(value)) }

/** Tab-local inventory intent only. Native credentials and sessions never enter this store. */
export function bindFloorActor(actorId: string) {
  const previous = sessionStorage.getItem(prefix + 'actor')
  if (previous && previous !== actorId) {
    for (const key of Object.keys(sessionStorage)) if (key.startsWith(prefix)) sessionStorage.removeItem(key)
  }
  sessionStorage.setItem(prefix + 'actor', actorId)
}

export function useFloorTask<T>(key: string, initial: T): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => readTask('task:' + key, initial))
  const save: Dispatch<SetStateAction<T>> = next => setValue(previous => {
    const value = typeof next === 'function' ? (next as (value: T) => T)(previous) : next
    writeTask('task:' + key, value)
    return value
  })
  return [value, save]
}

export function scanLink() { return activeScan }
export async function withScan<T>(scan: ScanLink | undefined, send: () => Promise<T>) {
  activeScan = scan
  try { return await send() } finally { if (activeScan === scan) activeScan = undefined }
}
export function settleScan(scan: ScanLink | undefined, success: boolean) {
  if (!scan) return
  const key = 'scans:' + scan.key, entries = readTask<ScanIntent[]>(key, [])
  writeTask(key, success ? entries.filter(entry => entry.id !== scan.id) : entries.map(entry => entry.id === scan.id ? { ...entry, status: 'refused' } : entry))
  window.dispatchEvent(new CustomEvent('pier.floor.scans', { detail: scan.key }))
}

export const floorCommand = (type: string) => /^(receiving|wave|pick|pack)\./.test(type)
export const durableCommand = (type: string) => /^(item|location|party|supplierItem|po|receipt|order|dispatch|return|count|transfer|receiving|wave|pick|pack|carrier|proposal|reservation|import)\./.test(type)

/** Conservative frontier: any warehouse inventory/document change requires a new physical review. */
export async function floorFrontier(state: PierState) {
  const value = JSON.stringify(['waves', 'packs', 'receivings', 'orders', 'purchaseOrders', 'reservations', 'positions', 'items', 'locations', 'lots', 'serials', 'stocktakes'].map(key => state[key] ?? []))
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
}
