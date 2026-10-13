import test from "node:test";
import assert from "node:assert/strict";
import { installation, basics, buy, receive } from "./harness.mjs";

async function cutover(h, input) {
  let batch = await h.command("import.stage", input);
  assert.deepEqual(batch.errors, []);
  for (const stage of ["mapped", "reconciled", "shadow", "frozen"])
    batch = await h.command("import.review", {
      batchId: batch.id,
      version: batch.version,
      stage,
      reason: "Reconcile exact exported allocation before cutover",
    });
  return h.command("import.commit", {
    batchId: batch.id,
    version: batch.version,
  });
}
function allocation(state) {
  return state.orders
    .flatMap((order) =>
      order.lines.map((line) => ({
        customer: state.parties.find((party) => party.id === order.customerId)
          .name,
        sku: state.items.find((item) => item.id === line.itemId).sku,
        reserved: line.reserved,
        backorder: line.backorder,
        bins: state.reservations
          .filter((r) => r.orderLineId === line.id)
          .map((r) => ({
            bin: state.locations.find((l) => l.id === r.locationId).name,
            quantity: r.quantity,
          }))
          .sort((a, b) => a.bin.localeCompare(b.bin)),
      })),
    )
    .sort((a, b) => a.customer.localeCompare(b.customer));
}

test("native exit preserves approved allocation and explicit backorders across a fresh cutover", async () => {
  let h = await installation();
  try {
    const b = await basics(h),
      po = await buy(h, b, "1");
    await receive(h, b, po, "1");
    const second = await h.command("party.save", {
      name: "Priority customer",
      kind: "customer",
    });
    const firstOrder = await h.command("order.create", {
      customerId: b.customer.id,
      promiseDate: "2026-11-01",
      lines: [{ itemId: b.item.id, quantity: "1" }],
    });
    const secondOrder = await h.command("order.create", {
      customerId: second.id,
      promiseDate: "2026-11-01",
      lines: [{ itemId: b.item.id, quantity: "1" }],
    });
    const proposal = await h.command("proposal.prepare", {
      kind: "reallocation",
      assumptions: "Owner gives the second customer priority",
      evidence: [firstOrder.id, secondOrder.id],
      plan: {
        fromOrderId: firstOrder.id,
        toOrderId: secondOrder.id,
        itemId: b.item.id,
        quantity: "1",
      },
    });
    await h.command("proposal.approve", {
      proposalId: proposal.id,
      version: proposal.version,
    });
    await h.command("proposal.execute", {
      proposalId: proposal.id,
      version: proposal.version,
    });
    const expected = allocation(await h.invariant());
    const snapshot = await (await h.request("/api/pier/native-export")).json();
    await h.close();
    h = null;
    h = await installation();
    const malformed = structuredClone(snapshot);
    malformed.files.find((file) => file.kind === "reservations").csv =
      "key,orderLineKey,locationKey,quantity,unit\n";
    const incomplete = await h.command("import.stage", malformed);
    assert.ok(
      incomplete.errors.some((error) => error.code === "RESERVATION_PLAN"),
    );
    assert.equal((await h.state()).movements.length, 0);
    const imported = await cutover(h, snapshot);
    assert.deepEqual(allocation(await h.invariant()), expected);
    const before = await h.state();
    await cutover(h, snapshot);
    const unchanged = await h.invariant();
    assert.deepEqual(unchanged.reservations, before.reservations);
    assert.deepEqual(unchanged.movements, before.movements);
    assert.equal(
      imported.source.records.filter((r) => r.kind === "reservations").length,
      2,
    );
  } finally {
    await h?.close();
  }
});
