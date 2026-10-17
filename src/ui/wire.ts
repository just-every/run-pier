import type { PierState } from './api'

type CommandReply = { ok: true; result: unknown; version: number } | { ok: false; error: { code: string; message: string; details?: unknown } }
const object = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const collections = ['items', 'locations', 'parties', 'supplierItems', 'orders', 'purchaseOrders', 'receipts', 'transfers', 'shipments', 'returns', 'counts', 'proposals', 'imports', 'roles', 'movements', 'reservations', 'commands', 'operators', 'people', 'priceLists', 'costingMethods']

export function readState(value: unknown): PierState {
  const actor = object(value) ? value.actor : null
  if (!object(value) || !Number.isSafeInteger(value.version) || Number(value.version) < 0 || !object(actor) || !['id', 'name', 'role'].every(key => typeof actor[key] === 'string')) throw new Error('The server returned an invalid stock-state envelope. Reload records or sign in again.')
  for (const key of collections) {
    const rows = value[key]
    if (!Array.isArray(rows) || !rows.every((row: unknown) => object(row) && typeof row.id === 'string')) throw new Error(`The server returned invalid ${key} records. Reload before taking an action.`)
  }
  if (!Array.isArray(value.positions) || !value.positions.every((position: unknown) => object(position) && ['itemId', 'locationId', 'status', 'quantity', 'reserved', 'available'].every(key => typeof position[key] === 'string'))) throw new Error('The server returned invalid stock positions. Reload records before proceeding.')
  return value as PierState
}

export function readReply(value: unknown): CommandReply {
  if (!object(value)) throw new Error('The server response did not confirm the command outcome.')
  if (value.ok === true && Number.isSafeInteger(value.version) && 'result' in value) return { ok: true, version: Number(value.version), result: value.result }
  if (value.ok === false && object(value.error) && typeof value.error.code === 'string' && typeof value.error.message === 'string') return { ok: false, error: { code: value.error.code, message: value.error.message, details: value.error.details } }
  throw new Error('The server response did not confirm the command outcome.')
}
