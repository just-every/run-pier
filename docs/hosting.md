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
MAIL_FROM="Pier <pier@example.com>"
MAIL_API_KEY=your-mail-api-key
```

`MAIL_PROVIDER` is `resend`, `sendgrid` or `cloudflare`. Keep the quotes around `MAIL_FROM`: the name and angle brackets are one value. Stop the local Pier first if it is running (`rer dev --stop`), because `rer deploy` refuses while it runs. Then, in the Pier folder:

```sh
rer deploy --dry-run --env-file ~/pier-deploy.env
rer deploy --environment production --env-file ~/pier-deploy.env
```

The dry run builds Pier and checks the settings without touching Cloudflare. The deploy creates the Worker and its database, prints the address (for example `https://pier-production.your-subdomain.workers.dev`) and claims the owner with a one-time setup token. Open the address, choose **Sign in**, enter the `OWNER_EMAIL` address and follow the link in your inbox. Finish setup at `/setup`.

## Make the hosted owner your real address

The hosted owner is `OWNER_EMAIL` from the file above. Without it, a new Worker takes the local setup owner, which on your computer is a placeholder address ending in `.test` that cannot receive mail. If that already happened, set the right address and deploy again (`rer deploy --environment production --env-file ~/pier-deploy.env`), or get a one-time owner link without mail with `rer signin --environment production --env-file ~/pier-deploy.env` and correct the email in Pier's settings.

To change a single secret later without a rebuild, put the new value in the file and run `rer deploy --environment production --env-file ~/pier-deploy.env --set-secret MAIL_API_KEY`.

## Back up the hosted Pier

`rer export` saves only the copy on your computer. The hosted copy is the environment's D1 database, and Pier's own `hosted` script backs it up with the tools `rer` installed in the Pier folder. Run these from the folder you deployed from. To see the database's name:

```sh
rer run hosted database --environment production
```

It prints a name such as `pier-production-db`. To back it up:

```sh
rer run hosted backup --environment production --env-file ~/pier-deploy.env
```

This saves `exports/pier-production-db-<date and time>.sql` and prints its name. The file holds every hosted record: items, stock, movements, orders, purchases, people and the command journal. Keep it private. Make one before every change you might want to undo, and on a schedule.

## Check a backup

Prove a backup is complete by loading it into a throwaway database:

```sh
rer run hosted check --environment production --env-file ~/pier-deploy.env --file exports/pier-production-db-2026-10-17T09-00-00.sql
```

It creates a database named `pier-production-check-db`, loads the file, lists how many records of each kind it holds, then deletes that database again. If the command is interrupted before it says "Deleted the check database", run it again: it removes a leftover check database before making a new one, and deletes it at the end.

## Restore the live Pier

- **Undo a recent mistake** (within 30 days): put the live database back to a moment before it. Run `rer run hosted rewind --environment production --env-file ~/pier-deploy.env --timestamp 2026-10-17T09:00:00Z --yes` with the moment just before the mistake, in UTC. Without `--timestamp` it shows the database's current point and repeats this command.
- **From a backup file**: replace everything in the live Pier with the file:

```sh
rer run hosted restore --environment production --env-file ~/pier-deploy.env --file exports/pier-production-db-2026-10-17T09-00-00.sql --yes
```

It first saves the live records to `exports/pier-production-db-before-restore-<date and time>.sql`, then empties the live database, loads the file and lists the records it now holds. Pier keeps running at the same address; sign in again if your session was newer than the backup. To undo the restore, run the same command with the `before-restore` file it named. Connection credentials (Pantry, Stall, carriers) are inside the database, so a restore brings back the ones that were current when the backup was made: if you changed one since, connect it again in Pier.

## Remove it

```sh
rer deploy --environment production --env-file ~/pier-deploy.env --remove --yes
```

This deletes what that environment's deploy created (the Worker and its D1 database), reads back that each is gone, and touches nothing else on the account. Back up first: removal deletes the hosted records.
