# Back up and restore hosted Pier

These commands manage Pier’s own hosted database. For deployment and mail setup, read [Put Pier online](hosting.md).

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
