# Pier command contract

Pier uses package mode: exact `@runeditrun/rer` 0.2.0 in package.json and pnpm-lock.yaml, public aliases `rer VERB`, and the edition adapter in scripts/installer/local.mjs. There is no vendored dispatcher or CLI tree. Runtime pins are Node 22.20.0 and pnpm 10.12.4. OPERATIONS.json is the machine-readable command/effect descriptor; `rer describe` lists current flags.

| Command | Effect |
|---|---|
| `rer install` | Frozen dependency installation; no setup or deployment. |
| `rer setup` | Validate manifest answers, build, apply local D1 migrations, claim/preserve the native owner, check local outbox sign-in and stop temporary serving. |
| `rer dev` | Managed loopback development with assets/HMR and real native dev identity; `--as` selects a declared persona, `--stop` stops it; it also serves the run site and prints `RER_SITE`. |
| `rer preview` | Managed production output on loopback with durable state and normal native sign-in; `--stop` stops it. |
| `rer build` | Real Worker/assets production build with private local configuration excluded and dev-identity output refused. `--site` renders the static run site (homepage, `/run`, `/docs` from the repository's Markdown) into `dist/site` and refuses broken or instance-only links. |
| `rer verify` | Complete declared app verification, then Base hosted-output and hydration checks. No deployment. |
| `rer reset --yes` | Confirmed removal of inventoried local state/private settings; no remote effect. |
| `rer export --output FILE` | Complete supported local installation archive, private file permissions, integrity checks and declared credential/transient exclusions. |
| `rer import --input FILE --yes` | Validated atomic restoration to an empty local destination, with native identity policy in OPERATIONS.md. |
| `rer deploy` | Owner-account Cloudflare deployment through Base deploy-kit; explicit authorized credentials/provider configuration required. `--dry-run` makes no provider request. |
| `rer outbox` | The local development outbox address for ordinary sign-in links; `--owner-email` requests the owner's link. Private token-bearing links are credentials. |
| `rer doctor` | Read-only tool/configuration diagnostics. |
| `rer describe` | Read-only implemented commands, pins and effects. |
| `rer check` | Read-only first-party command/operations/source structure validation. |
| `rer release` | Local verified release artifact preparation; does not push or deploy. |

Commands accept `--help`, `--cwd PATH`, `--non-interactive` and `--json` where the shared descriptor declares them. Setup accepts a private `--answers FILE`, explicit owner email/name and an available loopback port. Secret values are never CLI flags. Heavy commands admit `--no-queue` only under CI. Numeric port overrides apply consistently to listener and saved origin. RER_READY marks real health readiness; RER_OPEN is private credential-bearing output. Keep it out of logs and screenshots.

The adapter owns the real D1 database, complete restore policy, native sessions and dev identity. The exact Base application/auth pin is independent of CLI version. Local evidence does not establish hosted mail, stockkeeping or legal/tax acceptance. The full product floor is CONTRACT.md and ACCEPTANCE.md.
