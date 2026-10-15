# Run Pier locally

Install the shared CLI using `npx -y @runeditrun/rer@0.2.22 cli install`, or `curl -fsSL https://runeditrun.com/install.sh | sh`. Pier uses the exact published package, with no checkout-local CLI copy.

Run `rer install`, `rer setup --owner-email you@example.com`, then `rer dev`. Complete native owner setup at `/setup`; `/app` is the inventory workspace and `/` is the Base Lobby. Open the printed private sign-in URL on this computer. To sign in again later, run `rer dev` again and open its fresh link: it signs you in with one click. Local mail is suppressed silently; no mail or provider account is needed locally. `rer dev --stop` stops the owned server.

Node 22.20.0 and pnpm 10.12.4 are pinned. Local D1 data persists under `.wrangler/state`. Private settings, native sessions, dev credentials and installer state are excluded from Git. Setup preserves the saved owner and data. Missing noninteractive answers are reported by manifest field name; pass a private mode-0600 JSON answer file with `rer setup --answers PATH --non-interactive`.

Use `rer describe`, `rer doctor` and `rer check` for command effects, environment diagnostics and structural validation. `rer build` emits the production Worker; `rer verify` runs the declared acceptance wall. Stop preview with `rer preview --stop` before export/reset. `rer export --output exports/pier.rer` captures the supported complete installation; `rer import --input exports/pier.rer --yes` restores to an empty destination running the same Pier release (commit) that made the archive. Follow OPERATIONS.md for native identity re-entry and reconciliation. `rer reset --yes` is destructive and removes the declared local data/settings. Nothing here grants deployment or supplier-send authority.
