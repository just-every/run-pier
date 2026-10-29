import { supplierSubstitutes, substituteActors, supplierSubstituteView, substituteSource } from './supplier-substitutes';
import { requireAssurance } from '../strong-auth/assurance';
import { trade, tradeResponse } from './trade';
import { integrationHealth } from './integration-health';
import { customFieldCommands, customFieldRead, customFieldProjection, privateFieldCustody } from './custom-fields';
import { stockFeed } from './stock-feed';
import { purchaseChanges } from './purchase-changes';
import { purchaseApproval, purchaseApprovalRoute } from './purchase-approval';
import { customers, customerViews } from './customers';
import { releaseBackorders } from './backorder-release';
import { stocktakes, stocktakeView, enforceStocktakeFreeze } from './stocktakes';
import { savedReports, filteredReports, reportCsv } from './saved-reports';
import { workflowRules } from './workflow-rules';
import { privacy, privacyPreview, privacySubjectPreview } from './privacy';
import { providerOperation } from './provider-audit';
import { bulkInputDigest } from './item-agent/bulk';
import { liveQuestion } from './item-agent/questions';
import { auditEvent, auditRows, refusedScan } from './audit';
import { admitScopedCommand, allowedLocations, physicalState, scoped } from './permissions';
import { admitPhysicalEffects } from './physical-admission';
import { admitRead, roleState, physicalResult, operationalState, commandProjection } from './role-reads';
import { admitCommercialCommand } from './role-visibility';
import { commandIdentities } from './command-identities';
import { recurringOrders } from './recurring-orders';
import { documents } from './documents/commands';
import { extractDocument } from './documents/provider';
import { documentInbound } from './documents/inbound';
import { documentRead } from './documents/routes';
import { documentViews } from './documents/records';
import { commandText } from './documents/body';
import { dropships } from './dropships';
import { routing } from './routing';
import { salesDocuments } from './sales-documents';
import { deliverDocument } from './print/mail';
import { printedDocuments, generateDocument } from './print/commands';
import { printRead } from './print/routes';
import { deliveryWebhook } from './print/delivery-events';
import { invoices, nativeBalance, customerBalance } from './invoices/index';
import { paymentResponse, performPayment } from './payments/index';
import { salesImports } from './sales-imports';
import { salesQuotes } from './sales-quotes';
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
import { load, saved, commit, authority, policyAuthority, activeAutomationActors } from "./storage";
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
import { operationalExceptions, refreshOperationalExceptions, operationalCaseView } from "./operational-exceptions";
import { slowStock, refreshSlowStock } from "./slow-stock";
import { pricing } from "./pricing";
import { lateLandedCost } from './late-landed-cost';
import { costing } from "./costing";
import { reports } from "./reports";
import { warehouse, countView } from "./warehouse";
import { imports, importOriginal } from "./imports";
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
  await requireAssurance(env, session.id, session.operator.id);
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
    permissionVersion: role ? JSON.parse(role.data).version : 0,
    permissions: role ? JSON.parse(role.data).permissions : undefined,
    visibility: role ? JSON.parse(role.data).visibility : undefined,
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
    ? (JSON.parse(a.data).role !== 'owner' && (JSON.parse(a.data).permissions || JSON.parse(a.data).role === 'buyer' && JSON.parse(a.data).visibility?.costs === false || ['operator', 'sales'].includes(JSON.parse(a.data).role) && JSON.parse(a.data).visibility?.prices === false) ? "viewer" : JSON.parse(a.data).role)
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
              : ["owner", "operator", "sales"];
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
  const gate = backgroundPolicy ? policyAuthority({ actor, backgroundPolicy }) : authority(actor);
  if (!(await env.DB.prepare(`SELECT CASE WHEN (${gate.sql}) THEN 1 ELSE 0 END AS ok`).bind(...gate.params).first<any>())?.ok)
    throw new Problem('AUTH', 'Session or role changed. Sign in again.', null, 401);
  admitScopedCommand(await load(env.DB), actor, type, payload);
  admitCommercialCommand(actor, type);
  const digest = sha256(canonicalJson({ type, payload }));
  const previous = await saved(env.DB, commandId, digest, actor, backgroundPolicy);
  if (previous) {
    if (actor.role !== 'owner' && (type.startsWith('customField.') || type.startsWith('import.') && privateFieldCustody(await load(env.DB)) || previous.result?.pdf)) throw new Problem('FORBIDDEN', 'Current owner authority is required to recover protected field content, originals or documents.', null, 403);
    return { ...previous, replayed: true, result: physicalResult(await load(env.DB), actor, previous.result) };
  }
  // A losing optimistic admission is recomputed from current stock. This is
  // database concurrency handling, not a retry of an external effect or model.
  for (let attempt = 0; attempt < 8; attempt++) {
    const before = await load(env.DB),
      s = structuredClone(before),
      c: Context = { s, actor, commandId, now: now(), backgroundPolicy, installationScope:sha256('pier-recurring-authority\0'+env.SESSION_SECRET), automationActors: await activeAutomationActors(env.DB), booksCredentialPresent: (await bookConnectionViews(env, s)).some(connection => connection.credentialPresent) };
    if (type.startsWith('substitute.')) c.substituteActors = await substituteActors(env.DB);
    await approver(env, c, type, payload);
    let result: any = await privacy(c, type, payload, env);
    if (result === undefined) result = supplierBills(c, type, payload);
    if (result === undefined) result = await shipping(c, type, payload, env);
    if (result === undefined) result = business(c, type, payload);
    if (result === undefined) result = await edi(c, type, payload, env);
    if (result === undefined) result = await books(c, type, payload, env);
    if (result === undefined) result = await itemAgent(c, type, payload, env);
    if (result === undefined) result = await documents(c, type, payload, env);
    if (result === undefined) result = await printedDocuments(c, type, payload, env);
    if (result === undefined) result = await salesDocuments(c, type, payload);
    if (result === undefined) result = await invoices(c, type, payload, env);
    if (result === undefined) result = await channels(c, type, payload, env);
    if (backgroundPolicy && type === "automation.tick") result = { id: commandId, version: 1, draftIds: backgroundPolicy.collection === "purchaseOrders" ? [purchaseSend(c, "po.sendApproved", { poId: backgroundPolicy.id, version: s.purchaseOrders.find(po => po.id === backgroundPolicy.id)!.version })!.id] : backgroundPolicy.collection === "replenishmentPolicies" ? draftReplenishment(c, { policyId: backgroundPolicy.id, autoOnly: true }).map((po: any) => po.id) : [] };
    for (const handle of [
      trade,
      customFieldCommands,
      purchaseApproval,
      purchaseChanges,
      supplierSubstitutes,
      savedReports,
      workflowRules,
      trace,
      kits,
      slotting,
      catalogue,
      catalogueBulk,
      recurringOrders,
      dropships,
      routing,
      salesImports,
      salesQuotes,
      pricing,
      costing,
      lateLandedCost,
      orders,
      returns,
      purchasing,
      supplierInspections,
      supplierReturns,
      purchasingWorkflow,
      purchaseSend,
      slowStock,
      operationalExceptions,
      replenishment,
      warehouse,
      stocktakes,
      releaseBackorders,
      customers,
      imports,
      proposals,
      floor,
    ]) {
      if (result !== undefined) break;
      result = handle(c, type, payload);
      if (result !== undefined) break;
    }
    if (result === undefined) fail("COMMAND", "Unknown command type.");
    if (scoped(actor)) admitPhysicalEffects(before, s, allowedLocations(before, actor));
    for (const message of s.correspondence.filter(message => message.kind === 'purchase-order' && !message.documentId && !before.correspondence.some(old => old.id === message.id))) {
      const document = await generateDocument(c, { kind: 'purchase-order', sourceId: message.recordId }, undefined, true);
      message.documentId = document.id;
      if (env.MAIL_PROVIDER === 'rer') {
        message.documentAttachment = 'unavailable';
        message.body += '\n\nPDF attachment unavailable: this Managed relay sends the text copy only. The retained purchase document has not been delivered.';
      }
    }
    enforceStocktakeFreeze(c, before, type, payload);
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
      const outcome = await saved(env.DB, commandId, digest, actor, backgroundPolicy);
      if (!outcome)
        fail(
          "IMPORT_PUBLICATION",
          "The reviewed import was not published. Resume the same command.",
        );
      return outcome;
    }
    // Retaining and reviewing untrusted evidence never triggers unrelated plans.
    if (!type.startsWith('substitute.') && !type.startsWith('trade.') && !['itemAgent.bulkPreview', 'itemAgent.bulkEdit'].includes(type) && !['replenishment.compare', 'replenishment.review'].includes(type) && !type.startsWith('report.') && !type.startsWith('workflow.') && !type.startsWith('privacy.') && (!type.startsWith('document.') || type === 'document.approve')) {
    // Immediate planning stays within the signing buyer's own approved policies.
    for (const policy of c.s.replenishmentPolicies.filter(p => p.autoDraft && p.approvedBy === actor.id && ['owner','buyer'].includes(actor.role))) {
      if (!backgroundPolicy && type !== 'po.delete' && !type.startsWith('itemAgent.') && !type.startsWith('ai.')) draftReplenishment(c, { policyId: policy.id, autoOnly: true });
    }
    refreshReorderExceptions(c);
    refreshPromises(c);
    refreshSlowStock(c, backgroundPolicy?.collection === "slowStockPolicies");
    markChannelPending(c, before);
    }
    if (!type.startsWith('substitute.')) {
      refreshOperationalExceptions(c, backgroundPolicy?.collection === "operationalExceptionPolicies");
      invalidatePurchaseSends(c);
    }
    if (type === 'itemAgent.bulkApply') result.sourceDigest = bulkInputDigest(c);
    const visibleResult = physicalResult(s, actor, result);
    c.audit = auditEvent(c, before, type, payload, result, type.endsWith(".failed") ? "failed" : "accepted");
    try {
      const outcome = await commit(env, c, before, digest, result);
      return { ...outcome, result: visibleResult };
    } catch (error) {
      const replay = await saved(env.DB, commandId, digest, actor, backgroundPolicy);
      if (replay) return { ...replay, replayed: true, result: physicalResult(await load(env.DB), actor, replay.result) };
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
  const sent = await sendSummary(env, day, actor, commandId);
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
    const payment = await paymentResponse(request, env, execute);if(payment)return payment;
    const eventDelivery = await deliveryWebhook(request,env);if(eventDelivery)return eventDelivery;
    const inboundDocument = await documentInbound(request, env);
    if (inboundDocument) return inboundDocument;
    const carrierWebhook = await shippingWebhook(request, env);
    if (carrierWebhook) return carrierWebhook;
    const webhook = await channelWebhook(request, env);
    if (webhook) return webhook;
    const tradeReply = await tradeResponse(request, env);
    if (tradeReply) return tradeReply;
    const stall = await stallLink(request, env);
    if (stall) return stall;
    const actor = await current(request, env);
    let privateFields = false;
    const reply = (body:unknown,status=200) => json(customFieldProjection(commandProjection(body,actor),actor,privateFields),status);
    if (['/api/pier/stock-changes','/api/pier/stock-changes/ack'].includes(url.pathname)) {
      if (request.method === 'POST' && (request.headers.get('origin') !== new URL(env.AUTH_ORIGIN).origin || !request.headers.get('content-type')?.includes('application/json'))) throw new Problem('ORIGIN','Use same-origin JSON acknowledgement.',null,403);
      return await stockFeed(request,env.DB,actor,await load(env.DB));
    }
    if (request.method === "GET") {
      admitRead(actor, url);
      const full = await load(env.DB), s = physicalState(full, actor),
        c: Context = { s, actor, commandId: "", substituteActors: actor.role === 'owner' ? await substituteActors(env.DB) : undefined, now: new Date().toISOString(), automationActors: await activeAutomationActors(env.DB), booksCredentialPresent: (await bookConnectionViews(env, s)).some(connection => connection.credentialPresent) };
      privateFields = privateFieldCustody(full);
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
      if (url.pathname === '/api/pier/integrations') {
        if (actor.role !== 'owner') throw new Problem('FORBIDDEN', 'Only the current owner can inspect connector recovery.', null, 403);
        return reply(await integrationHealth(env, full));
      }
      if (url.pathname === '/api/pier/custom-fields') return reply(customFieldRead(c,url.searchParams));
      if (url.pathname === '/api/pier/questions') return reply(liveQuestion(full, actor, url.searchParams));
      if (scoped(actor)) {
        if (url.pathname === '/api/pier/scope-export') return reply({ format: 'pier-scoped-stock-v1', ...s });
        if (url.pathname === '/api/pier/state') return reply({ ...operationalState(full, actor), commands: await commandIdentities(env.DB, actor, url.searchParams.get('commandId')) });
      }
      if (url.pathname === '/api/pier/scope-export') return reply({ format: 'pier-scoped-stock-v1', ...operationalState(full, actor) });
      const reportFile = /^\/api\/pier\/report-snapshots\/([^/]+)\.csv$/.exec(url.pathname);
      if (reportFile) {
        if (actor.role !== 'owner') throw new Problem('FORBIDDEN','Only an owner can export saved report details.',null,403);
        const snapshot = s.reportSnapshots.find(r=>r.id===reportFile[1]) ?? fail('NOT_FOUND','Saved report snapshot not found.');
        return new Response(reportCsv(snapshot.result),{headers:{'content-type':'text/csv; charset=utf-8','content-disposition':'attachment; filename="pier-report.csv"','cache-control':'no-store','x-content-type-options':'nosniff'}});
      }
      if (url.pathname === '/api/pier/privacy') {
        if (actor.role !== 'owner') throw new Problem('FORBIDDEN', 'Only an owner can inspect retention and erasure dependencies.', null, 403);
        const kind = url.searchParams.get('kind'), subjectId = url.searchParams.get('subjectId');
        return reply(kind && subjectId ? await privacySubjectPreview(s, kind, subjectId, env) : { policies: s.privacyPolicies, holds: s.privacyHolds, receipts: s.privacyReceipts, reviewDue: s.evidenceDocuments.filter(d => Date.parse(d.createdAt) + (s.privacyPolicies[0]?.reviewAfterDays ?? 36500) * 86400000 <= Date.now()).map(d => d.id), automaticDeletion: false });
      }
      if (url.pathname === '/api/pier/audit') {
        const events = await auditRows(env.DB);
        return reply(events.filter(event => ['itemId','documentId','userId','connectorId','commandId'].every(key => {
          const value = url.searchParams.get(key);
          return !value || (key === 'itemId' ? event.itemIds.includes(value) : key === 'documentId' ? event.documentIds.includes(value) || event.commandId === value : key === 'userId' ? event.actorId === value : key === 'commandId' ? event.commandId === value : event.connectorId === value);
        })));
      }
      const nativeOriginal = importOriginal(url.pathname, actor, s);
      if (nativeOriginal) return nativeOriginal;
      const printDocument=printRead(url.pathname,actor,s);if(printDocument)return printDocument;
      const originalDocument = documentRead(url.pathname, actor, s);
      if (originalDocument) return originalDocument;
      const labelMatch = /^\/api\/pier\/shipping\/labels\/([^/]+)\.(pdf|zpl)$/.exec(url.pathname);
      if (labelMatch) {
        const connection = full.shippingSettings.find(row => row.id === 'shipping:easypost');
        if (!connection?.enabled) fail('SHIPPING_KEY', 'Reconnect EasyPost before downloading a carrier label.');
        const blocked = shippingUnavailable(env);
        if (blocked) fail('SHIPPING_UNAVAILABLE', blocked);
        const job = s.shippingJobs.find(j => j.id === labelMatch[1]);
        const destination = labelUrl(labelMatch[2] === 'pdf' ? job?.labelPdfUrl : job?.labelZplUrl);
        if (!destination) fail('LABEL', 'This label format is not available from the carrier.');
        const response = await providerOperation(env.DB, { actor, commandId: crypto.randomUUID(), connectorId: 'shipping-easypost', operation: 'shipping.labelDownload', direction: 'inbound', state: full, sources: [{ collection: 'shippingJobs', row: job! }, { collection: 'shippingSettings', row: connection! }], documentIds: [job!.id, job!.orderId], itemIds: full.orders.find(order => order.id === job!.orderId)?.lines.map((line: any) => line.itemId) ?? [] }, () => fetch(destination!, { redirect: 'manual', signal: AbortSignal.timeout(25000) }), response => ({ outcome: response.ok ? 'accepted' : 'refused' }));
        if (!response.ok) fail('LABEL', 'The carrier label could not be downloaded. Check EasyPost.');
        return new Response(response.body, { headers: { 'content-type': labelMatch[2] === 'pdf' ? 'application/pdf' : 'application/octet-stream', 'content-disposition': `inline; filename="pier-label-${job!.carton}.${labelMatch[2]}"`, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } });
      }
      const salesPdf=/^\/api\/pier\/sales-documents\/([^/]+)\.pdf$/.exec(url.pathname);
      if(salesPdf){
        if(actor.role!=='owner')throw new Problem('FORBIDDEN','Only an owner can read retained commercial PDFs.',null,403);
        const doc=s.salesDocuments.find(d=>d.id===salesPdf[1]) ?? fail('NOT_FOUND','Document not found.');
        if (!doc.pdf && doc.privacyErasedAt) return reply({ ok:false, error:{ code:'ERASED', message:'This private document copy was erased.' } },410);
        return new Response(Uint8Array.from(atob(doc.pdf),ch=>ch.charCodeAt(0)),{headers:{'content-type':'application/pdf','cache-control':'no-store','content-disposition':`inline; filename="${doc.filename}"`,'x-content-type-options':'nosniff'}});
      }
      const packSlip = /^\/api\/pier\/packs\/([^/]+)\/packing-slip$/.exec(url.pathname);
      if (packSlip) {
        const physical = actor.role !== 'owner' ? operationalState(full, actor) : s;
        if (!physical.packs.some(pack => pack.id === packSlip[1])) throw new Problem('SCOPE', 'This pack is outside your current warehouse grant.', null, 403);
        return packDocument(physical, packSlip[1], actor.role !== 'owner');
      }
      const packingSlip = /^\/api\/pier\/orders\/([^/]+)\/packing-slip$/.exec(url.pathname);
      if (packingSlip) {
        const physical = actor.role !== 'owner' ? operationalState(full, actor) : s;
        if (!physical.orders.some(order => order.id === packingSlip[1])) throw new Problem('SCOPE', 'This order is outside your current warehouse grant.', null, 403);
        return kitDocument(physical, packingSlip[1], actor.role !== 'owner');
      }
      const ediDownload = ediFile(s, url.pathname);
      if (ediDownload) return ediDownload;
      if (["/api/pier/books/export.csv","/api/pier/books/export.iif"].includes(url.pathname)) {
        const format = url.pathname.endsWith(".iif") ? "iif" : "csv";
        try { return new Response(booksExport(s, format), {headers:{"content-type":format === "csv" ? "text/csv; charset=utf-8" : "text/plain; charset=utf-8","content-disposition":`attachment; filename="pier-books.${format}"`,"cache-control":"no-store"}}); } catch(error) { fail("BOOK_EXPORT", error instanceof Error ? error.message : "Review the financial documents before exporting."); }
      }
      if (url.pathname === "/api/pier/native-export") {
        if (actor.role !== 'owner' && privateFields) throw new Problem('FORBIDDEN','Only an owner can export private custom-field CSV originals.',null,403);
        return reply(nativeExport(s));
      }
      if (url.pathname === '/api/pier/trace') return reply(traceReport(s, url.searchParams.get('identityId') ?? ''));
      if (url.pathname === "/api/pier/returns/lookup")
        return reply(returnLookup(s, url.searchParams.get("code")));
      if (url.pathname === "/api/pier/supplier-performance") return reply(supplierPerformance(s));
      if (url.pathname === '/api/pier/replenishment') return reply(forecast(c, [{ itemId: url.searchParams.get('itemId') ?? '', warehouse: url.searchParams.get('warehouse') ?? '', supplierId: url.searchParams.get('supplierId') ?? undefined }]));
      if (url.pathname === "/api/pier/reports") return reply(filteredReports(s, Object.fromEntries(url.searchParams)));
      if (url.pathname === "/api/pier/dispatch-summary")
        return reply(
          dispatchSummary(
            s,
            url.searchParams.get("date") ?? "",
            url.searchParams.get("timeZone") ?? "",
            url.searchParams.get("warehouse"),
          ),
        );
      if (url.pathname === "/api/pier/export") {
        if(actor.role!=='owner')throw new Problem('FORBIDDEN','Only an owner can export the complete business record and commercial source artifacts.',null,403);
        if (url.searchParams.has('source')) return reply(substituteSource(s, url.searchParams));
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
        return reply({
          format: "pier-business-v1",
          currency: "USD",
          precision: 6,
          exportedAt: new Date().toISOString(),
          ...s,
          auditEvents: await auditRows(env.DB),
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
        return reply(
          {
            ok: false,
            error: { code: "NOT_FOUND", message: "Unknown endpoint." },
          },
          404,
        );
      const commands = await commandIdentities(env.DB, actor, url.searchParams.get('commandId'));
      const operators =
        actor.role === "owner"
          ? (
              await env.DB.prepare(
                "SELECT id,email,display_name AS name,role,status FROM oa_operators",
              ).all()
            ).results
          : [];
      // Every signed-in role sees who recorded each change by name.
      const people = scoped(actor) ? [] : (
        await env.DB.prepare(
          "SELECT id,display_name AS name FROM oa_operators",
        ).all()
      ).results;
      const bookConnections = await bookConnectionViews(env, s);
      return reply(roleState(full, actor, {
        ...s,
        invoices: actor.role==='owner'?s.invoices.map(i=>({...i,balance:nativeBalance(s,i.id)})):[],
        customerProfiles: actor.role === 'owner' ? customerViews(s, c.now) : [],
        salesReps: actor.role === 'owner' ? s.salesReps : [],
        customerBalances: actor.role==='owner'?Object.fromEntries(s.parties.filter(p=>p.kind==='customer').map(p=>[p.id,customerBalance(s,p.id)])):{},
        evidenceDocuments: actor.role === 'owner' ? documentViews(s).documents : [],
        documentExtractions: actor.role === 'owner' ? s.documentExtractions : [],
        documentSettings: actor.role === 'owner' ? s.documentSettings : [],
        documentInbox: actor.role === 'owner' ? documentViews(s).inbox : [],
        ...(actor.role==='owner'?{}:{savedReports:[],reportSnapshots:[],workflowRules:[],workflowJobs:[],privacyHolds:[],privacyPolicies:[],privacyReceipts:[],salesDocuments:[],businessTemplates:[],printMailEvents:[],invoices:[],invoiceCredits:[],paymentConnections:[],invoicePayLinks:[],invoicePaymentSessions:[],invoicePayments:[],salesImports:[],recurringOrders:[],dropships:[],customerCredits:[],parties:s.parties.map(({creditClearance,resaleCertificates,contacts,addresses,paymentTerms,salesRepId,...party})=>party)}),
        actor,
        proposals: s.proposals.map(proposal => supplierSubstituteView(c, proposal)),
        people,
        bookConnections,
        operationalExceptions: actor.role === "owner" ? s.operationalExceptions.map(record => operationalCaseView(c, record)) : [],
        receiptClosures: receiptBookViews(s, bookConnections.some(row => row.enabled && row.credentialPresent && !row.problem)),
        orders: s.orders.map((o) => ({ ...orderView(c, o),...(actor.role==='owner'?{}:{creditClearance:undefined}), backorderPlan: backorderDates(c).find(r => r.orderId === o.id) })),
        supplierBills: supplierBillViews(s),
        purchaseOrders: s.purchaseOrders.map(po => {
          let approvalRoute = null, approvalRouteError = null;
          try { approvalRoute = purchaseApprovalRoute(c, po); } catch (error) { approvalRouteError = (error as Error).message; }
          return { ...po, approvalRoute, approvalRouteError, expectedLandedCost: expectedLandedCost(po) };
        }),
        forecasts: forecast(c),
        replenishmentProblem: planningScope(c).valid ? null : 'Planning warehouses changed. Save the current planning scope before drafting.',
        deliveries: scoped(actor) ? [] : (await correspondenceDeliveries(env.DB)).filter(d=>actor.role==='owner'||!s.salesDocuments.some(doc=>doc.id===d.correspondenceId)),
        counts: s.counts.map((count) => countView(c, count)),
        stocktakes: s.stocktakes.map(take => stocktakeView(c, take)),
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
        auditEvents: scoped(actor) ? [] : await auditRows(env.DB),
        operators,
      }));
    }
    if (request.method !== "POST" || !["/api/pier/commands", "/api/pier/catalogue/preview"].includes(url.pathname))
      return reply(
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
    const raw = await commandText(request);
    let body: any;
    try {
      body = JSON.parse(raw);
    } catch {
      throw new Problem("JSON", "Malformed JSON.", null, 400);
    }
    const gate = authority(actor);
    if (!(await env.DB.prepare(`SELECT CASE WHEN (${gate.sql}) THEN 1 ELSE 0 END AS ok`).bind(...gate.params).first<any>())?.ok)
      throw new Problem('AUTH', 'Session or role changed. Sign in again.', null, 401);
    if (url.pathname === "/api/pier/catalogue/preview") {
      if (!body || typeof body !== "object" || Array.isArray(body)) throw new Problem("INPUT", "Supply a catalogue CSV object.", null, 400);
      const s = await load(env.DB);
      admitScopedCommand(s, actor, 'catalogue.preview', body);
      const { trial: _trial, ...preview } = previewCatalogue({ s, actor, commandId: "preview", now: new Date().toISOString() }, body.csv);
      return reply(preview);
    }
    privateFields = privateFieldCustody(await load(env.DB));
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
    admitScopedCommand(await load(env.DB), actor, type, payload);
    admitCommercialCommand(actor, type);
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
      return reply(await performShipping(env, actor, commandId, type, payload));
    if (["edi.send.begin", "edi.send.result", "edi.send.unavailable"].includes(type)) fail("EDI_INTERNAL", "Pier records EDI traffic itself.");
    if (type === "edi.send") return reply(await deliverEdi(env, actor, commandId, payload, execute));
    if (["itemAgent.begin", "itemAgent.complete", "itemAgent.failed"].includes(type)) fail("AI_INTERNAL", "Pier records AI request outcomes itself.");
    if (['document.begin', 'document.complete', 'document.failed'].includes(type)) fail('DOCUMENT_INTERNAL', 'Pier records paid document request outcomes itself.');
    if (type.startsWith('document.') && actor.role !== 'owner') throw new Problem('FORBIDDEN', 'Only an owner can access retained originals and document processing.', null, 403);
    if (['payment.record','payment.begin','payment.complete','payment.apply'].includes(type))fail('PAYMENT_INTERNAL','Pier records verified payment outcomes itself.');
    if(['payment.checkout','payment.reconcile','payment.expire'].includes(type))return reply(await performPayment(env,actor,commandId,type,payload,execute));
    if (type === 'document.extract') return reply(await extractDocument(env, actor, commandId, payload, execute));
    if (type === "itemAgent.explain") return reply(await explainItem(env, actor, commandId, payload, execute));
    if (["book.plan","book.begin","book.record","book.checked","book.reconcile"].includes(type)) fail("BOOK_INTERNAL","Pier records books traffic itself.");
    if (type === "channel.stallLink") fail("CHANNEL_INTERNAL", "Pier creates Stall keys itself.");
    if (type === "channel.stallKey") {
      if (actor.role !== "owner") throw new Problem("FORBIDDEN","Only an owner can connect Stall.",null,403);
      // The key reaches only this reply; the saved command keeps its hash.
      const key = newStallKey();
      const outcome = await execute(env, actor, commandId, "channel.stallLink", { channelId: payload.channelId, version: payload.version, customerId: payload.customerId, keyHash: stallKeyHash(key) });
      if (!outcome) return reply({ ok: false, error: { code: "BUSY", message: "Retry." } }, 409);
      return reply({ ...outcome, result: { key, origin: new URL(env.AUTH_ORIGIN).origin, customerId: payload.customerId } });
    }
    if (type === "channel.shopifyLocations") {
      if (actor.role !== "owner") throw new Problem("FORBIDDEN","Only an owner can connect Shopify.",null,403);
      try { const state = await load(env.DB); return reply({ok:true,result:await providerOperation(env.DB, { actor, commandId, connectorId: 'shopify', operation: 'channel.locations', direction: 'inbound', state, sources: [] }, () => readShopifyLocations(payload)),version:(await load(env.DB)).version}); }
      catch { fail('CHANNEL_SETUP','Pier could not load Shopify locations. Check the myshopify.com address and read_locations scope. For a new app, check its client ID/secret and that it is installed on a store in the same Shopify organization; for a legacy app, check its Admin API token.'); }
    }
    if (type === "book.accounts") {
      if (actor.role !== "owner") throw new Problem("FORBIDDEN","Only an owner can connect the books.",null,403);
      const state = await load(env.DB), connected = state.bookConnections.find((row) => row.enabled);
      return reply({ok:true,result:await providerOperation(env.DB, { actor, commandId, connectorId: 'pantry', operation: 'book.accounts', direction: 'inbound', state, sources: connected ? [{ collection: 'bookConnections', row: connected }] : [] }, () => pantryAccounts(env,payload,connected)),version:(await load(env.DB)).version});
    }
    if (type === "book.sync") {
      if (actor.role !== "owner") throw new Problem("FORBIDDEN","Only an owner can sync the books.",null,403);
      return reply({ok:true,result:await syncBooks(env),version:(await load(env.DB)).version});
    }
    if (["channel.ingest", "channel.published", "channel.failed"].includes(type)) fail("CHANNEL_INTERNAL", "Pier records channel traffic itself.");
    if (type === "channel.sync") {
      if (actor.role !== "owner") throw new Problem("FORBIDDEN", "Only an owner can synchronize external connections.", null, 403);
      return reply({ ok: true, result: await syncChannels(env), version: (await load(env.DB)).version });
    }
    if (type === "dispatch.delivered")
      fail("COMMAND", "Pier records mail delivery itself.");
    if (type === 'mail.process') {
      if (!['owner','buyer','operator'].includes(actor.role)) throw new Problem('FORBIDDEN','Your current role cannot send approved correspondence.',null,403);
      return reply({ ok: true, result: await deliverCorrespondence(env), version: (await load(env.DB)).version });
    }
    if(['order.create','quote.create'].includes(type)&&(Object.hasOwn(payload,'nativeCutover')||payload.fulfilment||payload.channelId||payload.ediPartnerId||payload.routingSource&&payload.routingSource!=='manual'))fail('ROUTING_SOURCE','Public manual orders use the manual source; connector and file sources are assigned by their own intake doors.');
    let outcome;
    try { outcome = await execute(env, actor, commandId, type, payload); }
    catch (error) {
      if (error instanceof Problem) await refusedScan(env.DB, actor, commandId, type, payload, error.code, await load(env.DB));
      throw error;
    }
    if (outcome && (type.startsWith('substitute.') || type.startsWith('trade.') || ['replenishment.compare', 'replenishment.review'].includes(type) || type.startsWith('document.') || type.startsWith('privacy.') || type.startsWith('workflow.') || type.startsWith('report.'))) return reply(outcome);
    if(outcome && ['quote.send','order.confirm','print.send'].includes(type)) await deliverDocument(env,actor,outcome.result.id);
    if (outcome && type === 'print.send' && outcome.result.kind === 'purchase-order') await deliverCorrespondence(env, new Date().toISOString(), outcome.result.id, actor);
    if (outcome && type === 'edi.receive' && outcome.result?.acknowledgmentDocumentId) {
      const doc = (await load(env.DB)).ediDocuments.find(d => d.id === outcome.result.acknowledgmentDocumentId);
      if (doc) await deliverEdi(env, actor, `${commandId}-997`, {documentId:doc.id,version:doc.version}, execute);
    }
    if (outcome && type === 'po.sendApproved') await deliverCorrespondence(env, new Date().toISOString(), outcome.result.id, actor);
    if (outcome && ['po.send','slowStock.check','slowStock.flag','order.repromise','order.promisePolicy','po.confirm'].includes(type)) await deliverCorrespondence(env);
    if (outcome && type === "dispatch.close") return reply(await deliver(env, actor, commandId, outcome));
    if (outcome) {
      // Settled replays recover their durable result. Uncertain ledger work
      // still reconciles, while explicit and scheduled syncs always read back.
      const booksPending = !outcome.replayed || (await load(env.DB)).bookJobs.some(job => job.document && !['posted','reconciled','skipped'].includes(job.status));
      const followUp = Promise.all([syncChannels(env), ...(booksPending ? [syncBooks(env)] : [])]);
      if (execution) execution.waitUntil(followUp);
      else await followUp;
      return reply(outcome);
    }
    return reply(
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
