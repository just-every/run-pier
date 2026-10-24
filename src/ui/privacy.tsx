import { useEffect, useRef, useState } from 'react'
import { records, type PierState, type RunCommand } from './api'
import { Evidence, Select } from './controls'
import { words, when } from './display'

export function PrivacyReview({ state, run, busy }: { state: PierState; run: RunCommand; busy: boolean }) {
  const [kind, setKind] = useState('attachment'), [subjectId, setSubjectId] = useState(''), [preview, setPreview] = useState<any>(null)
  const [reading, setReading] = useState(false), [problem, setProblem] = useState(''), [confirmed, setConfirmed] = useState(false)
  const request = useRef<AbortController | null>(null)
  useEffect(() => { request.current?.abort(); setPreview(null); setConfirmed(false); setReading(false) }, [state.version, kind, subjectId])
  useEffect(() => () => request.current?.abort(), [])
  const subjects = kind === 'attachment' ? records(state, 'evidenceDocuments') : kind === 'operator' ? records(state, 'operators').filter(operator => operator.id !== state.actor.id) : records(state, 'parties').filter(party => party.kind === kind)
  async function inspect() {
    const controller = new AbortController(); request.current?.abort(); request.current = controller
    setReading(true); setProblem(''); setPreview(null); setConfirmed(false)
    try {
      const response = await fetch('/api/pier/privacy?' + new URLSearchParams({ kind, subjectId }), { cache: 'no-store', signal: controller.signal })
      const body: any = await response.json()
      if (!response.ok) throw new Error(body.error?.message ?? 'Dependencies could not be inspected.')
      if (!controller.signal.aborted) setPreview(body)
    } catch (cause) { if (!controller.signal.aborted) setProblem((cause as Error).message) } finally { if (!controller.signal.aborted) setReading(false) }
  }
  return <section className="panel"><details><summary>Retention and erasure</summary>
    <p>Inspect dependencies and holds before an explicit irreversible erasure. Permanent stock and accounting facts retain opaque identities. External copies and delivered messages remain outside local deletion.</p>
    <div className="form-grid"><label className="field"><span>Erasure subject kind</span><select aria-label="Erasure subject kind" value={kind} onChange={event => { setKind(event.target.value); setSubjectId('') }}><option value="attachment">Attachment</option><option value="customer">Customer</option><option value="supplier">Supplier</option><option value="operator">Operator</option></select></label>
      <Select label="Erasure subject" rows={subjects} value={subjectId} onChange={setSubjectId} />
    </div>
    <button disabled={reading || busy || !subjectId} onClick={() => void inspect()}>Inspect erasure dependencies</button>
    {problem && <p role="alert">{problem}</p>}
    {preview && <div><h3>Erasure dependency review</h3><p>{preview.allowed ? 'Eligible for explicit owner confirmation.' : 'Erasure is blocked by the dependencies listed below.'}</p><Evidence value={{ counts: preview.counts, holds: preview.holds, blockers: preview.blockers }} /><details><summary>Exact dependencies and retained scope</summary><Evidence value={preview} /></details>
      {preview.allowed && <><label className="check"><input type="checkbox" aria-label="Confirm irreversible local erasure" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />Confirm irreversible local erasure and the retained minimum</label>
        <button disabled={busy || !confirmed} onClick={() => void run(kind === 'attachment' ? 'privacy.eraseAttachment' : 'privacy.eraseSubject', { kind, subjectId, documentId: kind === 'attachment' ? subjectId : undefined, planHash: preview.planHash, confirm: confirmed })}>Erase reviewed local data</button></>}
    </div>}
    {records(state, 'privacyReceipts').map(receipt => <details key={receipt.id}><summary>{words(receipt.kind)} erasure · {when(receipt.completedAt)}</summary><Evidence value={receipt} /></details>)}
  </details></section>
}
