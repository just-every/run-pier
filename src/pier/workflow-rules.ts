import { canonicalJson, sha256 } from './import-kit';
import { decimal, fail, format, fresh, get, requireRole, row, text, type Context, type Row } from './model';
import { amount, money, MONEY_SCALE } from './money';
import { forecast, draftReplenishment } from './replenishment';
import { filteredReports } from './saved-reports';

export function previewWorkflow(c: Context, rule: Row) {
  const lines = forecast(c).filter(f => rule.warehouses.includes(f.warehouse) && f.low && !f.blockedReason && decimal(f.suggestedQuantity) > 0n).map(f => ({ itemId: f.itemId, warehouse: f.warehouse, supplierId: f.supplierId, quantity: f.suggestedQuantity, expectedCost: f.expectedLandedCost, policyVersion: f.policyVersion, unitPrice: f.unitPrice }));
  const sourceDigest = sha256(canonicalJson({ lines, orders: c.s.orders, purchases: c.s.purchaseOrders, movements: c.s.movements, terms: c.s.supplierItems, policies: c.s.replenishmentPolicies, settings: c.s.replenishmentSettings, locations: c.s.locations }));
  const spend = lines.reduce((n, l) => n + amount(l.expectedCost!), 0n), problems: string[] = [];
  if (rule.kind === 'draft-po' && lines.some(l => !rule.supplierIds.includes(l.supplierId))) problems.push('Supplier outside the authorized vendor list. Human review required.');
  if (rule.kind === 'draft-po' && spend > amount(rule.perRunBudget)) problems.push('Expected landed spend exceeds the per-run budget. Human review required.');
  return { sourceDigest, previewHash: sha256(canonicalJson({ sourceDigest, ruleId: rule.id, ruleVersion: rule.version })), lines, expectedSpend: money(rule.kind === 'draft-po' ? spend : 0n), problems, effects: rule.kind === 'draft-po' ? 'Unapproved purchase drafts only; no stock, approval or external send.' : rule.kind === 'report' ? 'Private retained native report snapshot only; no delivery.' : 'Private low-stock inspection only; no business mutation.' };
}
function stopQueued(c: Context, ruleId: string) {
  for (const job of c.s.workflowJobs.filter(j => j.ruleId === ruleId && ['pending','running'].includes(j.status)))
    Object.assign(job, { status: 'failed', problem: 'Rule changed or paused. Human review required.', escalatedAt: c.now, version: job.version + 1 });
}
function reconcile(c: Context) {
  for (const job of c.s.workflowJobs.filter(j => j.status === 'running' && j.leaseUntil <= c.now)) {
    Object.assign(job, { status: 'uncertain', problem: 'Worker lease expired before resolution. Human review required; no automatic replay.', escalatedAt: c.now, version: job.version + 1 });
  }
}
export function workflowRules(c: Context, type: string, p: any) {
  if (!type.startsWith('workflow.')) return;
  requireRole(c, []);
  reconcile(c);
  if (type === 'workflow.recover') return { id: c.commandId, version: 1, uncertain: c.s.workflowJobs.filter(j => j.status === 'uncertain').map(j => j.id) };
  if (type === 'workflow.save') {
    const old = p.id ? get(c.s, 'workflowRules', p.id) : undefined;
    if (old) { fresh(old, p.version); if (old.killed) fail('WORKFLOW_KILLED', 'Create a new rule after killing one.'); }
    if (!['inventory-check','draft-po','report'].includes(p.kind) || p.automaticApproval !== false) fail('WORKFLOW_POLICY', 'Choose a supported native rule. Automatic approval is unavailable; a separate human must approve purchases.');
    if (!Array.isArray(p.warehouses) || !p.warehouses.length || !p.warehouses.every((w: any) => typeof w === 'string' && c.s.locations.some(l => l.warehouse === w))) fail('WORKFLOW_SCOPE', 'Choose explicit existing warehouses.');
    if (p.kind === 'report' && p.warehouses.length !== 1) fail('WORKFLOW_SCOPE', 'A standalone report rule requires one warehouse. Use a saved-report schedule for explicit installation-wide analysis.');
    if (!Array.isArray(p.supplierIds) || !p.supplierIds.every((id: any) => c.s.parties.some(p => p.id === id && p.kind === 'supplier'))) fail('WORKFLOW_SCOPE', 'Choose explicit supplier identities.');
    if (!Number.isSafeInteger(p.cadenceMinutes) || p.cadenceMinutes < 15 || p.cadenceMinutes > 525600) fail('WORKFLOW_CADENCE', 'Use a cadence of 15 to 525600 UTC minutes.');
    const data = { name: text(p.name), kind: p.kind, warehouses: [...new Set(p.warehouses)], supplierIds: [...new Set(p.supplierIds)], perRunBudget: money(decimal(p.perRunBudget) * 1000000n), dailyBudget: money(decimal(p.dailyBudget) * 1000000n), cadenceMinutes: p.cadenceMinutes, automaticApproval: false, enabled: false, approvedBy: c.actor.id, approvedAt: c.now };
    if (old) stopQueued(c, old.id);
    return old ? Object.assign(old, data, { version: old.version + 1 }) : row(c, 'workflowRules', data);
  }
  const rule = get(c.s, 'workflowRules', p.ruleId);
  if (type === 'workflow.preview') { fresh(rule, p.version); return { id: rule.id, version: rule.version, ...previewWorkflow(c, rule) }; }
  if (['workflow.enable','workflow.pause','workflow.kill'].includes(type)) {
    fresh(rule, p.version);
    if (rule.killed) fail('WORKFLOW_KILLED', 'Create a new rule after killing one.');
    if (type === 'workflow.enable') {
      const preview = previewWorkflow(c, rule);
      if (p.previewHash !== preview.previewHash || preview.problems.length) fail('WORKFLOW_REVIEW', 'Review a fresh preview within its vendor and spend limits.');
    }
    rule.enabled = type === 'workflow.enable'; rule.killed = type === 'workflow.kill'; rule.version++;
    stopQueued(c, rule.id);
    return rule;
  }
  if (type === 'workflow.enqueue') {
    if (!rule.enabled || rule.killed) fail('WORKFLOW_PAUSED', 'This rule is paused or killed.');
    const slot = Math.floor(Date.parse(c.now) / (rule.cadenceMinutes * 60000)), key = `${rule.id}:${rule.version}:${slot}`;
    const old = c.s.workflowJobs.find(j => j.key === key); if (old) return old;
    const preview = previewWorkflow(c, rule);
    return row(c, 'workflowJobs', { key, ruleId: rule.id, ruleVersion: rule.version, ruleSnapshot: structuredClone(rule), sourceDigest: preview.sourceDigest, expectedSpend: preview.expectedSpend, status: 'pending', problem: null, attempts: 0, preparedBy: c.actor.id });
  }
  if (!['workflow.claim', 'workflow.finish'].includes(type)) fail('WORKFLOW_JOB', 'Choose a supported workflow action.');
  const job = get(c.s, 'workflowJobs', p.jobId); fresh(job, p.version);
  if (job.ruleId !== rule.id) fail('WORKFLOW_JOB', 'Choose a job for this rule.');
  if ((type === 'workflow.claim' && job.status !== 'pending') || (type === 'workflow.finish' && job.status !== 'running')) fail('WORKFLOW_JOB', 'Only pending work can be claimed and running work finished. Terminal outcomes are retained.');
  const stop = (problem: string) => Object.assign(job, { status: 'failed', problem, escalatedAt: c.now, version: job.version + 1 });
  if (!rule.enabled || rule.version !== job.ruleVersion || rule.killed) return stop('Rule version changed or paused. Human review required.');
  const preview = previewWorkflow(c, rule);
  if (preview.sourceDigest !== job.sourceDigest || preview.problems.length) return stop(preview.problems[0] ?? 'Source evidence changed. Human review required.');
  if (type === 'workflow.claim') {
    if (job.status !== 'pending') fail('WORKFLOW_JOB', 'Only a pending job can be claimed. Uncertain work is never automatically replayed.');
    const day = c.now.slice(0,10), reserved = c.s.workflowJobs.filter(j => j.id !== job.id && j.ruleId === rule.id && j.budgetDay === day && ['running','uncertain','resolved'].includes(j.status)).reduce((n, j) => n + amount(j.expectedSpend), 0n);
    if (reserved + amount(job.expectedSpend) > amount(rule.dailyBudget)) return stop('Expected landed spend exceeds the UTC daily budget. Human review required.');
    return Object.assign(job, { status: 'running', attempts: job.attempts + 1, budgetDay: day, startedAt: c.now, leaseUntil: new Date(Date.parse(c.now) + 120000).toISOString(), version: job.version + 1 });
  }
  if (type !== 'workflow.finish' || job.status !== 'running') fail('WORKFLOW_JOB', 'Only the current running job can resolve.');
  let result: any;
  if (rule.kind === 'draft-po') {
    const drafts = preview.lines.length ? draftReplenishment(c, { autoOnly: false, selected: preview.lines.map(l => ({ itemId: l.itemId, warehouse: l.warehouse, supplierId: l.supplierId! })) }) : [];
    for (const po of drafts) po.workflow = { ruleId: rule.id, ruleVersion: job.ruleVersion, jobId: job.id, draftOnly: true };
    result = { draftIds: drafts.map(po => po.id) };
  }
  else if (rule.kind === 'report') {
    if (rule.reportId && c.s.savedReports.find(r => r.id === rule.reportId)?.version !== rule.reportVersion) return stop('Saved report changed. Review its schedule again.');
    if (rule.reportId && !rule.reportParameters.warehouse && c.s.locations.some(l => !rule.warehouses.includes(l.warehouse))) return stop('Reporting warehouses changed. Review this schedule again.');
    result = filteredReports(c.s, rule.reportParameters ?? { warehouse: rule.warehouses.length === 1 ? rule.warehouses[0] : '' }, c.now);
    row(c, 'reportSnapshots', { reportId: rule.reportId ?? null, reportVersion: rule.reportVersion ?? null, jobId: job.id, generatedBy: c.actor.id, result });
  }
  else result = { lowStock: preview.lines };
  return Object.assign(job, { status: 'resolved', result, resolvedAt: c.now, version: job.version + 1 });
}
