# Pier demo

After the ordinary `rer setup`, run `rer demo` (`rer dev --demo`) and open its
private `RER_OPEN` link. It opens signed in as the saved owner, on a finished
first run, in five weeks of a US hardware and housewares distributor shipping
from Reno DC and Newark DC: twelve items in seventeen bins and a truck between
the warehouses, moved in from inFlow five weeks ago with USD opening costs (so
every report values the whole stock), four suppliers with their terms and
reorder points at both warehouses, sixteen customers, two of them retailers
that send X12 850 purchase orders over EDI, a queue of open sales orders priced
in USD (most reserved in full, three backordered: Hartwell Hardware's order 28
Blue Mug 12oz short at Reno DC after Harbor Ceramics' delivery arrived 20 short,
Trinity Contractors' drill drivers at Newark DC with no inbound order, and Valley
Supply's screws, which arrive before their promise), shipped orders including
two today, purchase orders (received, part received, expected and a draft), a
UPS Ground pick wave half scanned, a transfer, a count, returns in quarantine
and restocked, a replenishment proposal the agent prepared waiting for review,
and the owner's team (an owner still named "Owner" by the claim becomes Maya
Collins, whose business, Collins Supply Co., is named with both warehouses'
ship-to addresses in Purchasing → Your business): Jordan takes sales orders, Sam runs the floor,
Priya buys and the Pier agent prepares proposals, each with their Pier role, and
one invitation is still pending. `rer demo --stop`, Ctrl-C or
the demo's end (one hour) deletes its folder `.rer/demo/<start>/`; a new demo
starts afresh. The checkout's own `.wrangler/state` is never touched.

`src/demo.ts` (`seedDemo`) builds that workspace through Pier's own commands
(`execute` in `src/pier/api.ts`), the same admission the public command
endpoint uses, as the owner and dated back from the moment the demo starts;
earlier days' events fall in Reno working hours. The opening stock arrives as a
reviewed inFlow move-in (its export files with independent per-bin USD
controls), and the retailers' orders as X12 850 documents through `edi.receive`.
A first visit opens Sales orders on the warehouse with the most orders needing
attention, Reno DC, with Hartwell's order open. Store channels (Shopify,
Amazon, WooCommerce, Stall) need a live store to sync, so the demo connects
none; its orders are entered in Pier or arrive over EDI. Base's `modules/demo`
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
`.github/workflows/run-demo.yml` (Base's `export/run-demo.yml`, recorded in
`base-copies.json`) deploys it by manual dispatch from the `run-demo`
environment, and with `test_only` deploys the separate test host
`demo.test.run-pier.com` with Turnstile's test keys (`remove` with `test_only`
takes that host down). The environment holds the variable
`CLOUDFLARE_ACCOUNT_ID` and the secrets `CLOUDFLARE_API_TOKEN`,
`TURNSTILE_SECRET_KEY` and `RER_DEMO_MEASUREMENT_TOKEN`; test starts send the
measurement token as the `rer_demo_measure` cookie, and it is never committed.

Each visitor gets their own native Worker Loader isolate running Pier's
ordinary Worker bundle, with a SQLite facet standing in for Pier's D1 and the
static files served at the edge. Base's start page admits them through
Turnstile and signs them in as the demo owner through the signed owner claim at
`/auth/owner-claim`, which Pier serves with `createOwnerClaimHandler` whenever
`RER_OWNER_CLAIM_PUBLIC_KEYS` is set; `seedDemo` then fills the workspace. A
copy ends after 60 minutes or 15 idle minutes and its storage is erased. The
start and ended pages are Base's; see "Hosting the
demo" in Base's demo guide. `deploy.json` `platforms` still lists `container`: that is portable
container hosting for installations, not the demo.

## Base copy

Every Base copy (`src/base` foundation files, `src/modules/demo`,
`operator-auth`, `mail`, `owner-claim`, `dependencies`, `ai`, `d1-transport`,
`import-kit`, `scripts/edition-authoring`, the installer and template files and
`run-demo.yml`) is Base at tag `rer-v0.2.30`
(`d434ea67989fe10b6ddff01daba8bb350975e54a`), recorded in `base-copies.json`
and refreshed together with `refresh-base`, so owner-claim and operator-auth
always agree (`edition.json`, `sources.lock.json`). Three files carry Pier's
linear-time parsing fixes on top of Base's bytes and are kept out of the record
as adapted source: the mail module's `core/validation.mjs` and
`inbound/headers.mjs`, and the dependencies module's `logout.mjs`. `src/base/font-head.ts` is Pier's own
(system fonts, no font files).
