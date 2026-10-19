# Wholesale catalogue

Open **Stock** to create or edit an item. Each variant has its own SKU and stock history; a shared **Variant family** groups related products. Categories, HTTPS images, weight in pounds and dimensions in inches or centimeters are optional. Supplier and customer references point to existing counterparties. Search matches every reference, supplier terms code and barcode; category, family and active/archived filters retain all matching items.

The unit barcode counts one base unit. The case barcode counts the item's exact pack conversion. **Additional barcodes** bind inner cartons, other cases or counterparty codes to their own exact positive base-unit quantities. For example, an inner barcode may count `4` and a case barcode `12`. Receiving, picking and packing use those quantities; the returns bench also recognizes them. Numeric UPC/EAN/GTIN forms with leading zeroes share one identity. Archived items retain their codes. Collision messages name the proposed SKU and existing owners. Codes cannot collide with another SKU's barcodes, bin labels/names, shipment references or retained ASN SSCCs. Bin writes, shipment dispatch and SSCC allocation check the same namespace.

Once an item is referenced by stock, counts, terms or documents, its base unit, case conversion and existing barcode quantities cannot change. Create a new SKU for a different conversion. Removing a barcode does not rewrite retained scan or shipment evidence.

## Reviewed bulk import and edit

In Stock, open **Bulk import or edit catalogue CSV**. Upload a UTF-8 CSV with `sku,name,unit,packSize` columns. An exact existing SKU updates that item; a new SKU creates an item. Supported optional columns are `barcode,caseBarcode,variantFamily,category,imageUrl,weight,length,width,height,dimensionUnit,barcodes,references,archived`. Unrecognized columns, duplicate rows, collisions and invalid values are errors. Use at most 200 rows and 1 MiB per review.

Omitted optional columns preserve existing values. Blank supplied metadata clears it. Dimensions require all three positive values and `dimensionUnit` equal to `in` or `cm`; all blank dimensions clear them. `archived` accepts `true` or `false`. `barcodes` and `references` are JSON arrays in quoted CSV cells, for example:

```csv
sku,name,unit,packSize,barcodes
MUG-BLUE,Blue stoneware mug,each,12,"[{""code"":""INNER-BLUE"",""quantity"":""4"",""label"":""Inner carton""}]"
```

A reference has shape `{"partyId":"existing-party-id","code":"their-item-code"}`. An empty array clears additional codes or references. Preview shows each proposed item, collisions and affected orders, POs, receipts, shipments, counts and supplier terms. Preview writes no records or stock. Resolve every error before approval. Approval applies the whole file atomically and retains the source CSV in the durable command outcome. Any intervening stock/document change invalidates the preview; review it again. Referenced documents retain their own recorded quantities and costs.

The authenticated public doors are `POST /api/pier/catalogue/preview` with `{csv}` and `POST /api/pier/commands` with type `catalogue.apply` and payload `{csv,stateVersion}` from that preview. The full business JSON export at `/api/pier/export` includes these item fields. The native six-kind opening/exit CSV format is unchanged and omits the added catalogue metadata; use the full installation archive to preserve the installation.

CAT-001 remains partial: typed custom fields across items/counterparties/orders, their document printing, case-pack quotes/labels and the expanded native cutover mapping still need implementation. Lot/serial/expiry tracking and physical scanner/printer acceptance remain under TRACE-001 and SCAN-001/002.
