# X12 and SSCC codec

The codec is a bounded X12 004010 wholesale profile, implemented in `src/pier/edi/x12.ts` and `src/pier/edi/sscc.ts`. It performs no transport, database writes, stock allocation, invoice authorization or automatic retailer acceptance. Domain admission must retain the original bytes, map partner identifiers, resolve exceptions and allocate durable controls and SSCC sequences.

## Incoming documents

`parse850(raw)` validates the fixed-width ISA and its element, component and segment delimiters, ISA/IEA, GS/GE and ST/SE controls, transaction/segment/group counts and 00401/004010 versions. It accepts exactly one interchange, functional group and transaction per submission; batches are rejected rather than partially consumed. The input ceiling is 1 MiB and 20,000 segments. BEG purposes other than original (`00`) are rejected for authorized amendment/cancellation resolution.

The result contains envelope IDs and controls; PO number/date; purpose/order type; header DTM 002/067 arrival date; N1 ST ship-to and N3/N4 address; and PO1 line number, exact decimal quantity, X12 unit, unit price and every qualifier/value pair, including BP, UP, VN and unmapped identifiers. Decimals remain strings. Dates are ISO calendar dates. An explicit non-USD CUR, conflicting arrival dates, duplicate line numbers, incomplete identifiers, invalid decimal/date/count and unsupported price basis are rejected. Empty/PE price basis is the supported per-unit price profile; pack conversion belongs to explicit partner/item mapping.

`unmappedSegments` retains segments or extra known-segment fields outside this projection, including unsupported party loops, line schedules, charges, allowances, pack details and other commercial conditions. Admission must hold these for explicit mapping/review; parsing is not permission to discard them. This is a focused supported profile, not a complete validator for every segment and business rule in X12. The original artifact remains authoritative evidence.

`parse997(raw)` validates the same envelope and returns source AK1 group and optional AK2 transaction controls/type, A/E/R outcome and error segments. A, E and rejection/error codes remain distinct; a transport receipt never supplies a functional acceptance. Multi-transaction 997 responses are rejected for explicit mapping.

## Outgoing documents

`buildX12(type, input, now, control)` emits `997`, `855`, `856` or `810`, with padded ISA IDs, UTC envelope date/time, matching controls and computed SE/GE/IEA counts. `control` is an exact nine-digit interchange control. Group/transaction controls can be supplied separately; default is that same control. IDs are supplied in outbound sender-to-receiver order. Test usage (`T`) is the default; production usage is an explicit input.

The exported `X12Input` and `X12Line` interfaces define the contract:

- Common: `senderId`, `receiverId`, optional qualifiers, usage indicator and separate group/transaction controls.
- 997: source group/transaction controls, source transaction type/functional group and A/R acknowledgment.
- 855: PO number/date, original lines and their IA/IB/IR/IQ status, optional acknowledged quantity/date/reason and AD/AC/RD acknowledgment type. Reasons use the supported N9/MSG detail loop.
- 856: shipment ID/date, PO number and nonempty cartons with unique valid SSCCs and exact item quantities. The hierarchy is shipment → order → pack → item (`0001`), MAN GM includes AI 00 plus SSCC, and CTT counts HL segments.
- 810: invoice number/date, PO number/date, invoiced lines and `totalCents` as integer cents for TDS. Currency is USD. The domain calculates and reconciles the authorized invoice total; this serializer does not invent freight, tax, discounts or payment terms.

The builder rejects delimiter injection, unsupported character encodings, malformed product identifiers/units/decimals and invalid/duplicate carton SSCCs. Retailer routing, carrier/weight details, pallets, retailer-specific segments, deadline rules and label artwork require an explicitly reviewed partner map.

## SSCC and labels

`validateGs1Prefix` checks a numeric 4–12 digit company-prefix shape. It cannot establish ownership: retain the owner's GS1 prefix certificate separately. `issueSscc(prefix, sequence, extensionDigit)` constructs the 17-digit extension/prefix/serial body and its Mod-10 check digit, preserving leading zeroes and rejecting sequence overflow. The domain allocates unique sequences atomically and persists the resulting SSCC on the carton. Reprints call the renderers with that stored value and never issue another number.

`gs1128Svg` encodes Start C, FNC1, AI 00, ten numeric data pairs, a weighted Mod-103 symbol check and the stop symbol using Code 128 bar/space widths. The SVG has ten-module quiet zones, 0.508 mm modules and 31.75 mm bar height. `gs1128Zpl` emits a 203 dpi 4×6 inch Zebra label using explicit Code C and FNC1 (`>;>8`) in normal mode, with the already-calculated SSCC check digit. Printer Mod-10 generation is disabled; the printer supplies the mandatory symbol check. Both renderers accept only valid 18-digit SSCCs.

## Evidence and remaining boundaries

Every file in `tests/fixtures/edi/` is authored synthetic test evidence, not a retailer message, provider recording, prefix license or certification. The Target DC 0593 name is an illustrative destination, not an assertion about Target's actual guide or DC address. `850-synthetic.x12` contains MUG-BLUE (4), TOWEL (3) and UNKNOWN (1); its expected 855 demonstrates accepted, quantity-changed and rejected lines. The expected 856 contains two cartons; the expected 810 bills four mugs and two towels for USD 12.00. `bridge-accepted.json` is a test-only synthetic network-edge response, not proof of a send.

Focused checks executed on 17 October 2026: strict independent TypeScript compilation; parsing the synthetic 850; independent outbound segment/control/count assertions; malformed segment counts, mismatched controls, unsupported transactions/purposes, invalid dates and negative quantities; alternative delimiters; SSCC check/overflow checks; and independent ZXing decoding of the generated SVG to `(00)006141410000000012` with GS1 symbology identifier `]C1`. ZXing was a temporary verification tool and is not an application dependency. Physical printing/scanning, live SPS/Orderful transport, actual retailer guides, Target/Walmart/Home Depot certification and device acceptance remain unproven.

## Standards consulted

- [X12's official 004010 basic 850 example](https://x12.org/examples/004010x357/example-01-basic-purchase-order) supplies the official transaction example.
- The licensed [004010 ISA reference](https://www.stedi.com/edi/x12-004010/segment/ISA) and [855](https://www.stedi.com/edi/x12-004010/855), [856](https://www.stedi.com/edi/x12-004010/856), [810](https://www.stedi.com/edi/x12-004010/810) and [997](https://www.stedi.com/edi/x12-004010/997) reference tables describe the envelope, transaction order and hierarchy. These are general reference material, not retailer implementation guides.
- [GS1 US SSCC structure](https://www.gs1us.org/upcs-barcodes-prefixes/serialized-shipping-container-codes) specifies the extension, 4–12 digit company prefix, serial reference and check digit.
- [GS1's barcode format guidance](https://support.gs1.org/support/solutions/articles/43000734455-what-is-the-format-of-gs1-128-) describes FNC1, data, symbol check and quiet zones; [GS1's check digit service](https://www.gs1.org/services/check-digit-calculator) describes GS1 identifier checks.
- [Zebra's official Code 128 programming reference](https://docs.zebra.com/us/en/printers/software/zpl-pg/c-zpl-zpl-commands/r-zpl-bc.html) documents Code C, FNC1 and printer check-digit modes.
