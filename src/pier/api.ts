import { trace, traceState, reconcileTrace, traceReport } from './trace';
import { kitDocument } from './kit-documents';
import { packDocument } from './floor/pack-documents';
import { kits, kitState, validateKitReservations } from './kits';
import { slotting } from './slotting';
import { validatePlacements } from './location-capacity';
import { planningScope } from './replenishment-scope';
import { supplierPerformance } from './supplier-performance';
import { stockPosition } from './stock-position';
import { edi } from "./edi/commands";
import { ediState } from "./edi/view";
import { deliverEdi } from "./edi/dispatch";
import { ediFile } from "./edi-labels";
import { operatorAuth, runtimeBindings, type Bindings } from "../auth.server";
import {
  collections,
  Problem,
  fail,
  positions,
  type Actor,
  type Context,
} from "./model";
import { load, saved, commit, authority, activeAutomationActors } from "./storage";
import { channelWebhook } from './channels/webhook';
import { shipping, unavailable as shippingUnavailable } from './shipping/commands';
import { business } from './business';
import { performShipping } from './shipping/transport';
import { shippingWebhook } from './shipping/webhook';
import { labelUrl } from './shipping/easypost';
import { channels } from './channels/commands';
import { channelState, markChannelPending } from './channels/availability';
import { syncChannels } from './channels/sync';
import { supplierBills, supplierBillViews } from "./books/supplier-bills";
import { receiptBookViews } from "./books/receipt-closure";
import { books } from "./books/commands";
import { pantryAccounts } from './books/pantry-accounts';
import { bookConnectionViews } from './books/connection-state';
import { readShopifyLocations } from './channels/setup';
import { newStallKey, stallKeyHash, stallLink } from './channels/stall-link';
import { syncBooks } from "./books/sync";
import { booksExport } from "./books/export";
import { nativeExport } from "./native-export";
import { catalogue } from "./catalogue";
import { catalogueBulk, previewCatalogue } from "./catalogue-bulk";
import { orders, orderView } from "./orders";
import { returns } from "./returns";
import { returnLookup } from "./returns-lookup";
import { itemAgent, explainItem } from "./item-agent";
import { purchasing } from "./purchasing";
import { supplierReturns } from './supplier-returns';
import { supplierInspections } from "./supplier-inspections";
import { replenishment, forecast, draftReplenishment, refreshReorderExceptions } from './replenishment';
import { backorderDates } from './backorders';
import { purchasingWorkflow, expectedLandedCost, refreshPromises } from './purchasing-workflow';
import { deliverCorrespondence, correspondenceDeliveries } from './correspondence-delivery';
import { purchaseSend, invalidatePurchaseSends } from "./purchase-send";
import { slowStock, refreshSlowStock } from "./slow-stock";
import { pricing } from "./pricing";
import { costing } from "./costing";
import { reports } from "./reports";
import { warehouse, countView } from "./warehouse";
import { imports } from "./imports";
import { proposals, reorder } from "./proposals";
import { floor, floorState } from "./floor";
import { dispatchSummary } from "./floor/summary";
import { sendSummary } from "./floor/mail";
import { canonicalJson, sha256, publishImport } from "./import-kit";
const json = (body: unknown, status = 200) =>
  Response.json(body, {
    status,
    headers: {
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
async function current(request: Request, env: Bindings): Promise<Actor> {
  const session = await operatorAuth(env).getSession(request);
  if (!session)
    throw new Problem(
      "AUTH",
      "Sign in with a current native session.",
      null,
      401,
    );
  const role = await env.DB.prepare(
    "SELECT data FROM pier_records WHERE kind='roles' AND id=?",
  )
    .bind(session.operator.id)
    .first<{
      data: string;
    }>();
  return {
    id: session.operator.id,
    name: session.operator.displayName,
    role: role
      ? JSON.parse(role.data).role
      : session.operator.role === "owner"
        ? "owner"
        : "viewer",
    sessionId: session.id,
    operatorVersion: session.operator.version,
  };
}
async function approver(env: Bindings, c: Context, type: string, p: any) {
  let record: any;
  if (type === "kitting.post") record = c.s.kittingTasks.find(r => r.id === p.taskId);
  if (type === "slotting.scan") record = c.s.slottingPlans.find(r => r.id === p.planId);
  if (type === "po.commit")
    record = c.s.purchaseOrders.find((r) => r.id === p.poId);
  if (type === "return.restock")
    record = c.s.returns.find((r) => r.id === p.returnId);
  if (type === "proposal.execute")
    record = c.s.proposals.find((r) => r.id === p.proposalId);
  if (!record?.approval) return;
  const a = await env.DB.prepare(
    "SELECT o.status,o.role,r.data FROM oa_operators o LEFT JOIN pier_records r ON r.kind='roles' AND r.id=o.id WHERE o.id=?",
  )
    .bind(record.approval.actorId)
    .first<any>();
  const role = a?.data
    ? JSON.parse(a.data).role
    : a?.role === "owner"
      ? "owner"
      : "viewer";
  const allowed =
    ["slotting.scan", "kitting.post"].includes(type) ? ["owner"] : type === "po.commit"
      ? ["owner", "buyer"]
      : type === "return.restock"
        ? ["owner", "warehouse"]
        : record.kind === "migration"
          ? ["owner"]
          : record.kind === "replenishment"
            ? ["owner", "buyer"]
            : record.kind === "count-drift"
              ? ["owner", "warehouse"]
              : ["owner", "operator"];
  if (!a || a.status !== "active" || !allowed.includes(role))
    fail(
      "APPROVER_REVOKED",
      "The approving person no longer holds approval authority. Review again.",
    );
  c.approver = { id: record.approval.actorId, role };
}
/** One command through Pier's admission: the public endpoint's path, and the
 * demo seed's (src/demo.ts), which passes its own clock. */
export async function execute(
  env: Bindings,
  actor: Actor,
  commandId: string,
  type: string,
  payload: any,
  now = () => new Date().toISOString(),
  backgroundPolicy?: Context["backgroundPolicy"],
): Promise<any> {
  const digest = sha256(canonicalJson({ type, payload }));
  const previous = await saved(env.DB, commandId, digest, actor);
  if (previous) return previous;
  // A losing optimistic admission is recomputed from current stock. This is
  // database concurrency handling, not a retry of an external effect or model.
  for (let attempt = 0; attempt < 8; attempt++) {
    const before = await load(env.DB),
      s = structuredClone(before),
      c: Context = { s, actor, commandId, now: now(), backgroundPolicy, automationActors: await activeAutomationActors(env.DB) };
    await approver(env, c, type, payload);
    let result: any = supplierBills(c, type, payload);
    if (result === undefined) result = await shipping(c, type, payload, env);
    if (result === undefined) result = business(c, type, payload);
    if (result === undefined) result = await edi(c, type, payload, env);
    if (result === undefined) result = await books(c, type, payload, env);
    if (result === undefined) result = await itemAgent(c, type, payload, env);
    if (result === undefined) result = await channels(c, type, payload, env);
    if (backgroundPolicy && type === "automation.tick") result = { id: commandId, version: 1, draftIds: backgroundPolicy.collection === "purchaseOrders" ? [purchaseSend(c, "po.sendApproved", { poId: backgroundPolicy.id, version: s.purchaseOrders.find(po => po.id === backgroundPolicy.id)!.version })!.id] : backgroundPolicy.collection === "replenishmentPolicies" ? draftReplenishment(c, { policyId: backgroundPolicy.id, autoOnly: true }).map((po: any) => po.id) : [] };
    for (const handle of [
      trace,
      kits,
      slotting,
      catalogue,
      catalogueBulk,
      pricing,
      costing,
      orders,
      returns,
      purchasing,
      supplierInspections,
      supplierReturns,
      purchasingWorkflow,
      purchaseSend,
      slowStock,
      replenishment,
      warehouse,
      imports,
      proposals,
      floor,
    ]) {
      if (result !== undefined) break;
      result = handle(c, type, payload);
      if (result !== undefined) break;
    }
    if (result === undefined) fail("COMMAND", "Unknown command type.");
    reconcileTrace(c, before, payload);
    validateKitReservations(s);
    validatePlacements(s, before);
    if (type === "import.commit" || type === "import.undo") {
      refreshReorderExceptions(c);
      await publishImport(
        env,
        c,
        before,
        digest,
        result,
        type === "import.undo",
      );
      const outcome = await saved(env.DB, commandId, digest, actor);
      if (!outcome)
        fail(
          "IMPORT_PUBLICATION",
          "The reviewed import was not published. Resume the same command.",
        );
      return outcome;
    }
    // Immediate planning stays within the signing buyer's own approved policies.
    for (const policy of c.s.replenishmentPolicies.filter(p => p.autoDraft && p.approvedBy === actor.id && ['owner','buyer'].includes(actor.role))) {
      if (!backgroundPolicy && type !== 'po.delete' && !type.startsWith('itemAgent.') && !type.startsWith('ai.')) draftReplenishment(c, { policyId: policy.id, autoOnly: true });
    }
    refreshReorderExceptions(c);
    refreshPromises(c);
    invalidatePurchaseSends(c);
    refreshSlowStock(c, backgroundPolicy?.collection === "slowStockPolicies");
    markChannelPending(c, before);
    try {
      return await commit(env, c, before, digest, result);
    } catch (error) {
      const replay = await saved(env.DB, commandId, digest, actor);
      if (replay) return replay;
      const latest = await load(env.DB);
      if (latest.version !== before.version) {
        if (attempt < 7) continue;
        fail(
          "BUSY",
          "Stock changed repeatedly. Retry the same command identity.",
        );
      }
      throw error;
    }
  }
  return null;
}
/** The owner's copy of a closed day, sent once the close commits and recorded as its own command. */
async function deliver(env: Bindings, actor: Actor, commandId: string, outcome: any) {
  const day = (await load(env.DB)).dispatchDays.find((d) => d.id === outcome.result?.id);
  if (!day || day.version !== outcome.result.version || day.delivery?.status !== "sending") return { ...outcome, result: day ?? outcome.result };
  const sent = await sendSummary(env, day);
  const recorded = await execute(env, actor, `${commandId}-mail`, "dispatch.delivered", { dayId: day.id, version: day.version, ...sent });
  return recorded ?? outcome;
}
export async function pierResponse(
  request: Request,
  original: Bindings,
  execution?: { waitUntil(promise: Promise<unknown>): void },
): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/pier")) return null;
  try {
    const env = runtimeBindings(original);
    const carrierWebhook = await shippingWebhook(request, env);
    if (carrierWebhook) return carrierWebhook;
    const webhook = await channelWebhook(request, env);
    if (webhook) return webhook;
    const stall = await stallLink(request, env);
    if (stall) return stall;
    const actor = await current(request, env);
    if (request.method === "GET") {
      const s = await load(env.DB),
        c = { s, actor, commandId: "", now: new Date().toISOString() };
      const gate = authority(actor);
      if (
        !(
          await env.DB.prepare(
            "SELECT CASE WHEN (" + gate.sql + ") THEN 1 ELSE 0 END AS ok",
          )
            .bind(...gate.params)
            .first<any>()
        )?.ok
      )
        throw new Problem(
          "AUTH",
          "Session or role changed. Sign in again.",
          null,
          401,
        );
      const labelMatch = /^\/api\/pier\/shipping\/labels\/([^/]+)\.(pdf|zpl)$/.exec(url.pathname);
      if (labelMatch) {
        const blocked = shippingUnavailable(env);
        if (blocked) fail('SHIPPING_UNAVAILABLE', blocked);
        const job = s.shippingJobs.find(j => j.id === labelMatch[1]);
        const destination = labelUrl(labelMatch[2] === 'pdf' ? job?.labelPdfUrl : job?.labelZplUrl);
        if (!destination) fail('LABEL', 'This label format is not available from the carrier.');
        const response = await fetch(destination!, { redirect: 'manual', signal: AbortSignal.timeout(25000) });
        if (!response.ok) fail('LABEL', 'The carrier label could not be downloaded. Check EasyPost.');
        return new Response(response.body, { headers: { 'content-type': labelMatch[2] === 'pdf' ? 'application/pdf' : 'application/octet-stream', 'content-disposition': `inline; filename="pier-label-${job!.carton}.${labelMatch[2]}"`, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } });
      }
      const packSlip = /^\/api\/pier\/packs\/([^/]+)\/packing-slip$/.exec(url.pathname);
      if (packSlip) return packDocument(s, packSlip[1]);
      const packingSlip = /^\/api\/pier\/orders\/([^/]+)\/packing-slip$/.exec(url.pathname);
      if (packingSlip) return kitDocument(s, packingSlip[1]);
      const ediDownload = ediFile(s, url.pathname);
      if (ediDownload) return ediDownload;
      if (["/api/pier/books/export.csv","/api/pier/books/export.iif"].includes(url.pathname)) {
        const format = url.pathname.endsWith(".iif") ? "iif" : "csv";
        try { return new Response(booksExport(s, format), {headers:{"content-type":format === "csv" ? "text/csv; charset=utf-8" : "text/plain; charset=utf-8","content-disposition":`attachment; filename="pier-books.${format}"`,"cache-control":"no-store"}}); } catch(error) { fail("BOOK_EXPORT", error instanceof Error ? error.message : "Review the financial documents before exporting."); }
      }
      if (url.pathname === "/api/pier/native-export")
        return json(nativeExport(s));
      if (url.pathname === '/api/pier/trace') return json(traceReport(s, url.searchParams.get('identityId') ?? ''));
      if (url.pathname === "/api/pier/returns/lookup")
        return json(returnLookup(s, url.searchParams.get("code")));
      if (url.pathname === "/api/pier/supplier-performance") return json(supplierPerformance(s));
      if (url.pathname === '/api/pier/replenishment') return json(forecast(c, [{ itemId: url.searchParams.get('itemId') ?? '', warehouse: url.searchParams.get('warehouse') ?? '', supplierId: url.searchParams.get('supplierId') ?? undefined }]));
      if (url.pathname === "/api/pier/reports") return json(reports(s, url.searchParams));
      if (url.pathname === "/api/pier/dispatch-summary")
        return json(
          dispatchSummary(
            s,
            url.searchParams.get("date") ?? "",
            url.searchParams.get("timeZone") ?? "",
            url.searchParams.get("warehouse"),
          ),
        );
      if (url.pathname === "/api/pier/export") {
        const audit = await env.DB.batch([
          env.DB.prepare(
            "SELECT id,actor_id AS actorId,digest,result,created_at AS createdAt FROM pier_commands ORDER BY created_at,id",
          ),
          env.DB.prepare(
            "SELECT id,namespace,operation_key AS operationKey,state,checkpoint,total FROM ik_jobs ORDER BY id",
          ),
          env.DB.prepare(
            "SELECT job_id AS jobId,kind,original_key AS originalKey,name,sha256,size FROM ik_originals ORDER BY job_id,kind,original_key",
          ),
        ]);
        return json({
          format: "pier-business-v1",
          currency: "USD",
          precision: 6,
          exportedAt: new Date().toISOString(),
          ...s,
          commands: audit[0].results.map((command: any) => ({
            ...command,
            result: JSON.parse(command.result),
          })),
          importJournal: {
            jobs: audit[1].results,
            originals: audit[2].results,
          },
        });
      }
      if (url.pathname !== "/api/pier/state")
        return json(
          {
            ok: false,
            error: { code: "NOT_FOUND", message: "Unknown endpoint." },
          },
          404,
        );
      const commands = (
        await env.DB.prepare(
          "SELECT id,actor_id AS actorId,created_at AS createdAt FROM pier_commands ORDER BY created_at DESC LIMIT 100",
        ).all()
      ).results;
      const commandId = url.searchParams.get("commandId");
      if (commandId && !commands.some(command => command.id === commandId)) {
        const ownCommand = await env.DB.prepare(
          "SELECT id,actor_id AS actorId,created_at AS createdAt FROM pier_commands WHERE id=? AND actor_id=?",
        ).bind(commandId, actor.id).first();
        if (ownCommand) commands.push(ownCommand);
      }
      const operators =
        actor.role === "owner"
          ? (
              await env.DB.prepare(
                "SELECT id,email,display_name AS name,role,status FROM oa_operators",
              ).all()
            ).results
          : [];
      // Every signed-in role sees who recorded each change by name.
      const people = (
        await env.DB.prepare(
          "SELECT id,display_name AS name FROM oa_operators",
        ).all()
      ).results;
      const bookConnections = await bookConnectionViews(env, s);
      return json({
        ...s,
        actor,
        people,
        bookConnections,
        receiptClosures: receiptBookViews(s, bookConnections.some(row => row.enabled && row.credentialPresent && !row.problem)),
        orders: s.orders.map((o) => ({ ...orderView(c, o), backorderPlan: backorderDates(c).find(r => r.orderId === o.id) })),
        supplierBills: supplierBillViews(s),
        purchaseOrders: s.purchaseOrders.map(po => ({ ...po, expectedLandedCost: expectedLandedCost(po) })),
        forecasts: forecast(c),
        replenishmentProblem: planningScope(c).valid ? null : 'Planning warehouses changed. Save the current planning scope before drafting.',
        deliveries: await correspondenceDeliveries(env.DB),
        counts: s.counts.map((count) => countView(c, count)),
        ...floorState(c),
        ...kitState(s),
        ...traceState(s),
        ...channelState(s),
        shippingUnavailable: shippingUnavailable(env),
        ...ediState(s, c.now),
        positions: positions(s),
        ...stockPosition(s),
        reorder: reorder(c),
        commands,
        operators,
      });
    }
    if (request.method !== "POST" || !["/api/pier/commands", "/api/pier/catalogue/preview"].includes(url.pathname))
      return json(
        {
          ok: false,
          error: {
            code: "METHOD",
            message: "Use the public command endpoint.",
          },
        },
        405,
      );
    if (request.headers.get("origin") !== new URL(env.AUTH_ORIGIN).origin)
      throw new Problem(
        "ORIGIN",
        "Send commands from this installation origin.",
        null,
        403,
      );
    if (!request.headers.get("content-type")?.includes("application/json"))
      throw new Problem("CONTENT_TYPE", "Use application/json.", null, 400);
    const raw = await request.text();
    if (raw.length > 2 * 1024 * 1024)
      throw new Problem("SIZE", "Command exceeds 2 MiB.", null, 400);
    let body: any;
    try {
      body = JSON.parse(raw);
    } catch {
      throw new Problem("JSON", "Malformed JSON.", null, 400);
    }
    if (url.pathname === "/api/pier/catalogue/preview") {
      if (!body || typeof body !== "object" || Array.isArray(body)) throw new Problem("INPUT", "Supply a catalogue CSV object.", null, 400);
      const s = await load(env.DB);
      const { trial: _trial, ...preview } = previewCatalogue({ s, actor, commandId: "preview", now: new Date().toISOString() }, body.csv);
      return json(preview);
    }
    const { commandId, type, payload = {} } = body;
    if (!payload || typeof payload !== "object" || Array.isArray(payload))
      throw new Problem("INPUT", "Payload must be an object.", null, 400);
    if (
      typeof commandId !== "string" ||
      !/^[-a-zA-Z0-9_]{8,100}$/.test(commandId) ||
      typeof type !== "string"
    )
      throw new Problem(
        "COMMAND",
        "Supply a unique commandId and command type.",
        null,
        400,
      );
    if (type === "role.set") {
      const target = await env.DB.prepare(
        "SELECT role FROM oa_operators WHERE id=?",
      )
        .bind(payload.operatorId)
        .first<any>();
      if (!target) fail("OPERATOR", "Choose an existing native operator.");
      if (target.role === "owner" && payload.role !== "owner")
        fail(
          "OWNER_ROLE",
          "Native owners retain owner authority. Assign agent roles only to native members.",
        );
    }
    if (['shipping.record','shipping.complete'].includes(type)) fail('SHIPPING_INTERNAL', 'Pier records carrier outcomes itself.');
    if (['shipping.verify','shipping.rates','shipping.buy','shipping.reconcile','shipping.email','shipping.track'].includes(type))
      return json(await performShipping(env, actor, commandId, type, payload));
    if (["edi.send.begin", "edi.send.result", "edi.send.unavailable"].includes(type)) fail("EDI_INTERNAL", "Pier records EDI traffic itself.");
    if (type === "edi.send") return json(await deliverEdi(env, actor, commandId, payload, execute));
    if (["itemAgent.begin", "itemAgent.complete", "itemAgent.failed"].includes(type)) fail("AI_INTERNAL", "Pier records AI request outcomes itself.");
    if (type === "itemAgent.explain") return json(await explainItem(env, actor, commandId, payload, execute));
    if (["book.plan","book.begin","book.record","book.checked","book.reconcile"].includes(type)) fail("BOOK_INTERNAL","Pier records books traffic itself.");
    if (type === "channel.stallLink") fail("CHANNEL_INTERNAL", "Pier creates Stall keys itself.");
    if (type === "channel.stallKey") {
      if (actor.role !== "owner") throw new Problem("FORBIDDEN","Only an owner can connect Stall.",null,403);
      // The key reaches only this reply; the saved command keeps its hash.
      const key = newStallKey();
      const outcome = await execute(env, actor, commandId, "channel.stallLink", { channelId: payload.channelId, version: payload.version, customerId: payload.customerId, keyHash: stallKeyHash(key) });
      if (!outcome) return json({ ok: false, error: { code: "BUSY", message: "Retry." } }, 409);
      return json({ ...outcome, result: { key, origin: new URL(env.AUTH_ORIGIN).origin, customerId: payload.customerId } });
    }
    if (type === "channel.shopifyLocations") {
      if (actor.role !== "owner") throw new Problem("FORBIDDEN","Only an owner can connect Shopify.",null,403);
      try { return json({ok:true,result:await readShopifyLocations(payload),version:(await load(env.DB)).version}); }
      catch { fail('CHANNEL_SETUP','Pier could not load Shopify locations. Check the myshopify.com address and read_locations scope. For a new app, check its client ID/secret and that it is installed on a store in the same Shopify organization; for a legacy app, check its Admin API token.'); }
    }
    if (type === "book.accounts") {
      if (actor.role !== "owner") throw new Problem("FORBIDDEN","Only an owner can connect the books.",null,403);
      const connected = (await load(env.DB)).bookConnections.find((row) => row.enabled);
      return json({ok:true,result:await pantryAccounts(env,payload,connected),version:(await load(env.DB)).version});
    }
    if (type === "book.sync") {
      if (actor.role !== "owner") throw new Problem("FORBIDDEN","Only an owner can sync the books.",null,403);
      return json({ok:true,result:await syncBooks(env),version:(await load(env.DB)).version});
    }
    if (["channel.ingest", "channel.published", "channel.failed"].includes(type)) fail("CHANNEL_INTERNAL", "Pier records channel traffic itself.");
    if (type === "channel.sync") {
      if (actor.role !== "owner") throw new Problem("FORBIDDEN", "Only an owner can synchronize external connections.", null, 403);
      return json({ ok: true, result: await syncChannels(env), version: (await load(env.DB)).version });
    }
    if (type === "dispatch.delivered")
      fail("COMMAND", "Pier records mail delivery itself.");
    if (type === 'mail.process') {
      if (!['owner','buyer','operator'].includes(actor.role)) throw new Problem('FORBIDDEN','Your current role cannot send approved correspondence.',null,403);
      return json({ ok: true, result: await deliverCorrespondence(env), version: (await load(env.DB)).version });
    }
    const outcome = await execute(env, actor, commandId, type, payload);
    if (outcome && type === 'edi.receive' && outcome.result?.acknowledgmentDocumentId) {
      const doc = (await load(env.DB)).ediDocuments.find(d => d.id === outcome.result.acknowledgmentDocumentId);
      if (doc) await deliverEdi(env, actor, `${commandId}-997`, {documentId:doc.id,version:doc.version}, execute);
    }
    if (outcome && type === 'po.sendApproved') await deliverCorrespondence(env, new Date().toISOString(), outcome.result.id, actor);
    if (outcome && ['po.send','slowStock.check','slowStock.flag','order.repromise','order.promisePolicy','po.confirm'].includes(type)) await deliverCorrespondence(env);
    if (outcome && type === "dispatch.close") return json(await deliver(env, actor, commandId, outcome));
    if (outcome) {
      if (execution) execution.waitUntil(Promise.all([syncChannels(env),syncBooks(env)]));
      else await Promise.all([syncChannels(env),syncBooks(env)]);
      return json(outcome);
    }
    return json(
      {
        ok: false,
        error: { code: "BUSY", message: "Retry the same command identity." },
      },
      409,
    );
  } catch (error) {
    if (error instanceof Problem)
      return json(
        {
          ok: false,
          error: {
            code: error.code,
            message: error.message,
            details: error.details,
          },
        },
        error.status,
      );
    return json(
      {
        ok: false,
        error: {
          code: "TRANSACTION",
          message:
            "The command outcome is unconfirmed. Retry the identical command identity and payload to recover its durable outcome.",
        },
      },
      409,
    );
  }
}
