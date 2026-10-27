import { PantryRefusal } from './adapters/pantry-client';

/** One fresh, paged readback for the posted journals this sync must verify. */
export async function journalReadback(request: (path: string) => Promise<any>, ids: string[]) {
  const pending = new Set(ids), journals = new Map<string, any>(), cursors = new Set<string>();
  let cursor: string | null = null;
  while (pending.size) {
    const query = new URLSearchParams({ limit: '100', ...(cursor ? { cursor } : {}) });
    const page = await request('journals?' + query);
    if (!Array.isArray(page.entries) || page.nextCursor !== null && (typeof page.nextCursor !== 'string' || !page.nextCursor))
      throw new PantryRefusal('Pantry returned an incomplete journal page. Restore journal visibility before reconciling.', 502);
    for (const entry of page.entries) {
      if (!entry || typeof entry.id !== 'string')
        throw new PantryRefusal('Pantry returned an invalid journal identity. Review the ledger before reconciling.', 502);
      if (!ids.includes(entry.id)) continue;
      if (journals.has(entry.id))
        throw new PantryRefusal('Pantry repeated a journal identity. Review the ledger before reconciling.', 502);
      journals.set(entry.id, entry); pending.delete(entry.id);
    }
    cursor = page.nextCursor;
    if (!cursor) break;
    if (cursors.has(cursor))
      throw new PantryRefusal('Pantry repeated a journal cursor. Restore journal visibility before reconciling.', 502);
    cursors.add(cursor);
  }
  return journals;
}
