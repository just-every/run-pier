import type { Row, State } from '../model';
import { valuationLedger } from '../valuation-ledger';
import { amount, money } from '../money';

export function qboValuation(state: State, connection: Row, now: string) {
  const ledger = valuationLedger(state, now);
  const layers = ledger.positions.flatMap(p => p.layers).filter(l => l.quantity > 0n);
  const inventory = layers.some(l => l.value === null) ? null : money(layers.reduce((n, l) => n + l.value!, 0n));
  const shipped = new Set(state.shipments.filter(s => s.createdAt.slice(0, 10) >= connection.cutoverDate).map(s => s.id));
  const costLayers = [...ledger.consumed].filter(([key]) => [...shipped].some(id => key.startsWith(`${id}:`))).flatMap(([, layers]) => layers);
  const returned = new Set(state.returns.filter(r => r.createdAt.slice(0, 10) >= connection.cutoverDate).map(r => r.id));
  const returnLayers = [...ledger.returnedLayers].filter(([id]) => returned.has(id)).flatMap(([, layers]) => layers);
  const cogs = [...costLayers, ...returnLayers].some(l => l.value === null) ? null : money(amount(connection.cogsOpeningBalance) + costLayers.reduce((n, l) => n + l.value!, 0n) - returnLayers.reduce((n, l) => n + l.value!, 0n));
  return { inventory, cogs };
}
