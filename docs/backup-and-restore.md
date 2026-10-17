# Backup and restore

A Pier backup is one archive file holding the whole installation: items, stock, every movement, orders, purchases, receipts, counts, imports with their original files, approvals and the command journal.

## Make a backup

Stop Pier first so nothing changes while the archive is written, then export:

```sh
rer dev --stop
rer export --output exports/pier.rer
```

Keep the archive somewhere safe and private; it holds your business records. It does not contain passwords, sign-in sessions, tokens or private settings.

An archive restores with the same Pier release that made it. Restore it into the same Pier folder, or into a copy of Pier at the same version; if you update Pier in between, restore first and update after.

## Restore it

Restore only into an empty installation. On the same checkout, reset it first:

```sh
rer reset --yes
rer import --input exports/pier.rer --yes
rer setup
rer dev
```

`rer reset --yes` deletes this computer's Pier records and settings, so make sure your archive is complete before running it.

To restore on another computer, clone Pier, check out the release that made the archive, then:

```sh
rer install
rer import --input exports/pier.rer --yes
rer setup
rer dev
```

After restoring, sign in again as the owner with a fresh session (see [Getting started](getting-started.md#sign-in-again)). People, roles and approvals come back as history; nobody is signed in by the restore.

## Check before you carry on

Before taking new orders, look over balances, reservations, the remaining quantities on open orders and purchase orders, links in Activity and the retained import files. A database restore cannot bring back goods that were physically dispatched: Pier's records describe the moment of the backup.

## A spreadsheet copy

**Export records, costs and provenance** in Activity, and **Export complete business records** on Imports, download your records for reading elsewhere. They are not a backup: only `rer export` restores a complete installation.
