import type { RecordData, RunCommand } from '../api';
import { Field, Form, text } from '../controls';
export function PaymentSettings({connection,run,busy}:{connection:RecordData|undefined;run:RunCommand;busy:boolean}){
  return <details><summary>Invoice payment connection</summary><Form key={`stripe-${connection?.version??0}`} title="Stripe invoice payments" submit="Authorize Stripe invoice payments" busy={busy}
    note="Stripe hosts card and US bank-account entry. Pier retains provider references and confirmed payment amounts. Configure /api/pier/payments/stripe/webhook in this same Stripe account."
    onSubmit={d=>run('payment.configure',{version:connection?.version??0,mode:text(d,'mode'),secretKey:text(d,'secretKey'),webhookSecret:text(d,'webhookSecret'),consent:d.get('consent')==='on'})}>
    <label className="field"><span>Stripe payment mode</span><select name="mode" aria-label="Stripe payment mode" defaultValue={connection?.mode??'test'}><option value="test">Test</option><option value="live">Live</option></select></label>
    <Field label="Stripe invoice secret key" name="secretKey" type="password" autoComplete="new-password"/>
    <Field label="Stripe payment webhook secret" name="webhookSecret" type="password" autoComplete="new-password"/>
    <label className="field"><input type="checkbox" name="consent" required/> I authorize invoice-specific hosted payments and verified payment readback from this Stripe account.</label>
  </Form></details>;
}
