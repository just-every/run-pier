# The warehouse floor

**Floor** runs receiving, picking, packing and the day's dispatch from a desk, a handheld or a phone. Every step has one scan box. A USB or Bluetooth scanner, or a rugged handheld's built-in scanner, types the code into the box and presses Enter; on a phone, **Scan with camera** reads the barcode where the browser can, and you can always type the code.

## Receive by scanning

In **Floor → Receive**, choose a committed purchase order and the bin you are putting away to, then **Start receiving**. Scan each unit barcode, or the case barcode to receive the whole case; **Times** repeats one code, for example 24 cases. Scanning a bin label sends the next scans to that bin. A code Pier does not know, or an item that is not on the purchase order, is refused and nothing is counted.

The tally shows what is still expected and what you have scanned, line by line, as **Matches**, **Over** or **Short**. **Post receipt into bins** posts the stock. A short line stays expected on the purchase order; an over-receipt posts only with the reason you give. Both are kept on the receipt.

## Pick a wave

Add each **Carrier pickup** with its warehouse, dock door, cut-off and time zone. Orders with reserved stock wait under **Orders waiting for a wave**, grouped by the pickup they ship with; **Release wave** puts the chosen orders on one pick list, in bin order, each order in its own tote.

Each line asks for its bin label first, then the item. A wrong bin or a wrong item is refused with the reason, and nothing is picked. If the bin is empty or short, **Bin empty or short** sends you to the next bin holding unreserved stock of the same item, moves only that line's reservation and opens a count for the bin you reported. When no bin has it, the line is picked short and only that order stays short.

## Pack and dispatch

In **Floor → Pack**, open a picked order and scan its items into carton 1; **Start carton 2** when the first is full. Pier refuses a scan that would pack more than was picked. Enter each carton's weight in pounds and its length, width and height in inches, then **Mark order packed**. **Dispatch packed cartons** with the bill of lading, PRO or tracking number takes the stock out of its reserved bins.

## The day's dispatch

**Floor → Dispatch day** shows, for a day in the warehouse's time zone, the orders, shipments and units shipped, by carrier and by dock against each cut-off, and the exceptions: due orders that did not ship and why (short, unpicked, unpacked or packed but not shipped), short picks and the overflow bin used, shipments after the cut-off and receipts that arrived over or short.

**Close … and email the owner** keeps that day's summary under **Closed days** and sends a copy to the owner through your installation's mail. On your own computer Pier does not send mail, and says so; on a hosted installation the owner's copy goes through the mail provider you configured.
