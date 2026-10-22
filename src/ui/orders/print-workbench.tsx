import { useEffect, useState } from 'react';
import { freightFields } from '../../pier/print/freight-fields';
import { records, type PierState, type RecordData, type RunCommand } from '../api';
import { Field, Form, Select, Table, text } from '../controls';

type PrintState={kinds:Record<string,string>;templates:RecordData[];sources:Record<string,RecordData[]>;documents:RecordData[];deliverySettings:RecordData};
export function PrintWorkbench({state,run,busy}:{state:PierState;run:RunCommand;busy:boolean}){
  const [data,setData]=useState<PrintState|null>(null),[kind,setKind]=useState('invoice'),[error,setError]=useState('');
  useEffect(()=>{
    if(state.actor.role!=='owner')return;const controller=new AbortController();
    fetch('/api/pier/print',{cache:'no-store',signal:controller.signal}).then(async r=>{if(!r.ok)throw new Error('Business documents could not be loaded.');return r.json() as Promise<PrintState>}).then(d=>{setData(d);setError('')}).catch(e=>{if(!controller.signal.aborted)setError(e.message)});
    return()=>controller.abort();
  },[state.version,state.actor.role]);
  if(state.actor.role!=='owner')return null;
  const template=data?.templates.find(t=>t.kind===kind),title=data?.kinds[kind]??kind;
  return <details><summary>Business documents and templates</summary>
    {error&&<p role="alert">{error}</p>}
    {!state.businessProfile?.length&&<p>Add your company identity in <a href="#purchasing">Purchasing</a> before generating business documents.</p>}
    {data&&<>
      <label className="field"><span>Business document kind</span><select aria-label="Business document kind" value={kind} onChange={e=>setKind(e.target.value)}>{Object.entries(data.kinds).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
      <Form key={`generate-${kind}`} title="Generate a retained business PDF" submit="Generate exact PDF" busy={busy}
        note="The PDF keeps its source and template versions. Reprinting opens these same bytes; generating again deliberately uses the latest template."
        onSubmit={d=>run('print.generate',{kind,sourceId:text(d,'sourceId'),...(kind==='bill-of-lading'?{freight:Object.fromEntries(freightFields.map(([key])=>[key,text(d,key)]))}:{})})}>
        <Select label="Business document source" name="sourceId" rows={data.sources[kind]??[]}/>
        {kind==='bill-of-lading'&&<>{freightFields.map(([key,label,required])=><Field key={key} label={`BOL ${label}`} name={key} required={required}/>)}</>}
      </Form>
      <details><summary>Edit this document and email template</summary>
        <Form key={`template-${kind}-${template?.version??0}`} title={`Template · ${title}`} submit="Save new template version" busy={busy}
          note="Merge fields: {{title}}, {{reference}}, {{company}}, {{recipient}}, {{total}}, {{dueDate}}, {{payNowUrl}}. Prior generated PDFs and sends keep their original template."
          onSubmit={d=>run('print.template.save',{kind,version:template?.version??0,title:text(d,'title'),terms:text(d,'terms'),remitTo:text(d,'remitTo'),footer:text(d,'footer'),emailSubject:text(d,'emailSubject'),emailBody:text(d,'emailBody'),logo:d.get('logo')==='on'})}>
          <Field label="Business document title" name="title" defaultValue={template?.title??title}/>
          <Field label="Business document terms" name="terms" defaultValue={template?.terms??'See the source record for agreed terms.'}/>
          <Field label="Business document remit-to" name="remitTo" defaultValue={template?.remitTo??''} required={false}/>
          <Field label="Business document footer" name="footer" defaultValue={template?.footer??''} required={false}/>
          <Field label="Business email subject" name="emailSubject" defaultValue={template?.emailSubject??'{{title}} {{reference}}'}/>
          <Field label="Business email body" name="emailBody" defaultValue={template?.emailBody??'Please find {{title}} {{reference}} attached. {{payNowUrl}}'}/>
          <label className="field"><input type="checkbox" name="logo" defaultChecked={template?.logo!==false}/> Include company logo</label>
        </Form>
      </details>
      <Form title="Email a retained business PDF" submit="Approve recipient and send retained PDF" busy={busy}
        note="Consent applies to this exact PDF and recipient. Sent means provider acceptance; signed bounce notifications change the outcome to failed."
        onSubmit={d=>{const document=data.documents.find(doc=>doc.id===text(d,'documentId'));return run('print.send',{documentId:document?.id,version:document?.version,recipient:text(d,'recipient')})}}>
        <Select label="Retained business PDF" name="documentId" rows={data.documents.map(d=>({...d,label:d.filename}))}/>
        <Field label="Business PDF recipient" name="recipient" type="email"/>
      </Form>
      <section className="panel"><h2>Business document versions and sends</h2><Table headings={['Document','Versions','Recipient / outcome','PDF']}>
        {data.documents.map(d=><tr key={d.id}><td>{data.kinds[d.kind]??d.kind}<p>{d.filename}</p></td><td>Record {d.recordVersion} · template {d.templateVersion??'Earlier renderer'}</td><td>{d.recipient??'Not emailed'}<p>{records(state,'deliveries').find(r=>r.correspondenceId===d.id)?.phase??'Retained'}</p></td><td><a target="_blank" rel="noreferrer" href={`/api/pier/sales-documents/${d.id}.pdf`}>Open exact PDF</a></td></tr>)}
      </Table></section>
      <details><summary>Signed delivery notifications</summary><Form key={`events-${data.deliverySettings.version}`} title="Business mail delivery verification" submit="Authorize signed delivery events" busy={busy}
        note="Configure this endpoint with the sending provider: /api/pier/print/delivery-events. Notifications are verified before an outcome changes."
        onSubmit={d=>run('print.delivery.configure',{version:data.deliverySettings.version,provider:text(d,'provider'),verificationKey:text(d,'verificationKey'),consent:d.get('consent')==='on'})}>
        <label className="field"><span>Delivery event provider</span><select name="provider" aria-label="Delivery event provider" defaultValue={data.deliverySettings.provider??'sendgrid'}><option value="sendgrid">SendGrid</option><option value="resend">Resend</option></select></label>
        <Field label="Delivery event verification key" name="verificationKey" type="password" autoComplete="new-password"/>
        <label className="field"><input type="checkbox" name="consent" required/> Authorize this provider's signed delivery notifications.</label>
      </Form></details>
    </>}
  </details>;
}
