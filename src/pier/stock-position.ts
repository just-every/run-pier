import { format, decimal, positions, type State } from './model';

const fields = ['onHand', 'reserved', 'available', 'quarantine', 'transit', 'expected'] as const;
type Quantities = Record<typeof fields[number], bigint>;
const empty = (): Quantities => ({ onHand: 0n, reserved: 0n, available: 0n, quarantine: 0n, transit: 0n, expected: 0n });

/** Derived views only: no editable balance or invented bin for incoming supply. */
export function stockPosition(s: State) {
  const warehouses = new Map<string, { itemId: string; warehouse: string; values: Quantities }>();
  const get = (itemId: string, warehouse: string) => {
    const key = JSON.stringify([itemId, warehouse]);
    if (!warehouses.has(key)) warehouses.set(key, { itemId, warehouse, values: empty() });
    return warehouses.get(key)!.values;
  };
  const stockPositions = positions(s).map(p => ({ ...p, reserved: format(decimal(p.reserved) + decimal(p.held)) }));
  for (const p of stockPositions) {
    const location = s.locations.find(row => row.id === p.locationId)!;
    const q = get(p.itemId, location.warehouse);
    if (p.status === 'sellable') {
      q.onHand += decimal(p.quantity); q.reserved += decimal(p.reserved);
      q.available += decimal(p.available);
    } else if (p.status === 'quarantine') q.quarantine += decimal(p.quantity);
    else if (p.status === 'transit') q.transit += decimal(p.quantity);
  }
  for (const po of s.purchaseOrders) {
    if (po.status !== 'committed') continue;
    for (const line of po.lines) {
      const remaining = decimal(line.quantity) - decimal(line.received);
      if (remaining <= 0n) continue;
      get(line.itemId, line.destinationWarehouse ?? po.destinationWarehouse ?? 'Unassigned receiving warehouse').expected += remaining;
    }
  }
  const companies = new Map<string, Quantities>();
  const encode = (values: Quantities) => Object.fromEntries(fields.map(field => [field, format(values[field])]));
  const warehouseStocks = [...warehouses.values()].map(row => {
    if (!companies.has(row.itemId)) companies.set(row.itemId, empty());
    const company = companies.get(row.itemId)!;
    for (const field of fields) company[field] += row.values[field];
    return { itemId: row.itemId, warehouse: row.warehouse, ...encode(row.values) };
  });
  return { stockPositions, warehouseStocks, companyStocks: [...companies].map(([itemId, values]) => ({ itemId, ...encode(values) })) };
}
