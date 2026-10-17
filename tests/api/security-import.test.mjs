import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { installation, basics, buy, receive } from "./harness.mjs";
const native = (quantity = "1") => ({
  namespace: "sheet",
  sourceVersion: "v1",
  exportedAt: "2026-10-13T00:00:00Z",
  filters: "all",
  cutoffTimezone: "Australia/Brisbane",
  currency: "USD",
  mappingRevision: "1",
  files: [
    {
      kind: "items",
      name: "items.csv",
      csv: "key,sku,name,barcode,unit,packSize\ni,IMPORT,Imported item,,each,0.5\n",
    },
    {
      kind: "locations",
      name: "locations.csv",
      csv: "key,name,warehouse,kind\nl,Import bin,Main,bin\n",
    },
    {
      kind: "parties",
      name: "parties.csv",
      csv: "key,name,kind\ns,Source supplier,supplier\nc,Source customer,customer\n",
    },
    {
      kind: "positions",
      name: "positions.csv",
      csv: `key,itemKey,locationKey,status,quantity,unit,cost\np,i,l,sellable,${quantity},each,0.1\n`,
    },
  ],
});
async function freeze(h, b) {
  for (const stage of ["mapped", "reconciled", "shadow", "frozen"])
    b = await h.command("import.review", {
      batchId: b.id,
      version: b.version,
      stage,
      reason: "Reviewed and reconciled",
    });
  return b;
}
async function post(h, input = native()) {
  let b = await h.command("import.stage", input);
  assert.deepEqual(b.errors, []);
  b = await freeze(h, b);
  return h.command("import.commit", { batchId: b.id, version: b.version });
}

test("native import graph revisions, grouped lines, frontier and safe undo", async (t) => {
  const h = await installation();
  t.after(() => h.close());
  const original = await post(h);
  assert.equal((await h.state()).positions[0].quantity, "1");
  let same = await h.command("import.stage", native());
  same = await freeze(h, same);
  await h.command("import.commit", { batchId: same.id, version: same.version });
  assert.equal((await h.state()).positions[0].quantity, "1");
  let changed = await h.command("import.stage", native("1.5"));
  assert.equal(changed.errors[0].code, "REVISION_REVIEW");
  changed = await h.command("import.revise", {
    batchId: changed.id,
    version: changed.version,
    decisions: [{ kind: "positions", key: "p", action: "replace" }],
    reason: "Correct original spreadsheet after reconciliation",
  });
  assert.deepEqual(changed.errors, []);
  changed = await freeze(h, changed);
  changed = await h.command("import.commit", {
    batchId: changed.id,
    version: changed.version,
  });
  assert.equal((await h.state()).positions[0].quantity, "1.5");
  await h.command("import.undo", {
    batchId: changed.id,
    version: changed.version,
    reason: "Restore original opening count",
  });
  assert.equal((await h.state()).positions[0].quantity, "1");
  const bad = native();
  bad.files[0].csv += "i,SECOND,Duplicate,,each,1\n";
  const dup = await h.command("import.stage", bad);
  assert.ok(dup.errors.some((e) => e.code === "DUPLICATE"));
  await h.command(
    "import.review",
    {
      batchId: dup.id,
      version: dup.version,
      stage: "mapped",
      reason: "Cannot proceed",
    },
    { error: "IMPORT_ERRORS" },
  );
  const orphan = native();
  orphan.files[3].csv =
    "key,itemKey,locationKey,status,quantity,unit,cost\nnew,unknown,l,sellable,1,each,0\n";
  const broken = await h.command("import.stage", orphan);
  assert.ok(broken.errors.some((e) => e.code === "ORPHAN"));
  const grouped = native();
  grouped.files = grouped.files.slice(0, 3);
  grouped.files.push({
    kind: "orders",
    name: "orders.csv",
    csv: "key,orderKey,customerKey,itemKey,quantity,unit,promiseDate\na,ORDER-A,c,i,0.1,each,2026-11-01\nb,ORDER-A,c,i,0.2,each,2026-11-01\n",
  });
  const groupedBatch = await post(h, grouped);
  const state = await h.invariant();
  assert.equal(state.orders.length, 1);
  assert.equal(state.orders[0].lines.length, 2);
  assert.equal(
    groupedBatch.postedRows.filter((r) => r.kind === "orders").length,
    2,
  );
  const revisedOrder = structuredClone(grouped);
  revisedOrder.files[3].csv = revisedOrder.files[3].csv.replace(
    "a,ORDER-A,c,i,0.1,each",
    "a,ORDER-A,c,i,0.4,each",
  );
  let revised = await h.command("import.stage", revisedOrder);
  revised = await h.command("import.revise", {
    batchId: revised.id,
    version: revised.version,
    decisions: [{ kind: "orders", key: "a", action: "replace" }],
    reason: "Correct imported open order quantity",
  });
  revised = await freeze(h, revised);
  revised = await h.command("import.commit", {
    batchId: revised.id,
    version: revised.version,
  });
  assert.equal(
    (await h.state()).reservations.reduce(
      (sum, r) => sum + BigInt(r.quantity),
      0n,
    ),
    600000n,
  );
  await h.command("import.undo", {
    batchId: revised.id,
    version: revised.version,
    reason: "Restore original open order and exact reservations",
  });
  const restoredOrder = await h.invariant();
  assert.deepEqual(restoredOrder.orders, state.orders);
  assert.deepEqual(restoredOrder.reservations, state.reservations);
  const addedLine = structuredClone(grouped);
  addedLine.files[3].csv += "c,ORDER-A,c,i,0.1,each,2026-11-01\n";
  await post(h, addedLine);
  assert.equal((await h.state()).orders.length, 1);
  assert.equal((await h.state()).orders[0].lines.length, 3);
  const changedCustomer = structuredClone(addedLine);
  changedCustomer.files[2].csv += "c2,Correct customer,customer\n";
  changedCustomer.files[3].csv = changedCustomer.files[3].csv.replaceAll(
    "ORDER-A,c,i",
    "ORDER-A,c2,i",
  );
  let customerRevision = await h.command("import.stage", changedCustomer);
  customerRevision = await h.command("import.revise", {
    batchId: customerRevision.id,
    version: customerRevision.version,
    decisions: ["a", "b", "c"].map((key) => ({
      kind: "orders",
      key,
      action: "replace",
    })),
    reason: "Correct the customer on the reviewed open commitment",
  });
  customerRevision = await freeze(h, customerRevision);
  await h.command("import.commit", {
    batchId: customerRevision.id,
    version: customerRevision.version,
  });
  const corrected = await h.state();
  assert.equal(
    corrected.orders[0].customerId,
    corrected.parties.find((p) => p.name === "Correct customer").id,
  );
  const purchase = native();
  purchase.files = purchase.files.slice(0, 3);
  purchase.files.push({
    kind: "purchaseOrders",
    name: "purchases.csv",
    csv: "key,poKey,supplierKey,itemKey,quantity,unit,price,promiseDate\nx,PO-A,s,i,1,each,0.1,2026-11-01\n",
  });
  await post(h, purchase);
  const supplierRevision = structuredClone(purchase);
  supplierRevision.files[2].csv += "s2,Correct supplier,supplier\n";
  supplierRevision.files[3].csv = supplierRevision.files[3].csv.replace(
    "PO-A,s,i",
    "PO-A,s2,i",
  );
  let supplierBatch = await h.command("import.stage", supplierRevision);
  supplierBatch = await h.command("import.revise", {
    batchId: supplierBatch.id,
    version: supplierBatch.version,
    decisions: [{ kind: "purchaseOrders", key: "x", action: "replace" }],
    reason: "Correct supplier before any receipt",
  });
  supplierBatch = await freeze(h, supplierBatch);
  await h.command("import.commit", {
    batchId: supplierBatch.id,
    version: supplierBatch.version,
  });
  const correctedPO = (await h.state()).purchaseOrders[0];
  assert.equal(correctedPO.supplierSnapshot.name, "Correct supplier");
  assert.equal(correctedPO.supplierId, correctedPO.supplierSnapshot.id);
  await h.command(
    "import.undo",
    {
      batchId: original.id,
      version: original.version,
      reason: "Unsafe under reservations",
    },
    { error: "IMPORT_DEPENDENCY" },
  );
  await h.command("order.cancel", {
    orderId: state.orders[0].id,
    reason: "Release imported promise",
  });
  const captured = await h.command("count.capture", {
    locationId: (await h.state()).locations.find(
      (location) => location.name === "Import bin",
    ).id,
  });
  assert.equal((await h.state()).reservations.length, 0);
  const referenced = await h.command(
    "import.undo",
    {
      batchId: original.id,
      version: original.version,
      reason:
        "Cannot delete catalogue referenced by unreceived documents or counts",
    },
    { error: "IMPORT_DEPENDENCY" },
  );
  assert.ok(
    referenced.error.details.records.some(
      (row) => row.kind === "purchaseOrders" && row.id === correctedPO.id,
    ),
  );
  assert.ok(
    referenced.error.details.records.some(
      (row) => row.kind === "counts" && row.id === captured.id,
    ),
  );
  assert.equal((await h.state()).items.length, 1);
  const stale = await h.command("import.stage", {
    ...native(),
    namespace: "other",
  });
  await h.command("party.save", { name: "New counterparty", kind: "supplier" });
  if (!stale.errors.length)
    await h.command(
      "import.review",
      {
        batchId: stale.id,
        version: stale.version,
        stage: "mapped",
        reason: "stale",
      },
      { error: "STALE_IMPORT" },
    );
  await h.invariant();
});

test("empty downstream import undo restores native snapshot and retains custody", async (t) => {
  const h = await installation();
  t.after(() => h.close());
  const unrelatedStock = await basics(h);
  const po = await buy(h, unrelatedStock, "0.2");
  let staged = await h.command("import.stage", native());
  staged = await freeze(h, staged);
  const commandId = randomUUID();
  const payload = { batchId: staged.id, version: staged.version };
  // A real SQLite failure after native writes must roll the whole publication
  // back while leaving the retained Base job available for exact resumption.
  await h.db
    .prepare(
      "CREATE TRIGGER interrupt_import BEFORE INSERT ON pier_import_graphs BEGIN SELECT RAISE(ABORT,'interrupted publication'); END",
    )
    .run();
  await h.command("import.commit", payload, {
    commandId,
    error: "TRANSACTION",
  });
  const interrupted = await h.state();
  assert.equal(interrupted.items.length, 1);
  assert.equal(interrupted.movements.length, 0);
  assert.equal(interrupted.imports[0].status, "frozen");
  assert.equal(
    await h.db
      .prepare("SELECT COUNT(*) AS n FROM pier_commands WHERE id=?")
      .bind(commandId)
      .first("n"),
    0,
  );
  const pending = await h.db
    .prepare(
      "SELECT id,fingerprint,state,checkpoint FROM ik_jobs WHERE operation_key=?",
    )
    .bind("pier:" + staged.id)
    .first();
  assert.equal(pending.state, "queued");
  assert.equal(pending.checkpoint, 0);
  await h.db.prepare("DROP TRIGGER interrupt_import").run();
  await h.command("import.commit", payload, { error: "IDEMPOTENCY" });
  const b = await h.command("import.commit", payload, { commandId });
  assert.deepEqual(await h.command("import.commit", payload, { commandId }), b);
  const completed = await h.db
    .prepare(
      "SELECT id,fingerprint,state,checkpoint,total FROM ik_jobs WHERE operation_key=?",
    )
    .bind("pier:" + staged.id)
    .first();
  assert.equal(completed.id, pending.id);
  assert.equal(completed.fingerprint, pending.fingerprint);
  assert.equal(completed.state, "completed");
  assert.equal(completed.checkpoint, completed.total);
  assert.deepEqual((await h.state()).imports[0], b);
  await receive(h, unrelatedStock, po, "0.1");
  const unrelated = await h.command("party.save", {
    name: "Unrelated",
    kind: "customer",
  });
  await h.command("import.undo", {
    batchId: b.id,
    version: b.version,
    reason: "Withdraw untouched migration",
  });
  const s = await h.state();
  assert.equal(s.items.length, 1);
  assert.equal(s.items[0].id, unrelatedStock.item.id);
  assert.equal(s.movements.length, 1);
  assert.ok(s.parties.some((p) => p.id === unrelated.id));
  assert.equal(s.imports[0].status, "undone");
  assert.ok(s.imports[0].source.artifacts[0].original.base64);
  await receive(h, unrelatedStock, po, "0.1");
  assert.equal((await h.state()).positions[0].quantity, "0.2");
  const bulk = native();
  bulk.namespace = "warehouse-catalogue";
  bulk.files = [
    {
      kind: "items",
      name: "catalogue.csv",
      csv:
        "key,sku,name,barcode,unit,packSize\n" +
        Array.from(
          { length: 150 },
          (_, index) =>
            `bulk-${index},BULK-${index},Bulk product ${index},,each,1\n`,
        ).join(""),
    },
    {
      kind: "locations",
      name: "bins.csv",
      csv: "key,name,warehouse,kind\nbulk-bin,Bulk bin,Main,bin\n",
    },
    {
      kind: "positions",
      name: "stock.csv",
      csv:
        "key,itemKey,locationKey,status,quantity,unit,cost\n" +
        Array.from(
          { length: 150 },
          (_, index) =>
            `position-${index},bulk-${index},bulk-bin,sellable,0.1,each,0.25\n`,
        ).join(""),
    },
  ];
  const large = await post(h, bulk);
  const exported = await (await h.request("/api/pier/export")).json();
  const job = exported.importJournal.jobs.find(
    (job) => job.operationKey === `pier:${large.id}`,
  );
  assert.equal(job.state, "completed");
  assert.equal(job.checkpoint, job.total);
  for (const artifact of large.source.artifacts)
    assert.ok(
      exported.importJournal.originals.some(
        (original) =>
          original.jobId === job.id &&
          original.sha256 === artifact.sha256 &&
          original.size > 0,
      ),
    );
  assert.equal(
    (await h.state()).positions.filter(
      (position) => position.quantity === "0.1",
    ).length,
    150,
  );
  await h.command("import.undo", {
    batchId: large.id,
    version: large.version,
    reason: "Undo untouched warehouse catalogue with complete native journal",
  });
  assert.equal((await h.state()).items.length, 1);
  await h.invariant();
});

test("roles, agent preparation, revoked session, stale human approval and direct HTTP denial", async (t) => {
  const h = await installation();
  t.after(() => h.close());
  const b = await basics(h);
  // Local mail is suppressed, so the member signs in as the local dev persona.
  async function persona(as) {
    const entered = await fetch(`${h.origin}/auth/dev/enter?as=${as}`, {
      redirect: "manual",
      headers: { "x-rer-dev-key": h.devKey },
    });
    assert.equal(entered.status, 303, await entered.text());
    const cookie = entered.headers
      .getSetCookie()
      .map((v) => v.split(";")[0])
      .join("; ");
    const session = await (
      await h.request("/auth/session", { as: cookie })
    ).json();
    return { cookie, session };
  }
  const member = await persona("member");
  const run = (type, payload, opts = {}) =>
    h.command(type, payload, { as: member.cookie, ...opts });
  await run(
    "item.save",
    { sku: "DENIED", name: "Denied", unit: "each", packSize: "1" },
    { error: "FORBIDDEN" },
  );
  await h.command("role.set", {
    operatorId: member.session.operator.id,
    role: "agent",
  });
  const agentDraft = await run("po.draft", {
    supplierId: b.supplier.id,
    promiseDate: "2026-11-01",
    reason: "Prepared by owner agent",
    lines: [{ itemId: b.item.id, quantity: "1", price: "1" }],
  });
  await run(
    "po.approve",
    { poId: agentDraft.id, version: agentDraft.version },
    { error: "FORBIDDEN" },
  );
  await run(
    "count.capture",
    { locationId: b.source.id },
    { error: "FORBIDDEN" },
  );
  await run(
    "role.set",
    { operatorId: member.session.operator.id, role: "owner" },
    { error: "FORBIDDEN" },
  );
  await h.command("role.set", {
    operatorId: member.session.operator.id,
    role: "buyer",
  });
  await run("po.approve", { poId: agentDraft.id, version: agentDraft.version });
  await run(
    "order.create",
    {
      customerId: b.customer.id,
      lines: [{ itemId: b.item.id, quantity: "1" }],
    },
    { error: "FORBIDDEN" },
  );
  await h.command("role.set", {
    operatorId: member.session.operator.id,
    role: "viewer",
  });
  await h.command(
    "po.commit",
    { poId: agentDraft.id, version: agentDraft.version },
    { error: "APPROVER_REVOKED" },
  );
  await h.command("role.set", {
    operatorId: member.session.operator.id,
    role: "warehouse",
  });
  await run(
    "po.approve",
    { poId: agentDraft.id, version: agentDraft.version },
    { error: "FORBIDDEN" },
  );
  await h.request("/auth/session/revoke", {
    method: "POST",
    body: { sessionId: member.session.id },
  });
  const denied = await h.request("/api/pier/commands", {
    method: "POST",
    as: member.cookie,
    body: {
      commandId: randomUUID(),
      type: "count.capture",
      payload: { locationId: b.source.id },
    },
  });
  assert.equal(denied.status, 401);
  await h.invariant();
});

test("native import reads USD by default, refuses an unknown currency naming the row, and values AUD rows through the batch's reviewed rate", async (t) => {
  const h = await installation();
  t.after(() => h.close());
  const input = (positions, extra = {}) => ({
    namespace: "mixed", sourceVersion: "v1", exportedAt: "2026-10-13T00:00:00Z", filters: "all", cutoffTimezone: "America/Chicago", mappingRevision: "1", ...extra,
    files: [
      { kind: "items", name: "items.csv", csv: "key,sku,name,barcode,unit,packSize\ni1,MUG,Mug,,each,1\ni2,TEAPOT,Teapot,,each,1\n" },
      { kind: "locations", name: "locations.csv", csv: "key,name,warehouse,kind\nl,Bin 1,Main,bin\n" },
      { kind: "parties", name: "parties.csv", csv: "key,name,kind\ns,Sydney supplier,supplier\n" },
      { kind: "positions", name: "positions.csv", csv: `key,itemKey,locationKey,status,quantity,unit,cost,currency\n${positions}` },
      { kind: "purchaseOrders", name: "purchase-orders.csv", csv: "key,poKey,supplierKey,itemKey,quantity,unit,price,promiseDate,currency\npl,PO1,s,i2,6,each,20,2026-11-01,AUD\n" },
    ],
  });
  const rows = "p1,i1,l,sellable,10,each,2.50,\np2,i2,l,sellable,4,each,10,AUD\n";
  const refused = await h.command("import.stage", input("p1,i1,l,sellable,10,each,2.50,XYZ\n"), { error: "CURRENCY" });
  assert.match(refused.error.message, /Row 2 of positions\.csv/);
  let b = await h.command("import.stage", input(rows));
  assert.equal(b.currency, "USD");
  assert.equal(b.source.records.find((r) => r.sourceId === "p1").payload.currency, "USD");
  assert.ok(b.errors.some((e) => e.code === "CONVERSION_RATE" && /Row 3 of positions\.csv is in AUD/.test(e.message)));
  b = await h.command("import.stage", input(rows, { conversionRates: { AUD: "0.65" } }));
  assert.deepEqual(b.errors, []);
  b = await freeze(h, b);
  b = await h.command("import.commit", { batchId: b.id, version: b.version });
  assert.equal(b.conversionRates.AUD.rate, "0.65");
  const state = await h.state();
  const line = state.purchaseOrders[0].lines[0];
  assert.equal(line.price, "13");
  assert.deepEqual(line.source, { price: "20", currency: "AUD", usdRate: "0.65" });
  const report = await (await h.request("/api/pier/reports")).json();
  assert.equal(report.valuation.total, "51.000000000000");
});
