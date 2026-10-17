# Connect Stall

You need a running Stall shop and owner access to both Stall and Pier. No Stall yet? Follow [Run Stall and Pantry beside Pier](run-beside.md). Open **Channels → Connect Stall** in Pier. Create the warehouse bins and a Pier customer for the shop's orders first; the card can also add that customer later.

## Let Pier read the shop

In **Stall → Settings → Agent access**, choose **Create agent credential**. Copy that credential into Pier's **Access token**. Copy Stall's address from its browser tab into **Store API address**, for example `http://localhost:8791`. Name the connection, select the Pier warehouse and set its stock buffer to zero, then choose **Connect store**.

Stall's agent credential lasts seven days. If Stall refuses access, create a new one and use **Pier → Channels → Connection setup → Manage → Replace credentials**.

## Let Stall read and reserve Pier stock

On the Stall card in Pier, select **Customer for Stall's orders**. Use **Add “Online shop (Stall)”** if needed, then choose **Create Stall's key to Pier**. Copy the Pier address and key before leaving the page; Pier shows the key once and keeps only its fingerprint.

In Stall, open **Settings → Provider connections**, at the shop address followed by `/app#settings`. Paste the Pier address and key into **Connect Pier** and choose **Connect Pier**. Stall checks the key and shows **Connected**. Both apps may be on this computer or online, provided their servers can reach one another.

The key permits shop stock reads and that customer's own order reservations and dispatches. Creating a new key stops the old one immediately; paste the replacement in Stall. **Remove Stall's key** stops its access.

## Check a paid order

Stall takes payments through the owner's Stripe account. In **Stall → Settings → Provider connections → Connect Stripe**, enter your test key first. The form explains its online webhook setup. Publish a Stall product whose SKU exactly matches a Pier item, then check its available quantity and complete a Stripe test payment.

A paid checkout reserves in Pier. The connector links the existing reservation; it does not reserve again. Find the order at **Pier → Channels → Orders**, open it and inspect its reservations. For a local Stall that cannot receive Stripe webhooks, open the order in Stall and choose **Reconcile** after the payment.

Stall currently reads one company-wide pool, so this integration requires a single Pier warehouse and a zero channel buffer. A stock read-back that differs from Pier's published quantity remains a visible error. Payment, shipping approval and native sign-in requirements still apply. See [Sales channels](channels.md) for shared behavior and remaining integration limits.
