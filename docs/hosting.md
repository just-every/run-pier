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

`MAIL_PROVIDER` is `resend`, `sendgrid` or `cloudflare`. Cloudflare Email Sending also requires `MAIL_ACCOUNT_ID` set to your Cloudflare account ID. `MAIL_API_KEY` is a required private credential; keep it in the private environment file. Keep the quotes around `MAIL_FROM`: the name and angle brackets are one value. Stop the local Pier first if it is running (press Control-C in its terminal), because `rer deploy` refuses while it runs. Then, in the Pier folder:

```sh
rer deploy --dry-run --env-file ~/pier-deploy.env
rer deploy --environment production --env-file ~/pier-deploy.env
```

The dry run builds Pier and checks the settings without touching Cloudflare. The deploy creates the Worker and its database, prints the address (for example `https://pier-production.your-subdomain.workers.dev`) and claims the owner with a one-time setup token. Open the address, choose **Sign in**, enter the `OWNER_EMAIL` address and follow the link in your inbox. Finish setup at `/setup`.

## Make the hosted owner your real address

The hosted owner is `OWNER_EMAIL` from the file above. Without it, a new Worker takes the local setup owner, which on your computer is a placeholder address ending in `.test` that cannot receive mail. If that already happened, set the right address and deploy again (`rer deploy --environment production --env-file ~/pier-deploy.env`), or get a one-time owner link without mail with `rer signin --environment production --env-file ~/pier-deploy.env` and correct the email in Pier's settings.

To change a single secret later without a rebuild, put the new value in the file and run `rer deploy --environment production --env-file ~/pier-deploy.env --set-secret MAIL_API_KEY`.

For Pier-specific database backup, restore and removal commands, read [Hosted backup and recovery](hosted-recovery.md).
