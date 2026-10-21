import { decimal, format, type Row, type State } from './model';
import { money } from './money';
import { takeLayers, valuationLedger } from './valuation-ledger';

type ReturnCost = { total: string | null; layers: { quantity: string; value: string | null; sourceId: string; receivedAt: string }[] };

/** The actual FIFO/average inventory issued, including landed costs. Legacy
 * dispatches are reconstructed from the same append-only movement history. */
export function supplierReturnCosts(s: State, document: Row, now: string): Map<string, ReturnCost> {
  const ledger = valuationLedger(s, now);
  const pools = new Map([...new Set<string>(document.lines.map((line: any) => line.itemId))].map(itemId => {
    const key = `${document.id}:${itemId}`;
    return [key, structuredClone(ledger.consumed.get(key) ?? [])];
  }));
  return new Map(document.lines.map((line: any) => {
    const layers = takeLayers(pools.get(`${document.id}:${line.itemId}`) ?? [], decimal(line.quantity));
    return [line.id, {
      total: layers.some(l => l.value === null) ? null : money(layers.reduce((n, l) => n + l.value!, 0n)),
      layers: layers.map(l => ({ ...l, quantity: format(l.quantity), value: l.value === null ? null : money(l.value) })),
    }];
  }));
}
