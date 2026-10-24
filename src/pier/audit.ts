import { collections, type Context, type State, type Actor } from './model';
import { resolve } from './floor/codes';
import { authority } from './storage';

const scanTypes = new Set(['receiving.scan', 'pick.scan', 'pack.scan', 'slotting.scan', 'receiving.link']);
// Preserve business field changes without retaining contacts, source originals,
// provider responses, tokens, prompts or untrusted arbitrary metadata.
const fields = new Set(['sku','name','barcode','caseBarcode','unit','packSize','archived','warehouse','kind','zone','status','quantity','reserved','dispatched','received','cancelled','promiseDate','destinationWarehouse','enabled','autoDraft','role','method','reorderPoint','reorderQuantity','maximum','locationId','itemId','permissions','barcodes']);
const businessFields = new Set([...fields, 'id','version','lines','price','cost','freight','duty','tax','currency','approval','approvedBy','actorId','role','at','poLineId','orderLineId','beforeVersion','afterVersion','operationId','responseId','externalId','externalIds','attemptId','requestId','providerId','resultId','commandId','ruleId','ruleVersion','correctionId','reversalId','originalId','invoiceId','creditId','refundId','amount','total','dueDate','confirmation','promiseHistory','backorderPromiseDate','backorderPromisedQuantity','ai','counts','outcome','completedAt','kind','subjectId','warehouses','locationIds','expiresAt','code','packQuantity','originals','extractions','inboxCopies','pendingRequests','orders','purchases','supplierId','customerId','salesRepId','operatorId','repHistory','before','after','minimum','minimumValue','leadDays','safetyStock','windowDays','reviewDays','defaultSupplierId','supplierMode','scope','priority','buffer','provider','channelId','listingId','direction','affectedRecords','terms','estimated','sources','poId','shipmentId','receiptId','returnId','batchId','reservedPromiseDate','allowSplit','creditLimit','creditClearance','paymentTerms','days','discountDays','discountPercent','variantFamily','category','weight','dimensions','length','width','height','image','imageUrl','aliases','unitBarcodes','tier','minimumQuantity','mode','shortage','eligible','defaultEligible','zones','zipPrefixes','states','countries','locations','activeAt','preparedBy','revision','source','sourceVersion','mappingRevision','frontier','settings','rule','condition','threshold','action','budget','privacyErasedAt']);
function image(kind: string, row: any): any {
  if (row === null || row === undefined) return null;
  if (Array.isArray(row)) return row.map(value => image(kind, value));
  if (typeof row !== 'object') return row;
  return Object.fromEntries(Object.entries(row).filter(([key]) => businessFields.has(key) && !(key === 'name' && kind !== 'items' && kind !== 'locations')).map(([key, value]) => [key, image(kind, value)]));
}
export function auditEvent(c: Context, before: State, type: string, p: any, result: any, outcome = 'accepted', reason?: string) {
  const changes: any[] = [], itemIds = new Set<string>(), documents = new Set<string>();
  if (typeof p.itemId === 'string') itemIds.add(p.itemId);
  if (typeof result?.id === 'string') documents.add(result.id);
  const references = (value: any) => {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) { value.forEach(references); return; }
    for (const [key, child] of Object.entries(value)) {
      if (key === 'itemId' && typeof child === 'string') itemIds.add(child);
      if (['orderId','poId','documentId','receiptId','shipmentId','subjectId','proposalId'].includes(key) && typeof child === 'string') documents.add(child);
      if (!['original','raw','source','body','pdf','draft'].includes(key)) references(child);
    }
  };
  for (const key of ['poId','orderId','receivingId','waveId','packId','countId','returnId','jobId','documentId','extractionId','subjectId','proposalId','invoiceId','paymentId']) if (typeof p[key] === 'string') documents.add(p[key]);
  for (const kind of collections) {
    if (kind === 'evidenceDocuments' || kind === 'documentInbox') continue;
    const old = new Map(before[kind].map(r => [r.id, r]));
    const next = new Map(c.s[kind].map(r => [r.id, r]));
    for (const id of new Set([...old.keys(), ...next.keys()])) {
      const previous = old.get(id), row = next.get(id);
      if (JSON.stringify(previous) === JSON.stringify(row)) continue;
      documents.add(id);
      if (kind === 'items') itemIds.add(id);
      for (const affected of [previous, row]) {
        references(affected);
        if (affected?.itemId) itemIds.add(affected.itemId);
        for (const line of affected?.lines ?? []) if (line.itemId) itemIds.add(line.itemId);
      }
      const changedFields = [...new Set([...Object.keys(previous ?? {}), ...Object.keys(row ?? {})])].filter(field => JSON.stringify(previous?.[field]) !== JSON.stringify(row?.[field]));
      changes.push({ kind, id, changedFields, redactedFields: changedFields.filter(field => !businessFields.has(field) || field === 'name' && kind !== 'items' && kind !== 'locations'), beforeVersion: previous?.version ?? null, afterVersion: row?.version ?? null, before: image(kind, previous), after: image(kind, row) });
    }
  }
  let resolution: any = null;
  if (scanTypes.has(type)) {
    try {
      const hit = resolve(type === 'receiving.link' ? c.s : before, p.code ?? p.itemCode);
      if ('item' in hit) { itemIds.add(hit.item.item.id); resolution = { itemId: hit.item.item.id, sku: hit.item.item.sku, packQuantity: String(hit.item.units), unit: 'millionths', trace: hit.item.trace ?? null }; }
      if ('bin' in hit) resolution = { locationId: hit.bin.id };
    } catch { /* Invalid or ambiguous codes have no asserted resolution. */ }
    const wave = before.waves.find(w => w.id === p.waveId), line = wave?.lines.find((l: any) => l.id === p.lineId);
    if (line?.itemId) itemIds.add(line.itemId);
    const receiving = before.receivings.find(r => r.id === p.receivingId);
    if (receiving) for (const line of before.purchaseOrders.find(po => po.id === receiving.poId)?.lines ?? []) itemIds.add(line.itemId);
  }
  const listing = before.channelListings.find(l => l.id === p.listingId);
  if (listing?.itemId) itemIds.add(listing.itemId);
  return { id: c.commandId + ':' + outcome, at: c.now, actorId: c.actor.id, commandId: c.commandId, type, outcome, version: before.version + (outcome === 'refused' ? 0 : 1), rule: c.backgroundPolicy ?? null,
    connectorId: p.channelId ?? (type.startsWith('book.') ? 'pantry' : null), direction: type === 'channel.ingest' ? 'inbound' : type === 'channel.published' ? 'outbound' : null,
    itemIds: [...itemIds], documentIds: [...documents], changes, ...(reason ? { reason } : type === 'receiving.link' ? { reason: p.reason } : {}),
    ...(scanTypes.has(type) ? { code: typeof (p.code ?? p.itemCode) === 'string' ? (p.code ?? p.itemCode).slice(0, 200) : '', binCode: typeof p.binCode === 'string' ? p.binCode.slice(0, 200) : null, device: typeof p.device === 'string' ? p.device.slice(0, 120) : 'unspecified input', resolution } : {}),
  };
}
export function auditStatement(db: D1Database, event: ReturnType<typeof auditEvent>) {
  return db.prepare('INSERT INTO pier_audit(id,at,actor_id,command_id,event_type,outcome,data) VALUES(?,?,?,?,?,?,?)').bind(event.id,event.at,event.actorId,event.commandId,event.type,event.outcome,JSON.stringify(event));
}
export async function refusedScan(db: D1Database, actor: Actor, commandId: string, type: string, p: any, reason: string, s: State) {
  if (!scanTypes.has(type)) return;
  const c: Context = { s, actor, commandId, now: new Date().toISOString() }, event = auditEvent(c, s, type, p, null, 'refused', reason), gate = authority(actor);
  await db.prepare('INSERT INTO pier_audit(id,at,actor_id,command_id,event_type,outcome,data) SELECT ?,?,?,?,?,?,? WHERE (' + gate.sql + ') ON CONFLICT(id) DO NOTHING').bind(event.id,event.at,event.actorId,event.commandId,event.type,event.outcome,JSON.stringify(event),...gate.params).run();
}
export async function auditRows(db: D1Database) {
  const rows = await db.prepare('SELECT data FROM pier_audit ORDER BY at,id').all<{data:string}>();
  return rows.results.map(row => JSON.parse(row.data));
}
