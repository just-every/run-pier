import { useState } from 'react'
import { type RecordData } from './api'
import { Evidence, Table } from './controls'
import { identity } from './import-words'

export function ImportSource({ batch }: { batch: RecordData }) {
  const [page, setPage] = useState(0)
  const rows = batch.source?.records || []
  return <>{batch.moveIn && <><h3>Source field coverage</h3><Table headings={['Original file / column', 'Mapping', 'Retained archive reason']}>{batch.moveIn.coverage.map((entry: any, i: number) => <tr key={i}><td>{entry.artifact}<small>{entry.column}</small></td><td>{entry.fields.join(', ') || entry.disposition}</td><td>{entry.reason || '—'}</td></tr>)}</Table>{batch.moveIn.excluded.length > 0 && <details><summary>{batch.moveIn.excluded.length} unsupported rows retained without posting</summary><Evidence value={batch.moveIn.excluded} /></details>}</>}<h3>Immutable originals and row mapping</h3>{(batch.source?.artifacts || []).map((artifact: any) => <div className="record" key={artifact.sha256}><strong>{artifact.name}</strong><small>SHA-256 {artifact.sha256} · {artifact.size} bytes</small>{artifact.original?.status === 'available' && <a className="button" download={artifact.name} href={`data:text/csv;base64,${artifact.original.base64}`}>Download retained original CSV</a>}</div>)}
    <Table headings={['Source identity', 'Original file / row', 'Native mapping', 'Content digest']}>{rows.slice(page * 25, (page + 1) * 25).map((row: any, index: number) => <tr key={`${row.kind}-${row.sourceId}-${index}`}><td>{row.namespace} · {row.kind} · {identity(row.sourceId)}</td><td>{row.location?.artifact} / {row.location?.row}</td><td><details><summary>Inspect mapped fields</summary><Evidence value={row.payload} /></details></td><td><small>{row.payloadHash}</small></td></tr>)}</Table>
    <div className="actions"><button disabled={page === 0} onClick={() => setPage(value => value - 1)}>Previous rows</button><span>Rows {rows.length ? page * 25 + 1 : 0}–{Math.min((page + 1) * 25, rows.length)} of {rows.length}</span><button disabled={(page + 1) * 25 >= rows.length} onClick={() => setPage(value => value + 1)}>Next rows</button></div>
    <details><summary>Native record links and posting journal</summary><Evidence value={batch.links} /><Evidence value={batch.postedRows} /><Evidence value={batch.review} /><Evidence value={batch.reviewedRevisions} /></details>
  </>
}
