# Wholesale catalogue

Open **Stock** to create or edit an item. Each variant has its own SKU and stock history; a shared **Variant family** groups related products. Categories, HTTPS images, weight in pounds and dimensions in inches or centimeters are optional. Supplier and customer references point to existing counterparties. Search matches every reference, supplier terms code and barcode; category, family and active/archived filters retain all matching items.

The unit barcode counts one base unit. The case barcode counts the item's exact pack conversion. **Additional barcodes** bind inner cartons, other cases or counterparty codes to their own exact positive base-unit quantities. For example, an inner barcode may count `4` and a case barcode `12`. Receiving, picking and packing use those quantities; the returns bench also recognizes them. Numeric UPC, EAN and GTIN forms with leading zeroes share one identity. Archived items retain their codes. Collision messages name the proposed SKU and existing owners. Codes cannot collide with another SKU's barcodes, bin labels and names, shipment references or retained ASN SSCCs. Bin writes, shipment dispatch and SSCC allocation check the same namespace. Operator-entered shipment and BOL references are aliases: several shipments may share one consolidated reference, and a returns lookup lists every matching shipment for the operator to choose. Such aliases cannot collide with an item, bin or SSCC code. New native shipments receive dedicated unique Pier-allocated shipment barcodes; these are distinct from shared operator aliases.

Once an item is referenced by stock, counts, terms or documents, its base unit, case conversion and existing barcode quantities cannot change. Create a new SKU for a different conversion. Removing a barcode does not rewrite retained scan or shipment evidence.

## Reviewed bulk import and edit

In Stock, open **Bulk import or edit catalogue CSV**. Upload a UTF-8 CSV with `sku,name,unit,packSize` columns. An exact existing SKU updates that item; a new SKU creates an item. Supported optional columns are `barcode,caseBarcode,variantFamily,category,imageUrl,weight,length,width,height,dimensionUnit,barcodes,references,archived,customFields`. Unrecognized columns, duplicate rows, collisions and invalid values are errors. Use at most 200 rows and 1 MiB per review.

Omitted optional columns preserve existing values. Blank supplied metadata clears it. Dimensions require all three positive values and `dimensionUnit` equal to `in` or `cm`; all blank dimensions clear them. `archived` accepts `true` or `false`. `barcodes` and `references` are JSON arrays in quoted CSV cells, for example:

```csv
sku,name,unit,packSize,barcodes
MUG-BLUE,Blue stoneware mug,each,12,"[{""code"":""INNER-BLUE"",""quantity"":""4"",""label"":""Inner carton""}]"
```

A reference has shape `{"partyId":"existing-party-id","code":"their-item-code"}`. An empty array clears additional codes or references. Preview shows each proposed item, collisions and affected orders, POs, receipts, shipments, counts and supplier terms. Preview writes no records or stock. Resolve every error before approval. Approval applies the whole file atomically and retains the source CSV in the durable command outcome. Any intervening stock/document change invalidates the preview; review it again. Referenced documents retain their own recorded quantities and costs.

The authenticated public doors are `POST /api/pier/catalogue/preview` with `{csv}` and `POST /api/pier/commands` with type `catalogue.apply` and payload `{csv,stateVersion}` from that preview. The full business JSON export at `/api/pier/export` includes these item fields. The native six-kind opening/exit CSV format is unchanged and omits the added catalogue metadata; use the full installation archive to preserve the installation.

## Typed fields through the API

The owner defines immutable typed fields for an item, customer, supplier or order with `customField.define`; see [API.md](../API.md) for the exact commands. Supported types are text, non-negative exact decimal number, boolean, calendar date and a fixed choice list. Setting a value requires the current record version. A reviewed `customField.import` carries all four owner types in one atomic JSON batch, bound to the current installation version. A late invalid row leaves every record unchanged. Catalogue CSV also accepts a `customFields` JSON object in a quoted cell, after its item definitions exist. An omitted object retains existing values; an empty object replaces them with no values on item or counterparty saves. A null value explicitly clears an individual field in the field-setting commands.

Typed filters use authenticated `GET /api/pier/custom-fields` with `ownerType`, `field` and a JSON-encoded exact `value`. For example, the boolean false is distinct from the text “false”. The complete owner business export includes definitions and values. Retained PRINT-001 PDFs include item values on lines and record, order and counterparty values in document fields; already generated PDFs retain their original bytes after later value edits.

Conservative default pending ct approval: all arbitrary field content, its imports, filters and field-bearing document generation are owner-only. Wider role responses omit definitions and values. Field attribution and custody erasure are not implemented: subject erasure refuses while typed definitions exist. Native CSV cutover refuses to silently discard these definitions or values; use the complete installation archive and owner business JSON export.

CAT-001 remains partial: the expanded native CSV mappings and operator field-definition, editing and filtering controls across the four owner types, with desktop and mobile proof, remain. The API journey now proves typed fields and case-pack quote, pick and packing-slip quantities. Physical scanner and printer acceptance remain under SCAN-001 and SCAN-002.
