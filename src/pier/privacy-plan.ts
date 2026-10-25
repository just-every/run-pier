import { collections, fail, get, type State, type Row } from './model';
import { canonicalJson, sha256 } from './import-kit';

export type NativeSubject = { id: string; version: number; email: string; display_name: string; role: string; status: string };
const references = new Set(['customerId','supplierId','operatorId','orderId','poId','receiptId','shipmentId','returnId','recordId','sourceId','documentId','invoiceId','creditId','salesRepId','packId','ediOrderId','ruleId','scheduleId','defaultSupplierId','dropshipId']);
export function refers(value: any, ids: Set<string>): boolean {
  if (!value || typeof value !== 'object') return false;
  if (Array.isArray(value)) return value.some(v => refers(v, ids));
  return Object.entries(value).some(([key, v]) => references.has(key) && typeof v === 'string' && ids.has(v) || key === 'supplierIds' && Array.isArray(v) && v.some(id => ids.has(id)) || refers(v, ids));
}
export function contains(value: any, ids: Set<string>): boolean {
  return typeof value === 'string' ? ids.has(value) : !!value && typeof value === 'object' && Object.values(value).some(v => contains(v, ids));
}
export function subjectPlan(s: State, kind: string, id: string, native?: NativeSubject) {
  if (!['customer','supplier','operator'].includes(kind)) fail('PRIVACY_KIND', 'Choose a customer, supplier or operator.');
  const target: any = kind === 'operator' ? native ?? get(s, 'roles', id) : get(s, 'parties', id);
  if (kind !== 'operator' && target.kind !== kind) fail('PRIVACY_KIND', 'The subject must match the requested customer or supplier kind.');
  const ids = new Set<string>([id]), nodes: { kind: typeof collections[number]; row: Row }[] = [];
  // Stock definitions and shared parties never become subjects through an item link.
  const dependent = collections.filter(k => !['items','locations','parties','roles','privacyHolds','privacyPolicies','privacyReceipts','imports','salesImports'].includes(k));
  if (kind === 'operator') for (const rep of s.salesReps.filter(r => r.operatorId === id)) ids.add(rep.id);
  let changed = true;
  while (changed) {
    changed = false;
    for (const collection of dependent) for (const record of s[collection]) {
      const ownedOriginal = kind === 'operator' && (collection === 'evidenceDocuments' && record.source?.actorId === id || collection === 'documentExtractions' && record.requestedBy === id);
      const nestedPolicy = kind === 'operator' && ['promisePolicy','sendPolicy','chasePolicy','creditClearance'].some(field => record[field]?.approvedBy === id);
      const authoredPolicy = nestedPolicy || kind === 'operator' && ['recurringOrders','workflowRules','replenishmentPolicies','replenishmentSettings','slowStockPolicies','savedReports','channels','bookConnections','paymentConnections','shippingSettings','documentSettings','businessTemplates','aiSettings'].includes(collection) && (record.approvedBy === id || record.updatedBy === id || record.consent?.actorId === id);
      const linkedAttachment = collection === 'evidenceDocuments' && record.links?.some((link: any) => ids.has(link.id));
      const linkedInbox = collection === 'documentInbox' && (record.documentIds?.some((key: string) => ids.has(key)) || !!target.email && (record.from === target.email || record.to?.includes(target.email)));
      const authoredMessage = kind === 'operator' && ['correspondence','salesDocuments'].includes(collection) && (record.approvedBy === id || record.createdBy === id);
      const reportCopy = collection === 'reportSnapshots' && contains(record.result, ids);
      const identityCopy = kind === 'operator' && ['businessProfile','salesDocuments'].includes(collection) && contains(record, new Set([native?.display_name, native?.email].filter((v): v is string => !!v)));
      if (!ids.has(record.id) && (refers(record, ids) || ownedOriginal || authoredPolicy || authoredMessage || linkedAttachment || linkedInbox || reportCopy || identityCopy)) { ids.add(record.id); changed = true; }
    }
  }
  // A shared accounting connection must pause before any retained job is changed.
  for (const job of s.bookJobs) if (ids.has(job.id) && job.connectionId) ids.add(job.connectionId);
  for (const collection of collections) for (const record of s[collection]) if (ids.has(record.id)) nodes.push({ kind: collection, row: record });
  const documents = nodes.filter(n => n.kind === 'evidenceDocuments').map(n => n.row);
  const removals = new Set(nodes.filter(n => ['evidenceDocuments','documentExtractions','documentInbox','reportSnapshots'].includes(n.kind)).map(n => n.row.id));
  const holds = s.privacyHolds.filter(h => h.active && ids.has(h.subjectId));
  const blockers: { code: string; kind: string; id: string; reason: string }[] = [];
  const block = (collection: string, record: Row, reason: string) => blockers.push({ code: 'PRIVACY_DEPENDENCY', kind: collection, id: record.id, reason });
  for (const definition of s.customFieldDefinitions) block('customFieldDefinitions', definition, 'Typed custom-field values, retained command results and document copies require reviewed subject attribution and a dedicated custody erasure operation.');
  for (const batch of s.imports) if (batch.source?.records?.some((record:any)=>record.kind==='customFieldDefinitions')) block('imports',batch,'Retained typed-field CSV originals require reviewed subject attribution and a dedicated custody erasure operation, including after undo.');
  // Import custody has additional staged and journal tables: erasing a Pier row
  // alone cannot erase that source. Refuse rather than leave a hidden copy.
  for (const batch of s.imports) if (contains(batch, ids) || kind === 'operator' && contains(batch, new Set([id])) || !['committed','undone'].includes(batch.status)) block('imports', batch, 'Native import originals, staging and journal custody require a dedicated erasure operation.');
  for (const batch of s.salesImports) if (contains(batch, ids) || kind === 'operator' && batch.stagedBy === id || batch.status !== 'applied') block('salesImports', batch, 'Customer file originals and reviewed source rows require a dedicated custody erasure operation.');
  for (const node of nodes) if (['ediOrders','ediDocuments','ediPartners','channelOrders'].includes(node.kind)) block(node.kind, node.row, 'Retained channel or EDI source payload requires a dedicated custody erasure operation.');
  for (const extraction of s.documentExtractions) if (ids.has(extraction.id) && extraction.status === 'requesting') block('documentExtractions', extraction, 'Reconcile the unfinished extraction before erasure.');
  for (const session of s.invoicePaymentSessions) if (ids.has(session.id) && !['expired','succeeded','failed','cancelled'].includes(session.status)) block('invoicePaymentSessions', session, 'Expire or reconcile the active remote payment before erasure.');
  for (const job of s.shippingJobs) if (ids.has(job.id) && (['buying','uncertain'].includes(job.status) || ['sending','uncertain'].includes(job.mail?.status))) block('shippingJobs', job, 'Reconcile the label purchase or tracking message before erasure.');
  for (const job of s.bookJobs) if (ids.has(job.id) && job.attempted && !['posted','reconciled','skipped'].includes(job.status)) block('bookJobs', job, 'Reconcile the remote accounting request before erasure.');
  const dependencies = nodes.map(n => ({ kind:n.kind, id:n.row.id, version:n.row.version, action:removals.has(n.row.id) ? 'delete-private-copy' : 'anonymize-and-pause' }));
  const counts = { originals: documents.length, extractions: nodes.filter(n => n.kind === 'documentExtractions').length, inboxCopies: nodes.filter(n => n.kind === 'documentInbox').length,
    pendingRequests: blockers.filter(b => b.reason.startsWith('Reconcile') || b.reason.startsWith('Expire')).length,
    orders: s.orders.filter(o => ids.has(o.id)).length, purchases: s.purchaseOrders.filter(po => ids.has(po.id)).length, retainedRecords: nodes.length - removals.size };
  const retained = ['Opaque business and actor IDs, exact stock quantities, reservations, movements, document lines, financial amounts, tax rates, dates and append-only audit remain. Personal names, contacts, addresses and local private copies in supported dependencies are anonymized.',
    'Erasure cancels correspondence, revokes local payment links and access, and pauses affected automation. It does not cancel stock orders, purchase commitments, invoices or provider obligations.',
    'Unlinked originals cannot be attributed by inference. Identify and link every private original before confirming; the preview covers recorded dependencies only.'];
  const beyondLocalDeletion = ['Offline backups require a later post-erasure journal archive. Already delivered mail, downloaded documents, physical labels, external identity providers and provider-held requests remain outside local deletion. External erasure and lawful retention decisions need separate owner action.'];
  return { target, ids, nodes, removals, counts, holds, blockers, retained, beyondLocalDeletion,
    preview: { kind, subjectId: id, version: target.version, counts, dependencies, holds: holds.map(h => ({ id:h.id, reason:h.reason, category:h.category })), blockers,
      planHash: sha256(canonicalJson({ kind, id, stateVersion:s.version, native: native ?? null, dependencies:nodes.map(n => [n.kind,n.row.id,n.row.version]), holds, blockers })),
      allowed: !holds.length && !blockers.length, retained, beyondLocalDeletion,
      limitation: 'Explicit owner-confirmed local anonymization for the listed dependencies only. Automatic retention deletion remains unavailable; unsupported source custody and unfinished remote work refuse erasure.' } };
}
