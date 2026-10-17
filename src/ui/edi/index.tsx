import { records, label, type PierState, type RunCommand } from '../api'
import { Empty, Facts, Form, Select, Table, text } from '../controls'
import { when } from '../display'
import { EdiSettings } from './settings'
import { EdiOrders } from './orders'
import { EdiDocuments } from './documents'
import './style.css'

export function Edi({ state, run, busy }: { state: PierState; run: RunCommand; busy: boolean }) {
  const partners = records(state, 'ediPartners'), docs: any[] = state.edi.due
  const now = Date.now(), sent = docs.filter(d => d.status === 'sent'), late = docs.filter(d => d.sentAt ? d.onTime === false : Date.parse(d.deadline) < now)
  return <><div className="page-title"><div><h1>Retail EDI</h1><p className="muted">Purchase orders, acknowledgments, ship notices and invoices</p></div><a className="button" href="#floor/pack">Open pack station</a></div>
    <p className="notice">Retailer network onboarding is pending. X12 documents and labels can be prepared here. Delivery requires your authorized EDI bridge and retailer certification; RER Managed delivery is not available yet.</p>
    <Facts values={[{ label: 'Retailers', value: partners.length }, { label: 'Documents due', value: docs.length - sent.length }, { label: 'Sent to bridge', value: sent.length }, { label: 'Late', value: late.length }]} />
    <section className="panel"><h2>Retailer compliance</h2>{!partners.length ? <Empty>Add your retailer and its item mappings below to start.</Empty> : <Table headings={['Retailer', 'Documents due', 'Sent', 'Late', 'Next deadline']}>
      {partners.map(p => { const own = docs.filter(d => d.partnerId === p.id), pending = own.filter(d => d.status !== 'sent'), next = [...pending].sort((a,b) => String(a.deadline || a.dueAt).localeCompare(String(b.deadline || b.dueAt)))[0]; return <tr key={p.id}><td>{p.name}<small>{p.transport === 'pending' ? 'AS2 / SFTP / VAN pending' : p.transport}</small></td><td>{pending.length}</td><td>{own.length - pending.length}</td><td>{own.filter(d => d.sentAt ? d.onTime === false : Date.parse(d.deadline) < now).length}</td><td>{next ? `${next.kind} · ${next.deadline ? when(next.deadline) : next.kind === '856' ? 'Set pickup / arrival' : 'No retailer deadline'}` : 'No documents due'}</td></tr> })}
    </Table>}</section>
    {!!state.edi.exceptions.length && <section className="panel"><h2>Compliance exceptions</h2>{state.edi.exceptions.map((e: any) => <div className="record" key={e.id}><strong>{e.kind}</strong><p>{e.detail}</p>{e.deadline && <small>Deadline {when(e.deadline)}</small>}</div>)}</section>}
    {state.actor.role === 'owner' && <EdiSettings state={state} run={run} busy={busy} />}
    <Form title="Receive retailer 850" busy={busy} disabled={!partners.length} submit="Validate 850 and receive PO" note="Paste the original X12 interchange. The 997 confirms syntax receipt; an 855 is a separate business response. Duplicate PO and control numbers cannot create another order." onSubmit={d => run('edi.receive', { partnerId: text(d, 'partnerId'), x12: text(d, 'x12') })}>
      <Select label="Sending retailer" name="partnerId" rows={partners} /><label className="field edi-source"><span>X12 850 interchange</span><textarea aria-label="X12 850 interchange" name="x12" required rows={7} spellCheck={false} /></label>
    </Form>
    <details className="panel"><summary>Receive retailer 997 response</summary><Form title="Record functional acknowledgment" busy={busy} disabled={!partners.length} submit="Match retailer 997" onSubmit={d => run('edi.997.receive', {partnerId:text(d,'partnerId'),x12:text(d,'x12')})}><Select label="Acknowledging retailer" name="partnerId" rows={partners} /><label className="field edi-source"><span>X12 997 interchange</span><textarea aria-label="X12 997 interchange" name="x12" required rows={6} /></label></Form></details>
    <EdiOrders state={state} run={run} busy={busy} /><EdiDocuments state={state} run={run} busy={busy} />
  </>
}
