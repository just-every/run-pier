import { useState } from 'react'
import { Field, text } from '../controls'
import { records } from '../api'
import { connections, type BooksProps } from './model'

export function QboConnectionForm({ state, run, busy }: BooksProps) {
  const saved = connections(state).find(r => r.provider === 'qbo')
  const [token, setToken] = useState('')
  const [problem, setProblem] = useState('')
  const items = records(state, 'items'), parties = records(state, 'parties')
  async function connect(data: FormData) {
    setProblem('')
    const itemMappings = items.map(r => ({ sourceId: r.id, remoteId: text(data, `item-${r.id}`) })).filter(r => r.remoteId)
    const partyMappings = parties.map(r => ({ sourceId: r.id, remoteId: text(data, `party-${r.id}`) })).filter(r => r.remoteId)
    const ok = await run('book.qboConnect', { sandbox: text(data, 'environment') === 'sandbox', consent: data.get('consent') === 'on', realmId: text(data, 'realmId'), clientId: text(data, 'clientId'), clientSecret: text(data, 'clientSecret'), refreshToken: token,
      cutoverDate: text(data, 'cutoverDate'),openingInventoryValue:text(data,'openingInventoryValue'),cogsOpeningBalance:text(data,'cogsOpeningBalance'), inventoryAccountId: text(data, 'inventoryAccountId'), cogsAccountId: text(data, 'cogsAccountId'), revenueAccountId: text(data, 'revenueAccountId'), landedCostAccountId: text(data, 'landedCostAccountId'), purchaseTaxAccountId: text(data, 'purchaseTaxAccountId'), chargeItemId: text(data, 'chargeItemId'), clearingAccountId: text(data, 'clearingAccountId'), itemMappings, partyMappings })
    if (ok) { setToken(''); window.location.hash = 'books' }
    else setProblem('Connection was not saved. Check the error above and keep your current field values while correcting it.')
  }
  const account = (label: string, name: string, required = true) => <Field label={label} name={name} defaultValue={String(saved?.[name] ?? '')} required={required} inputMode="numeric" disabled={busy} />
  return <section className="panel"><h2>Connect QuickBooks Online</h2>
    <p>Use an Intuit app authorized for this US company with the Accounting scope. QuickBooks and its subscription are supplied by Intuit. Pier keeps credentials encrypted; archives omit them. Disconnect here stops Pier; revoke the app in QuickBooks to revoke Intuit authorization.</p>
    <details><summary>Supported posting and review</summary><p>Pier posts explicitly mapped USD, tax-exempt invoices, customer credits, supplier bills and inventory journals. Taxable sales, foreign currencies, channel settlements and automatic ledger changes require further mapping. They remain in review. Pier never changes an existing QuickBooks record to match a local edit.</p></details>
    <form onSubmit={e => { e.preventDefault(); if (!busy) void connect(new FormData(e.currentTarget)) }}>
      <div className="form-grid">
        <label className="field"><span>QuickBooks environment</span><select name="environment" defaultValue={saved?.sandbox === false ? 'production' : 'sandbox'} disabled={busy}><option value="sandbox">Sandbox company</option><option value="production">Production company</option></select></label>
        <Field label="Authorized company ID" name="realmId" defaultValue={String(saved?.realmId ?? '')} inputMode="numeric" disabled={busy} />
        <Field label="Intuit client ID" name="clientId" autoComplete="off" required={!saved} disabled={busy} />
        <Field label="Intuit client secret" name="clientSecret" type="password" autoComplete="off" required={!saved} disabled={busy} />
        <Field label="Authorized refresh token" name="refreshToken" type="password" autoComplete="off" value={token} onChange={setToken} required={!saved} disabled={busy} hint={saved ? 'Leave authorization fields blank to keep this company’s saved credential.' : 'Use the refresh token from your explicit Intuit company consent.'} />
        <Field label="Approved cutover date" name="cutoverDate" type="date" defaultValue={String(saved?.cutoverDate ?? '')} disabled={busy} />
        <Field label="Reviewed opening inventory USD" name="openingInventoryValue" defaultValue={String(saved?.openingInventoryValue ?? '')} inputMode="decimal" disabled={busy} /><Field label="Reviewed opening cost of goods USD" name="cogsOpeningBalance" defaultValue={String(saved?.cogsOpeningBalance ?? '')} inputMode="decimal" disabled={busy} />
        {account('Inventory asset account ID', 'inventoryAccountId')}{account('Cost of goods account ID', 'cogsAccountId')}{account('Sales income account ID', 'revenueAccountId')}
        {account('Freight and duty account ID', 'landedCostAccountId', false)}{account('Supplier tax account ID', 'purchaseTaxAccountId', false)}{account('Sales charge item ID', 'chargeItemId', false)}{account('Captured payment clearing account ID', 'clearingAccountId', false)}
      </div>
      <details open><summary>Explicit item and party mappings</summary><p>Enter the corresponding numeric record IDs from QuickBooks. Map items as non-inventory items so Pier alone owns physical quantities. Unmapped sources stay in review.</p><div className="form-grid">
        {items.map(r => <Field key={r.id} label={`QuickBooks item · ${r.sku}`} name={`item-${r.id}`} defaultValue={String((saved?.itemMappings as any[])?.find(m => m.sourceId === r.id)?.remoteId ?? '')} required={false} inputMode="numeric" disabled={busy} />)}
        {parties.map(r => <Field key={r.id} label={`QuickBooks ${r.kind} · ${r.name}`} name={`party-${r.id}`} defaultValue={String((saved?.partyMappings as any[])?.find(m => m.sourceId === r.id)?.remoteId ?? '')} required={false} inputMode="numeric" disabled={busy} />)}
      </div></details>
      <label className="check"><input name="consent" type="checkbox" required disabled={busy} /> I authorize Pier to send the supported accounting records to this company and read their financial state.</label>
      {problem && <p role="alert" className="error">{problem}</p>}
      <div className="form-actions"><button className="primary" disabled={busy}>{busy ? 'Connecting…' : 'Connect QuickBooks'}</button></div>
    </form>
  </section>
}
