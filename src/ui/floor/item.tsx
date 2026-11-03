import { ItemName } from '../display'
import type { PierState } from '../api'

// Phone table values have a narrow column. Keep the complete, unbroken SKU
// accessible within its own scroll area instead of widening the whole task.
export function FloorItem({ state, id }: { state: PierState; id: string }) {
  return <div tabIndex={0} aria-label="Item name and SKU" style={{ maxWidth: '100%', overflowX: 'auto' }}><ItemName state={state} id={id} /></div>
}
