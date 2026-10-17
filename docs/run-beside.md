# Run Stall and Pantry beside Pier

Pier connects to two apps from the same family: **Stall**, an online shop that sells from Pier's stock, and **Pantry**, the bookkeeping app Pier posts bills, invoices and cost of goods to. Each runs in its own folder on its own port, next to Pier.

## Start them

In a folder of your choice (not inside Pier's folder), run each line once:

```sh
npx -y @runeditrun/rer dev just-every/run-pantry
npx -y @runeditrun/rer dev just-every/run-stall
```

Each command clones the app into its own folder, sets up a local owner, starts it and prints a sign-in link with its address, for example `http://127.0.0.1:8790`. Open the link and finish that app's setup. `rer list` in the parent folder shows each app and the address it is running on.

The address in the browser tab is the one you give the other app: copy it up to the first single slash.

## Connect them

- **Pantry**: create a credential for Pier in Pantry, then connect from Pier's **Books → Books settings**. Step by step: [Books and Pantry](books.md).
- **Stall**: create an agent credential in Stall for Pier, then create Stall's key in Pier and put it in Stall's settings. Step by step: [Sales channels](channels.md#stall).

## Stop and start again

In each app's folder, `rer dev --stop` stops it and `rer dev` starts it again with the same records. A restart can give an app a different port; if it does, update its address in the other app (Books settings for Pantry, or a new Stall connection and key for Stall).
