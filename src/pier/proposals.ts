import { kitDefinition } from './kits';
import { planningWarehouses, supplyPosition, signedQuantity } from './replenishment-position';
import {
  decimal,
  format,
  get,
  row,
  text,
  fresh,
  fail,
  requireRole,
  min,
  positions,
  movementFrontier,
  type Context,
  type Row,
} from "./model";
import { warehouse } from "./warehouse";
export function reorder(c: Context) {
  return c.s.items
    .filter((i) => !i.archived && (!kitDefinition(c.s,i.id) || c.s.movements.filter(m=>m.itemId===i.id).reduce((n,m)=>n+BigInt(m.quantity),0n)>0n))
    .map((i) => {
      const demand = planningWarehouses(c).reduce((n,warehouse)=>n+signedQuantity(supplyPosition(c,i.id,warehouse).openDemand),0n);
      const onHand = positions(c.s)
        .filter((p) => p.itemId === i.id && p.status === "sellable")
        .reduce((n, p) => n + decimal(p.quantity), 0n);
      const expected = c.s.purchaseOrders
        .filter((po) => po.status === "committed")
        .flatMap((po) => po.lines.filter((l: any) => l.itemId === i.id))
        // An accepted over-receipt leaves nothing more expected, never less than nothing.
        .reduce((n, l) => { const open = decimal(l.quantity) - decimal(l.received); return n + (open > 0n ? open : 0n) }, 0n);
      const shortage =
        demand > onHand + expected ? demand - onHand - expected : 0n;
      return {
        itemId: i.id,
        demand: format(demand),
        onHand: format(onHand),
        expected: format(expected),
        minimum: format(shortage),
        recommended: format(shortage),
        stretch: format(shortage),
        terms: c.s.supplierItems.filter((t) => t.itemId === i.id),
        assumption:
          "Observed orders only; unmet and stockout-censored demand are explicit. No forecast establishes physical stock.",
      };
    });
}
export function proposals(c: Context, type: string, p: any): Row | undefined {
  if (!type.startsWith("proposal.")) return;
  if (type === "proposal.prepare") {
    requireRole(c, ["buyer", "operator", "warehouse", "agent"]);
    if (
      !["replenishment", "reallocation", "count-drift", "migration"].includes(
        p.kind,
      )
    )
      fail("PROPOSAL", "Unknown preparation kind.");
    if (!Array.isArray(p.evidence) || !p.evidence.length)
      fail("EVIDENCE", "Cite at least one record or observed evidence.");
    return row(c, "proposals", {
      kind: p.kind,
      preparation: { actorId: c.actor.id, at: c.now },
      assumptions: text(p.assumptions),
      evidence: p.evidence.map((e: any) => text(e)),
      plan: p.plan ?? {},
      snapshotVersion: c.s.version,
      context: {
        reorder: reorder(c),
        frontier: movementFrontier(c.s),
        orders: c.s.orders.map((o) => ({
          id: o.id,
          version: o.version,
          customerId: o.customerId,
          promiseDate: o.promiseDate,
        })),
        purchaseOrders: c.s.purchaseOrders.map((po) => ({ id: po.id, version: po.version })),
        counts: c.s.counts.map((count) => ({ id: count.id, version: count.version })),
        imports: c.s.imports.map((b) => ({ id: b.id, version: b.version })),
      },
      status: "prepared",
    });
  }
  const proposal = get(c.s, "proposals", p.proposalId);
  if (!['replenishment', 'reallocation', 'count-drift', 'migration'].includes(proposal.kind))
    fail('PROPOSAL', 'Use this preparation’s exact action review command.');
  requireRole(
    c,
    proposal.kind === "replenishment"
      ? ["buyer"]
      : proposal.kind === "reallocation"
        ? ["operator"]
        : proposal.kind === "count-drift"
          ? ["warehouse"]
          : [],
  );
  fresh(proposal, p.version);
  if (type === "proposal.approve") {
    if (proposal.status !== "prepared")
      fail("PROPOSAL_STATE", "Proposal is already reviewed.");
    if (c.s.version !== proposal.snapshotVersion + 1)
      fail(
        "STALE",
        "Preparation inputs changed. Prepare again using current evidence.",
      );
    proposal.approval = {
      actorId: c.actor.id,
      version: proposal.version,
      at: c.now,
    };
    proposal.status = "approved";
    proposal.approvedAtVersion = c.s.version;
    return proposal;
  }
  if (type !== "proposal.execute") fail("COMMAND", "Unknown proposal command.");
  if (
    proposal.status !== "approved" ||
    c.s.version !== proposal.approvedAtVersion + 1
  )
    fail(
      "STALE",
      "Approval is missing or inputs changed. Prepare and review again.",
    );
  if (proposal.kind === "reallocation") {
    const plan = proposal.plan,
      from = get(c.s, "orders", plan.fromOrderId),
      to = get(c.s, "orders", plan.toOrderId);
    const line = to.lines.find(
      (l: any) =>
        l.itemId === plan.itemId &&
        decimal(l.quantity) > decimal(l.dispatched) + decimal(l.cancelled),
    );
    if (!line)
      fail("REALLOCATION", "Destination has no matching unshipped demand.");
    let q = decimal(plan.quantity, true);
    const assigned = c.s.reservations
      .filter((r) => r.orderLineId === line.id)
      .reduce((n, r) => n + BigInt(r.quantity), 0n);
    if (
      q >
      decimal(line.quantity) -
        decimal(line.dispatched) -
        decimal(line.cancelled) -
        assigned
    )
      fail("REALLOCATION", "Quantity exceeds destination unreserved demand.");
    const sources = c.s.reservations.filter(
      (r) => r.orderId === from.id && r.itemId === plan.itemId,
    );
    if (sources.reduce((n, r) => n + BigInt(r.quantity), 0n) < q)
      fail("REALLOCATION", "Source reservations changed.");
    for (const r of sources) {
      const n = min(q, BigInt(r.quantity));
      if (n) {
        r.quantity = (BigInt(r.quantity) - n).toString();
        c.s.reservations.push({
          ...r,
          id: crypto.randomUUID(),
          orderId: to.id,
          orderLineId: line.id,
          quantity: n.toString(),
        });
        q -= n;
      }
    }
    c.s.reservations = c.s.reservations.filter((r) => BigInt(r.quantity) > 0n);
    from.version++;
    to.version++;
  } else if (proposal.kind === "count-drift") {
    warehouse(c, "count.approve", proposal.plan);
  } else {
    proposal.executionNote =
      "Reviewed preparation retained. Commit the exact PO or import through its separately approved command.";
  }
  proposal.status = "executed";
  proposal.version++;
  return proposal;
}
