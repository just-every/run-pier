import { decimal, fail, format, positions, type State } from "./model";
const csv = (columns: string[], rows: Record<string, unknown>[]) =>
  [columns, ...rows.map((r) => columns.map((k) => r[k] ?? ""))]
    .map((r) =>
      r.map((v) => '"' + String(v).replaceAll('"', '""') + '"').join(","),
    )
    .join("\r\n") + "\r\n";
export function nativeExport(s: State) {
  if (s.orders.some(o=>o.lines.some((l:any)=>l.kit && decimal(l.quantity)>decimal(l.dispatched)+decimal(l.cancelled)))) fail('NATIVE_KITS', 'The native CSV shape cannot preserve open kit definitions and component allocations. Use the complete installation archive and business export; do not cut over these orders as single-SKU demand.');
  const files = [
    {
      name: "items.csv",
      kind: "items",
      csv: csv(
        ["key", "sku", "name", "barcode", "unit", "packSize"],
        s.items.map((i) => ({ ...i, key: i.id })),
      ),
    },
    {
      name: "locations.csv",
      kind: "locations",
      csv: csv(
        ["key", "name", "warehouse", "kind"],
        s.locations.map((i) => ({ ...i, key: i.id })),
      ),
    },
    {
      name: "parties.csv",
      kind: "parties",
      csv: csv(
        ["key", "name", "kind"],
        s.parties.map((i) => ({ ...i, key: i.id })),
      ),
    },
    {
      name: "positions.csv",
      kind: "positions",
      csv: csv(
        ["key", "itemKey", "locationKey", "status", "quantity", "unit", "cost"],
        positions(s)
          .filter((p) => p.status !== "transit")
          .map((p) => ({
            key: [p.itemId, p.locationId, p.status].join(":"),
            itemKey: p.itemId,
            locationKey: p.locationId,
            status: p.status,
            quantity: p.quantity,
            unit: s.items.find((i) => i.id === p.itemId)!.unit,
            cost: "0",
          })),
      ),
    },
    {
      name: "orders.csv",
      kind: "orders",
      csv: csv(
        [
          "key",
          "orderKey",
          "customerKey",
          "itemKey",
          "quantity",
          "unit",
          "promiseDate",
        ],
        s.orders.flatMap((o) =>
          o.lines
            .filter(
              (l: any) =>
                decimal(l.quantity) >
                decimal(l.dispatched) + decimal(l.cancelled),
            )
            .map((l: any) => ({
              key: l.id,
              orderKey: o.id,
              customerKey: o.customerId,
              itemKey: l.itemId,
              quantity: format(
                decimal(l.quantity) -
                  decimal(l.dispatched) -
                  decimal(l.cancelled),
              ),
              unit: s.items.find((i) => i.id === l.itemId)!.unit,
              promiseDate: o.promiseDate ?? "",
            })),
        ),
      ),
    },
    {
      name: "reservations.csv",
      kind: "reservations",
      csv: csv(
        ["key", "orderLineKey", "locationKey", "quantity", "unit"],
        s.orders.flatMap((order) =>
          order.lines.flatMap((line: any) => {
            if (
              decimal(line.quantity) <=
              decimal(line.dispatched) + decimal(line.cancelled)
            )
              return [];
            const own = s.reservations.filter((r) => r.orderLineId === line.id);
            const unit = s.items.find((i) => i.id === line.itemId)!.unit;
            const byLocation = new Map<string, bigint>();
            for (const r of own)
              byLocation.set(
                r.locationId,
                (byLocation.get(r.locationId) ?? 0n) + BigInt(r.quantity),
              );
            return own.length
              ? [...byLocation].map(([locationKey, quantity]) => ({
                  key: line.id + ":" + locationKey,
                  orderLineKey: line.id,
                  locationKey,
                  quantity: format(quantity),
                  unit,
                }))
              : [
                  {
                    key: line.id + ":backorder",
                    orderLineKey: line.id,
                    locationKey: "",
                    quantity: "0",
                    unit,
                  },
                ];
          }),
        ),
      ),
    },
    {
      name: "purchaseOrders.csv",
      kind: "purchaseOrders",
      csv: csv(
        [
          "key",
          "poKey",
          "supplierKey",
          "itemKey",
          "quantity",
          "unit",
          "price",
          "promiseDate",
        ],
        s.purchaseOrders
          .filter((po) => po.status === "committed")
          .flatMap((o) =>
            o.lines
              .filter((l: any) => decimal(l.quantity) > decimal(l.received))
              .map((l: any) => ({
                key: l.id,
                poKey: o.id,
                supplierKey: o.supplierId,
                itemKey: l.itemId,
                quantity: format(decimal(l.quantity) - decimal(l.received)),
                unit: s.items.find((i) => i.id === l.itemId)!.unit,
                price: l.price,
                promiseDate: o.promiseDate,
              })),
          ),
      ),
    },
  ];
  return {
    namespace: "pier-exit",
    sourceVersion: "pier-native-v1",
    exportedAt: new Date().toISOString(),
    filters:
      "current positions and remaining documents; receipt-cost history in business export; transit requires completed transfer before cutover",
    cutoffTimezone: "Australia/Brisbane",
    currency: "USD",
    mappingRevision: "1",
    files,
    transit: positions(s).filter(
      (p) => p.status === "transit" && decimal(p.quantity) > 0n,
    ),
    costs: s.receipts,
    historyExport: "/api/pier/export",
  };
}
