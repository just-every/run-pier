import { collections, type Context } from './model';
import { subjectPlan, type NativeSubject } from './privacy-plan';

const privateFields = new Set(['email','contacts','addresses','address','phone','telephone','fax','contact','contactName','attention','recipient','shipTo','shippingAddress','originalAddress','suggestedAddress','customerName','supplierName','customerPO','profileReason','resaleCertificates','certificate','body','subject','text','html','raw','pdf','filename','notes','note','reason','sourceReference','supplierReference','shipmentReference','channelReference','verificationUrl','checkoutUrl','labelPdfUrl','labelZplUrl','trackingUrl','replies','supplierReply','ambiguities','citations','verificationErrors','rateMessages','problem']);
const identityContainers = new Set(['customer','supplier','supplierSnapshot','customerSnapshot','party','salesRep']);
const policyFields = ['promisePolicy','sendPolicy','chasePolicy','creditClearance'];
export function personalValues(target: any, native?: NativeSubject): Set<string> {
  const values = new Set<string>();
  const collect = (v: any) => { if (typeof v === 'string' && v.trim()) values.add(v); else if (Array.isArray(v)) v.forEach(collect); else if (v && typeof v === 'object') Object.values(v).forEach(collect); };
  for (const field of ['name','email','contacts','addresses']) collect(target[field]);
  if (native) { collect(native.email); collect(native.display_name); }
  return values;
}
export function anonymizeSubject(c: Context, kind: string, id: string, native?: NativeSubject) {
  const plan = subjectPlan(c.s, kind, id, native), values = personalValues(plan.target, native);
  const identityIds = new Set([id, ...(kind === 'operator' ? c.s.salesReps.filter(r => r.operatorId === id).map(r => r.id) : [])]);
  const anonymous = kind === 'operator' ? 'Anonymous operator' : kind === 'supplier' ? 'Anonymous supplier' : 'Anonymous customer';
  const redact = (value: any, active: boolean, field = ''): any => {
    if (typeof value === 'string') return values.has(value) ? anonymous : value;
    if (!value || typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.map(v => redact(v, active, field));
    const identity = identityIds.has(value.id) || kind === 'operator' && value.operatorId === id;
    return Object.fromEntries(Object.entries(value).map(([key, v]) => {
      if ((active || identity) && privateFields.has(key)) return [key, Array.isArray(v) ? [] : null];
      if (key === 'name' && (identity || active && identityContainers.has(field))) return [key, anonymous];
      return [key, redact(v, active || identity, key)];
    }));
  };
  for (const collection of collections) {
    c.s[collection] = c.s[collection].filter(r => !plan.removals.has(r.id));
    for (const record of c.s[collection]) {
      // Exact native identity values in business snapshots are scrubbed without
      // treating another customer's identity as the erased operator's identity.
      const affected = plan.ids.has(record.id);
      if (!affected) continue;
      if (['privacyHolds','privacyPolicies','privacyReceipts'].includes(collection)) continue;
      const before = JSON.stringify(record);
      const next = redact(record, affected && kind !== 'operator');
      if (affected) {
        next.privacyErasedAt = c.now;
        if (['parties','salesReps'].includes(collection)) { next.name = anonymous; next.email = null; next.contacts = []; next.addresses = []; }
        for (const field of policyFields) if (next[field]) next[field] = { ...next[field], enabled:false, recipient:null, restorePaused:true, version:(next[field].version ?? 0) + 1 };
        if (['recurringOrders','workflowRules','replenishmentPolicies','replenishmentSettings','slowStockPolicies','savedReports','channels','bookConnections','paymentConnections','shippingSettings','documentSettings','businessTemplates','aiSettings'].includes(collection)) {
          next.enabled = false; next.autoDraft = false; next.restorePaused = true;
        }
        if (collection === 'recurringOrders') next.cancelled = true;
        if (collection === 'correspondence') { next.recipient = null; next.subject = null; next.body = null; next.restorePaused = true; }
        if (collection === 'businessProfile' && kind === 'operator') { next.name = 'Anonymous business'; next.address = null; next.shipTo = {}; }
        if (collection === 'salesDocuments') {
          // The PDF and rendered text are private copies, never accounting truth.
          next.pdf = null; next.rendered = null; next.snapshot = redact(next.snapshot, kind !== 'operator'); next.subject = null; next.body = null; next.recipient = null; next.filename = null; next.restorePaused = true;
        }
        if (collection === 'invoicePayLinks') { next.status = 'revoked'; next.url = null; next.expiredAt = c.now; }
        if (collection === 'invoicePaymentSessions') { next.checkoutUrl = null; next.verificationUrl = null; }
        if (collection === 'shippingJobs') { next.email = null; next.originalAddress = null; next.suggestedAddress = null; next.labelPdfUrl = null; next.labelZplUrl = null; next.trackingUrl = null; next.mail = { status:'revoked', detail:'Local correspondence cancelled by explicit privacy erasure.' }; }
        if (collection === 'bookJobs') {
          if (next.document?.attachment) next.document.attachment = null;
          if (!next.attempted) { next.status = 'skipped'; next.document = null; }
        }
        if (collection === 'roles') { next.role = 'viewer'; next.permissions = null; next.preparationGrant = null; }
      }
      if (JSON.stringify(next) !== before) Object.assign(record, next, { version:record.version + 1 });
    }
  }
  for (const hold of c.s.privacyHolds.filter(hold => !hold.active && plan.ids.has(hold.subjectId))) { hold.reason = 'Released hold retained without personal content after erasure.'; hold.version++; }
  if (kind === 'operator') for (const policy of c.s.privacyPolicies.filter(policy => policy.approvedBy === id)) { policy.consent = null; policy.version++; }
  return plan;
}
