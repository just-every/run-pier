<!-- Generated from CONTRACT.md by contract-docs. Edit CONTRACT.md, then regenerate. -->

# Pier homepage claims

A claim is done when every clause behind it is done, missing when every one is missing, and partial otherwise.

| # | Claim | Clauses | Status |
| --- | --- | --- | --- |
| 1 | "Pier tracks stock across your warehouses" | `STOCK-001` done; `PIER-001` partial; `PIER-008` partial | partial |
| 2 | "runs orders from channel to carrier" | `CHANNEL-001` partial; `PIER-004` done; `PIER-009` partial; `WMS-001` done; `SHIP-001` partial | partial |
| 3 | "reorders before you run out" | `BUY-005` partial; `BUY-008` partial; `BUY-001` partial; `AUTO-001` partial | partial |
| 4 | "and keeps the books in step" | `ACCOUNT-001` partial; `ACCOUNT-002` partial | partial |
| 5 | "100% free, open source alternative to the supported source inventory systems" | `OPEN-001` done; `MIGRATE-001` partial | partial |
| 6 | The six hero tags, each a stage below | `PIER-006` done; `EDI-001` partial; `PIER-011` done; `WMS-001` done; `STOCK-001` done; `BUY-005` partial | partial |
| 7 | "The inventory agent reads sell-through across your channels, sees the gap" | `AGENT-002` done; `BUY-001` partial | partial |
| 8 | "Order 500 by Oct 7 · 12 days safety" | `BUY-001` partial; `BUY-005` partial | partial |
| 9 | "… and sends the purchase order" (PO-1048 sent, confirmed) | `AGENT-002` done; `BUY-006` partial | partial |
| 10 | "The supplier's ship notice drops to 480" (inbound EDI 856) | `BUY-007` partial; `EDI-001` partial | partial |
| 11 | "20 follow on PO-1048-B · due Nov 12" | `PIER-006` done; `BUY-007` partial | partial |
| 12 | "The agent checks each open order against stock, and no promise moves" | `AGENT-003` partial; `SALES-003` partial | partial |
| 13 | "Each carton is scanned against the PO as it comes off the truck" | `WMS-001` done; `SCAN-002` partial; `PIER-006` done | partial |
| 14 | "480 of 500 received · 20 short" | `PIER-006` done | done |
| 15 | "Scan the bin, scan the carton" (put away on a handheld) | `WMS-001` done; `SCAN-001` partial; `PIER-006` done | partial |
| 16 | "A count that disagrees gets a recount" | `PIER-011` done; `WMS-001` done | done |
| 17 | "… before anything moves" | `PIER-011` done; `COUNT-001` partial | partial |
| 18 | "Orders from your stores, marketplaces and EDI land in one queue" | `CHANNEL-001` partial; `EDI-001` partial; `SALES-001` partial; `SALES-008` done | partial |
| 19 | Faire among the orders and channels | `CHANNEL-004` partial | partial |
| 20 | One count: 571 available, 692 on hand, 121 reserved | `STOCK-001` done; `PIER-004` done | done |
| 21 | "855 acknowledged to Target" and "EDI 856 sent · Target DC 0593" | `EDI-001` partial | partial |
| 22 | "Stock goes back out to every channel" | `CHANNEL-003` partial | partial |
| 23 | "Pick by wave" (Wave 14 picked · 38 orders) | `WMS-004` done; `PIER-009` partial | partial |
| 24 | "pack" (Packed · 61 cartons) | `WMS-001` done | done |
| 25 | "send the ship notice" | `EDI-001` partial | partial |
| 26 | "rate-shop" (Rate shop · SO-2291) | `SHIP-001` partial | partial |
| 27 | "Address corrected · 1420 E Main St" | `SHIP-001` partial | partial |
| 28 | "print the label" (label failed, re-weighed, printed) | `SHIP-001` partial; `WMS-001` done | partial |
| 29 | "Tracking goes to each customer" | `SHIP-001` partial | partial |
| 30 | "214 orders out" by 4 pm | `WMS-003` done; `PIER-009` partial | partial |
| 31 | "Pier matches each bill to its PO and receipt, holds the difference" | `BUY-004` done | done |
| 32 | "Agent requested a credit" | `BUY-003` partial; `AGENT-003` partial | partial |
| 33 | "Credit memo CM-311" and "Paid $2,016.00 for 480" | `BUY-003` partial; `BUY-004` done | partial |
| 34 | "posts landed cost" (Landed cost $4.38 a unit) | `COST-001` partial | partial |
| 35 | "… to QuickBooks Online or Xero" | `ACCOUNT-001` partial; `ACCOUNT-002` partial | partial |
| 36 | "Each scan, sale, count and bill writes a line" | `PIER-012` done; `AUDIT-001` partial | partial |
| 37 | "Value moves with it" (FIFO · USD) | `COST-001` partial; `REPORT-002` partial | partial |
| 38 | Reorder row: "571 available = 36 days; 40 needed (28 lead + 12 safety)" | `BUY-001` partial; `BUY-005` partial | partial |
| 39 | "Items, bins, stock on hand, customers, suppliers and open orders come across from a supported source inventory system" | `MIGRATE-001` partial; `PIER-003` done | partial |
| 40 | "Channels reconnect to the same listings" | `CHANNEL-001` partial; `MIGRATE-001` partial | partial |
| 41 | The one-line start `npx -y @runeditrun/rer dev just-every/run-pier` and what it does | `OPS-001` partial | partial |
| 42 | "Runs on your own computer or server" | `OPS-001` partial | partial |
| 43 | "Where Pier stops. Manufacturing work orders, point of sale and 3PL client billing." | `OPEN-001` done | done |
| 44 | "Open source inventory and order management for wholesalers and distributors" | `STOCK-001` done; `CHANNEL-001` partial; `OPEN-001` done | partial |
| 45 | Tag "PO-1061 sent · 600 Blue Mug 12oz" | `AGENT-002` done; `BUY-006` partial | partial |
| 46 | "Free and open source, MIT licensed" | `OPEN-001` done | done |

Claims: 46; 7 done, 39 partial, 0 missing.
