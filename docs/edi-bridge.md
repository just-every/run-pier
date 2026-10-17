# EDI bridge integration for developers

This is the server integration contract for a self-hosted Pier installation's EDI network operator. For retailer setup and day-to-day work, see [Retail EDI](edi.md). Pier does not include a direct SPS Commerce or Orderful connection. Implementing this bridge still requires an authorized network account, the retailer's implementation guides and certification; a successful HTTP receipt is not retailer acceptance.

## Configure the bridge

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

## Delivery custody and recovery

Pier records intent before sending. A timeout or mismatched response leaves delivery uncertain and prevents another send. The owner checks the bridge and uses **Reconcile bridge receipt** to record its accepted identity/time or verified absence with evidence. Only verified absence permits another send. A transport receipt never supplies retailer functional acceptance. Business documents require owner send authority; operators may receive POs and return their syntax acknowledgments.

There is no automatic inbound bridge endpoint today. Obtain the original 850 or 997 through the authorized retailer/network account and submit it through Pier's receive forms. Do not treat outbound transport configuration as an inbound order feed.

Bridge credentials are install secrets, not business records. Never expose them in browser code, logs, exported business data or token-bearing URLs. The bridge must preserve document custody and deduplicate its durable document identity across ambiguous requests and retries.

See [X12 and SSCC profile](edi-x12.md) for the bounded supported documents. `tests/api/edi.test.mjs` exercises one HTTP bridge with synthetic network fixtures; it does not establish actual SPS/Orderful, AS2/SFTP/VAN, retailer certification or physical-printer acceptance.
