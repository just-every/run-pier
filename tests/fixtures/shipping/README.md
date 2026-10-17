# EasyPost network fixtures

These are synthetic recordings of the documented EasyPost v2 response shapes,
with synthetic IDs, addresses, prices and test tracking. No EasyPost account was
available; these are **not recordings of purchased carrier postage**. The edge
in `tests/api/shipping-edge.mjs` matches request paths and parcel/address bodies;
all stock, packing, shipping, email state and webhook effects use the real Worker
and D1 through authenticated HTTP. Only external network calls are replaced in
the core test. The clearly marked PDF is 4×6 inches and the ZPL is a synthetic
4×6 label. Neither is valid postage.

Sources (17 October 2026):
- https://docs.easypost.com/docs/addresses
- https://docs.easypost.com/docs/shipments
- https://docs.easypost.com/docs/shipments/rates
- https://docs.easypost.com/docs/trackers
- https://docs.easypost.com/docs/webhooks
- https://support.easypost.com/hc/en-us/articles/39826034964237-Webhook-HMAC-Validation
- https://support.easypost.com/hc/en-us/articles/360044915671-Shipping-Label-Sizes

Live carrier enablement, negotiated rates, account fees, actual label dimensions,
physical printers and real carrier events require an owner EasyPost account.
