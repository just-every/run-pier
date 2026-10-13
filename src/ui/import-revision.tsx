import { type RecordData, type RunCommand } from './api'
import { Evidence, Field, Form, text } from './controls'

export function RevisionReview({ batch, run, busy }: { batch: RecordData; run: RunCommand; busy: boolean }) {
  const conflicts = (batch.errors || []).filter((error: any) => error.code === 'REVISION_REVIEW')
  if (!conflicts.length) return null
  return <Form title="Review changed source rows" submit="Approve selected replacements and re-preview" busy={busy} note="Original files and revision history remain immutable. Replacements preserve source identity and are checked against downstream movements before admission." onSubmit={data => run('import.revise', { batchId: batch.id, version: batch.version, reason: text(data, 'reason'), decisions: conflicts.filter((_: any, index: number) => data.get(`replace-${index}`) === 'on').map((error: any) => ({ kind: error.details.kind, key: error.details.key, action: 'replace' })) })}>
    {conflicts.map((error: any, index: number) => <fieldset key={index}><legend>{error.details.kind} · source row {error.details.key}</legend><h3>Previous accepted row</h3><Evidence value={error.details.previous} /><h3>Proposed revision</h3><Evidence value={error.details.proposed} /><label className="check"><input type="checkbox" name={`replace-${index}`} />Approve replacement of this exact source row</label></fieldset>)}
    <Field label="Revision decision reason" name="reason" />
  </Form>
}
