import { useState } from 'react'
import { Facts } from '../controls'
import { BookConnectionForm, BookConnections } from './connection'
import { BookDocuments } from './documents'
import { BookReview } from './review'
import { connections, jobs, needsReview, type BookConnection, type BooksProps } from './model'

export function Books(props: BooksProps) {
  const { state, run, busy } = props
  const [editor, setEditor] = useState<{ connection?: BookConnection } | null>(null)
  const owner = state.actor.role === 'owner'
  const rows = jobs(state)
  const connected = connections(state).some(row => row.enabled)
  function edit(connection?: BookConnection) {
    setEditor({ connection })
    requestAnimationFrame(() => document.getElementById('books-connection-editor')?.scrollIntoView({ block: 'start', behavior: 'smooth' }))
  }
  return <>
    <div className="page-title"><div><h1>Books</h1><p className="muted">Accounting documents, payments and reconciliation</p></div>{owner && <div className="actions"><button className="primary" disabled={busy || !connected} onClick={() => void run('book.sync', {})}>{busy ? 'Working…' : 'Sync now'}</button></div>}</div>
    <Facts values={[{ label: 'Posted', value: rows.filter(job => job.status === 'posted').length }, { label: 'Reconciled', value: rows.filter(job => job.status === 'reconciled').length }, { label: 'In review', value: rows.filter(needsReview).length }, { label: 'Pending', value: rows.filter(job => job.status === 'pending').length }]} />
    {!owner && <p className="muted">You can review accounting records. The owner manages the ledger connection, sync and review actions.</p>}
    <BookReview {...props} />
    {owner && editor && <BookConnectionForm {...props} connection={editor.connection} close={() => setEditor(null)} />}
    <BookConnections {...props} edit={edit} />
    <BookDocuments {...props} />
    <section className="panel"><h2>Accounting exports</h2><p>Download documents for your accountant or manual import. An export does not confirm a posting or reconcile a document.</p><div className="actions"><a className="button" href="/api/pier/books/export.csv" download>Download CSV</a><a className="button" href="/api/pier/books/export.iif" download>Download QuickBooks Desktop IIF</a></div><p className="muted">IIF is for QuickBooks Desktop. For QuickBooks Online, review the CSV with your accountant and map it for manual import. Direct QuickBooks Online and Xero connections are pending owner app authorization; their adapters have fixture tests only.</p></section>
  </>
}
