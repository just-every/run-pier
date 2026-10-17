import { Field, Form, text } from '../controls'
import { when } from '../display'
import { connections, type BooksProps, type BookConnection } from './model'

export function BookConnectionForm({ run, busy, connection, close }: BooksProps & { connection?: BookConnection; close: () => void }) {
  async function connect(data: FormData) {
    const ok = await run('book.connect', {
      baseUrl: text(data, 'baseUrl').trim(), sessionCookie: text(data, 'sessionCookie').trim(),
      inventoryAccountId: text(data, 'inventoryAccountId').trim(), cogsAccountId: text(data, 'cogsAccountId').trim(),
      revenueAccountId: text(data, 'revenueAccountId').trim(),
      writeOffAccountId: text(data, 'writeOffAccountId').trim(),
      taxCode: text(data, 'taxCode'),
    })
    if (ok) close()
  }
  return <div id="books-connection-editor">
    <Form title={connection ? 'Reconnect Pantry' : 'Connect Pantry'} submit="Connect Pantry" busy={busy} onSubmit={connect} note="Use the Pantry owner's session. Pier encrypts the saved credential on the server; the cookie is not saved in browser storage.">
      <Field label="Pantry URL" name="baseUrl" type="url" defaultValue={connection?.baseUrl ?? ''} disabled={busy} hint="The address of your Pantry installation. Do not include credentials in the URL." />
      <Field label="Pantry owner session cookie" name="sessionCookie" type="password" autoComplete="off" spellCheck={false} disabled={busy} hint="Sign in to Pantry as its owner, then copy the session cookie name=value from your browser's developer tools → Application → Cookies." />
      <Field label="Inventory asset account ID" name="inventoryAccountId" defaultValue={connection?.inventoryAccountId ?? ''} disabled={busy} hint="From Pantry's chart of accounts: the asset account holding stock value. Copy its ID, rather than its account code." />
      <Field label="Cost of goods sold account ID" name="cogsAccountId" defaultValue={connection?.cogsAccountId ?? ''} disabled={busy} hint="The expense account for the cost of stock sold." />
      <Field label="Sales revenue account ID" name="revenueAccountId" defaultValue={connection?.revenueAccountId ?? ''} disabled={busy} hint="The income account for sales." />
      <Field label="Damaged stock expense account ID" name="writeOffAccountId" required={false} disabled={busy} defaultValue={connection?.writeOffAccountId ?? ''} hint="Optional. Required before writing off damaged returns; choose the expense account in Pantry." />
      <label className="field"><span>Tax treatment for exported invoices</span><select aria-label="Tax treatment for exported invoices" name="taxCode" required defaultValue={connection ? 'exempt' : ''} disabled={busy}><option value="">Choose tax treatment</option><option value="exempt">All exported invoices are tax-exempt</option></select><small>Choose this only for tax-exempt wholesale invoices. Pier does not yet map nonzero sales tax to Pantry; Pantry refuses unknown or undecided tax treatment.</small></label>
      <button type="button" disabled={busy} onClick={close}>Cancel</button>
    </Form>
    <p className="muted">Open Pantry → Chart of accounts to choose the accounts above. These mappings determine where Pier posts inventory, sales and cost of goods sold.</p>
    <p className="muted">Pantry v0.2.0 supports financial writes through owner sessions only. Its agent tokens cannot post bills or read payments. This connection expires with that session; reconnect here after expiry. Disconnect stops Pier sends; sign out that session in Pantry to revoke its access.</p>
  </div>
}

export function BookConnections({ state, run, busy, edit }: BooksProps & { edit: (connection?: BookConnection) => void }) {
  const rows = connections(state)
  const owner = state.actor.role === 'owner'
  return <section className="panel"><h2>Ledger connection</h2>
    {!rows.length && <p>Connect Pantry to send accounting documents and check their posted state.</p>}
    {rows.map(row => <div className="record" key={row.id}>
      <h3>Pantry · {row.enabled ? 'Connected' : 'Disconnected'}</h3>
      <p>{row.baseUrl}</p><p className="muted">Credential: encrypted owner session · expires with Pantry sign-in</p>
      <p className="muted">{row.lastSync ? `Last checked: ${when(row.lastSync)}` : 'Not checked yet.'}</p>
      {row.problem && <p className="error">{row.problem}</p>}
      {owner && <div className="actions"><button disabled={busy} onClick={() => edit(row)}>Reconnect Pantry</button>{row.enabled && <button disabled={busy} onClick={() => void run('book.disconnect', {})}>Disconnect</button>}</div>}
    </div>)}
    {owner && !rows.length && <button disabled={busy} onClick={() => edit()}>Connect Pantry</button>}
  </section>
}
