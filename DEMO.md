# Pier demo

After the ordinary `rer setup`, run `rer demo` (`rer dev --demo`) and open its
private `RER_OPEN` link. It opens signed in as the saved owner, on a finished
first run, in five weeks of a Brisbane café supply wholesaler: twelve items in
six bins across two warehouses, four suppliers with their terms, five customers,
six sales orders (shipped, reserved and one short of oat milk), four purchase
orders (received, part received, expected and a draft), transfers (one still in
the van), counts, returns in quarantine and restocked, the opening stock import,
and a replenishment proposal waiting for review. `rer demo --stop`, Ctrl-C or
the demo's end (one hour) deletes its folder `.rer/demo/<start>/`; a new demo
starts afresh. The checkout's own `.wrangler/state` is never touched.

`src/demo.ts` (`seedDemo`) builds that workspace through Pier's own commands
(`execute` in `src/pier/api.ts`), the same admission the public command
endpoint uses, as the owner and dated back from the moment the demo starts. The
opening stock arrives as a reviewed native CSV import. Base's `modules/demo`
runs it once after the owner exists, and only with `RER_DEMO=1`, which
`rer deploy` refuses to carry; a normal installation still starts empty.

## What a demo cannot send

| Effect | In a demo |
|---|---|
| Operator mail (sign-in links, invitations; Resend, SendGrid or Cloudflare in production) | Demo settings use the development mail provider and no key. Locally it lands in the development outbox and the Demo bar. On the hosted demo the outbox does not accept the https origin, so mail is unconfigured and nothing is sent; visitors are signed in by the signed owner claim instead. |
| Identity providers and RER dependency linking (OIDC discovery and token calls, back-channel logout) | Only after an owner configures one. Base's guard (`src/modules/demo`, `withDemo` first in `src/server.ts`) answers loopback only and lists the refusal in the Demo bar; the hosted container also has no internet. |
| Anything else (`fetch`, sockets, beacons) | Refused the same way. Pier has no webhooks, payments, AI, supplier messages or public publishing. |

## Hosted demo

`deploy-demo.json` puts the demo at `https://demo.run-pier.com/`;
`.github/workflows/run-demo.yml` deploys it by manual dispatch from the
`run-demo` environment, and with `test_only` deploys the separate test host
`demo.test.run-pier.com` with Turnstile's test keys (`remove_test` takes that
host down). Each visitor gets their own container running Pier's image
(`deploy.json` `platforms` includes `container`, workerd engine), signed in
through the signed owner claim at `/auth/owner-claim`, which Pier serves with
`createOwnerClaimHandler` whenever `RER_OWNER_CLAIM_PUBLIC_KEYS` is set. The
start and ended pages are Base's. See Base's `export/DEMO.md` for the host.

## Base copy

`src/modules/demo` is Base `modules/demo` at tag `rer-v0.2.19`
(`e17843562355e1b6e5068289c8e037951fbc8d3d`) with Base's
`modules/operator-auth/csp.mjs` beside it, because Pier's operator-auth copy
predates that file: `index.mjs` imports `./csp.mjs`, its only change
(`edition.json` maps both).
