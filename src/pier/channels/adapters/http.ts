import type { ChannelConfig } from './types'

export type JsonObject = Record<string, unknown>

export function object(value: unknown, label = 'provider response'): JsonObject {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`Invalid ${label}`)
  return value as JsonObject
}

export function array(value: unknown, label = 'provider collection'): unknown[] {
  if (!Array.isArray(value)) throw new Error(`Invalid ${label}`)
  return value
}

export function string(value: unknown, label = 'provider field', allowEmpty = false): string {
  if (typeof value !== 'string' || (!allowEmpty && !value.trim())) throw new Error(`Invalid ${label}`)
  return value
}

export function integer(value: unknown, label = 'quantity'): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw new Error(`Invalid ${label}`)
  return value
}

export function stockQuantity(value: string): number {
  if (!/^(0|[1-9]\d*)(?:\.0+)?$/.test(value)) throw new Error('Channel stock requires a nonnegative whole-unit quantity')
  const quantity = Number(value)
  if (!Number.isSafeInteger(quantity) || quantity > 2_147_483_647) throw new Error('Channel stock quantity exceeds the provider limit')
  return quantity
}

export function decimal(value: unknown): string {
  if (typeof value !== 'string' || !/^\d+(?:\.\d+)?$/.test(value)) throw new Error('Invalid provider price')
  return value
}

export function credential(config: ChannelConfig, name: string): string {
  const value = config.credentials[name]
  if (!value?.trim()) throw new Error(`Missing ${config.provider} credential: ${name}`)
  return value
}

export function baseUrl(config: ChannelConfig): URL {
  let url: URL
  try { url = new URL(config.baseUrl) } catch { throw new Error('Invalid channel base URL') }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  if ((url.protocol !== 'https:' && !(local && url.protocol === 'http:')) || url.username || url.password || url.search || url.hash) {
    throw new Error('Channel base URL must use HTTPS without credentials, query or fragment')
  }
  return url
}

/** Never follow redirects with a provider credential, or expose provider bodies/tokens in errors. */
export async function request(url: URL | string, init: RequestInit, operation: string): Promise<{ response: Response; body: unknown }> {
  let response: Response
  try {
    response = await fetch(url, { ...init, redirect: 'manual', signal: AbortSignal.timeout(30_000) })
  } catch {
    throw new Error(`${operation}: network request failed; reconcile any possible external write before replay`)
  }
  if (!response.ok) throw new Error(`${operation}: provider HTTP ${response.status}`)
  let body: unknown
  try { body = await response.json() } catch { throw new Error(`${operation}: invalid JSON response`) }
  return { response, body }
}

export function unique<T>(rows: T[], identity: (row: T) => string): void {
  const seen = new Set<string>()
  for (const row of rows) {
    const id = identity(row)
    if (seen.has(id)) throw new Error('Provider pagination returned a duplicate identity; reconcile before importing')
    seen.add(id)
  }
}

export function nextToken(value: unknown, seen: Set<string>): string | undefined {
  if (value === undefined || value === null) return undefined
  const token = string(value, 'pagination token')
  if (seen.has(token)) throw new Error('Provider pagination repeated a cursor')
  seen.add(token)
  return token
}
