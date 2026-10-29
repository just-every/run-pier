import { records, type PierState, type RecordData, type RunCommand } from '../api';
import { Field, Form, Select, Table, text, Amount } from '../controls';
import { TaxEvidence } from './tax-evidence';
import { PaymentSettings } from './payment-settings';
import { InvoiceDraftForm } from './invoice-draft-form';
export function InvoiceWorkbench({state,run,busy}:{state:PierState;run:RunCommand;busy:boolean}){
  if(state.actor.role!=='owner')return null;
  const invoices=records(state,'invoices'),credits=records(state,'invoiceCredits'),orders=records(state,'orders');
  return <details><summary>Customer invoices and credits</summary>
    <PaymentSettings connection={records(state,'paymentConnections').find(c=>c.enabled)} run={run} busy={busy}/>
    <Form title="Choose order invoicing policy" submit="Save invoicing policy" busy={busy}
      note="Choose shipment invoices or prepay before invoicing. Later shipments against an authorized prepay invoice create no second charge."
      onSubmit={d=>{const orderId=text(d,'orderId'),old=records(state,'salesPolicies').find(p=>p.kind==='invoicing'&&p.orderId===orderId);return run('invoice.policy',{orderId,mode:text(d,'mode'),terms:{kind:text(d,'terms')},reason:text(d,'reason'),...(old?{version:old.version}:{})})}}>
      <Select label="Invoicing policy order" name="orderId" rows={orders.map(o=>({...o,label:o.reference}))}/>
      <label className="field"><span>Invoicing policy</span><select name="mode" aria-label="Invoicing policy"><option value="shipment">Once per shipment</option><option value="prepay">Prepay on acceptance</option></select></label>
      <TermsSelect/><Field label="Invoicing policy reason" name="reason"/>
    </Form>
    <InvoiceDraftForm state={state} run={run} busy={busy}/>
    <section className="panel"><h2>Native customer invoices</h2><Table headings={['Invoice','Date / terms','Amount','State / review']}>
      {invoices.map(invoice=><tr key={invoice.id}><td>{invoice.reference}<p>{orders.find(o=>o.id===invoice.orderId)?.reference}</p></td><td>{invoice.invoiceDate}<p>Due {invoice.dueDate}</p></td><td>{invoice.currency} <Amount value={invoice.total}/><p>USD <Amount value={invoice.usdTotal}/></p><p>Open balance <Amount value={invoice.balance}/></p></td><td>{invoice.status}<p>{invoice.ledger?.status}</p>
        {invoice.status==='draft'&&<button disabled={busy} onClick={()=>run('invoice.review',{invoiceId:invoice.id,version:invoice.version})}>Review exact invoice</button>}
        {invoice.status==='reviewed'&&<button disabled={busy} onClick={()=>run('invoice.authorize',{invoiceId:invoice.id,version:invoice.version})}>Authorize immutable invoice</button>}
        {invoice.status==='authorized'&&<>{invoice.balance!=='0.000000000000'&&!String(invoice.balance).startsWith('-')&&<button disabled={busy} onClick={()=>run('invoice.payLink',{invoiceId:invoice.id,version:invoice.version})}>Create invoice payment link</button>}<button disabled={busy} onClick={()=>run('print.generate',{kind:invoice.policy==='prepay'?'proforma':'invoice',sourceId:invoice.id})}>Generate invoice PDF</button></>}
        {invoice.status==='authorized'&&!records(state,'invoicePayments').some(p=>p.invoiceId===invoice.id)&&!credits.some(c=>c.invoiceId===invoice.id&&c.status==='authorized')&&<details><summary>Void unpaid invoice</summary>
          <Form title={`Void invoice ${invoice.reference}`} submit="Void unpaid invoice" busy={busy} secondary
            note="Expire any active checkout and reconcile its payment first. The original is retained; external ledger and tax reversals remain pending."
            onSubmit={d=>run('invoice.void',{invoiceId:invoice.id,version:invoice.version,reason:text(d,'reason')})}>
            <Field label={`Void reason for ${invoice.reference}`} name="reason"/>
          </Form>
        </details>}
        {records(state,'invoicePayLinks').filter(l=>l.invoiceId===invoice.id).map(link=><p key={link.id}><a href={link.url} target="_blank" rel="noreferrer">Open invoice payment page</a> · {link.status}</p>)}
      </td></tr>)}
    </Table>{invoices.map(invoice=><details key={invoice.id}><summary>{`Inspect tax estimate for ${invoice.reference}`}</summary><TaxEvidence tax={invoice.tax} title={`Tax estimate for ${invoice.reference}`}/></details>)}</section>
    <Form title="Prepare a linked customer credit" submit="Draft credit note" busy={busy}
      note="A credit names its original invoice and line. Financial posting and refunds remain separate from this native credit."
      onSubmit={d=>run('invoice.credit.draft',{invoiceId:text(d,'invoiceId'),kind:text(d,'kind'),reason:text(d,'reason'),...(text(d,'returnId')?{returnId:text(d,'returnId')}:{}),lines:[{invoiceLineId:text(d,'invoiceLineId'),quantity:text(d,'quantity'),amount:text(d,'amount')}]})}>
      <Select label="Credit original invoice" name="invoiceId" rows={invoices.map(i=>({...i,label:i.reference}))}/>
      <label className="field"><span>Credit reason type</span><select name="kind" aria-label="Credit reason type"><option value="price">Price adjustment</option><option value="return">Returned goods</option><option value="freight">Freight refund</option></select></label>
      <Select label="Credit invoice line" name="invoiceLineId" rows={invoices.flatMap(i=>[...i.lines,...i.charges].map((line:any)=>({...line,version:1,label:`${i.reference} · ${records(state,'items').find(item=>item.id===line.itemId)?.sku??line.description}`})))}/>
      <Select label="Credit physical return" name="returnId" required={false} rows={records(state,'returns').map(r=>({...r,label:r.reason??r.id}))}/>
      <Field label="Credit returned quantity" name="quantity" required={false}/><Field label="Credit adjustment amount" name="amount" required={false}/><Field label="Credit note reason" name="reason"/>
    </Form>
    {credits.map(credit=><section className="panel" key={credit.id}><h3>{credit.reference}</h3><p>{credit.status} · {credit.currency} <Amount value={credit.total}/></p>
      {credit.status==='draft'&&<button disabled={busy} onClick={()=>run('invoice.credit.review',{creditId:credit.id,version:credit.version})}>Review exact credit</button>}
      {credit.status==='reviewed'&&<button disabled={busy} onClick={()=>run('invoice.credit.authorize',{creditId:credit.id,version:credit.version})}>Authorize credit note</button>}
    </section>)}
    {records(state,'invoicePaymentSessions').map(session=><section className="panel" key={session.id}><h3>Invoice payment · {session.status}</h3><p>{session.problem}</p>
      <Form title={`Reconcile payment ${session.id}`} submit="Check Stripe payment" busy={busy} onSubmit={d=>run('payment.reconcile',{sessionId:session.id,version:session.version,...(text(d,'providerSessionId')?{providerSessionId:text(d,'providerSessionId')}:{})})}><Field label="Stripe Checkout session reference" name="providerSessionId" required={false} defaultValue={session.providerSessionId??''}/></Form>
      <button disabled={busy} onClick={()=>run('payment.expire',{sessionId:session.id,version:session.version})}>Expire unpaid checkout before correction</button>
    </section>)}
  </details>;
}
function TermsSelect(){return <label className="field"><span>Invoice payment terms</span><select name="terms" aria-label="Invoice payment terms"><option value="net30">Net 30</option><option value="dueReceipt">Due on receipt</option><option value="net15">Net 15</option><option value="net60">Net 60</option><option value="eom">End of month</option></select></label>}
