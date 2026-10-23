# Pier operations

Pier is a package-mode seed. `package.json` pins the published `@runeditrun/rer` 0.2.53 package; the app adapter in `scripts/installer/local.mjs` selects the shared installer, local development and preview targets, verification command, owner deployment target and local portability adapter. The operation names and required deployment inputs are declared in `OPERATIONS.json`. The source graph records Base `1ce15dd8cbb7c8cf2d83ebfde2b4a8a130ff9d74` (tag `rer-v0.2.22`) separately from the CLI package version. There is no checkout-local copy of the RER CLI.

## Local start

Start from nothing with one line (without Node: `curl -fsSL https://runeditrun.com/install.sh | sh -s -- dev just-every/run-pier`), then use the bare project verbs inside the checkout:

```sh
npx -y @runeditrun/rer dev just-every/run-pier
```

Inside the checkout, `rer install` installs the pinned dependency set. `rer setup` prepares the local application and declared D1 migrations. `rer dev` serves the actual local Worker and persistent D1 with Base's native development identity; open its local URL on this computer and finish the owner claim at `/setup`. The shared Base Lobby owns `/`, and Pier opens at `/app`. Keep the printed local open URL private. Stop the server with `rer dev --stop`.

Node 22.20.0 and pnpm 10.12.4 are pinned. Local setup does not require Cloudflare credentials, an external identity issuer, an email provider, an embedded model or a supplier account. No business fixture is created for the operator. Local sign-in is one click: open the private `RER_OPEN` link `rer dev` prints. Authentication mail is suppressed on this computer. Business mail requires an explicitly configured production provider; without it, the record says “Email is not available yet.”

## Commands and their boundaries

- `rer build` produces the production Worker and assets with local development identity excluded.
- `rer verify` invokes the adapter's declared local verification hook. That hook runs typecheck, the production build, the focused Worker/D1 API suite, email-link checks and `tests/portable.mjs` fresh-install archive restore. It is a local verification command; its result must be reported from an actual run.
- `rer check` inspects this checkout's declared operation contract and source selections. `rer describe` reports supported commands, flags and effects. Use both before relying on a command's state effects.
- `rer export --output exports/pier.rer` and `rer import --input exports/pier.rer --yes` handle the complete installation archive. This archive is distinct from Pier's native CSV import workflow documented in [IMPORT.md](IMPORT.md).
- Native CSV import accepts the six established kinds and optional `reservations.csv`. Include that file to retain exact reviewed open-order allocations by bin and explicit zero backorders; omit it to use the six-kind import's normal hard-reservation allocation.
- `rer reset --yes` removes the declared local installation state and is destructive. Export first if the data matters.
- `rer deploy` targets the owner's configured Cloudflare account using the declared `deploy.json` and the `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` inputs. Own-account hosting, real sign-in mail and partial PO receipt entry were exercised on a disposable Cloudflare install on 18 October 2026 at 1440px and 390px. Fresh-machine and provider-specific acceptance remain separate.

All public commands use bare `rer` verbs. `rer export`/`rer import` are the installation portability commands; native stock migration is reviewed inside Pier using the CSV contract. Replenishment and approved business mail are described in [Replenishment](docs/replenishment.md). Accounting, payments, carriers and embedded models remain separate integrations.

## Backup and restore

Stop local serving before backup, reset or restore so no command can write during transfer. The installation archive is intended to preserve business records and their stock, reservation, approval, command and import-custody evidence. Durable operator, role and approval identities remain audit evidence, never access grants. Native credentials, sessions, tokens and private settings are excluded; establish a fresh native session for the retained owner before operating. The fresh-install restore and new-transaction journey is locally proven by `tests/portable.mjs`, as recorded in [ACCEPTANCE.md](ACCEPTANCE.md).

Restored external connections, workflow/replenishment/recurring policies, delivery verification and embedded send policies are paused. Prior authority is retained as historical evidence; non-owner role assignments restore as viewer evidence. Credentials and native sessions are excluded, payment/Stall access is revoked, and provider checkout/verification URLs are removed from records and recovered command replies. Review the retained records and explicitly reconnect with fresh owner authority before resuming external work. Pending sends never resume because a backup was restored.

After attachment erasure, keep a fresh post-erasure archive as the later journal. Pass its checkout-relative path with `rer import --input OLD_ARCHIVE --journal LATER_ARCHIVE --yes`: an older archive crossing the redaction checkpoint is refused. Restore the current post-erasure archive instead. This fences local restores; already copied offline backups and already delivered/provider-held messages remain outside Pier's local deletion.

For a same-checkout local restore:

```sh
rer dev --stop
rer export --output exports/pier.rer
rer reset --yes
rer import --input exports/pier.rer --yes
rer setup
rer dev
```

An archive restores with the Pier release that made it: record the commit (`git rev-parse HEAD`) beside each archive and restore into a checkout of that commit. For another empty checkout of that release, run `rer install`, restore with `rer import --input exports/pier.rer --yes`, then run `rer setup` and `rer dev`. Sign in with a fresh native session for the retained owner identity. Review balances, reservations, remaining order and PO quantities, audit links and retained source files before resuming use. A business export or CSV preview alone is not proof of a complete installation restore.

## Stock authority and incident handling

The edition roles are `owner`, `buyer`, `operator`, `warehouse`, `viewer` and `agent`. Native sessions establish the actor; the current edition role controls stock and document commands. After signing in with an existing native session, an owner opens Pier at `/app` → Activity → Invite an operator, then assigns a Pier role with Pier's existing operator-role form. A new invitation starts as `viewer`; invitation status is visible in the interface. Base's accepted response confirms the invitation request, not delivery. Locally the invitation mail is suppressed silently; no live email provider is configured. Buyers approve exact purchase commitments; operators approve reservation reallocation; warehouse staff perform and approve physical count/receipt/dispatch work; viewers read; agents prepare proposals. The owner decides source reconciliation. Changing a role or revoking native access must affect the next write.

Trace a position through its append-only movements, source document, actor, reason, command identity and any correction/import link. Retry a response-loss case with the same command identity and same payload. Do not repair a balance by editing a generic record or database row. Receipt reversal, count correction, return restocking and import undo must review downstream dependencies and use linked compensating operations. Already dispatched goods require a real return; restoring a snapshot cannot make them physically available.

The complete operational flows, local proof and remaining boundaries are recorded in [CONTRACT.md](CONTRACT.md) and [ACCEPTANCE.md](ACCEPTANCE.md). This documentation does not claim acceptance of hosted operation, provider integrations, owner export completeness or physical warehouse accuracy.
