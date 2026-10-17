# Put Pier online

Pier runs on your own Cloudflare account: one Worker and one D1 database per environment. Pier stores no files outside that database, so the database is the whole hosted installation. You deploy from the same folder you run locally.

## What you need

- A Cloudflare account. Create an account API token at [dash.cloudflare.com/profile/api-tokens](https://dash.cloudflare.com/profile/api-tokens) with the account permissions **Workers Scripts: Edit** and **D1: Edit**, and copy your account ID from the Cloudflare dashboard.
- A mail provider for sign-in links and the daily dispatch summary: Resend, SendGrid or Cloudflare Email, with an API key and a sender address that provider has verified.
- Your own email address, which becomes the hosted owner.

## Deploy

Put the settings in a private file only you can read, outside the Pier folder (for example `~/pier-deploy.env`, then `chmod 600 ~/pier-deploy.env`):

```sh
CLOUDFLARE_ACCOUNT_ID=your-account-id
CLOUDFLARE_API_TOKEN=your-api-token
OWNER_EMAIL=you@example.com
MAIL_PROVIDER=sendgrid
MAIL_FROM=Pier <pier@example.com>
MAIL_API_KEY=your-mail-api-key
```

`MAIL_PROVIDER` is `resend`, `sendgrid` or `cloudflare`. Then, in the Pier folder:

```sh
rer deploy --dry-run --env-file ~/pier-deploy.env
rer deploy --environment production --env-file ~/pier-deploy.env
```

The dry run builds Pier and checks the settings without touching Cloudflare. The deploy creates the Worker and its database, prints the address (for example `https://pier-production.your-subdomain.workers.dev`) and claims the owner with a one-time setup token. Open the address, choose **Sign in**, enter the `OWNER_EMAIL` address and follow the link in your inbox. Finish setup at `/setup`.

## Make the hosted owner your real address

The hosted owner is `OWNER_EMAIL` from the file above. Without it, a new Worker takes the local setup owner, which on your computer is a placeholder address ending in `.test` that cannot receive mail. If that already happened, set the right address and deploy again (`rer deploy --environment production --env-file ~/pier-deploy.env`), or get a one-time owner link without mail with `rer signin --environment production --env-file ~/pier-deploy.env` and correct the email in Pier's settings.

To change a single secret later without a rebuild, put the new value in the file and run `rer deploy --environment production --env-file ~/pier-deploy.env --set-secret MAIL_API_KEY`.

## Back up the hosted Pier

`rer export` saves only the copy on your computer. The hosted copy is the D1 database; `rer deploy` printed its name (for example `pier-production-db`). With the same Cloudflare settings in your environment:

```sh
set -a; . ~/pier-deploy.env; set +a
mkdir -p exports
npx wrangler d1 export pier-production-db --remote --output exports/pier-production-db.sql
```

The file holds every hosted record: items, stock, movements, orders, purchases, people and the command journal. Keep it private. Make one before every change you might want to undo, and on a schedule.

## Restore

- **Undo a recent mistake** (within 30 days): restore the live database to a moment before it with D1's point-in-time restore, `npx wrangler d1 time-travel restore pier-production-db --timestamp=2026-10-17T09:00:00Z`. Find the moment with `npx wrangler d1 time-travel info pier-production-db`.
- **From a backup file**: create an empty database and load the file into it, then check it:

```sh
npx wrangler d1 create pier-restore-db
npx wrangler d1 execute pier-restore-db --remote --file exports/pier-production-db.sql --yes
npx wrangler d1 execute pier-restore-db --remote --command "SELECT kind, COUNT(*) FROM pier_records GROUP BY kind"
```

Point-in-time restore is the way to bring a live Pier back. A restored file is your proof that the backup is complete and your source for moving to a new account; ask for help before swapping a running Pier onto another database.

## Remove it

```sh
rer deploy --environment production --env-file ~/pier-deploy.env --remove --yes
```

This deletes what that environment's deploy created (the Worker and its D1 database), reads back that each is gone, and touches nothing else on the account. Back up first: removal deletes the hosted records.
