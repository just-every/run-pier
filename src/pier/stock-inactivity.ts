import { decimal, format, type State } from './model';
import { amount, money } from './money';

type ValuedPosition = { itemId: string; locationId: string; quantity: string; value: string | null };

/** One inactivity clock per owned bin position. New stock first has to age. */
export function stockInactivity(s: State, positions: ValuedPosition[], at: string) {
  const bins = new Map<string, ValuedPosition[]>();
  for (const p of positions) {
    if (s.locations.find(l => l.id === p.locationId)?.kind !== 'bin') continue;
    const key = `${p.itemId}:${p.locationId}`;
    bins.set(key, [...(bins.get(key) ?? []), p]);
  }
  return [...bins.values()].map(owned => {
    const { itemId, locationId } = owned[0];
    const movements = s.movements.filter(m => m.itemId === itemId && m.locationId === locationId && m.createdAt <= at);
    let balance = 0n, start = movements[0], lastOut: typeof start | undefined, lastSale: typeof start | undefined;
    const commands = new Map<string, typeof movements>();
    for (const m of movements) commands.set(m.commandId, [...(commands.get(m.commandId) ?? []), m]);
    for (const group of commands.values()) {
      const before = balance;
      balance += group.reduce((n, m) => n + BigInt(m.quantity), 0n);
      if (before <= 0n && balance > 0n) { start = group.find(m => BigInt(m.quantity) > 0n)!; lastOut = undefined; }
      for (const m of group) {
        if (BigInt(m.quantity) < 0n && s.shipments.some(sh => sh.id === m.documentId)) lastSale = m;
        if (BigInt(m.quantity) < 0n && (s.shipments.some(sh => sh.id === m.documentId) || s.kittingTasks.some(task=>task.id===m.documentId) || s.transfers.some(t => t.id === m.documentId && t.fromLocationId === locationId))) lastOut = m;
      }
    }
    const since = lastOut ?? start;
    return { itemId, locationId, quantity: format(owned.reduce((n, p) => n + decimal(p.quantity), 0n)),
      value: owned.some(p => p.value === null) ? null : money(owned.reduce((n, p) => n + amount(p.value!), 0n)),
      lastSale: lastSale?.createdAt ?? null, lastMovement: movements.at(-1)?.createdAt ?? null,
      inactiveSince: since.createdAt, episode: since.id, lastOutId: lastOut?.id ?? null,
      inactiveDays: Math.max(0, Math.floor((Date.parse(at) - Date.parse(since.createdAt)) / 86400000)) };
  });
}
