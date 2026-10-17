# Shipping packed orders

Open **Floor → Shipping** (`/app#floor/shipping`). Setup works on an empty install.
The owner saves the ship-from address and an EasyPost **Test API key** (`EZTK…`).
No EasyPost account or carrier credentials are included with Pier. Activate UPS
and FedEx carrier accounts in EasyPost to receive those services. When ready for
paid postage, switch to production and paste the **Production API key** (`EZAK…`).
Keys and the optional webhook secret are encrypted server-side with the install
session secret, excluded from business exports/archives and never sent back to the
browser. Reconnect after restoring an install whose credentials were excluded.
Saving a key does not establish that EasyPost accepted it; the first provider
request checks it. ShipStation is not implemented.

1. Pick and pack an order in Floor. Scan each carton, weigh it in pounds and
   measure its length, width and height in inches. Mark it packed.
2. In Shipping, select the pack and prepare a destination and customer tracking
   email for each carton. Pier verifies delivery through EasyPost before rating.
   An undeliverable address blocks rates and purchase. The original and suggested
   street, ZIP+4 and residential/commercial flag appear together. A warehouse
   operator or owner explicitly accepts the suggestion or keeps the original;
   the decision and both addresses stay on the order/shipping record.
3. Compare returned UPS, FedEx and USPS services. Pier marks the cheapest USD
   rate and fastest known delivery estimate. A carrier that returns no rate is
   not invented. Each request uses that carton's actual measurements (pounds
   converted to EasyPost ounces), the saved origin and approved destination.
4. Select a rate and buy its label. Test labels are clearly marked and are not
   postage. Production purchase charges the connected EasyPost account. Open the
   PDF to print in the browser, or download ZPL for the label printer. Pier requests
   4×6; only formats the carrier returns or converts are offered. UPS may require
   account enablement for 4×6 formats; universal UPS PDF and physical printers
   remain unaccepted. A download failure stays visible and does not buy again.
5. The tracking number stays on the carton and is submitted once through the
   explicitly configured installation mail provider to the exact approved
   customer address. `sent` means provider acceptance, not delivery. Explicit
   refusals may be retried; unconfirmed mail is never automatically repeated.
   Without mail setup the record says so. No local mail inbox is created.
6. Confirm physical dispatch at Pack. Label purchase alone consumes no stock.
   When using carrier shipping, every carton needs a confirmed label. Dispatch
   consumes the order's own reservations and attaches its carton tracking numbers
   to the native shipment. Existing manual-reference dispatch remains available
   for packs without carrier shipping records.
7. Check tracking or configure the EasyPost webhook below. Canonical carrier
   events update the order and shipment. Delivery of every carton closes the
   shipment; an old or duplicate notification cannot reopen a delivered carton.

A purchase intent is committed before sending the paid request. If its response
is lost, **Reconcile label purchase** reads the same EasyPost shipment. Pier never
repeats an uncertain purchase automatically. If EasyPost cannot confirm it, check
that shipment in EasyPost before further action; no fallback label is generated.

## Automatic tracking

Register `https://YOUR-INSTALL/api/pier/shipping/webhook` in EasyPost with the
same signing secret saved in Shipping setup. The endpoint accepts signed
`tracker.created` and `tracker.updated` notifications, validates EasyPost HMAC
(including the timestamp/path-bound v2 form) and reads the canonical Tracker
using the encrypted key. Event IDs and tracking-detail identities are deduplicated.
The currently active owner who configured the connection must retain authority.

On **RER Managed**, provider calls say: “Shipping provider calls are not available
yet on RER Managed.” Setup and native records remain usable. Managed has no seed
integration egress relay yet; self-hosted installs use their own EasyPost and mail
connections.

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
