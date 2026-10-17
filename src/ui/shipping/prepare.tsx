import type { RecordData } from '../api'
import { Field, Form, text } from '../controls'
import { AddressFields, readAddress } from './address'
import type { ShippingJob, ShippingProps } from './model'

export function PrepareCarton({ run, busy, pack, carton, job, disabled }: ShippingProps & { pack: RecordData; carton: number; job?: ShippingJob; disabled: boolean }) {
  return <Form title={job ? 'Edit destination' : `Destination for carton ${carton}`} submit={job ? 'Save destination and reset verification' : 'Prepare carton for shipping'} busy={busy} disabled={disabled} note="Use the actual ship-to address and customer email. Each carton is verified, rated and labelled separately." onSubmit={data => run('shipping.prepare', { packId: pack.id, carton, address: readAddress(data), email: text(data, 'email').trim() })}>
    <AddressFields address={job?.originalAddress} disabled={busy || disabled} />
    <Field label="Customer tracking email" name="email" type="email" defaultValue={job?.email ?? ''} disabled={busy || disabled} hint="The customer is sent tracking when the label is purchased." />
  </Form>
}
