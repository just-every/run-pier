# Pier trade-buyer API

This is Pier's scoped boundary for a future Stall private catalog. Stall owns
buyer sign-in, carts and checkout. Stall B2B-001 and the connected journey remain
incomplete; this API does not establish SALES-005 completion.

An authenticated current owner uses `trade.grant` through
`POST /api/pier/commands`. Supply `channelId`, the current channel `version`,
a stable `buyerId`, the approved `customerId`, distinct approved `itemIds` and
an owner-reviewed `shipTo` containing country, state and postal code as needed
by the channel's routing rule. The connection must be Stall. A buyer identity
cannot be reassigned to another customer.

Generate a separate cryptographically random credential of at least 32 bytes
for each buyer on the integrating server. Send only its SHA-256 `keyHash` in
the grant: hash the UTF-8 bytes of `pier-trade-buyer`, one zero byte, then the
credential text. Pier never accepts that hash as a bearer credential and never
stores the original credential. Keep the original credential on the integrating
server; do not expose it in a browser, URL or log. Rotate by granting a new hash.
`trade.revoke` takes `channelId`, current channel `version` and `buyerId`.
Pausing the connection or removing the approving owner's authority also refuses
access. Restore clears buyer credentials and consent and pauses the connection;
re-enabling a connection alone does not restore buyer access.

Send `Authorization: Bearer <credential>` to `GET /api/pier/trade/catalog`.
The response contains only that buyer's approved nonarchived items with current
customer price tiers, exact sellable availability after reservations, holds and
the channel buffer, customer payment terms and a limited credit-status summary.
Availability uses the approved destination and the same versioned routing source
as channel orders. Missing routing publishes zero availability. Price schedules
outside their effective dates are absent. Orders and shipment references belong
to that customer only and appear only when every order line is in the approved
item scope. Mixed orders are omitted entirely, including their totals, status
and tracking, rather than exposing unapproved items through aggregate values; supplier costs, other buyers, arbitrary custom fields,
source originals, native sessions and carrier label URLs are excluded. The
response is private and has `Cache-Control: no-store`.

The history currently covers native orders only. MIGRATE-002 imported history
is pending. Tracking numbers and status project only from matching retained
shipping jobs; real carrier acceptance is separate. This credential cannot
submit orders, change prices, dispatch goods or use native private doors.
Reorder submission and credit authorization still need the connected workflow.

`POST /api/pier/trade/cart-events` accepts JSON with `eventId`, `cartId` and
`event`: `abandoned`, `purchased` or `unsubscribed`. The credential supplies the
buyer scope; supplied customer identities, email addresses and cart bodies are
ignored. Reuse the event identity and identical content after response loss;
changed content with that identity refuses. Event intake creates no stock
reservation, order or message, and starts no connector sync.

Without a recorded owner-approved `followupConsent` on the grant, abandonment
returns `no-consent`. Consent names its explicit `recipient`, `purpose`, prior `at` timestamp and
`source`, with the approving owner retained. A missing recipient or purpose
refuses the grant. This records consent for review and grants no send authority. With consent it returns `pending-owner-review`; no reminder is sent.
Purchase permanently suppresses that cart. Unsubscribe permanently suppresses
all this buyer's carts, including later abandonment and delayed event replay.
Re-granting cannot reset unsubscribe suppression. Responses report the current
cart suppression state, including on replay. At most 1,000 carts per buyer are
retained; exceeding that bound refuses rather than deleting prior evidence.
Automatic reminders, recipient authorization and delivery remain unimplemented.

CT approved this authority and consent boundary with riders on 27 October 2026.
The authorized reminder workflow remains a required product target. Retained
cart identities and consent remain under owner custody; there is no automatic
deletion or claim of complete subject erasure. DATA-002 governs future erasure;
SEC-002 governs future external disclosure; SALES-007 governs trade order routing.
There are no new screens in this API slice. Owner controls and the Stall journey
at 1440px and 390px remain required before SALES-005 can be complete.
