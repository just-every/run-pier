import { collections, type Row, type State } from "./model";

export function importReservationDependencies(state: State, batch: Row) {
  const affected = new Set(batch.itemIds ?? []);
  const frontier = new Map<string, any>(
    (batch.reservationFrontier ?? []).map((r: any) => [r.id, r]),
  );
  return state.reservations.filter((reservation) => {
    if (!affected.has(reservation.itemId)) return false;
    const previous = frontier.get(reservation.id);
    return (
      !previous ||
      ["orderId", "orderLineId", "itemId", "locationId", "quantity"].some(
        (field) =>
          previous[field] !== reservation[field as keyof typeof reservation],
      )
    );
  });
}

// A catalogue row may be used before there is any stock movement: an empty PO,
// backorder, count capture or supplier term is still a real dependent record.
export function importRecordDependencies(state: State, batch: Row) {
  const catalogue = new Set(
    (batch.created ?? [])
      .filter((entry: any) =>
        ["items", "locations", "parties", "customFieldDefinitions"].includes(entry.kind),
      )
      .map((entry: any) => entry.id),
  );
  const restored = new Set([
    ...(batch.created ?? []).map((entry: any) => `${entry.kind}:${entry.id}`),
    ...(batch.beforeRecords ?? []).map(
      (entry: any) => `${entry.kind}:${entry.data.id}`,
    ),
  ]);
  function references(value: unknown, found = new Set<string>()): Set<string> {
    if (typeof value === "string" && catalogue.has(value)) found.add(value);
    else if (Array.isArray(value))
      value.forEach((entry) => references(entry, found));
    else if (value && typeof value === "object")
      Object.values(value).forEach((entry) => references(entry, found));
    return found;
  }
  return collections
    .filter((kind) => kind !== "imports")
    .flatMap((kind) =>
      state[kind].flatMap((record) => {
        // Books keeps immutable catalogue/valuation evidence. Those snapshots
        // do not consume stock or create a financial obligation; keep them
        // with the import originals when an otherwise unused cutover is undone.
        if (kind === "bookJobs" && ["item", "valuation"].includes(record.kind)) return [];
        if (restored.has(`${kind}:${record.id}`)) return [];
        const ids = [...references(record)];
        const ownerType=kind==='items'?'item':kind==='orders'?'order':kind==='parties'?record.kind:null;
        for(const definition of state.customFieldDefinitions)if(catalogue.has(definition.id)&&definition.ownerType===ownerType&&Object.hasOwn(record.customFields??{},definition.key))ids.push(definition.id);
        return ids.length
          ? [{ kind, id: record.id, references: ids, record }]
          : [];
      }),
    );
}
