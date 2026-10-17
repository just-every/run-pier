import { readReply } from '../wire'

export type PantryBankAccount = { id: string; name: string }
export type PantryAccount = { id: string; code: string; name: string; type: string; subtype: string }
type Lookup = { ok: true; baseUrl: string; accounts: PantryAccount[]; bankAccounts: PantryBankAccount[] } | { ok: false; message: string }

/** Ask Pier's server to check a Pantry credential and read Pantry's chart; nothing is saved. */
export async function loadPantryAccounts(payload: { baseUrl: string; integrationToken: string }): Promise<Lookup> {
  try {
    const response = await fetch('/api/pier/commands', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ commandId: crypto.randomUUID(), type: 'book.accounts', payload }) })
    const reply = readReply(await response.json())
    if (!reply.ok) return { ok: false, message: reply.error.message }
    const result = reply.result as { baseUrl: string; accounts: PantryAccount[]; bankAccounts: PantryBankAccount[] }
    return { ok: true, baseUrl: result.baseUrl, accounts: result.accounts, bankAccounts: result.bankAccounts }
  } catch {
    return { ok: false, message: 'Pier could not check Pantry. Check your connection and try again.' }
  }
}
