# Bounded search and background movement exports

The owner can prepare a complete movement export without loading Pier’s complete
business state into one request. This is an authenticated API door; the ordinary
business JSON export and existing report screens keep their current behavior.

Send same-origin JSON `POST /api/pier/movement-exports` with a unique
`{"commandId":"synthetic-pier-export-1"}`. The response is HTTP 202 and a manifest:
`id`, `status`, `total`, `processed`, `pages`, `frontier`, `sourceVersion`,
`createdAt`, `format`, `quantityUnit` and a progress message. Retry the same
identity after response loss to recover the same job. Each new export needs a
new identity. An empty export completes with zero movements and zero pages.

Read `GET /api/pier/movement-exports/ID` for durable progress. Request completion
work starts in the Worker’s background context; the existing once-per-minute
schedule resumes pending jobs after a restart. Each invocation prepares at most
1,000 movements in ten pages, and each scheduled pass takes at most five jobs.
Concurrent retries compare the saved cursor before advancing. There is no
maximum total movement count in this door; more rows require more passes.

When `status` is `complete`, download every zero-based numbered page using
`GET /api/pier/movement-exports/ID/pages/PAGE`. Concatenate all pages in order
into one JSONL file. The manifest names the exact page and movement counts;
the last page can contain fewer than 100 rows. Incomplete exports return HTTP
409 for downloads. A page outside the manifest returns HTTP 404. Each page
contains at most 100 movements with original IDs, sequence, item and location,
stock status, exact signed quantity, actor, command, document, reversal, import,
reason and creation time. Quantity is an integer string in **millionths of the
base unit**, matching the business JSON export, including fractional and negative
movements. Responses disable caching. No row is silently truncated.

Current owner authority is required at request, preparation, progress and every
download. Preparation remains tied to the requesting session and its native and
Pier authority revisions. Revocation or session expiry stops the job; signing
in again does not revive that authorization. A changed business revision also
makes the job visibly `stale`, returning HTTP 409 rather than a mixed snapshot.
Start a fresh job after writes settle. This conservative implementation therefore
requires a quiet business revision for the duration of preparation and download.
A full immutable export that can finish while ordinary writes continue remains
SCALE-001 work.

Jobs retain only counts and sequence ranges, without duplicate movement bodies
or personal-content copies. Their transient manifests are excluded from complete
installation archives; restored original movements can be exported under fresh
owner authority. These files are movement exports, not complete installation
backups, accounting reconciliation or subject-erasure evidence.

## Current proof and remaining capacity work

`tests/api/native-exit.test.mjs` — “background movement exports retain exact
pages, durable progress and current owner authority” imports 1,205 opening movements
through reviewed native commands and posts a fractional transfer, yielding 1,207 movements, checks intermediate 1,000-row progress,
restarts the Worker, advances concurrent retries and compares all 13 downloaded
pages with the complete source export. It also checks empty exports, incomplete
and missing pages, denied access, source invalidation, recovery and revocation.

Run the committed bounded journey separately with:

```sh
node scripts/journeys/movement-export.mjs
```

Its output names the exact commit and explicitly disclaims PIER-SCALE-1 and
reference-deployment acceptance. It is a correctness fixture with seven items,
1,205 bins and one transit location across three warehouses, with 1,205 opening
movements and two signed transfer movements. It is **not** the
contract’s 600-bin, 10,000-SKU, twelve-month fixture. No p95 timing or measured
capacity envelope is claimed. The full fixture, search, filtered reports and
drill-through, a 50-order pick list, scan timing, desktop and mobile controls,
Workers Paid and North American D1 reference measurements, US wired-client
receipt and matching OPS-001 and REPORT-001 capacity disclosure remain open.

## Paged catalogue and customer search

The authenticated owner can read `GET /api/pier/search?kind=items&q=QUERY`
or choose `kind=customers`. This query reads catalogue or customer records
directly from D1, without loading historical movements or unrelated business
records. `limit` is 1 to 100, default 50. The result includes `rows`, exact
`total`, `sourceVersion`, `hasMore`, `nextCursor` and an explicit continuation
notice. Pass the returned cursor with the unchanged query to read the next
page. Rows use stable ID order; duplicate matching aliases retain every item.
Archived items remain searchable. A changed business revision invalidates the
cursor with HTTP 409, requiring a fresh search rather than mixing revisions.

Item matching covers SKU, name, unit barcode, case barcode, additional barcode
and customer or supplier reference codes. Customer matching covers customer
names and excludes suppliers. Search is a literal substring, case insensitive
for ASCII characters; percent and underscore are literal characters. This search
does not apply the warehouse scanner’s GTIN normalization or Unicode case
folding. Every page requires current owner authority and disables caching.

`tests/api/catalogue.test.mjs` — “paged catalogue and customer search returns
every literal match with consistent continuation” proves each supported search
field, shared aliases, archived matches, exact pagination, literal percent,
customer isolation, empty results, changed and invalid cursors, denied access
and invalid input. This is functional proof, not a p95 measurement or a claim
that existing screens use this new API. The full named fixture and desktop and
mobile reference-deployment search timings remain SCALE-001 work.
