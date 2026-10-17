import { decimal } from "../model";

// Which reserved units still need a pick list. A reservation stays until its
// order ships, so a finished wave's picked units are still reserved: they are
// covered by that wave, not waiting for another one. Units leave coverage when
// a wave's pack ships them.

// Server state rows and UI records share this shape.
export type CoverageSource = { waves: any[]; reservations: any[]; shipments: any[] };

const key = (orderLineId: string, locationId: string) => `${orderLineId}\u0000${locationId}`;

/** Units of each order line and bin on a pick list and not yet shipped. */
function pending(s: CoverageSource) {
  const units = new Map<string, bigint>();
  const add = (k: string, n: bigint) => units.set(k, (units.get(k) ?? 0n) + n);
  for (const w of s.waves)
    for (const l of w.lines) add(key(l.orderLineId, l.locationId), l.status === "open" ? decimal(l.quantity) : decimal(l.picked));
  for (const sh of s.shipments)
    if (sh.waveId)
      for (const l of sh.lines)
        for (const link of l.reservations ?? []) add(key(l.orderLineId, link.locationId), -decimal(link.quantity));
  return units;
}

/** Reserved units not yet on any pick list, per reservation (scaled integer units). */
export function unwaved(s: CoverageSource, orderId?: string) {
  const covered = pending(s), left: { reservation: any; quantity: bigint }[] = [];
  for (const r of s.reservations) {
    if (orderId && r.orderId !== orderId) continue;
    const k = key(r.orderLineId, r.locationId), cover = covered.get(k) ?? 0n, reserved = BigInt(r.quantity);
    const take = cover > 0n ? (cover < reserved ? cover : reserved) : 0n;
    covered.set(k, cover - take);
    if (reserved > take) left.push({ reservation: r, quantity: reserved - take });
  }
  return left;
}

export const waitingForWave = (s: CoverageSource, orderId: string) => unwaved(s, orderId).length > 0;

/** Units of an order line still reserved (they leave the reservation when they ship). */
export function reservedFor(s: CoverageSource, orderLineId: string) {
  return s.reservations.filter((r) => r.orderLineId === orderLineId).reduce((n, r) => n + BigInt(r.quantity), 0n);
}

/** Units of an order line still to pick or picked on waves, excluding one pick line. */
export function onOtherLines(s: CoverageSource, orderLineId: string, exceptLineId: string) {
  let units = 0n;
  for (const w of s.waves)
    for (const l of w.lines)
      if (l.orderLineId === orderLineId && l.id !== exceptLineId) units += l.status === "open" ? decimal(l.quantity) : decimal(l.picked);
  for (const sh of s.shipments)
    if (sh.waveId) for (const l of sh.lines) if (l.orderLineId === orderLineId) units -= decimal(l.quantity);
  return units > 0n ? units : 0n;
}
