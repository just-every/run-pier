# Warehouse placement

Open **Transfers** to configure bins and prepare directed put-away or replenishment work. This uses the same stock admission rules as receiving and count correction; a suggestion never moves goods by itself.

## Configure measured bins

As the owner, choose a bin under **Bin policies and directed tasks**. Enter its usable volume in cubic centimetres and its individual length, width and height in centimetres. Item dimensions can be centimetres or inches. An item's axes must fit the bin's corresponding axes; Pier does not rotate a box automatically. Occupancy sums every item's volume times its base-unit quantity, including quarantine stock. A fractional base unit occupies the same fraction of its defined volume. Dimensionless goods need their item dimensions completed before entering a measured bin. Empty permitted-stock selection allows every dimensioned item; otherwise only the selected SKUs may enter.

Aisle and bay are walking coordinates in metres from the warehouse entrance, with Manhattan distance between bins. Pick sequence breaks travel ties. Mark a bin as a pick face and add or replace an item's minimum and maximum; clearing Pick face removes its thresholds. Existing thresholds for other items remain when one is updated. Unconfigured bins retain their existing behavior.

## Prepare, review and confirm

Choose a warehouse and optionally its receiving bin. Empty pick faces are prioritized before other faces at or below their minimum; reserve stock replenishes toward each maximum. Only unreserved sellable stock is offered. Receiving-bin put-away follows those tasks. The plan accounts for earlier tasks' stock and space and shows a partial quantity when only part fits. Quarantine is never offered as replenishment stock. Missing dimensions, forbidden stock or lack of fitting capacity produces no placement recommendation.

Review the quantities, source and destination. The owner approves the exact plan until a supervisor role exists. Warehouse staff then scan both bin labels and the item, confirm the exact base-unit quantity, and name the device or workstation. Item or location edits require a fresh plan; new reservations, capacity conflicts and revoked approval authority refuse the move. A completed task retains who approved and physically confirmed it. A lost response recovers using the same command identity, with no second movement. Internal moves preserve original cost layers.

## Explain ABC recommendations

ABC counts confirmed pick scans in the preceding 30 days; scans per day truncate to six decimals. Items sort by count then SKU. The cumulative share before an item places it in A below 80%, B below 95%, otherwise C. An item without observations is unranked. The report retains the source wave, pick line, confirmation time and dimensions. A recommendation names the closest fitting permitted pick face from the entrance, then the smaller observed mean elapsed time, then pick sequence. Observed time runs from wave release to confirmation and includes waiting and task work; it is not a claimed measurement of walking alone. A missing observation stays unknown. ABC does not change a bin policy or relocate stock.

Business export includes complete bin policies and plans, approvals and physical confirmations. Future kits and tracked lots/serials must extend capacity, permitted-stock and task identity before shipping under KIT-001 and TRACE-001. Physical scanner/printer acceptance remains separately recorded under SCAN-001 and SCAN-002.
