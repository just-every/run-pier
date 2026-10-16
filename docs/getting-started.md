# Getting started

Pier runs on your own computer with one command and starts empty: no sample stock, no demo orders. This page takes you from nothing to your first stock you can promise.

## Start Pier

One line installs the `rer` command, gets Pier and starts it:

```sh
npx -y @runeditrun/rer dev just-every/run-pier
```

To start it again later, run `cd run-pier && rer dev`.

`rer dev` installs everything, makes you the owner and prints a link that opens Pier signed in. Keep that link private: it carries this computer's development sign-in key. Pier needs Node 22 or later and pnpm 10.12.4, on macOS, Linux or Windows with WSL2.

The first time you open it, Pier asks you to finish setup at `/setup`. Check the name and email shown, tick **I confirm this owner account is ready to use.** and choose **Finish setup**. Pier then opens at `/app`. The page at `/` is the installation's front door, with **Sign in** for everyone you invite.

Stop Pier with `rer dev --stop`. Your records stay on this computer and are there the next time you run `rer dev`.

## Sign in again

When the printed link has expired or you signed out, run `rer dev` again and open the new link it prints: it signs you in with one click. Nothing is emailed from this computer.

## Set up your stock

Everything starts on the **Stock** view.

1. **Add a bin.** In **Add warehouse bin or transit location**, enter the bin name and its warehouse, and choose **Warehouse bin**. Add an **In transit (never sellable)** location too if you move stock between warehouses.
2. **Add customers and suppliers** in **Add customer or supplier**.
3. **Add an item** with **Add item**: SKU, product name, barcode, the base unit every quantity uses (for example `each`) and its exact pack conversion. Once stock or documents use an item, its unit and pack stay fixed, so choose them carefully.
4. **Put stock on the shelf.** Either import your opening stock (see [Moving in](moving-in.md)) or receive a purchase order into the bin (see [Daily stock work](daily-work.md#buy-and-receive)).

The ledger then shows each item by bin with **On hand (sellable)**, **Reserved**, **Available**, **Quarantine** and **Expected**. Available is what you can promise: sellable stock on hand less what open orders have reserved. Quarantine, transit and expected receipts are never available.

## Invite your team

Open **Activity** and use **Invite an operator** with their name and email. A new person starts as `viewer`; give them a role with **Set an invited operator’s role**:

- **owner**: everything, including migration decisions.
- **buyer**: approves exact purchase orders.
- **operator**: sales orders and reservation decisions.
- **warehouse**: receipts, dispatches, transfers and counts.
- **viewer**: reads everything, changes nothing.
- **agent**: prepares evidence-backed proposals for a person to approve.

Locally, invitation mail is not sent; try roles with the dev personas instead.

## Next

- [Daily stock work](daily-work.md): sales orders, purchasing, transfers, counts and finding where a number came from.
- [Moving in](moving-in.md): bring items, bins, stock and open orders from your current system.
- [Backup and restore](backup-and-restore.md): keep a complete copy and restore it.
