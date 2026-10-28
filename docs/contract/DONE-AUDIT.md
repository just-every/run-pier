Carried-done audit against main `b23893e4b0b46c454a14f98a8602ba508f350ddd`.

Every part of a clause that was done at that commit has one row per acceptance point, and one row per outcome where a point names several. **Asserting test** is the line of the assertion in a file the clause's Evidence cell lists; where a cited test passes an expected error code to its command helper, the line is that call, and the helper asserts the code. **Result** is `asserted`, `none` (the part is partial and its Gap names the outcome) or `moved` (a pointer or proof boundary left the point). SEC-001 is partial because it merged the partial BASE-001, whatever its rows say.

| Clause | Point | Outcome | Asserting test | Result |
| --- | --- | --- | --- | --- |
| PIER-001 | 1 | A fractional-pack item is created through the UI | `tests/browser/journey.spec.ts:78` | asserted |
| PIER-001 | 1 | Fractional-pack stock, bins and transit locations through authenticated commands | `tests/api/flows.test.mjs:15` | asserted |
| PIER-001 | 1 | Bin and transit locations through the UI | `tests/browser/journey.spec.ts:84` | asserted |
| PIER-001 | 1 | The item is referenced by documents and counts | `tests/browser/journey.spec.ts:220` | asserted |
| PIER-001 | 1 | A unit edit on a used item is attempted and refused | none | none |
| PIER-001 | 1 | A pack edit on a used item is attempted and refused | none | none |
| PIER-001 | 1 | A kind edit on a used location is attempted and refused | none | none |
| PIER-001 | 1 | The used item is archived | `tests/api/flows.test.mjs:556` | asserted |
| PIER-001 | 2 | The edits fail atomically | none | none |
| PIER-001 | 2 | Archived history remains readable | none | none |
| PIER-002 | 1 | Supplier terms are created and a PO commits against them | `tests/api/flows.test.mjs:40` | asserted |
| PIER-002 | 1 | The terms are revised after the PO | none | none |
| PIER-002 | 1 | The original PO and receipt are read after the revision | none | none |
| PIER-002 | 2 | The commitment retains its original quantities after the revision | none | none |
| PIER-002 | 2 | The commitment retains its original price after the revision | none | none |
| PIER-002 | 2 | The commitment retains its source version | none | none |
| PIER-002 | 2 | Duplicate-pair creation cannot bypass the versioned record | none | none |
| PIER-003 | 1 | Preview and freeze a native batch | `tests/api/native-exit.test.mjs:7` | asserted |
| PIER-003 | 1 | Commit once | `tests/api/native-exit.test.mjs:104` | asserted |
| PIER-003 | 1 | Repeat unchanged input with no change | `tests/api/native-exit.test.mjs:114` | asserted |
| PIER-003 | 1 | Revise a changed opening | `tests/api/security-import.test.mjs:92` | asserted |
| PIER-003 | 1 | Safe undo | `tests/api/security-import.test.mjs:98` | asserted |
| PIER-003 | 1 | Dependency-blocked undo | `tests/api/native-exit.test.mjs:121` | asserted |
| PIER-003 | 2 | A wholly backordered and a bin-allocated line import with reservations.csv | `tests/api/native-exit.test.mjs:104` | asserted |
| PIER-003 | 2 | No duplicate opening appears | `tests/api/native-exit.test.mjs:113` | asserted |
| PIER-003 | 2 | No silent reallocation appears | `tests/api/native-exit.test.mjs:104` | asserted |
| PIER-003 | 3 | USD unit costs of the imported opening are read in COST-001's ledger | none | none |
| PIER-003 | 3 | USD valuation of the opening in COST-001's ledger | `tests/api/security-import.test.mjs:655` | asserted |
| PIER-003 | 4 | An AUD batch waits for its reviewed USD rate before commit | `tests/api/security-import.test.mjs:642` | asserted |
| PIER-003 | 4 | The committed batch records the rate beside the source amounts and currency | `tests/api/security-import.test.mjs:653` | asserted |
| PIER-003 | 5 | A row with no currency is read and shown as USD in the preview | `tests/api/security-import.test.mjs:641` | asserted |
| PIER-003 | 6 | An unknown currency code is refused with the row named | `tests/api/security-import.test.mjs:638` | asserted |
| PIER-004 | 1 | Simultaneous orders for the last fractional units through authenticated HTTP | `tests/api/flows.test.mjs:126` | asserted |
| PIER-004 | 1 | A retried command returns the same outcome | `tests/api/flows.test.mjs:133` | asserted |
| PIER-004 | 2 | Total reservations never exceed on-hand sellable stock | `tests/api/flows.test.mjs:126` | asserted |
| PIER-004 | 2 | Unmet demand remains visible as backorders | `tests/api/flows.test.mjs:130` | asserted |
| PIER-005 | 1 | The PO is prepared as an agent | none | none |
| PIER-005 | 1 | Approval with the agent's own credential is refused | none | none |
| PIER-005 | 1 | The buyer's approval is obtained | `tests/api/flows.test.mjs:158` | asserted |
| PIER-005 | 1 | A material change is made and commit attempted | `tests/api/flows.test.mjs:170` | asserted |
| PIER-005 | 2 | A stale or unapproved version does not commit | `tests/api/flows.test.mjs:175` | asserted |
| PIER-005 | 2 | The freshly approved version commits | none | none |
| PIER-005 | 2 | The commit changes expected supply rather than on-hand stock | none | none |
| PIER-006 | 1 | A partial receipt of a multi-line PO | none | none |
| PIER-006 | 1 | The repeated command returns the first receipt | `tests/api/flows.test.mjs:232` | asserted |
| PIER-006 | 1 | A receipt with one invalid line is refused | `tests/api/flows.test.mjs:252` | asserted |
| PIER-006 | 2 | The first receipt posts once | `tests/api/flows.test.mjs:232` | asserted |
| PIER-006 | 2 | Exact receipt cost is retained | `tests/api/flows.test.mjs:236` | asserted |
| PIER-006 | 2 | Remaining expected quantities reconcile | none | none |
| PIER-006 | 2 | The invalid receipt leaves every line unchanged | `tests/api/flows.test.mjs:254` | asserted |
| PIER-007 | 1 | An unused receipt reverses | `tests/api/flows.test.mjs:262` | asserted |
| PIER-007 | 1 | Reversal after stock is reserved is refused | `tests/api/flows.test.mjs:269` | asserted |
| PIER-007 | 1 | Reversal after dispatch is refused | `tests/api/flows.test.mjs:337` | asserted |
| PIER-007 | 1 | Correction against an approved physical count posts | `tests/api/flows.test.mjs:526` | asserted |
| PIER-007 | 2 | Intervening movement invalidates the old count | `tests/api/flows.test.mjs:422` | asserted |
| PIER-007 | 2 | The correction retains the original and its compensating link | `tests/api/flows.test.mjs:532` | asserted |
| PIER-008 | 1 | A transfer dispatches through transit | `tests/api/flows.test.mjs:298` | asserted |
| PIER-008 | 1 | In-transit units cannot be sold | `tests/api/flows.test.mjs:288` | asserted |
| PIER-008 | 1 | Partial destination receipt | `tests/api/flows.test.mjs:294` | asserted |
| PIER-008 | 1 | The retry returns the same receipt | `tests/api/flows.test.mjs:296` | asserted |
| PIER-008 | 2 | Source, transit and destination reconcile | `tests/api/flows.test.mjs:299` | asserted |
| PIER-008 | 2 | Transit cannot be promised as current sellable stock | `tests/api/flows.test.mjs:288` | asserted |
| PIER-009 | 1 | A partial dispatch posts | `tests/api/flows.test.mjs:325` | asserted |
| PIER-009 | 1 | Use of another order's reservation is refused | none | none |
| PIER-009 | 1 | A retry after response loss decrements nothing twice | `tests/api/flows.test.mjs:323` | asserted |
| PIER-009 | 2 | The shipment's consumed allocations are exact | `tests/api/flows.test.mjs:325` | asserted |
| PIER-009 | 2 | Outstanding demand on the remaining order reconciles | none | none |
| PIER-010 | 1 | The unshipped remainder is cancelled and the shipped quantity kept | `tests/api/flows.test.mjs:349` | asserted |
| PIER-010 | 1 | Shipped units return into quarantine | `tests/api/flows.test.mjs:371` | asserted |
| PIER-010 | 1 | An excess return is rejected | `tests/api/flows.test.mjs:390` | asserted |
| PIER-010 | 1 | A partial restock is reviewed | `tests/api/flows.test.mjs:370` | asserted |
| PIER-010 | 2 | Shipment history survives | `tests/api/flows.test.mjs:349` | asserted |
| PIER-010 | 2 | Quarantined units cannot be sold before restock | none | none |
| PIER-011 | 1 | A bin is captured and counted | `tests/api/flows.test.mjs:495` | asserted |
| PIER-011 | 1 | The old approval after a movement is refused | `tests/api/flows.test.mjs:422` | asserted |
| PIER-011 | 2 | The refusal leaves stock unchanged | none | none |
| PIER-011 | 2 | A new captured count produces the exact compensating movement | `tests/api/flows.test.mjs:531` | asserted |
| PIER-012 | 1 | Investigate a corrected receipt and dispatch through the export | `tests/api/flows.test.mjs:550` | asserted |
| PIER-012 | 1 | Export the business records | `tests/api/flows.test.mjs:546` | asserted |
| PIER-012 | 1 | Restore into a fresh local installation and compare business records | `tests/portable.mjs:418` | asserted |
| PIER-012 | 1 | Journal links survive the restore | `tests/portable.mjs:404` | asserted |
| PIER-012 | 1 | Replaying an unchanged import adds nothing | `tests/portable.mjs:472` | asserted |
| PIER-012 | 1 | A new authorized transaction after fresh sign-in | `tests/portable.mjs:490` | asserted |
| STOCK-001 | 1 | The two-warehouse scenario is built through public commands | `tests/api/stock.test.mjs:26` | asserted |
| STOCK-001 | 2 | Per-warehouse figures equal independent sums | `tests/api/stock.test.mjs:26` | asserted |
| STOCK-001 | 2 | Per-bin figures equal independent sums | `tests/api/stock.test.mjs:36` | asserted |
| STOCK-001 | 2 | The Stock view shows each figure | `tests/browser/stock.spec.ts:28` | asserted |
| STOCK-001 | 2 | Warehouse and company totals add up | `tests/api/stock.test.mjs:29` | asserted |
| STOCK-001 | 2 | Search by SKU and barcode at 1440 and 390 | `tests/browser/stock.spec.ts:33` | asserted |
| STOCK-001 | 2 | Filters by warehouse, bin and status at 1440 and 390 | `tests/browser/stock.spec.ts:37` | asserted |
| STOCK-001 | 3 | Reserved includes held units | `tests/api/stock.test.mjs:26` | asserted |
| STOCK-001 | 3 | Reserved carries its explanation | none | none |
| STOCK-001 | 3 | Available falls by the held units | `tests/api/stock.test.mjs:37` | asserted |
| STOCK-001 | 3 | An order cannot reserve held units | none | none |
| STOCK-001 | 3 | Totals still equal the bin sums | `tests/api/stock.test.mjs:29` | asserted |
| STOCK-001 | 3 | The export lists reservation and hold records separately | `tests/api/stock.test.mjs:26` | asserted |
| STOCK-001 | 4 | A legacy PO with no destination shows in the Unassigned bucket and in no real warehouse | none | none |
| CAT-001 | 1 | Catalog import of variants, aliases and dimensions | `tests/api/catalogue.test.mjs:15` | asserted |
| CAT-001 | 1 | A bulk change is previewed with its affected documents | `tests/api/catalogue.test.mjs:64` | asserted |
| CAT-001 | 1 | A unit UPC and a case barcode resolve to their quantities | `tests/api/catalogue.test.mjs:33` | asserted |
| CAT-001 | 1 | The same UPC on a second SKU is refused naming both owners | `tests/api/catalogue.test.mjs:20` | asserted |
| CAT-001 | 1 | Search by each alias and barcode | `tests/browser/catalogue.spec.ts:30` | asserted |
| CAT-001 | 2 | Both dispatches sharing one BOL post | `tests/api/catalogue.test.mjs:49` | asserted |
| CAT-001 | 2 | A returns lookup by that reference returns both shipments | `tests/api/catalogue.test.mjs:50` | asserted |
| CAT-001 | 2 | An item barcode equal to the reference is refused | `tests/api/catalogue.test.mjs:61` | asserted |
| CAT-001 | 3 | A case-pack quote keeps the base-unit quantity | `tests/api/catalogue.test.mjs:117` | asserted |
| CAT-001 | 3 | A case-pack pick keeps the base-unit quantity | `tests/api/catalogue.test.mjs:120` | asserted |
| CAT-001 | 3 | A case-pack label keeps the base-unit quantity | `tests/api/catalogue.test.mjs:124` | asserted |
| CAT-002 | 1 | A custom field on items and orders is filtered | `tests/api/catalogue.test.mjs:93` | asserted |
| CAT-002 | 1 | The field prints on a packing slip | `tests/api/catalogue.test.mjs:105` | asserted |
| CAT-002 | 1 | The field is found in export | `tests/api/catalogue.test.mjs:110` | asserted |
| CAT-002 | 2 | The owner defines and imports exact typed values for all four record types | `tests/api/catalogue.test.mjs:94` | asserted |
| CAT-002 | 2 | The owner edits a typed value | `tests/api/catalogue.test.mjs:112` | asserted |
| CAT-002 | 2 | The owner exports exact typed values | `tests/api/catalogue.test.mjs:109` | asserted |
| CAT-002 | 2 | The owner generates and retrieves field-bearing documents | `tests/api/catalogue.test.mjs:113` | asserted |
| CAT-003 | 1 | Non-owner direct reads disclose no protected content | `tests/api/catalogue.test.mjs:130` | asserted |
| CAT-003 | 1 | Non-owner filters are refused | `tests/api/catalogue.test.mjs:132` | asserted |
| CAT-003 | 1 | Non-owner imports and writes are refused | `tests/api/catalogue.test.mjs:134` | asserted |
| CAT-003 | 1 | Non-owner exports are refused | `tests/api/catalogue.test.mjs:140` | asserted |
| CAT-003 | 1 | Non-owner original downloads disclose nothing | `tests/api/native-exit.test.mjs:126` | asserted |
| CAT-003 | 1 | Non-owner retained document retrieval is refused | `tests/api/catalogue.test.mjs:139` | asserted |
| CAT-003 | 1 | Non-owner reprints are refused | `tests/api/catalogue.test.mjs:137` | asserted |
| CAT-003 | 1 | Recovered-result requests after revocation disclose nothing, on the next operation | `tests/api/catalogue.test.mjs:156` | asserted |
| CAT-003 | 2 | Unsupported erasure names the missing setup | `tests/api/catalogue.test.mjs:142` | asserted |
| CAT-003 | 2 | The refusal is recorded | `tests/api/catalogue.test.mjs:144` | asserted |
| CAT-003 | 2 | No content is deleted | `tests/api/native-exit.test.mjs:133` | asserted |
| CAT-003 | 3 | The refusal repeats after undo removes the live definitions | `tests/api/native-exit.test.mjs:132` | asserted |
| CAT-003 | 3 | The refusal repeats after restart | `tests/api/native-exit.test.mjs:132` | asserted |
| CAT-003 | 3 | The refusal repeats after a valid archive restore | `tests/portable.mjs:449` | asserted |
| CAT-003 | 4 | Custody holds without live definitions | `tests/api/native-exit.test.mjs:127` | asserted |
| CAT-003 | 4 | Exact archive preservation | `tests/portable.mjs:445` | asserted |
| CAT-003 | 4 | Fresh owner authority after restore | `tests/portable.mjs:397` | asserted |
| CAT-003 | 4 | Paused external authority after restore | `tests/portable.mjs:455` | asserted |
| CAT-003 | 4 | Older-archive refusal with the later journal | `tests/portable.mjs:523` | asserted |
| CAT-003 | 5 | Activity holds the durable operation and refusal metadata without field values | `tests/api/catalogue.test.mjs:146` | asserted |
| CAT-003 | 5 | Exported audit holds the refusal without field values | `tests/portable.mjs:578` | asserted |
| CAT-003 | 6 | Field-control screens at 1440 and 390 with success, error and recovery | `tests/browser/catalogue.spec.ts:172` | asserted |
| CAT-003 | 6 | Erasure-refusal and Activity screens at both widths | `tests/browser/catalogue.spec.ts:189` | asserted |
| CAT-003 | 6 | Denied access at both widths | `tests/browser/catalogue.spec.ts:199` | asserted |
| CAT-003 | 6 | Field-bearing document screens at both widths | none | none |
| CAT-003 | 6 | Original-custody screens at both widths | none | none |
| KIT-001 | 1 | A two-component and a three-component kit are defined from stocked SKUs | `tests/api/floor.test.mjs:206` | asserted |
| KIT-001 | 2 | Concurrent sales-order and channel kit sales reserve components | `tests/api/floor.test.mjs:205` | asserted |
| KIT-001 | 2 | Published kit availability is the lowest buildable count | `tests/api/floor.test.mjs:207` | asserted |
| KIT-001 | 2 | The pick list carries the component lines | `tests/browser/stock.spec.ts:89` | asserted |
| KIT-001 | 2 | COGS agrees | `tests/api/floor.test.mjs:216` | asserted |
| KIT-001 | 3 | Kit availability drops to zero when a component drains | `tests/api/floor.test.mjs:220` | asserted |
| KIT-001 | 3 | A further kit order backorders as a whole kit | `tests/api/floor.test.mjs:227` | asserted |
| KIT-001 | 4 | Five display kits are pre-assembled and two shipped | `tests/api/floor.test.mjs:275` | asserted |
| KIT-001 | 4 | A returned kit is inspected per component | `tests/api/floor.test.mjs:272` | asserted |
| KIT-001 | 4 | Rolled-up kit cost and margin reconcile | `tests/api/floor.test.mjs:266` | asserted |
| KIT-001 | 4 | No component is reserved twice | `tests/api/floor.test.mjs:274` | asserted |
| TRACE-001 | 1 | Two dated lots and serials are received | `tests/api/floor.test.mjs:312` | asserted |
| TRACE-001 | 1 | Transfer of a lot | `tests/api/floor.test.mjs:315` | asserted |
| TRACE-001 | 1 | Split dispatch | `tests/api/floor.test.mjs:342` | asserted |
| TRACE-001 | 1 | A lot is quarantined | `tests/api/floor.test.mjs:338` | asserted |
| TRACE-001 | 1 | A serial is returned | `tests/api/floor.test.mjs:343` | asserted |
| TRACE-001 | 2 | Exact customers and receipts are traced | `tests/api/floor.test.mjs:342` | asserted |
| TRACE-001 | 2 | A duplicate serial cannot silently ship | `tests/api/floor.test.mjs:310` | asserted |
| TRACE-001 | 2 | An expired or blocked lot cannot silently ship | `tests/api/floor.test.mjs:365` | asserted |
| TRACE-001 | 3 | The owner approves FIFO or FEFO | none | none |
| TRACE-001 | 3 | Expiry is valid through its UTC calendar day | `tests/api/floor.test.mjs:366` | asserted |
| TRACE-001 | 4 | FIFO orders by first receipt time and arrival order | none | none |
| TRACE-001 | 4 | FEFO orders by expiry | `tests/api/floor.test.mjs:321` | asserted |
| TRACE-001 | 4 | FEFO places undated identities last | none | none |
| TRACE-001 | 5 | Serials and trace codes share the stock-code namespace | none | none |
| TRACE-001 | 5 | Supplier lot references are exact per-SKU metadata | none | none |
| TRACE-001 | 6 | Quarantine follows component parents into assembled kits | `tests/api/floor.test.mjs:393` | asserted |
| WMS-001 | 1 | Phone and desktop receiving and put-away of a partial PO | `tests/browser/warehouse-returns.spec.ts:65` | asserted |
| WMS-001 | 1 | A pick list across bins | `tests/browser/warehouse-waves.spec.ts:52` | asserted |
| WMS-001 | 1 | A wrong SKU scan is refused | `tests/api/floor.test.mjs:105` | asserted |
| WMS-001 | 1 | A split pack and shipment | `tests/browser/warehouse-waves.spec.ts:145` | asserted |
| WMS-001 | 1 | The packing slip prints at the pack step | `tests/browser/warehouse-waves.spec.ts:95` | asserted |
| WMS-001 | 1 | A transfer | `tests/browser/warehouse-returns.spec.ts:74` | asserted |
| WMS-001 | 1 | A cycle count | `tests/browser/warehouse-returns.spec.ts:79` | asserted |
| WMS-001 | 2 | Ten orders batch-picked in one walk to their own totes | `tests/api/warehouse-waves.test.mjs:51` | asserted |
| WMS-001 | 2 | Each shipment consumes only its own reservations | `tests/api/warehouse-waves.test.mjs:82` | asserted |
| WMS-001 | 2 | Only the short order stays open | `tests/api/warehouse-waves.test.mjs:85` | asserted |
| WMS-001 | 3 | A zone pick across two zones merges at pack | `tests/api/warehouse-waves.test.mjs:38` | asserted |
| WMS-001 | 4 | Interrupted connectivity resumes without double movement | `tests/browser/warehouse-offline.spec.ts:98` | asserted |
| WMS-001 | 4 | No stale allocation posts | `tests/browser/warehouse-offline.spec.ts:126` | asserted |
| WMS-001 | 5 | Wave lines retain their zones and each order its tote | `tests/api/warehouse-waves.test.mjs:26` | asserted |
| WMS-001 | 5 | Closing the pack records the completed zone contributions | `tests/api/warehouse-waves.test.mjs:38` | asserted |
| WMS-001 | 6 | Interrupted scan intent stays in the same tab | `tests/browser/warehouse-offline.spec.ts:52` | asserted |
| WMS-001 | 6 | Reconnecting sends no write automatically | `tests/browser/warehouse-offline.spec.ts:53` | asserted |
| WMS-001 | 7 | Recovery replays an already-recorded command by its exact identity | `tests/browser/warehouse-offline.spec.ts:56` | asserted |
| WMS-001 | 7 | An unrecorded intent is refused when stock or task evidence changed | `tests/browser/warehouse-offline.spec.ts:122` | asserted |
| WMS-004 | 1 | The released wave's pick list shows the wave and dock | `tests/api/floor.test.mjs:99` | asserted |
| WMS-004 | 1 | Each line confirms only after its bin and item scans | `tests/api/floor.test.mjs:103` | asserted |
| WMS-004 | 2 | The picker is directed to the overflow bin | `tests/api/floor.test.mjs:110` | asserted |
| WMS-004 | 2 | Only that line's reservation moves | `tests/api/floor.test.mjs:112` | asserted |
| WMS-004 | 2 | A count opens for the reported bin | `tests/api/floor.test.mjs:113` | asserted |
| WMS-005 | 1 | One authorized scan restocks a sellable return into the bin | `tests/browser/warehouse-returns.spec.ts:97` | asserted |
| WMS-005 | 2 | A damaged scan with a reason posts the write-off to its mapped account | `tests/browser/warehouse-returns.spec.ts:104` | asserted |
| WMS-005 | 3 | Unauthorized scans leave the units in quarantine | `tests/browser/warehouse-returns.spec.ts:118` | asserted |
| WMS-002 | 1 | Pick-face minimums and capacity drive a put-away plan | `tests/api/slotting.test.mjs:46` | asserted |
| WMS-002 | 1 | A received oversized item gets no destination | `tests/api/slotting.test.mjs:49` | asserted |
| WMS-002 | 1 | The replenishment and ABC plan runs | `tests/api/slotting.test.mjs:97` | asserted |
| WMS-002 | 2 | An operator completes the approved scan tasks | `tests/api/slotting.test.mjs:81` | asserted |
| WMS-002 | 2 | Over-capacity placement is refused | `tests/api/slotting.test.mjs:109` | asserted |
| WMS-002 | 2 | Slotting alone changes no stock | `tests/api/slotting.test.mjs:95` | asserted |
| WMS-003 | 1 | Eighteen of twenty due orders ship, one short and one unpicked | `tests/api/dispatch.test.mjs:64` | asserted |
| WMS-003 | 2 | A later-promised order is due today through its reviewed ship-by date | `tests/api/dispatch.test.mjs:36` | asserted |
| WMS-003 | 2 | An invalid ship-by date is refused | `tests/api/dispatch.test.mjs:32` | asserted |
| WMS-003 | 3 | The board shows the 4 pm cut-off with its time zone | none | none |
| WMS-003 | 3 | Counts equal the orders' states throughout | `tests/api/dispatch.test.mjs:60` | asserted |
| WMS-003 | 3 | Unfinished due orders are flagged with their reasons before cut-off | `tests/api/dispatch.test.mjs:67` | asserted |
| WMS-003 | 3 | The flags carry the labeled conservative basis | none | none |
| WMS-003 | 3 | Each flag clears only when its dispatch posts | none | none |
| WMS-003 | 4 | The day-close record matches independent counts | `tests/api/dispatch.test.mjs:71` | asserted |
| SALES-001 | 1 | Two customer tiers price a case-pack quote | `tests/api/costing.test.mjs:165` | asserted |
| SALES-001 | 1 | An authorized discount and exact USD tax | `tests/api/costing.test.mjs:132` | asserted |
| SALES-001 | 1 | The emailed quote's PDF is kept on the record | `tests/api/costing.test.mjs:146` | asserted |
| SALES-001 | 1 | Acceptance converts once and reserves | `tests/api/costing.test.mjs:150` | asserted |
| SALES-001 | 1 | The order confirmation is sent | `tests/api/costing.test.mjs:151` | asserted |
| SALES-001 | 2 | A duplicate acceptance creates no order | `tests/api/costing.test.mjs:150` | asserted |
| SALES-001 | 2 | A price or quantity change invalidates approval | `tests/api/costing.test.mjs:172` | asserted |
| SALES-001 | 3 | The approver role defaults to Owner | `tests/api/costing.test.mjs:297` | asserted |
| SALES-001 | 3 | The owner designates Sales operator or Buyer | `tests/api/costing.test.mjs:309` | asserted |
| SALES-001 | 3 | The designation keeps its reason | none | none |
| SALES-001 | 4 | A recipient list needs explicit owner consent | `tests/api/costing.test.mjs:300` | asserted |
| SALES-001 | 5 | A material revision invalidates approval and acceptance | `tests/api/costing.test.mjs:160` | asserted |
| SALES-001 | 5 | Acceptance converts the same quote identity once, keeping earlier versions | `tests/api/costing.test.mjs:145` | asserted |
| SALES-001 | 6 | Tax estimates name the owner table version | none | none |
| SALES-001 | 6 | USD cents with half-away-from-zero rounding | `tests/api/costing.test.mjs:132` | asserted |
| SALES-001 | 6 | Unresolved exemption evidence stops the quote | `tests/api/costing.test.mjs:177` | asserted |
| SALES-001 | 7 | A policy change invalidates open approvals | `tests/api/costing.test.mjs:303` | asserted |
| SALES-001 | 7 | Acceptance and sending recheck the approver's current role | `tests/api/costing.test.mjs:304` | asserted |
| SALES-008 | 1 | Blank prices come from each customer's price list | `tests/api/costing.test.mjs:201` | asserted |
| SALES-008 | 1 | The unknown row and its routed warehouse are named | `tests/api/costing.test.mjs:193` | asserted |
| SALES-008 | 1 | Approval creates three orders once | `tests/api/costing.test.mjs:202` | asserted |
| SALES-008 | 1 | Importing the same file again creates none | `tests/api/costing.test.mjs:204` | asserted |
| SALES-004 | 1 | A recurring order across a price change | `tests/api/costing.test.mjs:217` | asserted |
| SALES-004 | 1 | A recurring order across a credit hold | `tests/api/costing.test.mjs:218` | asserted |
| SALES-004 | 1 | Pause stops further orders | `tests/api/costing.test.mjs:221` | asserted |
| SALES-004 | 2 | Dropship confirmation, tracking and customer credit | `tests/api/costing.test.mjs:277` | asserted |
| SALES-004 | 2 | Local on-hand stock is unchanged | `tests/api/costing.test.mjs:280` | asserted |
| BUY-002 | 1 | A threshold-crossing PO routes to the correct buyer | `tests/api/purchase-send.test.mjs:122` | asserted |
| BUY-002 | 1 | An approval recorded with an agent’s credential is refused | `tests/api/purchase-send.test.mjs:157` | asserted |
| BUY-002 | 2 | Routing uses owner-saved named human approvers | `tests/api/purchase-send.test.mjs:155` | asserted |
| BUY-002 | 3 | Spend includes goods, freight and supplier tax exactly | `tests/api/purchase-send.test.mjs:123` | asserted |
| BUY-002 | 3 | Spend includes duty | none | none |
| BUY-002 | 3 | Ceilings are inclusive | none | none |
| BUY-002 | 4 | The supplier-specific scope wins over the general scope | `tests/api/purchase-send.test.mjs:153` | asserted |
| BUY-002 | 4 | An exact exception type wins over any | `tests/api/purchase-send.test.mjs:153` | asserted |
| BUY-002 | 4 | The smallest covering ceiling wins | `tests/api/purchase-send.test.mjs:122` | asserted |
| BUY-002 | 4 | Uncovered spend is refused | `tests/api/purchase-send.test.mjs:133` | asserted |
| BUY-002 | 5 | The minimum-order exception type | `tests/api/purchase-send.test.mjs:152` | asserted |
| BUY-002 | 6 | Delegates carry an explicit UTC expiry | `tests/api/purchase-send.test.mjs:136` | asserted |
| BUY-002 | 6 | Delegates must be current unrestricted owners or buyers | none | none |
| BUY-002 | 6 | Escalation is an explicit owner action to the named approver | `tests/api/purchase-send.test.mjs:145` | asserted |
| BUY-002 | 6 | The escalation is audited | none | none |
| BUY-002 | 7 | A policy edit invalidates existing approval | `tests/api/purchase-send.test.mjs:143` | asserted |
| BUY-002 | 7 | A policy edit invalidates pending send authority | none | none |
| BUY-006 | 1 | An approved PO sends once | `tests/api/purchase-send.test.mjs:46` | asserted |
| BUY-006 | 2 | An ambiguous send stays visible and is not resubmitted | `tests/api/purchase-send.test.mjs:81` | asserted |
| BUY-006 | 3 | Both send doors share one correspondence identity and claim | `tests/api/purchase-send.test.mjs:174` | asserted |
| BUY-006 | 4 | Install mail attaches the retained PDF as exact bytes | `tests/api/purchase-send.test.mjs:37` | asserted |
| BUY-006 | 5 | The Managed relay sends text only with a visible notice and refuses purchase PDF sends | none | none |
| BUY-006 | 5 | Uncertain claims are never automatically retried | `tests/api/purchase-send.test.mjs:81` | asserted |
| BUY-007 | 1 | A supplier price and date change requires re-approval | `tests/api/purchase-send.test.mjs:184` | asserted |
| BUY-007 | 2 | Intake retains its source and lines without changing the commitment | `tests/api/purchase-send.test.mjs:185` | asserted |
| BUY-007 | 3 | The change stops sends | `tests/api/purchase-send.test.mjs:186` | asserted |
| BUY-007 | 3 | The change stops chases | none | none |
| BUY-007 | 3 | Explicit review applies the change under the current spend route | `tests/api/purchase-send.test.mjs:192` | asserted |
| BUY-007 | 4 | Received goods cannot be cancelled | `tests/api/purchase-send.test.mjs:208` | asserted |
| BUY-007 | 5 | An 856 notice uses the reviewed receiving door | `tests/api/floor.test.mjs:83` | asserted |
| BUY-003 | 1 | Partial rejection, authorization, dispatch, credit and replacement | `tests/api/supplier-returns.test.mjs:58` | asserted |
| BUY-003 | 2 | A duplicate return is refused | `tests/api/supplier-returns.test.mjs:34` | asserted |
| BUY-003 | 2 | An excess return is refused | `tests/api/supplier-returns.test.mjs:39` | asserted |
| BUY-003 | 2 | The original receipt, cost, PO and stock history survive | `tests/api/supplier-returns.test.mjs:64` | asserted |
| BUY-003 | 3 | Return dispatch journals clear COGS and credit Inventory at exact layers | `tests/api/supplier-returns.test.mjs:79` | asserted |
| BUY-003 | 4 | Owner-authorized credits allocate once to the matched payable | `tests/api/supplier-returns.test.mjs:77` | asserted |
| BUY-003 | 4 | An insufficient balance or mismatched readback stays in review | none | none |
| BUY-003 | 5 | Replacements use the original cost and freight and duty shares | `tests/api/supplier-returns.test.mjs:67` | asserted |
| BUY-003 | 6 | A remaining clearing expense states a non-credited cost | none | none |
| BUY-004 | 1 | A wrong pack on the invoice is a named difference | `tests/api/supplier-bill-documents.test.mjs:18` | asserted |
| BUY-004 | 1 | A wrong freight line is a named difference | `tests/api/supplier-bill-documents.test.mjs:68` | asserted |
| BUY-004 | 1 | The bill compares against the partial receipt and PO | `tests/api/books.test.mjs:63` | asserted |
| BUY-004 | 1 | Only the approved bill posts | `tests/api/supplier-bill-documents.test.mjs:33` | asserted |
| BUY-004 | 2 | Scorecards reproduce on-time | `tests/api/supplier-performance.test.mjs:90` | asserted |
| BUY-004 | 2 | Scorecards reproduce fill | `tests/api/supplier-performance.test.mjs:89` | asserted |
| BUY-004 | 2 | Scorecards reproduce defects | `tests/api/supplier-performance.test.mjs:88` | asserted |
| BUY-004 | 2 | Scorecards reproduce price changes | `tests/api/supplier-performance.test.mjs:98` | asserted |
| BUY-005 | 1 | The East and West scenario is built through public commands | `tests/api/reorder-list.test.mjs:62` | asserted |
| BUY-005 | 2 | SKU A suggests 48 | `tests/api/reorder-list.test.mjs:62` | asserted |
| BUY-005 | 3 | SKU B suggests 66 from S2 | `tests/api/reorder-list.test.mjs:83` | asserted |
| BUY-005 | 4 | SKU C's supplier quantity and minimum give 10 | `tests/api/reorder-list.test.mjs:62` | asserted |
| BUY-005 | 5 | SKU D is not listed | `tests/api/reorder-list.test.mjs:62` | asserted |
| BUY-005 | 6 | SKU E is listed at East for 13 | `tests/api/reorder-list.test.mjs:62` | asserted |
| BUY-005 | 7 | Exactly A, B, C and E with every calculation term | `tests/api/reorder-list.test.mjs:65` | asserted |
| BUY-008 | 1 | One action creates exactly the two drafts | `tests/api/reorder-list.test.mjs:82` | asserted |
| BUY-008 | 2 | A rerun shows the four lines marked with drafts and zero remaining | `tests/api/reorder-list.test.mjs:84` | asserted |
| BUY-008 | 3 | Deleting the S2 draft restores B's 66 | `tests/api/reorder-list.test.mjs:87` | asserted |
| BUY-008 | 4 | Committing B's PO removes B | `tests/api/reorder-list.test.mjs:95` | asserted |
| BUY-008 | 5 | Company-wide replenishment removes E | `tests/api/reorder-list.test.mjs:98` | asserted |
| BUY-008 | 6 | AUTO-001 exceptions and the REPORT-002 low-stock report list the same SKU-locations | `tests/api/reorder-list.test.mjs:58` | asserted |
| BUY-008 | 7 | An independent calculator computes every expected quantity | `tests/api/reorder-list.test.mjs:66` | asserted |
| COST-001 | 1 | Openings, two layers, freight and duty, partial shipment, return and a late bill | `tests/api/books-landed.test.mjs:98` | asserted |
| COST-001 | 2 | FIFO and average-cost value, COGS and margin reconcile to postings | `tests/api/books-landed.test.mjs:193` | asserted |
| COST-001 | 2 | Rounding and period-lock differences enter review | `tests/api/books-landed.test.mjs:206` | asserted |
| COST-001 | 3 | Receipt conversions keep source currency, amounts and rate | `tests/api/books-landed.test.mjs:43` | asserted |
| COST-001 | 4 | Weight allocation by pounds per base unit | `tests/api/books-landed.test.mjs:99` | asserted |
| COST-001 | 5 | Charges split by largest remainder | `tests/api/books-landed.test.mjs:37` | asserted |
| COST-001 | 6 | A late bill keeps supplemental shares and its delta journal reconciles | `tests/api/books-landed.test.mjs:98` | asserted |
| COST-001 | 7 | Original journals keep their baseline amounts | `tests/api/books-landed.test.mjs:101` | asserted |
| COST-001 | 8 | Fractional-cent payables stay in review | `tests/api/books-landed.test.mjs:206` | asserted |
| COST-001 | 8 | Provider period-lock refusals stay in review | `tests/api/books-landed.test.mjs:180` | asserted |
| COST-001 | 8 | Unbuilt baseline documents stay in review | none | none |
| COST-001 | 8 | Unmapped prior adjustments stay in review | none | none |
| COST-002 | 1 | A damaged write-off posts to its mapped GL account | `tests/api/returns.test.mjs:70` | asserted |
| COST-002 | 2 | The write-off carries the damaged reason code | `tests/api/returns.test.mjs:69` | asserted |
| COST-002 | 2 | A write-off without a reason mapping is refused | none | none |
| COST-002 | 2 | The default approval limit is zero USD and equality is within it | none | none |
| COST-002 | 2 | Amounts above the limit need explicit owner approval | `tests/api/returns.test.mjs:72` | asserted |
| API-001 | 1 | Authenticate and read state | `tests/api/flows.test.mjs:584` | asserted |
| API-001 | 1 | Create and reserve an order, then repeat the command | `tests/api/flows.test.mjs:133` | asserted |
| API-001 | 1 | A stale mutation is refused | `tests/api/flows.test.mjs:170` | asserted |
| API-001 | 1 | An unauthorized mutation is refused | `tests/api/flows.test.mjs:581` | asserted |
| API-001 | 2 | Responses expose the durable result and public errors without duplicate effects | `tests/api/flows.test.mjs:139` | asserted |
| SEC-001 | 1 | Reusing a command ID with changed content is refused | `tests/api/flows.test.mjs:139` | asserted |
| SEC-001 | 1 | Invalid decimals are refused | `tests/api/flows.test.mjs:24` | asserted |
| SEC-001 | 1 | A revoked prepared actor is refused | `tests/api/security-import.test.mjs:603` | asserted |
| SEC-001 | 1 | A stale approval race is refused | `tests/api/flows.test.mjs:170` | asserted |
| SEC-001 | 2 | Refusals leave no movement, reservation, document or command result | `tests/api/flows.test.mjs:254` | asserted |
| SEC-001 | 2 | An identical retry returns its original outcome | `tests/api/flows.test.mjs:133` | asserted |
| SEC-001 | 3 | A generic edit that would bypass stock admission is refused | `tests/api/security-import.test.mjs:449` | asserted |
| DATA-001 | 1 | A corrupt archive is refused | `tests/portable.mjs:373` | asserted |
| DATA-001 | 1 | The valid archive restores into a fresh installation | `tests/portable.mjs:418` | asserted |
| DATA-001 | 2 | Complete records, source bytes and history compare | `tests/portable.mjs:444` | asserted |
| DATA-001 | 2 | Fresh owner authority is required | `tests/portable.mjs:397` | asserted |
| DATA-001 | 2 | Reconnection is deliberate | `tests/portable.mjs:458` | asserted |
| DATA-001 | 2 | No outbound effect occurs | `tests/portable.mjs:455` | asserted |
| DATA-001 | 2 | No duplicate opening occurs | `tests/portable.mjs:472` | asserted |
| OPEN-001 | 1 | LICENSE is MIT and package.json declares MIT | `tests/api/open.test.mjs:11` | asserted |
| OPEN-001 | 1 | Every area is reached with three warehouses and 25 staff | `tests/api/open.test.mjs:28` | asserted |
| OPEN-001 | 1 | No payment, upgrade or license prompt appears | `tests/browser/open.spec.ts:26` | asserted |
| OPEN-001 | 1 | A paid provider's cost shows before activation | `tests/browser/open.spec.ts:34` | asserted |
| OPEN-001 | Requirement | "This proof changes no other clause's status" left point 2 for the Requirement | n/a | moved |
| AGENT-001 | 1 | The replenishment proposal is prepared | `tests/api/flows.test.mjs:188` | asserted |
| AGENT-001 | 1 | The reallocation, count-drift and migration proposals are prepared as an agent | none | none |
| AGENT-001 | 1 | An agent's stock write is refused | `tests/api/security-import.test.mjs:500` | asserted |
| AGENT-001 | 1 | An agent's approval is refused | `tests/api/security-import.test.mjs:499` | asserted |
| AGENT-001 | 1 | A stale-version application is refused | none | none |
| AGENT-001 | 2 | The refusals leave business state unchanged | `tests/api/security-import.test.mjs:501` | asserted |
| AGENT-001 | 2 | Only an exact current approved consequence executes | `tests/api/flows.test.mjs:188` | asserted |
| AGENT-006 | 1 | A restricted warehouse user asks why an order is short | `tests/api/item-agent.test.mjs:240` | asserted |
| AGENT-006 | 1 | Bulk promise and PO changes are proposed | `tests/api/item-agent.test.mjs:156` | asserted |
| AGENT-006 | 2 | Answers cite allowed evidence without forbidden costs | `tests/api/item-agent.test.mjs:253` | asserted |
| AGENT-006 | 2 | The plan is previewed, edited and approved | `tests/api/item-agent.test.mjs:169` | asserted |
| AGENT-006 | 3 | The stale action is refused | `tests/api/item-agent.test.mjs:176` | asserted |
| AGENT-006 | 3 | Applied results keep ordinary command and audit links | `tests/api/item-agent.test.mjs:183` | asserted |
