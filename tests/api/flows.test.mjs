import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { installation, basics, buy, receive, parse } from "./harness.mjs";

test("Pier public Worker and D1 wholesale journey", async (t) => {
  const outbound = [];
  const outboundService = request => { outbound.push(new URL(request.url).origin); throw new Error('Native stock does not authorize external access.'); };
  const h = await installation({ outboundService });
  t.after(async () => { assert.deepEqual(outbound, [], "the complete native stock/import/return/count journey requires no external account or outbound request"); await h.close(); });
  let b, po, receipt, order, shipment, returned;
  await t.test(
    "01 item definitions and archive preserve used history",
    async () => {
      assert.equal((await h.state()).items.length, 0);
      b = await basics(h);
      await h.command(
        "item.save",
        { sku: "BOLT", name: "Duplicate", unit: "each", packSize: "1" },
        { error: "DUPLICATE" },
      );
      await h.command(
        "item.save",
        { sku: "BAD", name: "Bad", unit: "each", packSize: "0.0000001" },
        { error: "DECIMAL" },
      );
      await h.invariant();
    },
  );
  await t.test("02 supplier terms are exact snapshots", async (t) => {
    const terms = await h.command("supplierItem.save", {
      supplierId: b.supplier.id,
      itemId: b.item.id,
      code: "M-B",
      packSize: "0.5",
      price: "0.25",
      minimum: "0",
      leadDays: 3,
    });
    po = await buy(h, b);
    assert.equal(po.lines[0].terms.id, terms.id);
    assert.equal(po.lines[0].terms.price, "0.25");
    const historyInstallation = await installation({ outboundService });
    t.after(() => historyInstallation.close());
    const historyBasics = await basics(historyInstallation);
    const historyItem = await historyInstallation.command("item.save", {
      sku: "synthetic-pier-2", name: "Historical supplier terms", unit: "each", packSize: "1",
    });
    const originalTerms = await historyInstallation.command("supplierItem.save", {
      supplierId: historyBasics.supplier.id, itemId: historyItem.id, code: "synthetic-pier-2-original",
      packSize: "1", price: "2.5", minimum: "1", leadDays: 3,
    });
    const historicalPo = await historyInstallation.command("po.draft", {
      supplierId: historyBasics.supplier.id, promiseDate: "2026-11-01", reason: "Retain agreed supplier terms",
      lines: [{ itemId: historyItem.id, quantity: "4", price: "2.5" }],
    });
    await historyInstallation.command("po.approve", { poId: historicalPo.id, version: historicalPo.version });
    await historyInstallation.command("po.commit", { poId: historicalPo.id, version: historicalPo.version });
    const historicalReceipt = await historyInstallation.command("receipt.create", {
      poId: historicalPo.id, supplierReference: "synthetic-pier-2-receipt",
      lines: [{ poLineId: historicalPo.lines[0].id, locationId: historyBasics.source.id, quantity: "2", cost: "2.5" }],
    });
    const originalState = await historyInstallation.state();
    const originalPo = originalState.purchaseOrders.find((p) => p.id === historicalPo.id);
    const changedTerms = await historyInstallation.command("supplierItem.save", {
      ...originalTerms, code: "synthetic-pier-2-revised", packSize: "2", price: "3.75", minimum: "2", leadDays: 8,
    });
    assert.equal(changedTerms.version, originalTerms.version + 1);
    assert.equal(changedTerms.price, "3.75");
    const revisedState = await historyInstallation.state();
    assert.deepEqual(revisedState.supplierItems.find((r) => r.id === changedTerms.id), changedTerms);
    assert.deepEqual(revisedState.purchaseOrders.find((p) => p.id === historicalPo.id), originalPo);
    assert.deepEqual(revisedState.receipts.find((r) => r.id === historicalReceipt.id), historicalReceipt);
    const exportedResponse = await historyInstallation.request("/api/pier/export");
    assert.equal(exportedResponse.status, 200);
    const exported = await exportedResponse.json();
    const retainedLine = exported.purchaseOrders.find((p) => p.id === historicalPo.id).lines[0];
    assert.equal(retainedLine.quantity, "4");
    assert.equal(retainedLine.received, "2");
    assert.equal(retainedLine.price, "2.5");
    assert.deepEqual(retainedLine.terms, originalTerms);
    const retainedReceipt = exported.receipts.find((r) => r.id === historicalReceipt.id);
    assert.equal(retainedReceipt.poId, historicalPo.id);
    assert.equal(retainedReceipt.lines[0].poLineId, retainedLine.id);
    assert.equal(retainedReceipt.lines[0].quantity, "2");
    assert.equal(retainedReceipt.lines[0].cost, "2.5");
    assert.equal(retainedReceipt.lines[0].costTotal, "5.000000000000");
    assert.equal(exported.movements.find((m) => m.id === retainedReceipt.lines[0].movementId).documentId, historicalReceipt.id);
    const history = (s) => ({ supplierItems: s.supplierItems, purchaseOrders: s.purchaseOrders,
      receipts: s.receipts, movements: s.movements, positions: s.positions, commands: s.commands });
    const beforeDuplicate = history(await historyInstallation.state());
    await historyInstallation.command("supplierItem.save", {
      supplierId: historyBasics.supplier.id, itemId: historyItem.id, code: "synthetic-pier-2-duplicate",
      packSize: "1", price: "1", minimum: "1", leadDays: 1,
    }, { error: "DUPLICATE" });
    assert.deepEqual(history(await historyInstallation.state()), beforeDuplicate);
    await historyInstallation.invariant();
    await h.invariant();
  });
  await t.test(
    "03 CSV preview review opening inventory and original custody",
    async () => {
      const batch = await h.command("import.stage", {
        namespace: "opening",
        sourceVersion: "sheet-1",
        exportedAt: "2026-10-13T00:00:00Z",
        filters: "all",
        cutoffTimezone: "Australia/Brisbane",
        currency: "USD",
        mappingRevision: "1",
        files: [
          {
            name: "items.csv",
            kind: "items",
            csv: "key,sku,name,barcode,unit,packSize\nbolt2,NUT,Nut,,each,1\n",
          },
          {
            name: "locations.csv",
            kind: "locations",
            csv: "key,name,warehouse,kind\nbin2,C1,North,bin\n",
          },
          {
            name: "positions.csv",
            kind: "positions",
            csv: "key,itemKey,locationKey,status,quantity,unit,cost\nopening1,bolt2,bin2,sellable,0.3,each,0.2\n",
          },
        ],
      });
      assert.deepEqual(batch.errors, []);
      assert.equal((await h.state()).movements.length, 0);
      let review = batch;
      for (const stage of ["mapped", "reconciled", "shadow", "frozen"])
        review = await h.command("import.review", {
          batchId: batch.id,
          version: review.version,
          stage,
          reason: "Reviewed source and reconciled physical count",
        });
      const committed = await h.command("import.commit", {
        batchId: batch.id,
        version: review.version,
      });
      assert.equal(committed.status, "committed");
      assert.equal(committed.source.artifacts.length, 3);
      const replay = await h.command("import.stage", {
        namespace: "opening",
        sourceVersion: "sheet-1",
        exportedAt: "2026-10-13T00:00:00Z",
        filters: "all",
        cutoffTimezone: "Australia/Brisbane",
        currency: "USD",
        mappingRevision: "1",
        files: batch.source.artifacts.map((a, i) => ({
          name: a.name,
          kind: ["items", "locations", "positions"][i],
          csv: Buffer.from(a.original.base64, "base64").toString(),
        })),
      });
      assert.equal(replay.reconciliation.unchangedRows, 3);
      await h.invariant();
    },
  );
  await t.test(
    "04 simultaneous sales reserve last fractional units with durable outcomes",
    async () => {
      receipt = await receive(h, b, po, "1.25");
      const payload = {
          customerId: b.customer.id,
          lines: [{ itemId: b.item.id, quantity: "1" }],
        },
        keys = [randomUUID(), randomUUID()];
      const [a, z] = await Promise.all(
        keys.map((commandId) =>
          h.command("order.create", payload, { commandId }),
        ),
      );
      const s = await h.invariant();
      assert.equal(
        s.reservations
          .filter((r) => r.itemId === b.item.id)
          .reduce((n, r) => n + BigInt(r.quantity), 0n),
        1250000n,
      );
      assert.equal(
        parse(a.lines[0].backorder) + parse(z.lines[0].backorder),
        750000n,
      );
      assert.deepEqual(
        await h.command("order.create", payload, { commandId: keys[0] }),
        a,
      );
      await h.command(
        "order.create",
        { ...payload, promiseDate: "changed" },
        { commandId: keys[0], error: "IDEMPOTENCY" },
      );
      order = a.lines[0].reserved === "1" ? a : z;
    },
  );
  await t.test(
    "05 exact purchase approval and agent preparation leave expected separate",
    async () => {
      const draft = await h.command("po.draft", {
        supplierId: b.supplier.id,
        promiseDate: "2026-12-01",
        reason: "More demand",
        lines: [{ itemId: b.item.id, quantity: "2", price: "0.3" }],
      });
      await h.command(
        "po.commit",
        { poId: draft.id, version: draft.version },
        { error: "APPROVAL" },
      );
      await h.command("po.approve", { poId: draft.id, version: draft.version });
      const revised = await h.command("po.revise", {
        poId: draft.id,
        version: draft.version,
        supplierId: b.supplier.id,
        promiseDate: "2026-12-02",
        reason: "Changed promise",
        lines: [{ itemId: b.item.id, quantity: "3", price: "0.3" }],
      });
      await h.command(
        "po.commit",
        { poId: draft.id, version: draft.version },
        { error: "STALE" },
      );
      await h.command(
        "po.commit",
        { poId: draft.id, version: revised.version },
        { error: "APPROVAL" },
      );
      const proposal = await h.command("proposal.prepare", {
        kind: "replenishment",
        assumptions:
          "Observed backorders and supplier lead time; censored sales are not demand.",
        evidence: [order.id],
        plan: { poId: draft.id },
      });
      await h.command("proposal.approve", {
        proposalId: proposal.id,
        version: proposal.version,
      });
      await h.command("proposal.execute", {
        proposalId: proposal.id,
        version: proposal.version,
      });
      await h.invariant();
    },
  );
  await t.test(
    "05b documents carry their own references and changes name who made them",
    async () => {
      const s = await h.state();
      for (const [rows, prefix] of [
        [s.orders, "SO-"],
        [s.purchaseOrders, "PO-"],
      ]) {
        const references = rows.map((row) => row.reference);
        assert.ok(rows.length >= 2);
        assert.ok(references.every((value) => value.startsWith(prefix)));
        assert.equal(new Set(references).size, rows.length);
      }
      const names = new Map(s.people.map((person) => [person.id, person.name]));
      assert.ok(s.movements.length);
      assert.ok(
        s.movements.every((movement) => names.get(movement.actorId) === "Owner"),
      );
    },
  );
  await t.test(
    "06 partial receipts and failed multi-line receipt are atomic",
    async () => {
      const key = randomUUID(),
        payload = {
          poId: po.id,
          supplierReference: "Partial 2",
          lines: [
            {
              poLineId: po.lines[0].id,
              locationId: b.source.id,
              quantity: "0.1",
              cost: "0.2",
            },
          ],
        };
      const r = await h.command("receipt.create", payload, { commandId: key });
      assert.deepEqual(
        await h.command("receipt.create", payload, { commandId: key }),
        r,
      );
      assert.equal(r.lines[0].costTotal, "0.020000000000");
      const before = (await h.state()).movements.length;
      await h.command(
        "receipt.create",
        {
          ...payload,
          lines: [
            ...payload.lines,
            {
              poLineId: "missing",
              locationId: b.source.id,
              quantity: "1",
              cost: "1",
            },
          ],
        },
        { error: "LINE" },
      );
      assert.equal((await h.state()).movements.length, before);

      const receiptItems = await Promise.all([1, 2].map((n) => h.command("item.save", {
        sku: `synthetic-pier-6-${n}`, name: `Partial receipt item ${n}`, unit: "each", packSize: "0.1",
      })));
      const multiPo = await h.command("po.draft", {
        supplierId: b.supplier.id, destinationWarehouse: "North", promiseDate: "2026-11-01",
        reason: "Receive both lines in parts",
        lines: [{ itemId: receiptItems[0].id, quantity: "3", price: "0.2" },
          { itemId: receiptItems[1].id, quantity: "5", price: "0.35" }],
      });
      await h.command("po.approve", { poId: multiPo.id, version: multiPo.version });
      await h.command("po.commit", { poId: multiPo.id, version: multiPo.version });
      const receiptLines = [{ poLineId: multiPo.lines[0].id, locationId: b.source.id, quantity: "1.2", cost: "0.2" },
        { poLineId: multiPo.lines[1].id, locationId: b.source.id, quantity: "2.5", cost: "0.35" }];
      const multiPayload = { poId: multiPo.id, supplierReference: "synthetic-pier-6-receipt", lines: receiptLines };
      const multiKey = randomUUID();
      const posted = await h.command("receipt.create", multiPayload, { commandId: multiKey });
      const received = await h.state();
      const receivedPo = received.purchaseOrders.find((p) => p.id === multiPo.id);
      for (const [index, expected] of [[0, "1.8"], [1, "2.5"]]) {
        const itemId = receiptItems[index].id;
        const line = receivedPo.lines[index];
        assert.equal(line.received, receiptLines[index].quantity);
        assert.equal(parse(line.quantity) - parse(line.received), parse(expected));
        assert.equal(received.warehouseStocks.find((s) => s.itemId === itemId && s.warehouse === "North").expected, expected);
        assert.equal(received.companyStocks.find((s) => s.itemId === itemId).expected, expected);
        assert.equal(received.movements.filter((m) => m.itemId === itemId && m.status === "sellable").reduce((n, m) => n + BigInt(m.quantity), 0n), parse(receiptLines[index].quantity));
        assert.equal(received.positions.find((p) => p.itemId === itemId && p.locationId === b.source.id && p.status === "sellable").quantity, receiptLines[index].quantity);
        assert.equal(posted.lines[index].poLineId, line.id);
        assert.equal(posted.lines[index].cost, receiptLines[index].cost);
        assert.equal(posted.lines[index].costTotal, ["0.240000000000", "0.875000000000"][index]);
      }
      const receiptBusiness = (s) => ({ purchaseOrders: s.purchaseOrders, receipts: s.receipts,
        movements: s.movements, positions: s.positions, reservations: s.reservations, commands: s.commands });
      assert.deepEqual(await h.command("receipt.create", multiPayload, { commandId: multiKey }), posted);
      assert.deepEqual(receiptBusiness(await h.state()), receiptBusiness(received));
      const secondReceipt = await h.command("receipt.create", {
        ...multiPayload, supplierReference: "synthetic-pier-6-second-receipt",
        lines: [{ ...receiptLines[0], quantity: "0.3" }, { ...receiptLines[1], quantity: "0.5" }],
      });
      const cumulative = await h.state();
      const cumulativePo = cumulative.purchaseOrders.find((p) => p.id === multiPo.id);
      for (const [index, quantity, expected] of [[0, "1.5", "1.5"], [1, "3", "2"]]) {
        const itemId = receiptItems[index].id;
        assert.equal(cumulativePo.lines[index].received, quantity);
        assert.equal(parse(cumulativePo.lines[index].quantity) - parse(quantity), parse(expected));
        assert.equal(cumulative.warehouseStocks.find((s) => s.itemId === itemId && s.warehouse === "North").expected, expected);
        assert.equal(cumulative.movements.filter((m) => m.itemId === itemId && m.status === "sellable").reduce((n, m) => n + BigInt(m.quantity), 0n), parse(quantity));
        assert.equal(cumulative.positions.find((p) => p.itemId === itemId && p.locationId === b.source.id && p.status === "sellable").quantity, quantity);
        assert.equal(secondReceipt.lines[index].costTotal, ["0.060000000000", "0.175000000000"][index]);
      }
      const beforeLimit = receiptBusiness(await h.state());
      await h.command("receipt.create", {
        ...multiPayload, lines: [{ ...receiptLines[0], quantity: "0.1" }, { ...receiptLines[1], quantity: "2.6" }],
      }, { error: "RECEIPT_LIMIT" });
      assert.deepEqual(receiptBusiness(await h.state()), beforeLimit);
      await h.invariant();
    },
  );
  await t.test(
    "07 receipt reversal preserves original evidence and guards reservations",
    async () => {
      const safe = await receive(h, b, po, "0.2");
      await h.command("receipt.reverse", {
        receiptId: safe.id,
        reason: "Duplicate physical receipt, corrected",
      });
      await h.command(
        "receipt.reverse",
        { receiptId: receipt.id, reason: "Cannot remove reserved goods" },
        { error: "DEPENDENCY" },
      );
      await h.invariant();
    },
  );
  await t.test(
    "08 transfer conserves stock and transit cannot be sold",
    async () => {
      await receive(h, b, po, "2");
      const transfer = await h.command("transfer.send", {
        itemId: b.item.id,
        fromLocationId: b.source.id,
        toLocationId: b.destination.id,
        transitLocationId: b.transit.id,
        quantity: "0.5",
        reason: "Move to South",
      });
      assert.equal(
        (await h.state()).positions.find((p) => p.locationId === b.transit.id)
          .available,
        "0",
      );
      const receiptKey = randomUUID();
      const partial = { transferId: transfer.id, version: transfer.version, quantity: "0.2" };
      const arrived = await h.command("transfer.receive", partial, { commandId: receiptKey });
      assert.equal(arrived.received, "0.2");
      assert.equal(arrived.status, "transit");
      assert.deepEqual(await h.command("transfer.receive", partial, { commandId: receiptKey }), arrived);
      const midway = await h.invariant();
      assert.equal(midway.positions.find(p => p.locationId === b.transit.id).quantity, "0.3");
      assert.equal(midway.positions.find(p => p.locationId === b.destination.id).quantity, "0.2");
      const beforeDenied = midway.movements;
      await h.command("transfer.receive", partial, { error: "STALE" });
      await h.command("transfer.receive", { ...partial, version: arrived.version, quantity: "0.4" }, { error: "TRANSFER_QUANTITY" });
      assert.deepEqual((await h.state()).movements, beforeDenied);
      await h.command("transfer.receive", { transferId: transfer.id });
      await h.command("transfer.receive", { transferId: transfer.id }, { error: "TRANSFER_STATE" });
      await h.invariant();
    },
  );
  await t.test(
    "09 partial dispatch consumes only owned reservations and retries once",
    async () => {
      const key = randomUUID(),
        payload = {
          orderId: order.id,
          shipmentReference: "SHIP-1",
          lines: [{ orderLineId: order.lines[0].id, quantity: "0.4" }],
        };
      shipment = await h.command("dispatch.create", payload, {
        commandId: key,
      });
      assert.deepEqual(
        await h.command("dispatch.create", payload, { commandId: key }),
        shipment,
      );
      assert.ok(shipment.lines[0].reservations[0].reservationId);
      await h.command(
        "dispatch.create",
        {
          ...payload,
          lines: [{ orderLineId: order.lines[0].id, quantity: "10" }],
        },
        { error: "RESERVATION" },
      );
      await h.command(
        "receipt.reverse",
        { receiptId: receipt.id, reason: "Would invalidate dispatch" },
        { error: "DEPENDENCY" },
      );
      await h.invariant();
    },
  );
  await t.test(
    "10 cancellation preserves shipment and returns remain quarantine until review",
    async () => {
      const cancelled = await h.command("order.cancel", {
        orderId: order.id,
        reason: "Customer cancels remainder",
      });
      assert.equal(cancelled.lines[0].dispatched, "0.4");
      assert.equal(cancelled.lines[0].cancelled, "0.6");
      const cancelledState = await h.state();
      assert.deepEqual(cancelledState.shipments.find((s) => s.id === shipment.id), shipment);
      assert.deepEqual(cancelledState.reservations.filter((r) => r.orderId === order.id), []);
      returned = await h.command("return.create", {
        shipmentId: shipment.id,
        shipmentLineId: shipment.lines[0].id,
        locationId: b.source.id,
        quantity: "0.2",
        reason: "Customer return",
      });
      await h.command(
        "return.restock",
        { returnId: returned.id, version: returned.version },
        { error: "APPROVAL" },
      );
      const review = { returnId: returned.id, version: returned.version, quantity: "0.1" };
      await h.command("return.approve", review);
      const beforeMismatch = (await h.state()).movements;
      await h.command("return.restock", { ...review, quantity: "0.2" }, { error: "RETURN_QUANTITY" });
      await h.command("return.restock", { returnId: returned.id, version: returned.version }, { error: "RETURN_QUANTITY" });
      assert.deepEqual((await h.state()).movements, beforeMismatch);
      const restockKey = randomUUID();
      const partial = await h.command("return.restock", review, { commandId: restockKey });
      assert.equal(partial.restocked, "0.1");
      assert.equal(partial.status, "quarantine");
      assert.deepEqual(await h.command("return.restock", review, { commandId: restockKey }), partial);
      const beforeDenied = (await h.state()).movements;
      await h.command("return.restock", { returnId: returned.id, version: partial.version }, { error: "APPROVAL" });
      await h.command("return.approve", { returnId: returned.id, version: partial.version, quantity: "0.2" }, { error: "RETURN_QUANTITY" });
      assert.deepEqual((await h.state()).movements, beforeDenied);
      await h.command("return.approve", { returnId: returned.id, version: partial.version });
      const complete = await h.command("return.restock", { returnId: returned.id, version: partial.version });
      assert.equal(complete.restocked, returned.quantity);
      assert.equal(complete.status, "restocked");
      await h.command(
        "return.create",
        {
          shipmentId: shipment.id,
          shipmentLineId: shipment.lines[0].id,
          locationId: b.source.id,
          quantity: "0.3",
          reason: "Too much",
        },
        { error: "RETURN_LIMIT" },
      );

      // No other SKU or leftover sellable stock can satisfy this demand.
      const isolatedItem = await h.command("item.save", {
        sku: "synthetic-pier-10", name: "Quarantine isolation", unit: "each", packSize: "0.1",
      });
      const isolated = { ...b, item: isolatedItem };
      const isolatedPo = await buy(h, isolated, "0.3");
      await receive(h, isolated, isolatedPo, "0.3");
      const originalOrder = await h.command("order.create", {
        customerId: b.customer.id, lines: [{ itemId: isolatedItem.id, quantity: "0.3" }],
      });
      const originalShipment = await h.command("dispatch.create", {
        orderId: originalOrder.id, shipmentReference: "synthetic-pier-10-dispatch",
        lines: [{ orderLineId: originalOrder.lines[0].id, quantity: "0.3" }],
      });
      const quarantined = await h.command("return.create", {
        shipmentId: originalShipment.id, shipmentLineId: originalShipment.lines[0].id,
        locationId: b.source.id, quantity: "0.3", reason: "Inspect returned units before release",
      });
      assert.equal(quarantined.shipmentId, originalShipment.id);
      assert.equal(quarantined.shipmentLineId, originalShipment.lines[0].id);
      const stock = (s, sellable, quarantine, reserved) => {
        const movements = s.movements.filter((m) => m.itemId === isolatedItem.id);
        const reservations = s.reservations.filter((r) => r.itemId === isolatedItem.id);
        for (const [status, quantity] of [["sellable", sellable], ["quarantine", quarantine]]) {
          const sum = movements.filter((m) => m.status === status).reduce((n, m) => n + BigInt(m.quantity), 0n);
          assert.equal(sum, parse(quantity), status);
          const positions = s.positions.filter((p) => p.itemId === isolatedItem.id && p.status === status);
          assert.equal(positions.reduce((n, p) => n + parse(p.quantity), 0n), sum);
          assert.equal(positions.reduce((n, p) => n + parse(p.available), 0n), status === "sellable" ? sum - parse(reserved) : 0n);
        }
        assert.equal(reservations.reduce((n, r) => n + BigInt(r.quantity), 0n), parse(reserved));
      };
      const business = (s) => ({
        positions: s.positions, movements: s.movements, reservations: s.reservations,
        shipments: s.shipments, orders: s.orders, returns: s.returns, commands: s.commands,
      });
      stock(await h.state(), "0", "0.3", "0");
      const demand = await h.command("order.create", {
        customerId: b.customer.id, lines: [{ itemId: isolatedItem.id, quantity: "0.3" }],
      });
      assert.equal(demand.lines[0].reserved, "0");
      assert.equal(demand.lines[0].backorder, "0.3");
      stock(await h.state(), "0", "0.3", "0");
      const dispatch = {
        orderId: demand.id, shipmentReference: "synthetic-pier-10-new-demand",
        lines: [{ orderLineId: demand.lines[0].id, quantity: "0.1" }],
      };
      const beforeDispatch = business(await h.state());
      await h.command("dispatch.create", dispatch, { error: "RESERVATION" });
      assert.deepEqual(business(await h.state()), beforeDispatch);

      const exactReview = { returnId: quarantined.id, version: quarantined.version, quantity: "0.1" };
      await h.command("return.approve", exactReview);
      const approvedOnly = await h.command("order.reserve", { orderId: demand.id });
      assert.equal(approvedOnly.lines[0].reserved, "0");
      assert.equal(approvedOnly.lines[0].backorder, "0.3");
      stock(await h.state(), "0", "0.3", "0");
      const released = await h.command("return.restock", exactReview);
      assert.equal(released.status, "quarantine");
      assert.equal(released.restocked, "0.1");
      assert.equal(released.restockReviews[0].quantity, "0.1");
      assert.equal(released.restockReviews[0].actorId, released.restockReviews[0].postedBy);
      stock(await h.state(), "0.1", "0.2", "0");
      const allocated = await h.command("order.reserve", { orderId: demand.id });
      assert.equal(allocated.lines[0].reserved, "0.1");
      assert.equal(allocated.lines[0].backorder, "0.2");
      stock(await h.state(), "0.1", "0.2", "0.1");
      const beforeExcessDispatch = business(await h.state());
      await h.command("dispatch.create", {
        ...dispatch, lines: [{ orderLineId: demand.lines[0].id, quantity: "0.2" }],
      }, { error: "RESERVATION" });
      assert.deepEqual(business(await h.state()), beforeExcessDispatch);
      const allowedShipment = await h.command("dispatch.create", dispatch);
      assert.equal(allowedShipment.lines[0].quantity, "0.1");
      stock(await h.state(), "0", "0.2", "0");
      const stillShort = await h.command("order.reserve", { orderId: demand.id });
      assert.equal(stillShort.lines[0].reserved, "0");
      assert.equal(stillShort.lines[0].backorder, "0.2");
      const finalState = await h.state();
      assert.deepEqual(finalState.shipments.find((s) => s.id === originalShipment.id), originalShipment);
      assert.deepEqual(finalState.returns.find((r) => r.id === quarantined.id), released);
      assert.equal(finalState.movements.filter((m) => m.itemId === isolatedItem.id && m.status === "quarantine").every((m) => m.documentId === quarantined.id), true);
      await h.invariant();
    },
  );
  await t.test(
    "11 count frontier prevents overwriting intervening movement",
    async () => {
      let count = await h.command("count.capture", {
        locationId: b.destination.id,
      });
      count = await h.command("count.record", {
        countId: count.id,
        version: count.version,
        lines: count.lines.map((l) => ({ ...l, quantity: "0.4" })),
        reason: "Physical shelf count",
      });
      await h.command("count.approve", {
        countId: count.id,
        version: count.version,
      });
      let stale = await h.command("count.capture", { locationId: b.source.id });
      stale = await h.command("count.record", {
        countId: stale.id,
        version: stale.version,
        lines: stale.lines,
        reason: "Physical count",
      });
      await receive(h, b, po, "0.1");
      await h.command(
        "count.approve",
        { countId: stale.id, version: stale.version },
        { error: "COUNT_FRONTIER" },
      );
      let revision = await h.command("import.stage", {
        namespace: "opening",
        sourceVersion: "corrected-opening",
        exportedAt: "2026-10-13T00:00:00Z",
        filters: "corrected row",
        cutoffTimezone: "Australia/Brisbane",
        currency: "USD",
        mappingRevision: "1",
        files: [
          {
            name: "positions.csv",
            kind: "positions",
            csv: "key,itemKey,locationKey,status,quantity,unit,cost\nopening1,bolt2,bin2,sellable,0.5,each,0.2\n",
          },
        ],
      });
      revision = await h.command("import.revise", {
        batchId: revision.id,
        version: revision.version,
        decisions: [{ kind: "positions", key: "opening1", action: "replace" }],
        reason: "Correct source opening row",
      });
      for (const stage of ["mapped", "reconciled", "shadow", "frozen"])
        revision = await h.command("import.review", {
          batchId: revision.id,
          version: revision.version,
          stage,
          reason: "Review corrected opening row",
        });
      revision = await h.command("import.commit", {
        batchId: revision.id,
        version: revision.version,
      });
      const native = await h.state();
      const imported = {
        ...b,
        item: native.items.find((item) => item.sku === "NUT"),
        source: native.locations.find((location) => location.name === "C1"),
      };
      let aba = await h.command("count.capture", {
        locationId: imported.source.id,
      });
      aba = await h.command("count.record", {
        countId: aba.id,
        version: aba.version,
        lines: aba.lines,
        reason: "Physical capture before revision undo",
      });
      await h.command("import.undo", {
        batchId: revision.id,
        version: revision.version,
        reason: "Restore prior source opening count",
      });
      const freshPO = await buy(h, imported, "1");
      await receive(h, imported, freshPO, "0.1");
      const intervened = await h.state();
      assert.equal(
        intervened.movements.filter(
          (movement) => movement.locationId === imported.source.id,
        ).length,
        aba.frontierCount,
      );
      assert.equal(
        intervened.counts.find((count) => count.id === aba.id).stale,
        true,
      );
      const rejected = await h.command(
        "count.approve",
        { countId: aba.id, version: aba.version },
        { error: "COUNT_FRONTIER" },
      );
      assert.equal(rejected.error.details.removedMovementIds.length, 1);
      assert.equal(
        intervened.positions.find(
          (position) => position.itemId === imported.item.id,
        ).quantity,
        "0.4",
      );
      let correction = await h.command("count.capture", {
        locationId: b.source.id,
      });
      correction = await h.command("count.record", {
        countId: correction.id,
        version: correction.version,
        lines: correction.lines.map((line) => {
          if (line.itemId !== b.item.id || line.status !== "sellable")
            return line;
          const quantity = parse(line.quantity) + 100000n;
          return {
            ...line,
            quantity: `${quantity / 1000000n}.${(quantity % 1000000n).toString().padStart(6, "0")}`,
          };
        }),
        reason:
          "Physical count confirms one additional tenth after downstream work",
      });
      const corrected = await h.command("receipt.correct", {
        receiptId: receipt.id,
        countId: correction.id,
        version: correction.version,
        reason: "Reconcile receipt using the current physical count",
      });
      assert.equal(corrected.status, "posted");
      const evidence = await h.state();
      const adjustment = evidence.movements.find(
        (movement) => movement.documentId === correction.id,
      );
      assert.equal(adjustment.quantity, "100000");
      assert.equal(adjustment.reversalId, receipt.lines[0].movementId);
      assert.ok(
        evidence.receipts
          .find((r) => r.id === receipt.id)
          .corrections.some((c) => c.countId === correction.id),
      );
      await h.invariant();
    },
  );
  await t.test(
    "12 investigation export preserves every ledger and review link",
    async () => {
      const state = await h.invariant(),
        exported = await (await h.request("/api/pier/export")).json();
      assert.deepEqual(exported.movements, state.movements);
      assert.deepEqual(exported.reservations, state.reservations);
      assert.ok(exported.imports[0].source.artifacts[0].original.base64);
      assert.ok(exported.purchaseOrders[0].approval.actorId);
      assert.ok(exported.movements.some((m) => m.reversalId));
      const used = await h.command("item.save", {
        ...b.item,
        version: b.item.version,
        archived: true,
      });
      assert.equal(used.archived, true);
      await h.command(
        "order.create",
        {
          customerId: b.customer.id,
          lines: [{ itemId: b.item.id, quantity: "1" }],
        },
        { error: "ARCHIVED" },
      );
      await h.invariant();
    },
  );
  await t.test(
    "authorization fails before stock or command writes",
    async () => {
      const before = await h.state();
      const response = await h.request("/api/pier/commands", {
        method: "POST",
        as: "",
        body: {
          commandId: randomUUID(),
          type: "order.cancel",
          payload: { orderId: order.id, reason: "Unauthorized" },
        },
      });
      assert.equal(response.status, 401);
      assert.equal((await h.state()).version, before.version);
      await h.request("/auth/signout", { method: "POST", body: {} });
      assert.equal((await h.request("/api/pier/state")).status, 401);
    },
  );
});

test('warehouse stocktakes freeze only their scope, retain blind counts and zone decisions, require recounts and reject stale live approval', async t => {
  const h = await installation(); t.after(() => h.close());
  const b = await basics(h), bins = [];
  for (let i = 0; i < 20; i++) bins.push(await h.command('location.save', { name: `synthetic-pier-${i}`, warehouse: 'Count warehouse', kind: 'bin', zone: i === 19 ? 'Keep' : 'Zero' }));
  const po = await buy(h, b, '220');
  await h.command('receipt.create', { poId: po.id, supplierReference: 'synthetic-pier-20', lines: [...bins, b.destination].map(bin => ({ poLineId: po.lines[0].id, locationId: bin.id, quantity: bin.id === bins[18].id ? '0.5' : '10', cost: '0.25' })) });
  let countRule = await h.command('routing.save', { source: 'manual', mode: 'fixed', shortage: 'hold', eligible: ['Count warehouse'] });
  countRule = await h.command('routing.preview', { ruleId: countRule.id, version: countRule.version });
  await h.command('routing.activate', { ruleId: countRule.id, version: countRule.version });
  const order = await h.command('order.create', { customerId: b.customer.id, warehouse: 'Count warehouse', lines: [{ itemId: b.item.id, quantity: '1' }] });
  const carrier = await h.command('carrier.save', { name: 'synthetic-pier-carrier', warehouse: 'Count warehouse', dock: 'A', cutoff: '16:00', timeZone: 'UTC' });
  const wave = await h.command('wave.release', { carrierId: carrier.id, orderIds: [order.id] });
  // Count scope also fences reservations, independently of the UI.
  let take = await h.command('stocktake.start', { warehouse: 'Count warehouse', frozen: true, quantityThreshold: '1', valueThreshold: '100', reason: 'Year-end physical stocktake' });
  assert.equal(take.bins.length, 20);
  const unchanged = await h.state();
  await h.command('pick.scan', { waveId: wave.id, lineId: wave.lines[0].id, binCode: bins.find(b => b.id === wave.lines[0].locationId).name, itemCode: b.item.barcode }, { error: 'STOCKTAKE_FROZEN' });
  await h.command('order.create', { customerId: b.customer.id, warehouse: 'Count warehouse', lines: [{ itemId: b.item.id, quantity: '1' }] }, { error: 'STOCKTAKE_FROZEN' });
  await h.command('receipt.create', { poId: po.id, supplierReference: 'synthetic-pier-21', lines: [{ poLineId: po.lines[0].id, locationId: bins[0].id, quantity: '1', cost: '0.25' }] }, { error: 'STOCKTAKE_FROZEN' });
  await h.command('transfer.send', { itemId: b.item.id, fromLocationId: bins[0].id, toLocationId: b.destination.id, transitLocationId: b.transit.id, quantity: '1', reason: 'Frozen refusal' }, { error: 'STOCKTAKE_FROZEN' });
  assert.equal((await h.state()).version, unchanged.version);
  await h.command('transfer.send', { itemId: b.item.id, fromLocationId: b.destination.id, toLocationId: b.source.id, transitLocationId: b.transit.id, quantity: '1', reason: 'Other warehouse continues' });
  for (const zone of ['Zero', 'Keep']) take = await h.command('stocktake.zone', { stocktakeId: take.id, version: take.version, zone, uncounted: zone === 'Zero' ? 'zero' : 'unchanged', assignedTo: unchanged.actor.id });
  const record = async (i, quantity) => take = await h.command('stocktake.record', { stocktakeId: take.id, version: take.version, locationId: bins[i].id, binCode: bins[i].name, lines: [{ itemCode: b.item.barcode, status: 'sellable', quantity }], reason: 'Scanned physical count' });
  for (let i = 0; i < 18; i++) await record(i, i === 0 ? '8' : '10');
  await h.command('stocktake.approve', { stocktakeId: take.id, version: take.version }, { error: 'COUNT_RECOUNT' });
  await record(0, '8');
  const review = (await h.state()).stocktakes.find(takeRow => takeRow.id === take.id);
  assert.equal(review.preview.find(l => l.locationId === bins[0].id).valueCents, '-50');
  assert.equal(review.preview.find(l => l.locationId === bins[18].id).quantity, '0');
  assert.equal(review.preview.find(l => l.locationId === bins[19].id).quantity, '10');
  const commandId = randomUUID();
  const approved = await h.command('stocktake.approve', { stocktakeId: take.id, version: take.version }, { commandId });
  assert.deepEqual(await h.command('stocktake.approve', { stocktakeId: take.id, version: take.version }, { commandId }), approved);
  assert.equal(approved.status, 'posted'); assert.equal(approved.ledgerStatus, 'not-posted');
  const state = await h.state();
  assert.equal(state.movements.filter(m => m.documentId === take.id).length, 2);
  assert.equal(state.stocktakes.find(r => r.id === take.id).result.length, 20);
  assert.equal(state.stocktakes.find(r => r.id === take.id).bins[0].history.length, 2);
  await h.command('receipt.create', { poId: po.id, supplierReference: 'synthetic-pier-22', lines: [{ poLineId: po.lines[0].id, locationId: bins[0].id, quantity: '1', cost: '0.25' }] });
  take = await h.command('stocktake.start', { warehouse: 'Count warehouse', zones: ['Keep'], frozen: false, quantityThreshold: '100', valueThreshold: '100', reason: 'Live frontier count' });
  take = await h.command('stocktake.zone', { stocktakeId: take.id, version: take.version, zone: 'Keep', uncounted: 'unchanged', assignedTo: state.actor.id });
  const liveRecord = () => h.command('stocktake.record', { stocktakeId: take.id, version: take.version, locationId: bins[19].id, binCode: bins[19].name, lines: [{ itemCode: b.item.barcode, status: 'sellable', quantity: '10' }], reason: 'Fresh physical observation' });
  take = await liveRecord();
  await h.command('receipt.create', { poId: po.id, supplierReference: 'synthetic-pier-23', lines: [{ poLineId: po.lines[0].id, locationId: bins[19].id, quantity: '1', cost: '0.25' }] });
  await h.command('stocktake.approve', { stocktakeId: take.id, version: take.version }, { error: 'COUNT_FRONTIER' });
  take = await liveRecord();
  assert.equal(take.bins[0].history.filter(h => h.stale).length, 1);
  take = await h.command('stocktake.approve', { stocktakeId: take.id, version: take.version });
  assert.equal(take.result[0].expected, '11'); assert.equal(take.result[0].delta, '-1');
  const exported = await h.request('/api/pier/export');
  assert.equal(exported.status, 200);
  assert.ok((await exported.text()).includes(take.id));

  const { traceStock } = await import('./trace-fixture.mjs');
  const traced = await traceStock(h);
  await h.command('receipt.create', { poId: traced.po.id, supplierReference: 'synthetic-pier-24', lines: [
    { poLineId: traced.po.lines[0].id, locationId: traced.source.id, quantity: '4', cost: '2', trace: [{ lot: 'synthetic-pier-25', expiry: '2027-12-31', quantity: '4' }] },
    { poLineId: traced.po.lines[1].id, locationId: traced.source.id, quantity: '1', cost: '3', trace: [{ serial: 'synthetic-pier-26', quantity: '1' }] },
  ] });
  const identities = (await h.state()).traceIdentities;
  const lot = identities.find(i => i.itemId === traced.lot.id), serial = identities.find(i => i.itemId === traced.serial.id);
  take = await h.command('stocktake.start', { warehouse: 'Trace North', frozen: true, quantityThreshold: '10', valueThreshold: '100', reason: 'Identity count' });
  take = await h.command('stocktake.zone', { stocktakeId: take.id, version: take.version, zone: 'Unzoned', uncounted: 'unchanged', assignedTo: state.actor.id });
  take = await h.command('stocktake.record', { stocktakeId: take.id, version: take.version, locationId: traced.source.id, binCode: traced.source.name, lines: [
    { itemCode: traced.lot.barcode, identityCode: lot.code, status: 'sellable', quantity: '3' },
    { itemCode: serial.code, status: 'sellable', quantity: '0' },
  ], reason: 'Counted retained lot and absent serial' });
  take = await h.command('stocktake.approve', { stocktakeId: take.id, version: take.version });
  const tracedState = await h.state();
  assert.equal(tracedState.tracePositions.find(p => p.identityId === lot.id).quantity, '3');
  assert.equal(tracedState.tracePositions.find(p => p.identityId === serial.id).quantity, '0');
  assert.deepEqual(take.result.map(l => l.valueCents).sort(), ['-200', '-300']);
  take = await h.command('stocktake.start', { warehouse: 'Trace North', frozen: true, quantityThreshold: '10', valueThreshold: '100', reason: 'Serial identity conflict review' });
  take = await h.command('stocktake.zone', { stocktakeId: take.id, version: take.version, zone: 'Unzoned', uncounted: 'unchanged', assignedTo: state.actor.id });
  for (const bin of [traced.source, traced.destination]) for (let attempt = 0; attempt < 2; attempt++) take = await h.command('stocktake.record', { stocktakeId: take.id, version: take.version, locationId: bin.id, binCode: bin.name, lines: [{ itemCode: serial.code, status: 'sellable', quantity: '1' }], reason: 'Repeated physical serial observation' });
  const beforeConflict = await h.state();
  await h.command('stocktake.approve', { stocktakeId: take.id, version: take.version }, { error: 'TRACE_SERIAL' });
  assert.equal((await h.state()).movements.length, beforeConflict.movements.length);
  await h.command('stocktake.cancel', { stocktakeId: take.id, version: take.version, reason: 'Resolve duplicate physical serial before posting' });

});
