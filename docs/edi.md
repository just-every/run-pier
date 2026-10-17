# Retail EDI

Open **EDI** in Pier to prepare retailer orders and documents today: receive an original purchase order, map the retailer's item codes, review its acknowledgment, prepare a carton ship notice and shipment invoice, and print SSCC labels.

**Automatic retailer delivery is coming.** Live exchange needs an authorized EDI network account, such as SPS Commerce or Orderful, plus the retailer's onboarding and certification. Pier has no direct connection to either service today, and RER Managed sending is not available yet. A self-hosted installation can use a developer-configured bridge to its provider. Target, Walmart and The Home Depot certification remains pending.

## How orders arrive today

Get the original **X12 850** file from your retailer or EDI provider's portal or agreed delivery channel. Open the file as text, copy its complete interchange and paste it into **Receive retailer 850**. Pier does not automatically fetch orders from a retailer or network account. A PDF or an ordinary spreadsheet is not an X12 850.

The same manual route accepts a retailer's original **X12 997** response at **Receive retailer 997 response**. Keep using your provider's portal to track delivery until a certified connection is in place. The illustrative synthetic DC 0593 purchase order used in local tests is not a retailer implementation guide.

## Set up a retailer

The owner adds the retailer as a customer and creates its warehouse bins first. Under **Retailer settings and item mappings**, enter the agreed sender/receiver IDs, fixed fulfilment warehouse, licensed GS1 company prefix and the retailer’s 855, 856 and 810 windows. New connections use test mode; production mode requires the approved retailer connection. Map each buyer item code (BP) or UPC (UP) to a Pier item, X12 unit and exact base units per EDI unit. Conflicting BP/UPC matches and mismatched units block intake.

The owner needs the retailer’s current implementation and label guides, its agreed identifiers and deadlines, a GS1 prefix assigned to the business, and an authorized network account. AS2, SFTP or VAN selection is pending. A network operator must connect your chosen transport and complete certification against the actual retailer guide. General X12 support does not establish retailer acceptance.

## Purchase order to invoice

1. Paste one original 850 interchange into **Receive retailer 850**. Pier checks envelope controls and segment counts, retains the original and prepares a 997 syntax acknowledgment. An available bridge receives that 997 automatically. A repeated interchange does not create another order. Unmapped lines are named; no sales order is created until mapped or explicitly rejected. Unsupported commercial segments remain held for a partner map, rather than disappearing from the order.
2. Resolve item mappings, then review every line for the 855. Accept keeps the requested quantity; change accepts a lower positive quantity with a reason; reject accepts zero with a reason. The reviewed response adjusts this order’s unshipped demand and reservations. The deadline starts when the 850 is received. Once warehouse work starts, commercial changes require a separate review.
3. Pick the order and pack/measure cartons at **Floor → Pack**. Follow its EDI link. Enter expected pickup, arrival and the shipment reference, then prepare the 856. Pier allocates an SSCC per carton and builds shipment/order/pack/item hierarchy. Its deadline is the earlier of the pickup window and arrival minus the retailer’s required lead. Delivery after the stated arrival is refused.
4. Open the 856 to request label printing, open its 4 × 6 browser print sheet or download Zebra ZPL. The GS1-128 barcode carries AI 00 and exactly the SSCC in the ASN. Reprints retain the SSCC and carton contents, with actor and reason recorded. Printing does not dispatch stock or confirm a physical printer completed the job. Check print scale, contrast and scanning on the actual printer before warehouse use.
5. Send the ASN, then physically dispatch the packed order in Floor. Prepare the 810 against the actual shipment. It invoices shipped quantities and retained prices in USD; it cannot invoice an absent shipment. Freight, tax, allowances and partner-specific charges are outside this profile and require explicit mapping.

**Retailer compliance** counts required documents even before they have been prepared, shows the next deadline and lists approaching, late, blocked and rejected-997 exceptions. A sent-late document stays an exception. Bridge acceptance records a send time; a retailer’s 997 is separate. Paste a retailer 997 into **Receive retailer 997 response** to match its source controls and retain acceptance or rejection.

## Delivery and recovery

On RER Managed, EDI delivery is not available yet. Preparing documents works; a provider action shows that line without making a network call. There is no provider simulator in the application.

For a self-hosted installation, a developer can connect your authorized network provider through Pier's [EDI bridge integration](edi-bridge.md). This needs technical setup and retailer certification; there is no direct SPS Commerce or Orderful account connection in Pier today. Until that is ready, download prepared X12 documents and arrange delivery with your provider. Pier does not track sends performed outside its bridge, so keep that delivery evidence with your provider.

Pier records intent before sending. A timeout or mismatched response leaves delivery uncertain and prevents another send. The owner checks the bridge and uses **Reconcile bridge receipt** to record its accepted identity/time or verified absence with evidence. Only verified absence permits another send. A transport receipt never supplies retailer functional acceptance. Business documents require owner send authority; operators may receive POs and return their syntax acknowledgments.

The single public-flow test is `tests/api/edi.test.mjs`. All network-edge fixtures are authored synthetic examples. See [X12 and SSCC profile](edi-x12.md) for supported segments, standards references and remaining certification and physical-device boundaries.
