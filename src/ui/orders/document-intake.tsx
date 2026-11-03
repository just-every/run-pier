import { useEffect, useState } from 'react';
import type { PierState, RecordData, RunCommand } from '../api';
import { Form, Table } from '../controls';
import { DocumentSettings } from './document-settings';
import { DocumentReview } from './document-review';

type Evidence = { documents: RecordData[]; extractions: RecordData[]; settings: RecordData; inboundSettings: RecordData; inbox: RecordData[] };
export function DocumentIntake({ state, run, busy }: { state: PierState; run: RunCommand; busy: boolean }) {
  const [evidence, setEvidence] = useState<Evidence | null>(null), [error, setError] = useState('');
  const [file, setFile] = useState<{name:string;mimeType:string;base64:string} | null>(null), [consents, setConsents] = useState<Record<string, boolean>>({});
  useEffect(() => {
    if (state.actor.role !== 'owner') return;
    const controller = new AbortController();
    fetch('/api/pier/documents', { credentials: 'same-origin', cache: 'no-store', signal: controller.signal })
      .then(async r => { if (!r.ok) throw new Error('Document evidence could not be loaded. Retry after reconnecting.'); return r.json() as Promise<Evidence>; })
      .then(data => { setEvidence(data); setError(''); })
      .catch(e => { if (!controller.signal.aborted) setError(e.message); });
    return () => controller.abort();
  }, [state.version, state.actor.role]);
  if (state.actor.role !== 'owner') return null;
  return <details><summary>Evidence documents and extracted orders</summary>
    {error && <p role="alert">{error}</p>}
    <Form title="Retain a customer or supplier original" submit="Upload original for review" busy={busy} disabled={!file}
      note="PDF, PNG or JPEG up to 1 MiB. Originals remain private to the owner. An upload creates no order and is not permission to send it to a model."
      onSubmit={async () => file ? run('document.upload', file) : false}>
      <label className="field"><span>Business original</span><input aria-label="Business original" type="file" accept="application/pdf,image/png,image/jpeg" required
        onChange={async e => {
          setFile(null); setError(''); const chosen = e.target.files?.[0]; if (!chosen) return;
          if (chosen.size > 1024 * 1024) { setError('Choose an original up to 1 MiB.'); return; }
          try {
            const bytes = new Uint8Array(await chosen.arrayBuffer()); let raw = '';
            for (let i = 0; i < bytes.length; i += 8192) raw += String.fromCharCode(...bytes.subarray(i, i + 8192));
            setFile({ name: chosen.name, mimeType: chosen.type, base64: btoa(raw) });
          } catch { setError('This file could not be read. Select it again.'); }
        }} /></label>
    </Form>
    {evidence && <>
      <DocumentSettings inboundSettings={evidence.inboundSettings} settings={evidence.settings} run={run} busy={busy} />
      <section className="panel"><h2>Retained business originals</h2>
        {!evidence.documents.length ? <p>No originals retained.</p> : <Table headings={['Original', 'Source', 'Pages / bytes', 'Review']}>
          {evidence.documents.map(d => <tr key={d.id}>
            <td><a href={`/api/pier/documents/${d.id}/original`} target="_blank" rel="noreferrer">{d.name}</a></td>
            <td>{d.source?.kind ?? 'Upload'}{d.record && <p>Attached to {d.record.kind}</p>}</td>
            <td>{d.pageCount ?? 'Image'} / {d.size}</td>
            <td><label><input type="checkbox" checked={!!consents[d.id]} onChange={e => setConsents({...consents,[d.id]:e.target.checked})} /> Send this entire original to OpenAI for extraction</label>
              <button disabled={busy || !evidence.settings.enabled || !consents[d.id]} onClick={() => run('document.extract', {documentId:d.id,version:d.version,consentOriginal:true})}>Extract cited draft</button></td>
          </tr>)}
        </Table>}
      </section>
      {evidence.inbox?.length > 0 && <section className="panel"><h2>Received document mail</h2>
        {evidence.inbox.map(m => <div key={m.id}><h3>{m.subject}</h3><p>From {m.from} · To {Array.isArray(m.to) ? m.to.join(', ') : m.to}</p><p style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere"}}>{m.text}</p><p>{m.documentIds.length} originals retained for owner review.</p></div>)}
      </section>}
      {evidence.extractions.map(extraction => <DocumentReview key={extraction.id} extraction={extraction} state={state} run={run} busy={busy} />)}
    </>}
  </details>;
}
