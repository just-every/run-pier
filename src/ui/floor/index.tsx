import { type PierState, type RunCommand } from '../api'
import { Receive } from './receive'
import { Pick } from './pick'
import { Pack } from './pack'
import { Dispatch } from './dispatch'
import { Returns } from './returns'
import { Shipping } from '../shipping'

// The warehouse floor at any width: receive, pick, pack and the day's dispatch.
const steps = [{ id: 'receive', title: 'Receive' }, { id: 'pick', title: 'Pick' }, { id: 'pack', title: 'Pack' }, { id: 'shipping', title: 'Shipping' }, { id: 'dispatch', title: 'Dispatch day' }, { id: 'returns', title: 'Returns' }]

export function Floor({ state, run, busy, error, step }: { state: PierState; run: RunCommand; busy: boolean; error: string; step: string }) {
  const current = steps.some(row => row.id === step) ? step : 'receive'
  return <><div className="page-title"><h1>Floor</h1></div>
    <nav className="floor-steps" aria-label="Floor steps">{steps.map(row => <a key={row.id} href={`#floor/${row.id}`} aria-current={row.id === current ? 'page' : undefined}>{row.title}</a>)}</nav>
    {current === 'receive' && <Receive state={state} run={run} busy={busy} error={error} />}
    {current === 'pick' && <Pick state={state} run={run} busy={busy} error={error} />}
    {current === 'pack' && <Pack state={state} run={run} busy={busy} error={error} />}
    {current === 'shipping' && <Shipping state={state} run={run} busy={busy} />}
    {current === 'dispatch' && <Dispatch state={state} run={run} busy={busy} />}
    {current === 'returns' && <Returns state={state} run={run} busy={busy} error={error} />}
  </>
}
