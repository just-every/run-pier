import { balance, decimal, fail, format, get, SCALE, type Row, type State } from './model';

// Integer volume uses micrometres cubed. No binary floating point conversions.
export function sizeCm(item: Row): bigint[] | null {
  const d = item.dimensions;
  if (!d) return null;
  return [d.length, d.width, d.height].map(v => decimal(v, true) * (d.unit === 'in' ? 254n : 100n));
}
export function binLoad(s: State, locationId: string) {
  let volume = 0n;
  for (const item of s.items) {
    const quantity = balance(s, item.id, locationId) + balance(s, item.id, locationId, 'quarantine');
    if (quantity <= 0n) continue;
    const dims = sizeCm(item);
    if (!dims) fail('BIN_DIMENSIONS', `${item.sku} needs dimensions before it can occupy a capacity-controlled bin.`);
    volume += dims![0] * dims![1] * dims![2] * quantity;
  }
  return volume;
}
export function placement(s: State, itemId: string, locationId: string, quantity: bigint) {
  const bin = get(s, 'locations', locationId), policy = bin.storagePolicy;
  if (!policy) return;
  const item = get(s, 'items', itemId), dims = sizeCm(item);
  if (policy.allowedItemIds.length && !policy.allowedItemIds.includes(itemId)) fail('BIN_STOCK', `${item.sku} is not permitted in ${bin.name}.`);
  if (!dims) fail('BIN_DIMENSIONS', `${item.sku} needs dimensions before placement in ${bin.name}.`);
  const limits = [policy.lengthCm, policy.widthCm, policy.heightCm].map((v: string) => decimal(v, true) * 100n);
  if (dims!.some((v, i) => v > limits[i])) fail('BIN_SIZE', `${item.sku} does not fit the configured dimensions of ${bin.name}; choose another bin.`);
  const added = dims![0] * dims![1] * dims![2] * quantity;
  if (binLoad(s, locationId) + added > decimal(policy.capacityCm3, true) * SCALE ** 3n * 1000000n) fail('BIN_CAPACITY', `${bin.name} would exceed its configured cubic-centimetre capacity.`);
}
/** All movement doors (including imports and counts) inherit the same policy. */
export function validatePlacements(s: State, before: State) {
  for (const bin of s.locations.filter(l => l.kind === 'bin' && l.storagePolicy)) {
    const old = before.locations.find(l => l.id === bin.id);
    const changed = JSON.stringify(old?.storagePolicy) !== JSON.stringify(bin.storagePolicy);
    for (const item of s.items) {
      const total = balance(s, item.id, bin.id) + balance(s, item.id, bin.id, 'quarantine');
      const prior = balance(before, item.id, bin.id) + balance(before, item.id, bin.id, 'quarantine');
      const itemChanged = JSON.stringify(before.items.find(i => i.id === item.id)?.dimensions) !== JSON.stringify(item.dimensions);
      if (total > 0n && (total > prior || changed || itemChanged)) placement(s, item.id, bin.id, 0n);
    }
    if (binLoad(s, bin.id) > decimal(bin.storagePolicy.capacityCm3, true) * SCALE ** 3n * 1000000n) fail('BIN_CAPACITY', `${bin.name} exceeds its configured capacity.`);
  }
}
export const capacityRemaining = (s: State, itemId: string, locationId: string): bigint => {
  const bin = get(s, 'locations', locationId), dims = sizeCm(get(s, 'items', itemId));
  try { placement(s, itemId, locationId, 0n); } catch { return 0n; }
  if (!bin.storagePolicy) return 0n; // Recommendations need a measured destination.
  const space = decimal(bin.storagePolicy.capacityCm3, true) * SCALE ** 3n * 1000000n - binLoad(s, locationId);
  return dims && space > 0n ? space / (dims[0] * dims[1] * dims[2]) : 0n;
};
