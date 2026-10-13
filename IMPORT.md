# Native CSV import

This is the only supported first-source kit. It defines Pier's own UTF-8 CSV shape, not a Zoho, inFlow, Cin7, Sortly, Fishbowl or other provider adapter. Provider mappings remain unavailable until a real owner export, an explicit field map and an independent reconciliation establish support. The local release acceptance scope for import and undo is recorded in [ACCEPTANCE.md](ACCEPTANCE.md).

## Submission metadata and files

Stage the files with an authenticated Pier command. Supply a non-empty `namespace`, `sourceVersion`, `exportedAt`, `cutoffTimezone`, `mappingRevision`, `currency: "AUD"` and the `files` array. `filters` records the source export filters and may be empty when no filters were applied. `cutoffTimezone` must be a valid IANA time-zone name. The export time, filters, cutoff, source version and mapping revision explain what the files represent; do not infer a missing cutoff or currency.

Each file has a name, one supported kind and its CSV text. Send 1–20 files, each no larger than 1 MiB of UTF-8 and with at most 1,000 data rows. Header names and order are exact; every data row must have exactly the matching number of cells. The importer accepts quoted commas, doubled quotes and CRLF. It rejects malformed quoting, content after a closing quote, duplicate row keys, duplicate opening snapshots for the same item/bin/status and unlisted kinds. It retains the submitted UTF-8 artifact bytes, file name, byte length, SHA-256 digest and source row locations. Names, identifiers and other values passed through Pier's text validator allow at most 2,000 characters; exact decimal fields allow up to 10 whole digits and six fractional digits, within the supported numeric range.

These file and field limits are input ceilings, not a promise that every maximum-size file combination fits in one import batch. The raw sum of CSV bytes is not the D1 admission threshold. Preview, every review stage and commit check the actual bounded SQL writes plus the serialized retained import record and successful command result, including original files, reconciliation, review and provenance. If an import record or result exceeds D1's 2,000,000-byte SQL value budget, the operation reports `IMPORT_SIZE`, blocks review or commit and posts no stock. Split it into smaller separately reconciled batches along referentially complete boundaries; a reservation plan still needs its order rows and every line it covers in the same batch. Native graph SQL is chunked by encoded bytes; a large aggregate row count alone does not make a safe set of individual bindings exceed the value budget.

The six established kinds and exact headers are:

**items**

```csv
key,sku,name,barcode,unit,packSize
```

**locations**

```csv
key,name,warehouse,kind
```

**parties**

```csv
key,name,kind
```

**positions**

```csv
key,itemKey,locationKey,status,quantity,unit,cost
```

**orders**

```csv
key,orderKey,customerKey,itemKey,quantity,unit,promiseDate
```

**purchaseOrders**

```csv
key,poKey,supplierKey,itemKey,quantity,unit,price,promiseDate
```

An optional seventh kind, `reservations`, preserves reviewed allocation for imported open orders:

```csv
key,orderLineKey,locationKey,quantity,unit
```

## Keys, units and mapping rules

`key` is a stable, non-empty source-row identity within its namespace and kind. Preserve it across revisions. A repeated `(namespace, kind, key)` with the same row content is unchanged; changed content requires explicit review. Do not evade a changed-row review by inventing a new namespace. `itemKey`, `locationKey`, `customerKey` and `supplierKey` refer to the corresponding `key` in this same namespace. An unresolved reference is an error, not a guessed match. In `reservations.csv`, `orderLineKey` refers to the `key` of an `orders` row, not its containing `orderKey`.

`orderKey` and `poKey` identify the containing open document; `key` remains the identity of each separate line. Rows with the same document key become one document with multiple lines. All lines in that document must agree on the same customer or supplier and the same explicit promise date. Conflicting group values fail review. Keep distinct source line keys even when two lines have the same item and quantity.

When `reservations.csv` is present, include every line of each affected open order and at least one allocation row for each line. A positive quantity names a real `bin` through `locationKey` and records an exact non-negative quantity in that item's base unit; `unit` must match the order item's base unit. Allocation totals cannot exceed remaining demand or the sellable quantity available in each named bin after other reservations. A wholly backordered line has exactly one row with quantity `0` and an empty `locationKey`; it cannot have other rows. Duplicate line/bin rows, omitted lines in an affected order, orphan references, transit locations, wrong units and over-allocation block review. CSV row order never chooses priority. Without the optional file, imported open order lines use the existing automatic hard-reservation rule: reserve available sellable stock and leave the rest backordered.

All quantities, pack sizes, prices and costs are decimal text using a period as the decimal separator and no more than six fractional digits. They are never parsed through binary floating-point values. State the base `unit` on every stock, order and purchase-order line; it must match the referenced item's base unit exactly. Quantities are in that base unit, including when an item has a fractional pack size. `packSize` is exact item metadata; Pier does not treat an imported quantity as a number of packs or guess conversions between unlike units. An opening position must refer to a `bin` and use `sellable` or `quarantine` status. Transit locations are for actual transfers, not opening positions. Location `kind` is `bin` or `transit`; party `kind` is `supplier` or `customer`.

The request currency is AUD. `positions.cost` and `purchaseOrders.price` are cost/price per base unit. Opening-position cost is retained as separate cost evidence; it is not a financial valuation or a general-ledger posting. Purchase-line price is carried as an operational amount. Derived receipt-cost totals use exact arithmetic with twelve decimal places. The import does not perform foreign-exchange, tax or accounting calculations. Promise dates are explicit source dates; the cutoff time zone applies to the export snapshot, not to an inferred promise date.

The native shape has no columns for supplier-item terms, sales prices, invoices, payments, taxes, historic receipt/dispatch movements, transfer/return history, images, attachments, manufacturing, lots, serials or expiry. The optional reservations file preserves current open-order allocations, not prior reservation IDs, shipment links or allocation history. Extra columns are rejected rather than ignored. Do not strip source fields silently to make an export fit. Record unmapped source fields and omitted history in the owner-reviewed reconciliation, and keep the untouched external export under the owner's custody. Pier retains the exact submitted native CSV originals and the mapping provenance.

## Review, commit and revision

Import staging captures originals and source-row provenance, then previews the complete mapping and reconciliation without posting stock. Review advances in order: `captured` → `mapped` → `reconciled` → `shadow` → `frozen`; only the owner commits the frozen batch. A material change to catalogue, supplier terms, documents, movements or reservations after preview makes the review stale and requires a new preview. Reconcile entity counts, distinct SKUs, positions by item/location/status, remaining orders, expected receipts and cost evidence separately. Never add totals across unlike units.

Open order rows group by `orderKey`; without `reservations.csv`, imported demand reserves only available stock and leaves unmet units backordered. With that file, the import applies the supplied per-line/per-bin allocations, including explicit zero backorders, as part of the same reviewed graph. Open purchase-order rows group by `poKey`; they become expected receipts and do not create on-hand stock. Opening positions create append-only movements. A successful commit retains source rows and file digests, source identifiers, import links to native records and lines, posted row content, before-images, prior reservations, movement frontier and the owner's approval. The native D1 adapter applies the cohesive Pier record, ledger, reservation and durable command-result graph atomically through Base's import journal. A failed stock admission cannot leave partial business effects.

An identical row identity and content is a no-op. When the same identity arrives with changed content, preview reports `REVISION_REVIEW` and includes the previous and proposed values. The owner must explicitly select replacement decisions with `import.revise`, a current batch version and a reason; only `replace` is supported. The batch is previewed and reconciled again before it can move through the review stages. Omitting a previously imported row is not a delete instruction. Original artifacts are immutable. A changed opening quantity posts only the reviewed difference; if later movements depend on that position, the replacement is refused and requires a reviewed count correction. An opening row cannot change its item, location or status in place. Received or dispatched open documents cannot be rewritten. New namespaces are not a revision workaround.

Before downstream work depends on the import, undo may restore the exact prior native rows and reservations and remove only the import's created graph. Source originals and journal evidence remain. Once later movements or unrelated reservations depend on imported rows, undo refuses with dependency details and makes no partial change; use reviewed compensating counts/reallocations or safe reverse-order correction. Exact snapshot guards also refuse undo after a conflicting native edit. Never restore a database snapshot over real shipments or claim that dispatched stock returned without an actual return.

## Fixtures and evidence boundary

The synthetic CSV fixtures in `tests/api/security-import.test.mjs` are authored examples of Pier's native CSV contract. They exercise Pier-shaped inputs; they are not exports from Zoho, inFlow, Cin7 or another provider and do not verify a provider mapping. Never commit an owner's real export or personal/customer data as a fixture. A provider mapping requires an actual authorized owner export and independent reconciliation, with unsupported objects and fields accounted for explicitly.

The full `rer export` archive is the installation backup and restore contract. This CSV path is a reviewed business-data cutover, not a substitute for that archive. Keep the former system read-only after cutover and reconcile post-cutover changes before any separate exit import.

## Native exit snapshot

`GET /api/pier/native-export` returns the six established CSV kinds plus `reservations.csv` and cutover metadata. Its generated metadata currently uses namespace `pier-exit`, source version `pier-native-v1`, mapping revision `1`, currency `AUD` and cutoff timezone `Australia/Brisbane`. The CSV headers are exactly the ones listed above. Item, location and party keys are record IDs; position keys combine item ID, location ID and status; order and PO row keys are line IDs, grouped by document IDs; reservation rows identify the order line and bin.

The positions file includes current sellable and quarantine positions, in base units, and omits transit. Its `cost` cells are `0`; receipt-cost evidence is returned separately in the `costs` field and full business history is available from `/api/pier/export`. The response also returns positive transit positions in a separate `transit` field. Complete in-transit transfers and physically reconcile the bins before accepting this as a cutover snapshot. The orders file contains only quantities not yet dispatched or cancelled. The optional reservation file aggregates each remaining order line's allocations by bin and emits one zero-quantity, empty-bin row for a wholly backordered line. It preserves allocation quantities and bin priority, but native reservation IDs are regenerated on import. The purchase-orders file contains committed PO quantities not yet received. These files do not reconstruct historic movements, receipt cost or shipment records; use the complete `rer export` archive when those records must be restored.

The native allocation round-trip is included in the 18-test Worker/D1 suite passed by current-main Verify. This is behavioral proof for native open-order allocation and explicit backorders, not a promise that the snapshot restores every endpoint field or the complete movement, shipment, receipt-cost and transit history. Use the full `rer export` installation archive when comprehensive history and identity restoration is required; the cutover limits above remain part of the contract.
