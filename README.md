<p><img src="public/brand/mark.svg" width="72" height="72" alt=""></p>

# Pier

Know what’s on every shelf. Pier is open source inventory and order management for wholesalers and distributors, a free alternative to Cin7, inFlow and Fishbowl. The project site is https://run-pier.com, with [the docs](https://run-pier.com/docs).

## Run it locally

Pier is an MIT-licensed stock and wholesale-order app for small finished-goods wholesalers. Its contract covers item and location records, stock movements, hard reservations, purchasing, fulfilment, counts, migration review and portable backup. All twelve first-release journeys have local proof across the real server and database, responsive browser and fresh-install portability checks; [ACCEPTANCE.md](ACCEPTANCE.md) records the test coverage and scope.

The public source repository is [just-every/run-pier](https://github.com/just-every/run-pier).

Pier starts with no business records. On your computer Pier runs the same server and a lasting local database as online, and you sign in with a one-click local link. No remote identity, mail, model, supplier, accounting or carrier account is needed for local setup. The project is pinned to the published `@runeditrun/rer` 0.2.51 package.

One line, the same as [run-pier.com/run](https://run-pier.com/run). It installs `rer`, gets Pier, installs everything, makes you the owner and prints a link that opens Pier signed in:

```sh
npx -y @runeditrun/rer dev just-every/run-pier
```

No Node? `curl -fsSL https://runeditrun.com/install.sh | sh -s -- dev just-every/run-pier` brings its own Node and does the same.

To start it again later, run `cd run-pier && rer dev`. To choose the owner yourself, run `npx -y @runeditrun/rer install just-every/run-pier`, then from the checkout:

```sh
rer setup
rer dev
```

Open the local URL printed by `rer dev` on this computer and complete the first-owner claim at `/setup`. The start page is at `/`; open `/app` for Pier. Keep the printed local open URL private because it carries the development sign-in key; run `rer dev` again for a fresh one-click link. Local mail is suppressed silently. Stop the server with `rer dev --stop`.

The checkout pins Node 22.20.0 and pnpm 10.12.4. `rer build` builds the production Worker, `rer verify` runs the declared local verification command, `rer check` checks the checkout's declared operations and source selections, and `rer describe` reports command effects. The local verification wall and separate browser evidence are recorded in [ACCEPTANCE.md](ACCEPTANCE.md); they do not establish hosted operation, provider integrations or physical warehouse accuracy.

The full installation archive is separate from the native CSV migration contract:

```sh
rer export --output exports/pier.rer
rer import --input exports/pier.rer --yes
```

Restore only into an empty installation running the same Pier release (commit) that made the archive, then run `rer setup` and establish a fresh native session for the retained owner identity. The archive preserves historical operator and approval identity but never restores credentials or sessions. The archive is the portable installation backup; [IMPORT.md](IMPORT.md) defines the six established native CSV kinds plus the optional `reservations.csv` allocation file and its review rules. Do not treat the two formats as interchangeable.

`rer reset --yes` removes local installation state and is destructive. Export first if data needs to be kept. To put Pier online on your own Cloudflare account, with your real owner address, a hosted backup, restore and removal, follow [Put Pier online](docs/hosting.md). To run Stall and Pantry next to Pier, see [Run Stall and Pantry beside Pier](docs/run-beside.md).

Read [the product contract](CONTRACT.md), [acceptance record](ACCEPTANCE.md), [operations](OPERATIONS.md) and [native CSV contract](IMPORT.md) before making operational changes. Moving in from Cin7 Core, inFlow or Fishbowl is described in [docs/move-in.md](docs/move-in.md). The public run site (`rer build --site`) carries the homepage, the Run page and these documents.
