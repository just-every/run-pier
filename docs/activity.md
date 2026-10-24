# Activity and proposals

## Find where a number came from

**Activity** lists every movement with its signed quantity, source document, person, reason and command. Choose **History** on a Stock row, or filter by item, and follow the source link to the order, receipt, transfer, count or import that made it. **Export records, costs and provenance** downloads it all.

Decision history includes accepted and refused scans, safe before and after business values, approval identities and provider attempts. The attempt is retained before the request leaves Pier. Its outcome is appended separately, so an interrupted request remains uncertain. Expand **Recorded change details** for source versions, external identities and command links. Filter by item, document, person or any recorded connector; exported history uses the same entries.

## Proposals from an agent

An agent, or anyone preparing work for review, uses **Prepare evidence-backed proposal** in Activity: a replenishment with minimum, recommended and stretch quantities, a shortage reallocation, a count investigation or a migration step, with its evidence. A person with the right role approves the exact version before anything is applied, through the same commands as everyone else. Agents never approve their own work or post stock. Item checks and bulk plans have their own exact-action review; they do not appear as migration proposals.

## Ask current records

**Live operational questions** offers stock availability, order shortages, late purchases, goods margin and comparisons of supplier, purchase date or reservation allocation. Answers cite current records, quantities, the committed version, the observation time and missing evidence. No paid model is needed.

A restricted warehouse reader gets granted-bin stock. An order explanation requires access to every bin in that order's warehouse and excludes outside allocations. It exposes only operational order identity, demand, hard reservations and permitted stock; customer identity, costs and outside stock stay private. A partial-bin grant cannot infer the warehouse's whole demand. Revocation removes the answer's underlying authority.

Margin uses the same retained shipment and reservation cost layers as Reports. Unpriced or unvalued demand remains unknown; it is never assigned zero cost. This operational goods comparison does not reconcile credits, tax or shipping revenue. Supplier comparisons validate an ordinary purchase revision on an isolated copy, including current supplier prices and terms. A draft is not committed inbound supply, so changing it does not change customer promises. Allocation comparisons show the donor's lost reservations and the recipient's gain, together with recalculated supply estimates; no live stock, reservation or message changes.

## Review bulk work

Select draft purchases, enter a proposed date and reason, then preview exact before and after rows, USD cash changes, affected customer promises and quantities by item. Update the plan date before approval if needed. A buyer or owner approves each row separately; it becomes an ordinary purchase revision and still needs separate purchase approval and commitment.

**Review customer promises** selects the exact backordered lines, their calculated dates and each recipient. Explicitly approve the recipients and dates before preview. Edit recipients or selected lines and update the plan before approving each order. Applying a row queues its exact reviewed customer message; reserved units keep their original promise. Customer promise approval follows the ordinary buyer, operator or owner authority.

Any intervening business change makes a plan stale; prepare a fresh preview. An applied row advances the plan's frontier so another unchanged row can be reviewed. Applied rows retain their command identity and Activity link. Preview and edit never change stock, purchase records or outgoing work.

## Inspect retention and erasure

Owners expand **Retention and erasure** in Activity, select a recorded subject and inspect its dependencies and holds. A legal or accounting hold blocks erasure. An unfinished remote request or uncertain mail must be reconciled first. Unsupported import, customer file, channel and EDI custody is listed explicitly and refuses subject erasure.

For supported dependencies, explicit irreversible confirmation removes private originals and derived copies, anonymizes retained business snapshots, cancels local correspondence and pauses affected policies. Operator erasure revokes local access and replaces the personal label with **Anonymous operator**. Opaque identities, stock movements, reservations and financial facts remain attributable without retaining the erased identity. Every operation records a content-free receipt and advances the older-archive redaction fence.

This conservative owner-only default awaits policy approval under DATA-002 and AUDIT-001. There is no automatic destructive sweep. Unlinked originals require explicit association before they can be attributed to a subject. Offline copies, downloaded documents, physical labels, already delivered messages and provider-held data remain outside local deletion.
