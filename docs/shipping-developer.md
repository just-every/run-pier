# Shipping developer notes

Register `https://YOUR-INSTALL/api/pier/shipping/webhook` in EasyPost with the
same signing secret saved in Shipping setup. The endpoint accepts signed
`tracker.created` and `tracker.updated` notifications, validates EasyPost HMAC
(including the timestamp/path-bound v2 form) and reads the canonical Tracker
using the encrypted key. Event IDs and tracking-detail identities are deduplicated.
The currently active owner who configured the connection must retain authority.

## What is proven

`tests/api/shipping.test.mjs` is one real Worker/D1 core flow through authenticated
HTTP: packed order → address rejection and both correction choices → UPS/FedEx/USPS
rates → lost purchase response recovered without a second buy → PDF/ZPL downloads
→ one tracking email → dispatch → signed delivered event closes the shipment.
Only the external network edge uses fixtures; their provenance and synthetic
4×6 files are documented in `tests/fixtures/shipping/README.md`. The local browser journey was exercised at desktop and phone widths; its real
tracking email was received by the fleet QA inbox with passing SPF, DKIM and
DMARC. Standalone setup was also exercised on an empty temporary hosted install
at both widths, including real email sign-in and encrypted settings. The temporary
Worker and D1 were removed; exact-resource readbacks confirmed both absent.
No EasyPost account
was available for this round. Real carrier rates, fees, live labels/webhooks,
physical printers, label void/refund, freight/LTL, channel fulfilment publication
and accounting freight reconciliation remain outside the proven subset.

API references: [EasyPost addresses](https://docs.easypost.com/docs/addresses),
[shipments](https://docs.easypost.com/docs/shipments),
[trackers](https://docs.easypost.com/docs/trackers), and
[label sizes](https://support.easypost.com/hc/en-us/articles/360044915671-Shipping-Label-Sizes).
