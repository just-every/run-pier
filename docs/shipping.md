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
   PDF to print in the browser, or download the printer file (ZPL) if your label printer uses it. Pier requests
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

In EasyPost, open **Account → Webhooks**, add your Pier address followed by `/api/pier/shipping/webhook`, and copy the same signing secret into Pier Shipping setup. Enable tracker-created and tracker-updated notifications. Pier verifies them and asks EasyPost for the latest tracking status before changing the shipment.

On **RER Managed**, provider calls say: “Shipping provider calls are not available
yet on RER Managed.” Setup and native records remain usable. Managed has no seed
integration egress relay yet; self-hosted installs use their own EasyPost and mail
connections.

## Current limits

EasyPost live labels, carrier charges and physical printers still need acceptance with your own account and equipment. ShipStation and label void and refund remain unavailable. Native manual LTL records are described below; connected freight platforms and physical freight acceptance remain unqualified. [Shipping developer notes](shipping-developer.md) list transport and test details.

The owner can pause EasyPost from Channels → Integration health → EasyPost
shipping → Pause shipping. Pier clears its saved carrier credentials and stops
future carrier requests and webhook processing; retained jobs and uncertain
purchases remain visible. Reconnect with fresh credentials before reconciling an
existing purchase. Pausing does not void a carrier label or repeat a purchase.


## Manual LTL freight

The current owner opens Floor → Shipping → Manual LTL freight. This native path
works without carrier credentials, including when Managed carrier egress is
unavailable. It retains operator evidence; it makes no booking request, sends no
customer notification and supplies no carrier acknowledgment or physical-stock
verification.

1. Close and measure the order's cartons at Pack. Choose that packed order and
   assign every carton to exactly one pallet. Enter each pallet's measured gross
   weight in pounds, dimensions in inches, NMFC number and freight class. Select
   liftgate or the other required accessorials and retain the manifest reference,
   origin, destination and commodity. Gross pallet weight includes its cartons.
2. Retain the carrier's manually obtained quote, SCAC, quote reference, USD amount,
   charge terms and evidence. Third-party freight terms also require the payer's
   name and billing address; the retained BOL uses that exact quote detail. Review
   the exact quote and enter the operator's PRO
   number and planned pickup date with a reason. These steps leave stock,
   reservations, packs and shipment facts unchanged.
3. Generate the VICS bill of lading before pickup. Download its retained PDF to
   review the order, pallet and carton particulars, quote, source record version
   and template version. Reopening a retained PDF returns the same bytes.
   Generating again uses the current document template and retains another PDF.
4. After observing pickup, explicitly confirm it and record the evidence. Pier
   dispatches the packed quantities through its ordinary pack and dispatch
   commands, consumes only the order's own reservations and links the one
   shipment to the manifest, reviewed BOL and operator pickup record. Recover a
   lost response with the same command identity; it cannot dispatch again. The
   retained quote, payer and entered evidence remain visible after dispatch.

A manifest revision retains earlier evidence and invalidates its pending quote,
pickup review and BOL eligibility. Re-enter and review the quote and generate a
current BOL. A changed quote or PRO review also requires a current BOL before
pickup. Ordinary dispatch cannot bypass this review. Revoked owner authority
cannot approve, recover protected results or download the retained documents.
Manual freight evidence remains subject to explicit custody review; unsupported
erasure refuses instead of leaving an undisclosed private copy.

This path retains one closed pack on each manifest and excludes packs already
prepared for parcel shipping. Freightview and Freightquote connections, actual
booking, carrier pickup and tracking qualification, customer notifications,
pallet SSCC labels and retailer artwork, physical printing and scanning,
retailer-certified EDI structure, above-quote invoice review through BUY-004,
freight-cost allocation and connected accounting remain outside this native
proof. The commercial authority boundary remains owner-only under RL-101.
