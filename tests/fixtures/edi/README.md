# Synthetic EDI fixtures

These authored examples contain no real customer, retailer, provider or licensed prefix evidence. The illustrative Target DC name does not claim retailer certification. `850-synthetic.x12` is incoming RETAILER → PIER; outbound expected files reverse those IDs. Controls start at incoming interchange 000000101 / group 101 / transaction 0101. Outbound 997/855/856/810 controls are 000000102–000000105. `997-rejected.x12` rejects the outbound 855. `bridge-accepted.json` is a synthetic transport-edge response used only by tests.

The 850 requests four MUG-BLUE, three TOWEL and one UNKNOWN. Expected 855 accepts mugs, changes towels to two and rejects the unknown identifier. Two expected cartons ship four mugs plus two towels; the invoice is USD 12.00. Barcode fixtures carry SSCC 006141410000000012, independently decoded as GS1-128 by ZXing. The example prefix is not available for production use. See `docs/edi-x12.md` for interfaces, sources and unproven boundaries.
