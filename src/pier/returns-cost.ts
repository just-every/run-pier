import { decimal, type Row, type State } from './model';
import { money } from './money';
import { takeLayers, valuationLedger } from './valuation-ledger';

/** Reverse the dispatched line's actual USD cost, preserving cumulative
 * fractional allocation so the last return takes the remaining precision. */
export function returnCost(s: State, returned: Row, end: string): string | null {
  const shipment = s.shipments.find(sh => sh.id === returned.shipmentId);
  const line = shipment?.lines.find((l: any) => l.id === returned.shipmentLineId);
  if (!line) return null;
  const layers = structuredClone(valuationLedger(s, end).consumed.get(`${shipment!.id}:${returned.itemId}`) ?? []);
  if (!layers.length) return null;
  for (const prior of shipment!.lines) {
    if (prior.id === line.id) break;
    if (prior.itemId === returned.itemId) takeLayers(layers, decimal(prior.quantity));
  }
  const cost = takeLayers(layers, decimal(line.quantity));
  if (cost.some(l => l.value === null)) return null;
  const before = s.returns.slice(0, s.returns.findIndex(r => r.id === returned.id)).filter(r => r.shipmentLineId === line.id).reduce((n, r) => n + decimal(r.quantity), 0n);
  const total = cost.reduce((n, l) => n + l.value!, 0n), shipped = decimal(line.quantity);
  return money(total * (before + decimal(returned.quantity)) / shipped - total * before / shipped);
}
