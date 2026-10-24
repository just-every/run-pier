// Archive normalization is pure and idempotent, and also runs on imported rows.
// Historical consent is evidence, never authority in the receiving installation.
const connections = new Set(['channels', 'bookConnections', 'shippingSettings', 'paymentConnections', 'aiSettings', 'documentSettings', 'ediPartners']);
const policies = new Set(['replenishmentPolicies', 'slowStockPolicies', 'recurringOrders', 'workflowRules']);
export function inactiveValue(value) {
  if (Array.isArray(value)) return value.map(inactiveValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key,
    ['checkoutUrl', 'verificationUrl'].includes(key) ? null : inactiveValue(entry)]));
}
export function inactiveRecord(kind, record) {
  const r = inactiveValue(record);
  const remember = (key, value) => {
    r.archiveAuthority ??= {};
    if (!Object.hasOwn(r.archiveAuthority, key)) r.archiveAuthority[key] = value;
  };
  if (connections.has(kind) || policies.has(kind) || (kind === 'businessTemplates' && r.id === 'pier-print-delivery')) {
    for (const key of ['enabled', 'configured', 'autoDraft']) if (Object.hasOwn(r, key)) { remember(key, r[key]); r[key] = false; }
    r.restorePaused = true;
  }
  if (kind === 'roles') { remember('role', r.role); r.role = 'viewer'; }
  for (const key of ['sendPolicy', 'chasePolicy', 'promisePolicy']) if (r[key]) {
    remember(key, r[key]); r[key] = { ...r[key], enabled: false };
  }
  if (kind === 'channels' && r.stallLink) { remember('stallLink', { ...r.stallLink, keyHash: undefined }); r.stallLink = null; }
  if (kind === 'correspondence') r.restorePaused = true;
  if (kind === 'invoicePayLinks') { r.status = 'revoked'; r.url = null; }
  if (kind === 'invoicePaymentSessions') { r.checkoutUrl = null; r.verificationUrl = null; }
  return r;
}
export default {
  includeTables: ['oa_operators', 'oa_bootstrap', 'oa_invitation_cancellations', 'oa_auth_settings', 'oa_auth_audit', 'oa_domain_rules', 'oa_logout_events'],
  excludeTables: ['rer_dependency_keys', 'rer_dependency_pending', 'rer_dependency_codes', 'pier_guard', 'pier_channel_secrets', 'pier_channel_locks', 'pier_book_locks'],
  product: 'inventory-pier', replaceableTables: ['pier_meta'],
  requiredConfiguration: ['OWNER_EMAIL', 'INSTALLATION_KEY', 'SESSION_SECRET', 'SETUP_TOKEN', 'AUTH_ORIGIN', 'MAIL_PROVIDER', 'MAIL_FROM'],
  exportRow(table, row) {
    if (table === 'pier_commands') row.result = JSON.stringify(inactiveValue(JSON.parse(row.result)));
    if (table === 'pier_records') row.data = JSON.stringify(inactiveRecord(row.kind, JSON.parse(row.data)));
    if (table === 'pier_mail_deliveries' && ['sending', 'unavailable'].includes(row.phase)) {
      row.phase = row.phase === 'sending' ? 'uncertain' : 'revoked';
      row.error = 'Restored submission is paused. Review and explicitly approve new work; delivery is not replayed.';
    }
    return row;
  },
};
