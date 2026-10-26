import { useState } from 'react'
import { QboConnectionForm } from './qbo-connection'
import { Facts } from '../controls'
import { BookConnectionForm, BookConnections, PantryIntro } from './connection'
import { SupplierBills } from './supplier-bills'
import { BookDocuments } from './documents'
import { BookReview } from './review'
import { ReceiptClosures } from './receipt-closure'
import { connections, jobs, needsReview, type BooksProps } from './model'

export function Books(props: BooksProps & { section?: string }) {
  const { state, run, busy } = props
  const [provider, setProvider] = useState(connections(state)[0]?.provider ?? 'pantry')
  const qbo = connections(state)[0]?.provider === 'qbo'
  const owner = state.actor.role === 'owner'
  const rows = jobs(state)
  const connected = connections(state).some(row => row.enabled)
  // Connecting needs the whole explanation, so every connect or reconnect opens Books settings.
  const edit = () => { window.location.hash = 'books/settings' }
  if (props.section === 'settings') return <>
    <div className="page-title"><div><h1>Books settings</h1><p className="muted">Ledger connection and posting accounts</p></div><a className="button" href="#books">Back to Books</a></div>
    {owner && <label className="field"><span>Ledger provider</span><select aria-label="Ledger provider" value={provider} onChange={e => setProvider(e.target.value as 'pantry' | 'qbo')}><option value="pantry">Pantry</option><option value="qbo">QuickBooks Online</option></select></label>}
    {provider === 'pantry' && <PantryIntro />}
    {owner ? provider === 'qbo' ? <QboConnectionForm {...props} /> : <BookConnectionForm {...props} connection={connections(state).find(c => c.provider === 'pantry')} close={() => { window.location.hash = 'books' }} /> : <p>The owner manages the books connection.</p>}
    <section className="panel"><h2>Connection status</h2><p>{!connected ? 'No ledger is connected.' : connections(state)[0]?.problem ? 'Connection needs attention. Review the details below.' : `Connected to ${qbo ? 'QuickBooks Online' : 'Pantry'}.`}</p>{connections(state)[0]?.problem && <p className="error">{connections(state)[0].problem}</p>}{owner && connected && <button disabled={busy} onClick={() => void run('book.disconnect', {})}>Disconnect</button>}</section>
  </>
  return <>
    <div className="page-title"><div><h1>Books</h1><p className="muted">Accounting documents, payments and reconciliation</p></div>{owner && <div className="actions"><a className="button" href="#books/settings">Books settings</a><button className="primary" disabled={busy || !connected} onClick={() => void run('book.sync', {})}>{busy ? 'Working…' : 'Sync now'}</button></div>}</div>
    <Facts values={[{ label: 'Posted', value: rows.filter(job => job.status === 'posted').length }, { label: 'Reconciled', value: rows.filter(job => job.status === 'reconciled').length }, { label: 'In review', value: rows.filter(needsReview).length }, { label: 'Pending', value: rows.filter(job => job.status === 'pending').length }]} />
    {!owner && <p className="muted">You can review accounting records. The owner manages the ledger connection, sync and review actions.</p>}
    <ReceiptClosures {...props} />
    <SupplierBills {...props} billId={props.section?.startsWith('purchase-') ? undefined : props.section} poId={props.section?.startsWith('purchase-') ? props.section.slice(9) : undefined} />
    <BookReview {...props} />
    <BookConnections {...props} edit={edit} />
    <BookDocuments {...props} />
    <section className="panel"><h2>Accounting exports</h2><p>Download documents for your accountant or manual import. An export does not confirm a posting or reconcile a document.</p><div className="actions"><a className="button" href="/api/pier/books/export.csv" download>Download CSV</a><a className="button" href="/api/pier/books/export.iif" download>Download QuickBooks Desktop IIF</a></div><p className="muted">IIF is for QuickBooks Desktop. For QuickBooks Online, review the CSV with your accountant and map it for manual import. QuickBooks Online connects from Books settings with explicit company authorization. Xero connection acceptance remains pending.</p></section>
  </>
}
