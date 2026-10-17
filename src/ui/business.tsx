import { records, type PierState, type RunCommand } from './api'
import { Field, Form, text } from './controls'

// Who supplier and customer emails come from, and where each warehouse takes deliveries.
export function BusinessProfile({ state, run, busy }: { state: PierState; run: RunCommand; busy: boolean }) {
  const profile = records(state, 'businessProfile')[0], owner = state.actor.role === 'owner'
  const warehouses = [...new Set(records(state, 'locations').filter(l => l.kind === 'bin').map(l => String(l.warehouse)))]
  return <Form key={`business-${profile?.version ?? 0}`} title="Your business" submit="Save business details" busy={busy} disabled={!owner} note={profile ? 'Purchase orders and customer date updates name this business and the ship-to address.' : 'Purchase orders and customer date updates wait for these details, so suppliers and customers know who is writing and where to deliver.'} onSubmit={data => run('business.save', { name: text(data, 'name'), address: text(data, 'address'), shipTo: Object.fromEntries(warehouses.map(w => [w, text(data, `shipTo-${w}`)])) })}>
    <Field label="Business name" name="name" defaultValue={profile?.name} />
    <Field label="Business and default ship-to address" name="address" defaultValue={profile?.address} hint="Street, city, state and ZIP, on one line or separated by commas." />
    {warehouses.map(w => <Field key={w} label={`Ship-to address for ${w} (if different)`} name={`shipTo-${w}`} required={false} defaultValue={profile?.shipTo?.[w]} />)}
  </Form>
}
