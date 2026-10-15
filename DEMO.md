# Pier demo

After the ordinary `rer setup`, run `rer demo` (`rer dev --demo`) and open its
private `RER_OPEN` link. It opens signed in as the saved owner, on a finished
first run, in five weeks of a Brisbane café supply wholesaler: twelve items in
six bins across two warehouses, four suppliers with their terms, five customers,
six sales orders (shipped, reserved and one short of oat milk), four purchase
orders (received, part received, expected and a draft), transfers (one still in
the van), counts, returns in quarantine and restocked, the opening stock import,
a replenishment proposal waiting for review, and the owner's team: Jordan takes
sales orders, Sam runs the floor and Priya buys, each with their Pier role, and
one invitation is still pending. `rer demo --stop`, Ctrl-C or
the demo's end (one hour) deletes its folder `.rer/demo/<start>/`; a new demo
starts afresh. The checkout's own `.wrangler/state` is never touched.

`src/demo.ts` (`seedDemo`) builds that workspace through Pier's own commands
(`execute` in `src/pier/api.ts`), the same admission the public command
endpoint uses, as the owner and dated back from the moment the demo starts. The
opening stock arrives as a reviewed native CSV import. Base's `modules/demo`
runs it once after the owner exists, and only with `RER_DEMO=1`, which
`rer deploy` refuses to carry; a normal installation still starts empty.

The app reads **Pier Demo** in its nav and title (Base adds the suffix to the
`data-rer-name` label); there is no bar and no outbox. Under `rer dev` it reads
**Pier Dev**.

## Real reads, mocked sends

| Effect | In a demo |
|---|---|
| Operator mail (sign-in links, invitations; Resend, SendGrid or Cloudflare in production) | Suppressed silently: the invitation is recorded and the owner sees it accepted, but nothing is sent. Visitors are signed in by the signed owner claim, never by mail. |
| Identity providers and RER dependency linking (OIDC discovery and token calls, back-channel logout) | Only after an owner configures one. Public reads (GET discovery, keys) run for real; writes to a provider return its success without contacting it (Base's guard, `withDemo` first in `src/server.ts`). |
| Anything else | Pier has no webhooks, payments, AI, supplier messages or public publishing, and no feature that reads the public internet. |

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

Every Base copy (`src/base` foundation, `src/modules/demo`, `operator-auth`,
`mail`, `owner-claim`, `dependencies`, `ai`, `d1-transport`, `import-kit` and
`scripts/edition-authoring`) is Base at tag `rer-v0.2.22`
(`1ce15dd8cbb7c8cf2d83ebfde2b4a8a130ff9d74`), refreshed together so owner-claim
and operator-auth always agree (`edition.json`, `sources.lock.json`).
`src/base/font-head.ts` is Pier's own (system fonts, no font files).
