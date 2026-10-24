# Books and reconciliation

Pier sends its accounting to **Pantry**, the bookkeeping app from the same family: invoices, bills, payments and reports, on your own computer or your own Cloudflare account. Pier stays the record of quantities and stock cost; Pantry holds the ledger.

## Get a Pantry

No Pantry yet? Start one on the same computer as Pier with one line:

```sh
rer dev just-every/run-pantry
```

Open the link it prints, finish Pantry's setup and choose its chart of accounts. [Run Stall and Pantry beside Pier](run-beside.md) covers ports and stopping. Pantry's own guide is at [run-pantry.com/run](https://run-pantry.com/run).

Pier posts stock to an inventory account and the cost of what ships to a cost of goods account. A new Pantry chart has neither: in Pantry open **Books → Chart of accounts → Add an account** and add, for example, `1300 Inventory` (type Asset) and `5000 Cost of goods sold` (type Expense). If you pay freight or duty on deliveries, add an Expense account for them too, for example `5200 Freight and duty in`: enter carrier and customs bills against it in Pantry, and Pier moves the part it spreads over received stock into Inventory. Choose **Ordinary account** for Role on these Inventory, expense and income accounts. Add an Income account for product sales too if you want one apart from Service revenue.

## Create Pier's credential in Pantry

1. In Pantry, open **People & settings** and scroll to **Integration credentials**.
2. Name it **Pier** and tick Contacts, Invoices, Bills, Journals, Documents, Payments readback, Record external payments, Reports and Post approved sibling records.
3. Choose **Create integration credential** and copy the value. Pantry shows it once; it starts with `pantry_integration_`.

The credential cannot sign in, manage people or move money. It keeps working until you revoke it in the same place in Pantry.

## Connect in Pier

Open **Books → Books settings** (or `/app#books/settings`). Enter Pantry's address, copied from its browser tab up to the first single slash (for example `http://localhost:8790` on this computer, or `https://books.example.com` once Pantry is online), and paste the credential. Choose **Check Pantry and load accounts**. Pier checks the credential has every permission it needs, names any that are missing, and lists Pantry's active accounts. Pick the inventory, cost of goods, sales and (optionally) damaged-stock and freight-and-duty accounts from those lists, confirm the tax treatment, and choose **Connect Pantry**. You never copy an account ID or a browser cookie.

For Stripe-paid Stall orders, also pick **Stripe payments from Stall**. In Pantry open **Bank → Statements → Add a bank or card account** and create the account holding the Stripe money: use Checking or a separate Asset chart account with the **Bank or card** role. Enter its actual last four digits, opening statement date and balance. Load accounts again in Pier and choose it. Pier records the payment already collected; it never charges a card or initiates a payout. Each partial shipment records only its invoiced share, with the original Stripe payment reference. An existing mismatched payment or reversal stays in review.

Pier encrypts the credential with the installation secret. Business exports, installation archives and pending browser commands never contain it. Pantry over plain HTTP is accepted only by a local Pier on the same computer; an online Pier needs Pantry's HTTPS address.

## When the connection breaks

If you revoke or replace the credential in Pantry, Pier's next sync stops at the first refusal and Books shows **Connection broken** with the fix: create a new credential in Pantry and choose **Reconnect Pantry**. Nothing is sent while the connection is broken, and nothing is lost: pending documents wait in the queue and resume after reconnecting. To rotate a credential, create the replacement, reconnect Pier with it, then revoke the old one. **Disconnect** stops Pier sending without touching Pantry.

## What posts

- Item versions become exact item-definition evidence attachments. Pantry has no native item catalogue. Pier remains the quantity and cost subledger.
- A buyer records the actual supplier invoice against a committed PO, with billed quantities, unit prices and explicit quantity/price percentage tolerances. Pier names receipt shortfalls, cumulative invoicing above the PO, PO price differences and receipt price differences. Hold records a reason; approval checks the exact current evidence and permits only differences within the reviewed tolerances. Each line needs unused, valued USD receipt evidence. Partial invoices allocate receipts once, in approval order. A later receipt completes earlier approvals first.
- An approved invoice posts one Pantry payable, debiting the mapped inventory account for its actual invoiced amount. Its immutable invoice, PO, tolerances and approval evidence attach to the bill. New receipts alone create no payable. Already-sent receipt-generated bills retain their original identity and payment readback, and their receipts cannot be billed again. Unsent receipt-generated proposals are replaced by this invoice review. Price/quantity variances may leave a visible inventory-account reconciliation difference; Pier does not invent an adjusting journal.
- Freight and duty you enter on a receipt are spread over its lines in whole cents (largest remainder, so the parts add up exactly to what you entered) and post one journal: debit inventory, credit the freight-and-duty account you picked, which is where the carrier and customs bills are entered in Pantry. Until that account is picked, the journal waits in review with that reason. Receipts landed before cents were whole are re-split once, the next time Pier syncs.
- Each shipment creates one sales invoice for its shipped lines and one balanced cost-of-goods journal: debit cost of goods, credit inventory. Shipment quantities and original references stay in the descriptions. Stock cost layers are kept in whole cents, so a partial shipment's cost is rounded to the cent and the last unit out of a layer takes the remainder; the layers always add up to the receipt's landed total. Amounts with fractions of a cent from the source (a sales price such as 0.125 each), missing prices, unknown USD costs and zero-cost/zero-price financial documents wait for review rather than silently rounding or inventing values.
- Each stock change sends an inventory valuation evidence attachment. Pier also compares its current valuation to Pantry's posted inventory account balance through the latest source-document date (shown on the reconciliation row). A supplier invoice dated today in your time zone is included even before UTC reaches that day. A difference stays in the same review queue, including unsupported returns, receipt reversals and other adjustments until the accountant reconciles them. Valuation snapshots do not post inventory a second time.
- Payments and allocations recorded in Pantry return to Pier's Books view, order details and receipt/bill details. Reversed payments reopen the balance. Cash payments are shown separately from the open balance, which may also include credits.

When an approved supplier invoice's receipts are complete and within tolerance, Pier marks the Pantry bill **received** and **ready to pay** with Pantry's native bill readiness, and attaches the receipt-state evidence to the bill. Receipt reversals or later discrepancies set readiness back. Readiness records no payment: a bill becomes reconciled in Pier only when Pantry's payment readback shows its open balance is zero. No payment is fabricated by receiving stock.

**Receipt follow-through** in Books lists every receipt, including goods that have no supplier invoice yet. Its next action opens invoice entry with the purchase order selected. The receipt shows its quantities not yet allocated to an approved invoice, waits for remaining goods and confirmed Pantry readiness, then directs you to **Pantry Sales & bills → Bills / Payments**. Only confirmed zero open balances close the receipt; freight-and-duty journals must also be posted. The same status appears beside the receipt in Purchasing. Choose **Sync now** after recording a payment or reversal in Pantry; the scheduled books check also refreshes these states. A disconnected, missing or revoked credential asks for reconnection instead of claiming a current closure. The supplier invoice list distinguishes Pier's local matching from Pantry's confirmed ready-to-pay state.


## One review queue

Every refused, unpriced, unvalued, mismatched or uncertain document appears with a reason and next action. Open its source, resolve the issue or reconnect with a new Pantry credential, then retry. An owner may skip a source that has never been sent, recording a reason. A request that may have reached Pantry cannot be skipped. When Pantry shows no record of it (**Outcome unknown**), choose **Check Pantry**: Pier looks again and, if there is still no record, re-sends the same request as the same original request, so a request that did arrive is never recorded twice. Pier never re-sends an unknown outcome on its own.

Pier saves what it intends to send before contacting Pantry and sends one batch at a time. Stable invoice numbers, bill references, journal memos and evidence names identify the immutable source. Pantry recognizes repeat requests for the same source, so a replay after a lost response returns the record it already saved. Successful remote records are checked for matching dates, amounts, accounts and parties, by exact reference lookups. If Pantry cannot show the outcome, it stays uncertain until the owner chooses **Check Pantry**; there is no automatic create retry.

Sync runs after Pier writes, on the minute schedule and with **Sync now**. Approval belongs to the still-active connecting Pier owner; disconnecting or revoking that owner stops future sends. Restored archives retain jobs and source identities but exclude credentials and temporary send locks; reconnect before resuming.

## QuickBooks and Xero

Direct QBO and Xero connections remain unavailable until the owner supplies authorized apps and real company accounts. Both use the same document adapter interface; their HTTP requests, payment readback and receipt attachments are exercised against authored synthetic examples recorded from their documented API shapes. These are protocol fixtures, not captured account traffic or provider acceptance. [Fixture provenance](https://github.com/just-every/run-pier/blob/main/tests/fixtures/books/README.md) names the official sources and remaining mapping/OAuth boundaries.

**Download CSV** exports real source documents, mapped debit/credit lines and review reasons. It is an accountant handoff that must be mapped to the destination's import shape. **Download QuickBooks Desktop IIF** exports balanced invoice, bill and general-journal entries; it refuses unpriced or unvalued documents. It names `Inventory Asset`, `Cost of Goods Sold`, `Sales`, `Accounts Receivable` and `Accounts Payable`; review the account/customer/vendor lists and tax treatment in a backup QuickBooks company before importing. IIF is a Desktop format, not a QuickBooks Online import. Export is a separate manual posting workflow, never confirmation that the connected ledger posted; do not import the same documents twice.

Technical transport and testing details live in [Books developer notes](books-developer.md).

## Direct shipments and supplier returns

These credit flows use the scoped posting surface documented by Pantry v0.2.6.

A dropship credit stays retained and unposted until the owner chooses **Post customer credit to Pantry**. Pier posts the direct shipment invoice and its linked customer credit note, then reads back their amounts and identity. It makes no warehouse receipt, stock movement or cash refund.

For supplier returns, give the Pantry credential both **Vendor credits read** and **Vendor credits write**, plus **Post approved sibling records**. Retain the supplier's credit evidence, select its **Matched supplier payable**, and choose **Post supplier credit to Pantry** as owner. Pier checks the payable's approved original receipt allocation, posts one native vendor credit and reads back its allocation and zero unapplied amount. An insufficient open balance waits for accountant review; no payment is fabricated. Lost responses recover by the same source identity; **Check Pantry** remains the explicit action for an unknown create.

Dispatched supplier returns move their exact cost from Inventory to the mapped Cost of goods expense account as return clearing. Supplier credits reverse that clearing expense. Replacement receipts move the original unit cost and retained cumulative whole-cent freight and duty shares back from clearing to Inventory. They create no second payable and leave the original receipt and PO unchanged. Any remaining expense represents cost the supplier did not credit.

Newer Pantry installations may flag the separate invoice and receipt-state attachments as possible duplicates. Pier retains the refusal and names it in Books. In Pantry **Documents**, review those exact files and choose **Keep both** only when they are distinct supporting evidence, then sync again. Pier never overrides Pantry's duplicate guard or decides that consent for the owner.
