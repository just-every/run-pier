# Working on Pier

Read [CONTRACT.md](CONTRACT.md), [ACCEPTANCE.md](ACCEPTANCE.md), [OPERATIONS.md](OPERATIONS.md) and [IMPORT.md](IMPORT.md) before changing product behavior. Keep the twelve first-release journeys aligned with CONTRACT.md. Requirements are not proof: mark a status **LOCAL PROVEN** only after its named evidence exists, and keep hosted, provider, legal and physical-stock boundaries separate.

Use the exact published `@runeditrun/rer` 0.2.79 package pinned by this checkout. Base source selections are pinned independently in `edition.json` and `sources.lock.json`; the verbatim Base copies in `base-copies.json` are at tag `rer-v0.2.79` (`4280971d7c0295b8a88c3e1179048efcbbe14f30`). Public commands use bare verbs such as `rer install`, `rer setup`, `rer dev`, `rer build`, `rer verify`, `rer check`, `rer describe`, `rer export`, `rer import`, `rer reset --yes` and `rer deploy`. Do not add a local CLI copy or restore removed command paths.

Pier owns stock definitions, append-only movements, hard reservations, purchase and fulfilment documents, counts, migration review and its complete interface. Keep those responsibilities in their domain modules. Start local business state empty; never add seeded stock, fake providers, fallback balances or mock application behavior. The one exception is the demo ([DEMO.md](DEMO.md)): `src/demo.ts` fills a throwaway `RER_DEMO=1` runtime through Pier's own commands, and `rer deploy` refuses `RER_DEMO`.

The native CSV kit has six established kinds and an optional seventh `reservations` kind. Alongside `orders.csv`, the optional file preserves exact open-order allocations by bin, including an explicit zero row for a fully backordered line; an allocation-bearing batch includes every line of each affected order. Without that file, the six-kind import keeps its existing hard-reservation behavior. This is a native shape, not a provider adapter.

Every write must check the current native session actor and edition role inside atomic SQL admission. Keep exact decimal quantities, durable command identities and append-only movement history. A failed admission must leave no stock, reservation, document or successful command-result write. Once referenced by movements, counts, supplier terms, sales orders or purchase orders, an item's base unit and pack conversion are immutable; create a new SKU to change them. Once movements or counts reference a location, its bin/transit kind is immutable. Agents prepare evidence-backed proposals; current human authority approves exact versions. Agents do not approve themselves or post stock. Supplier and customer messages require exact human approval or the bounded human policies described in docs/replenishment.md.

Exercise meaningful stock journeys through authenticated HTTP in the real Worker with D1. For focused API changes, use `pnpm run test:api`; run `rer verify` for the declared verification wall when authorized and feasible. API success alone does not establish the complete UI, hosted, provider or physical acceptance. Record UI inspection separately and retain every outstanding boundary in ACCEPTANCE.md.

Protect dirty work and source evidence. Keep private credentials and token-bearing URLs out of output and public-ready documents. Do not place private evidence logs or personal email addresses in this checkout. Stop every server or watcher you start. Do not deploy or send supplier messages without explicit authority.

The installed root is Base's Lobby at `/`. The public run site (`rer build --site`: `src/site/`, `docs/site.json`) carries the homepage, `/run` and the docs rendered from the repository's Markdown. Keep all journeys usable on desktop and mobile. Product and operations commands in user-facing docs use the shared `rer` verbs.

## Lander-Regenerate

CONTRACT.md is the only acceptance text and status source; ACCEPTANCE.md, docs/CLAIMS.md and the Status counts are generated from it. After a rebase or any contract change, regenerate the contract documents, then the edition source lock last:

Lander-Regenerate: node src/base/contract-docs.mjs write
Lander-Regenerate: node scripts/edition-authoring/cli.mjs lock
