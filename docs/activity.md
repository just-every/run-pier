# Activity and proposals

## Find where a number came from

**Activity** lists every movement with its signed quantity, source document, person, reason and command. Choose **History** on a Stock row, or filter by item, and follow the source link to the order, receipt, transfer, count or import that made it. **Export records, costs and provenance** downloads it all.

## Proposals from an agent

An agent, or anyone preparing work for review, uses **Prepare evidence-backed proposal** in Activity: a replenishment with minimum, recommended and stretch quantities, a shortage reallocation, a count investigation or a migration step, with its evidence. A person with the right role approves the exact version before anything is applied, through the same commands as everyone else. Agents never approve their own work or post stock.

## Ask current records and review purchase changes

Activity offers stock availability by item and late committed purchases. Stock answers cite permitted bins, base-unit quantities and the committed state version. A restricted reader gets only granted stock, with no customer details or costs. Late means an outstanding purchase quantity whose requested date is before today's UTC date; an unreported delivery remains uncertain.

Select draft purchases, enter a proposed date and reason, then preview the exact before and after rows and retained USD cost impact. Update the plan date before approval if needed. A buyer or owner approves each row separately; it becomes an ordinary purchase revision and still needs separate purchase approval and commitment. Applied rows link back to Activity and retain their command identity.

The bulk command door also accepts reviewed customer promises through the existing `order.repromise` command. Its exact recipient consent, calculated supply fingerprint and ordinary authority remain required. The bulk interface currently offers draft purchase dates only. Any intervening business change makes a plan stale; prepare a new preview. An applied row updates the plan's input frontier so another unchanged row can be reviewed. Preview and edit retain the plan without changing stock, purchase records or outbound work.

These answers do not yet explain a restricted order's shortage or simulate margins, suppliers or allocations. No paid model request is needed for these deterministic records.
