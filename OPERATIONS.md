# Pier operations

Pier is a package-mode seed. `package.json` pins the published `@runeditrun/rer` 0.2.79 package; the app adapter in `scripts/installer/local.mjs` selects the shared installer, local development and preview targets, verification command, owner deployment target and local portability adapter. The operation names and required deployment inputs are declared in `OPERATIONS.json`. Recorded verbatim Base copies use `4280971d7c0295b8a88c3e1179048efcbbe14f30` (tag `rer-v0.2.79`); adapted components retain their independent comparison origins in `edition.json`. There is no checkout-local copy of the RER CLI.

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

## Hosted delivery

`packaging.json` declares Pier’s existing build and recovery commands, its D1 migrations and optional provider effects. After the real build, run `pnpm delivery:spec` to write the import specification and `pnpm check:deployment-spec` to verify freshness. `node scripts/delivery/base/cli.mjs package --config packaging.json --output rer-package` produces the hosted descriptor, dispatch-only Managed workflow and artifact. Generated package and artifact folders are private build output.

Managed mail uses the provisioned RER relay. Assisted hosting can select RER, Resend, SendGrid or Cloudflare and must supply that provider’s sender, credential and, where required, account or relay address. Local development continues to suppress authentication mail. Provider configuration does not authorize a stock change or a business send; existing human approvals still apply.

## Native two-factor authentication

Open Activity → Operator roles → Security settings, or `/security`. Start enrollment, enter the private setup key in a TOTP authenticator and verify its six-digit code. An enrolled and verified native owner can require two-factor authentication. Existing and new sessions then need their own factor proof before private records, documents, exports or commands are available. A used code cannot verify another session; wait for the next code. Five attempts per operator in five minutes limit guessing.

Security lists current sessions and offers explicit session revocation, all-device revocation, local deprovisioning and reason-bearing owner recovery. Recovery clears the old factor and revokes prior sessions and links; the person signs in afresh and enrolls again. Recovering a lost owner factor requires another assured native owner. This release has no unaudited emergency bypass.

An installation archive retains the requirement and security audit but excludes factor secrets, attempt counters and session assurance. A restored operator cannot open private records merely by signing in. A fresh native owner explicitly authorizes restored-factor recovery on Security, then enrolls and verifies a new factor. That owner can subsequently recover staff. `INSTALLATION_KEY` encrypts factor material on the running installation; preserve it across ordinary restarts. SSO and separately scoped service credentials remain ADMIN-002 gaps.

An assured native owner can issue an expiring security grant on Security for one named human administrator and one named non-owner target. The administrator must verify their own factor, then can reset the target factor, revoke target sessions or deactivate the target. The grant confers no business permissions and cannot recover owners, administer the delegate, manage grants or change authentication policy. Owners can revoke grants immediately. Restored grants remain revoked. Prepare another assured native owner before requiring factors: losing every assured owner leaves no live recovery path.

## Overdue operational cases

The owner opens Activity → Overdue operational cases. Under Case settings, choose current owners for assignment and escalation, set the response interval and enable the minute check. Checks create one retained case per overdue unconfirmed purchase order or late customer order. Assignment, due date, next action and unanswered escalation remain visible after restart; repeat checks create no duplicate cases or sends.

Receiving only part of a purchase, confirming a supplier date or receiving a provider acknowledgment cannot close these cases. Complete actual receipt or shipment, settled obligations and current Pantry inventory reconciliation are required. A reversed payment, returned shipment, changed stock history or lost ledger authority reopens affected work. Owners may explicitly cancel a case with a retained reason; this does not cancel its source order. Existing exact message approvals, destination and content limits, quiet hours and current sender authority continue to govern notifications separately. Case settings confer no approval or sending authority.
