import { useState } from 'react'
import { Field, text } from '../controls'
import { when } from '../display'
import { connections, type BooksProps, type BookConnection } from './model'
import { loadPantryAccounts, type PantryAccount, type PantryBankAccount } from './pantry-lookup'

// Connecting Pantry from this page alone: what Pantry is and how to start it,
// the credential to create inside Pantry, then accounts picked from the list
// Pantry returns. No account IDs or browser cookies are copied by hand.

const SCOPES = 'Contacts, Invoices, Bills, Journals, Documents, Payments readback, Record external payments, Vendor credits read and write, Reports and Post approved sibling records'
const option = (a: PantryAccount) => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>
const kinds = {
  inventory: (a: PantryAccount) => a.type === 'asset' && !['bank', 'receivable'].includes(a.subtype),
  expense: (a: PantryAccount) => a.type === 'expense',
  income: (a: PantryAccount) => a.type === 'income',
}
const guess = (rows: PantryAccount[], words: RegExp, saved?: string) => saved && rows.some(a => a.id === saved) ? saved : rows.find(a => words.test(a.name))?.id ?? ''

export function PantryIntro() {
  return <section className="panel"><h2>What Pantry is</h2>
    <p>Pantry is the bookkeeping app from the same family as Pier: invoices, bills, payments and reports, on your own computer or your own Cloudflare account. Pier sends it a bill for each supplier invoice you approve, the freight and duty it adds to received stock, an invoice and cost of goods for each shipment, and credits for returns, then reads back what was paid.</p>
    <p><strong>No Pantry yet?</strong> Start one on this computer with <code>rer dev just-every/run-pantry</code> (the <code>rer</code> command from <a href="https://run-pier.com/run" target="_blank" rel="noreferrer">run-pier.com/run</a>), or follow the steps on <a href="https://run-pantry.com/run" target="_blank" rel="noreferrer">run-pantry.com/run</a>. Open the link it prints, finish Pantry's setup, and choose its chart of accounts.</p>
    <p className="muted">Step-by-step guide: <a href="https://run-pier.com/docs/books" target="_blank" rel="noreferrer">Books and Pantry</a>.</p>
  </section>
}

export function BookConnectionForm({ run, busy, connection, close }: BooksProps & { connection?: BookConnection; close: () => void }) {
  const [baseUrl, setBaseUrl] = useState(connection?.baseUrl ?? '')
  const [token, setToken] = useState('')
  const [accounts, setAccounts] = useState<PantryAccount[] | null>(null)
  const [bankAccounts, setBankAccounts] = useState<PantryBankAccount[]>([])
  const [checking, setChecking] = useState(false)
  const [problem, setProblem] = useState('')
  const keepCredential = !!connection?.enabled && connection.credentialPresent !== false && baseUrl.trim().replace(/\/$/, '') === connection.baseUrl
  async function check() {
    setChecking(true); setProblem('')
    const reply = await loadPantryAccounts({ baseUrl: baseUrl.trim(), integrationToken: token.trim() })
    setChecking(false)
    if (!reply.ok) { setAccounts(null); setProblem(reply.message); return }
    setBaseUrl(reply.baseUrl); setAccounts(reply.accounts); setBankAccounts(reply.bankAccounts)
  }
  async function connect(data: FormData) {
    const ok = await run('book.connect', {
      baseUrl: baseUrl.trim(), integrationToken: token.trim(),
      inventoryAccountId: text(data, 'inventoryAccountId'), cogsAccountId: text(data, 'cogsAccountId'),
      revenueAccountId: text(data, 'revenueAccountId'), writeOffAccountId: text(data, 'writeOffAccountId'), landedCostAccountId: text(data, 'landedCostAccountId'), purchaseTaxAccountId: text(data, 'purchaseTaxAccountId'),
      writeOffReasonCode: text(data, 'writeOffReasonCode'), writeOffApprovalLimit: text(data, 'writeOffApprovalLimit'), stripeBankAccountId: text(data, 'stripeBankAccountId'), taxCode: text(data, 'taxCode'),
    })
    if (ok) { setToken(''); close() }
  }
  const inventory = accounts?.filter(kinds.inventory) ?? [], expenses = accounts?.filter(kinds.expense) ?? [], income = accounts?.filter(kinds.income) ?? []
  const missing = accounts && [!inventory.length && 'an inventory account (type Asset, for example 1300 Inventory)', !expenses.length && 'a cost of goods sold account (type Expense, for example 5000 Cost of goods sold)', !income.length && 'a sales account (type Income, for example 4100 Product sales)'].filter(Boolean)
  return <div id="books-connection-editor">
    <section className="panel"><h2>{connection ? 'Reconnect Pantry' : 'Connect Pantry'}</h2>
      <p className="muted"><strong>Provider costs.</strong> Pantry is open source. If you host it online, your hosting provider bills any hosting and usage charges under your account. Review those rates before connecting. Pier charges no connection, license or per-seat fee.</p>
      <h3>1. Create a credential for Pier inside Pantry</h3>
      <ol className="steps">
        <li>In Pantry, open <strong>People &amp; settings</strong> and scroll to <strong>Integration credentials</strong>.</li>
        <li>Name it <strong>Pier</strong> and tick <strong>{SCOPES}</strong>.</li>
        <li>Choose <strong>Create integration credential</strong> and copy the value. Pantry shows it once; it starts with <code>pantry_integration_</code>.</li>
      </ol>
      <p className="muted">The credential cannot sign in or move money. Revoke it in the same place in Pantry to stop Pier at once.</p>
      <h3>2. Tell Pier where Pantry is</h3>
      <div className="form-grid">
        <Field label="Pantry address" name="baseUrl" type="url" value={baseUrl} onChange={value => { setBaseUrl(value); setAccounts(null) }} disabled={busy || checking} placeholder="http://localhost:8790" hint="Copy it from the address bar of Pantry's browser tab, up to the first single slash: for example http://localhost:8790 on this computer, or https://books.example.com once Pantry is online." />
        <Field label="Pantry integration credential" name="integrationToken" type="password" value={token} onChange={value => { setToken(value); setAccounts(null) }} required={!keepCredential} autoComplete="off" spellCheck={false} disabled={busy || checking} hint={keepCredential ? 'Leave blank to keep the saved credential, or paste a new one to replace it.' : 'Paste the value you copied in step 1. Pier keeps it encrypted on its server, never in this browser.'} />
      </div>
      <div className="form-actions"><button type="button" className={accounts ? undefined : 'primary'} disabled={busy || checking || !baseUrl.trim() || (!token.trim() && !keepCredential)} onClick={() => void check()}>{checking ? 'Checking Pantry…' : 'Check Pantry and load accounts'}</button><button type="button" disabled={busy} onClick={close}>Cancel</button></div>
      {problem && <p className="error" role="alert">{problem}</p>}
    </section>
    {accounts && <section className="panel"><h2>3. Choose where Pier posts</h2>
      <p className="muted">Connected to {baseUrl}. These are the active accounts in Pantry's chart.</p>
      {missing && missing.length > 0 && <p className="error">Pantry's chart has no {missing.join(', no ')}. In Pantry open <strong>Books → Chart of accounts → Add an account</strong>, choose <strong>Ordinary account</strong> for Role, add it, then choose <strong>Check Pantry and load accounts</strong> again.</p>}
      <form onSubmit={event => { event.preventDefault(); if (!busy) void connect(new FormData(event.currentTarget)) }}><div className="form-grid">
        <label className="field"><span>Inventory (stock value)</span><select aria-label="Inventory account" name="inventoryAccountId" required defaultValue={guess(inventory, /inventor|stock/i, connection?.inventoryAccountId)}><option value="">Choose an asset account</option>{inventory.map(option)}</select><small>The asset account that holds the value of stock on your shelves.</small></label>
        <label className="field"><span>Cost of goods sold</span><select aria-label="Cost of goods sold account" name="cogsAccountId" required defaultValue={guess(expenses, /cost of goods|cogs/i, connection?.cogsAccountId)}><option value="">Choose an expense account</option>{expenses.map(option)}</select><small>The expense account for the cost of what you ship.</small></label>
        <label className="field"><span>Sales</span><select aria-label="Sales account" name="revenueAccountId" required defaultValue={guess(income, /product|sales/i, connection?.revenueAccountId)}><option value="">Choose an income account</option>{income.map(option)}</select><small>The income account for what customers pay for goods.</small></label>
        <label className="field"><span>Damaged stock (optional)</span><select aria-label="Damaged stock account" name="writeOffAccountId" defaultValue={guess(expenses, /damage|write.?off|shrink/i, connection?.writeOffAccountId ?? undefined)}><option value="">Not yet: damaged returns wait for this</option>{expenses.map(option)}</select><small>The expense account for damaged returns you write off.</small></label><Field label="Write-off reason code" name="writeOffReasonCode" defaultValue="damaged" required={false} hint="Saving a code maps it to the selected damaged stock expense account. Earlier code mappings remain available." /><Field label="Write-off owner approval limit USD" name="writeOffApprovalLimit" defaultValue="0" inputMode="decimal" hint="Amounts above this limit require explicit owner approval. The exact cost and mapping stay on the return." />
        <label className="field"><span>Freight and duty (needed once a receipt carries them)</span><select aria-label="Freight and duty account" name="landedCostAccountId" defaultValue={guess(expenses, /freight|duty|customs|shipping|postage/i, connection?.landedCostAccountId ?? undefined)}><option value="">Not yet: receipts with freight or duty wait for this</option>{expenses.map(option)}</select><small>The expense account you enter carrier and customs bills against in Pantry. Pier moves the freight and duty it spreads over received stock from there into Inventory.</small></label>
        <label className="field"><span>Supplier invoice tax (needed once an invoice carries it)</span><select aria-label="Purchase tax account" name="purchaseTaxAccountId" defaultValue={guess(expenses, /tax/i, connection?.purchaseTaxAccountId ?? undefined)}><option value="">Not yet: supplier invoices with tax wait for this</option>{expenses.map(option)}</select><small>The account Pier posts approved supplier-invoice tax to. Pier does not decide whether that tax is recoverable.</small></label>
        <label className="field"><span>Stripe payments from Stall (optional)</span><select aria-label="Stripe payment account" name="stripeBankAccountId" defaultValue={connection?.stripeBankAccountId ?? ''}><option value="">Not yet: paid shop invoices wait for this</option>{bankAccounts.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}</select><small>Choose the Pantry bank or Stripe clearing account that holds money Stripe collected. In Pantry open Bank → Statements → Add a bank or card account to create one. Grant Record external payments when creating Pier's credential, then load accounts again. Use the existing Checking ledger account or create a separate Asset account with the Bank or card role in Books → Chart of accounts. Enter the real last four digits, opening date and balance. This records money already collected; it does not charge the customer.</small></label>
        <label className="field"><span>Sales tax on invoices</span><select aria-label="Tax treatment for exported invoices" name="taxCode" required defaultValue={connection ? 'exempt' : ''}><option value="">Choose tax treatment</option><option value="exempt">All invoices Pier sends are tax-exempt (wholesale)</option></select><small>Pier does not yet send taxable invoices to Pantry. Choose this only for tax-exempt wholesale sales.</small></label>
      </div><div className="form-actions"><button className="primary" type="submit" disabled={busy || inventory.length === 0 || expenses.length === 0 || income.length === 0}>{busy ? 'Saving…' : connection ? 'Save and reconnect' : 'Connect Pantry'}</button></div></form>
    </section>}
  </div>
}

export function BookConnections({ state, run, busy, edit }: BooksProps & { edit: (connection?: BookConnection) => void }) {
  const rows = connections(state)
  const owner = state.actor.role === 'owner'
  return <section className="panel"><h2>Ledger connection</h2>
    {!rows.length && <p>Connect Pantry to send accounting documents and check their posted state.</p>}
    {rows.map(row => <div className="record" key={row.id}>
      <h3>{row.provider === 'qbo' ? 'QuickBooks Online' : 'Pantry'} · {!row.enabled ? 'Disconnected' : row.problem ? 'Connection broken' : 'Connected'}</h3>
      <p>{row.baseUrl}</p><p className="muted">Credential kept encrypted · revoke it in {row.provider === 'qbo' ? 'QuickBooks' : 'Pantry'} to stop Pier</p>
      <p className="muted">{row.lastSync ? `Last checked: ${when(row.lastSync)}` : 'Not checked yet.'}</p>
      {row.problem && <p className="error">{row.problem}</p>}
      {owner && <div className="actions"><button className={row.problem ? 'primary' : undefined} disabled={busy} onClick={() => edit(row)}>Reconnect {row.provider === 'qbo' ? 'QuickBooks' : 'Pantry'}</button>{row.enabled && <button disabled={busy} onClick={() => void run('book.disconnect', {})}>Disconnect</button>}</div>}
    </div>)}
    {owner && !rows.length && <button disabled={busy} onClick={() => edit()}>Connect Pantry</button>}
  </section>
}
