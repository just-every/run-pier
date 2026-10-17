# Retail EDI

Open **EDI** in Pier. This is an X12 004010 document workflow, with a single installation-configured EDI bridge. No SPS Commerce or Orderful sandbox is connected. Target, Walmart and The Home Depot onboarding and certification are pending; the illustrative synthetic DC 0593 purchase order is not a retailer implementation guide.

## Set up a retailer

The owner adds the retailer as a customer and creates its warehouse bins first. Under **Retailer settings and item mappings**, enter the agreed sender/receiver IDs, fixed fulfilment warehouse, licensed GS1 company prefix and the retailer’s 855, 856 and 810 windows. New connections use test mode; production mode requires the approved retailer connection. Map each buyer item code (BP) or UPC (UP) to a Pier item, X12 unit and exact base units per EDI unit. Conflicting BP/UPC matches and mismatched units block intake.

The owner needs the retailer’s current implementation and label guides, its agreed identifiers and deadlines, a GS1 prefix assigned to the business, and an authorized network account. AS2, SFTP or VAN selection is pending. A network operator must implement the bridge contract below and complete certification against the actual retailer guide. General X12 support does not establish retailer acceptance.

## Purchase order to invoice

1. Paste one original 850 interchange into **Receive retailer 850**. Pier checks envelope controls and segment counts, retains the original and prepares a 997 syntax acknowledgment. An available bridge receives that 997 automatically. A repeated interchange does not create another order. Unmapped lines are named; no sales order is created until mapped or explicitly rejected. Unsupported commercial segments remain held for a partner map, rather than disappearing from the order.
2. Resolve item mappings, then review every line for the 855. Accept keeps the requested quantity; change accepts a lower positive quantity with a reason; reject accepts zero with a reason. The reviewed response adjusts this order’s unshipped demand and reservations. The deadline starts when the 850 is received. Once warehouse work starts, commercial changes require a separate review.
3. Pick the order and pack/measure cartons at **Floor → Pack**. Follow its EDI link. Enter expected pickup, arrival and the shipment reference, then prepare the 856. Pier allocates an SSCC per carton and builds shipment/order/pack/item hierarchy. Its deadline is the earlier of the pickup window and arrival minus the retailer’s required lead. Delivery after the stated arrival is refused.
4. Open the 856 to request label printing, open its 4 × 6 browser print sheet or download Zebra ZPL. The GS1-128 barcode carries AI 00 and exactly the SSCC in the ASN. Reprints retain the SSCC and carton contents, with actor and reason recorded. Printing does not dispatch stock or confirm a physical printer completed the job. Check print scale, contrast and scanning on the actual printer before warehouse use.
5. Send the ASN, then physically dispatch the packed order in Floor. Prepare the 810 against the actual shipment. It invoices shipped quantities and retained prices in USD; it cannot invoice an absent shipment. Freight, tax, allowances and partner-specific charges are outside this profile and require explicit mapping.

**Retailer compliance** counts required documents even before they have been prepared, shows the next deadline and lists approaching, late, blocked and rejected-997 exceptions. A sent-late document stays an exception. Bridge acceptance records a send time; a retailer’s 997 is separate. Paste a retailer 997 into **Receive retailer 997 response** to match its source controls and retain acceptance or rejection.

## Delivery and recovery

On RER Managed, EDI delivery is not available yet. Preparing documents works; a provider action shows that line without making a network call. There is no provider simulator in the application.

Self-hosted installations configure `EDI_BRIDGE_URL` and `EDI_BRIDGE_TOKEN` in private runtime settings. Both are optional secrets in `deploy.json`; they are excluded from business state and exports. Use HTTPS and a URL without credentials, query or fragment. A localhost HTTP bridge is permitted only in local development. The configured URL receives:

```json
{
  "documentId": "durable-document-id",
  "kind": "856",
  "control": "000000003",
  "partner": { "id": "retailer-id", "name": "Retailer", "senderId": "OUR-ID", "receiverId": "RETAILER-ID", "transport": "pending" },
  "x12": "ISA*..."
}
```

The POST uses `Authorization: Bearer <install secret>`, `Content-Type: application/json` and `Idempotency-Key: <documentId>`. The bridge must deduplicate that identity and return `{"documentId":"durable-document-id","status":"accepted","providerId":"bridge-receipt"}` only after durable acceptance. The bridge then owns onward AS2/SFTP/VAN delivery and custody; the owner is responsible for its costs and destination authorization. Order, party, price and carton contents leave the installation for that operator and retailer.

Pier records intent before sending. A timeout or mismatched response leaves delivery uncertain and prevents another send. The owner checks the bridge and uses **Reconcile bridge receipt** to record its accepted identity/time or verified absence with evidence. Only verified absence permits another send. A transport receipt never supplies retailer functional acceptance. Business documents require owner send authority; operators may receive POs and return their syntax acknowledgments.

The single public-flow test is `tests/api/edi.test.mjs`. All network-edge fixtures are authored synthetic examples. See [X12 and SSCC profile](edi-x12.md) for supported segments, standards references and remaining certification and physical-device boundaries.
