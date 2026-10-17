import { decimal, fail, format, fresh, get, item, MAX, requireRole, row, SCALE, text, type Context, type Row } from './model';
import { money } from './money';
import { purchasing } from './purchasing';
import { learnedParameters, sellThrough, stockProjection } from './replenishment-demand';
import { planningWarehouses, roundPack, signedQuantity, supplyPosition } from './replenishment-position';

const policies = (c: Context): Row[] => c.s.replenishmentPolicies;
const nonnegative = (value: bigint) => value > 0n ? value : 0n;
function days(value: unknown, name: string, defaultValue: number, positive = false) {
  const n = value === undefined ? defaultValue : Number(value);
  if ((typeof value !== 'number' && typeof value !== 'string' && value !== undefined) || value === '' ||
    !Number.isSafeInteger(n) || n < (positive ? 1 : 0) || n > 3650)
    fail('REPLENISHMENT_DAYS', `${name} must be ${positive ? 1 : 0}–3650 whole days.`);
  return n;
}
function optionalQuantity(value: unknown): string | null {
  return value === undefined || value === null || value === '' ? null : format(decimal(value));
}

/** Read-only, including for SKUs without a policy or sales history. */
export function forecast(c: Context) {
  return c.s.items.filter(i => !i.archived).flatMap(i => planningWarehouses(c).map(warehouse => {
    const policy = policies(c).find(p => p.itemId === i.id && p.warehouse === warehouse);
    const supplierId = policy?.supplierId ?? i.defaultSupplierId ?? null;
    const terms = c.s.supplierItems.find(t => t.itemId === i.id && t.supplierId === supplierId);
    const leadDays = policy?.leadDays ?? terms?.leadDays ?? 0;
    const safetyStock = policy?.safetyStock ?? '0', windowDays = policy?.windowDays ?? 30, reviewDays = policy?.reviewDays ?? 30;
    const windows = sellThrough(c, i.id, warehouse, windowDays);
    const selected = windows.find(window => window.days === windowDays)!;
    const learned = learnedParameters(selected.sold, windowDays, leadDays, reviewDays, safetyStock, i.unit);
    const position = supplyPosition(c, i.id, warehouse);
    const method = policy?.method ?? 'fixed';
    const reorderPoint = policy?.reorderPoint ?? null;
    const reorderQuantity = terms?.reorderQuantity ?? policy?.reorderQuantity ?? null;
    const maximum = policy?.maximum ?? null;
    const configured = reorderPoint !== null && (method === 'upTo' ? maximum !== null : reorderQuantity !== null);
    const low = configured && signedQuantity(position.position) <= decimal(reorderPoint);
    const unrounded = low ? nonnegative((method === 'upTo' ? decimal(maximum) : decimal(reorderPoint) + decimal(reorderQuantity)) - signedQuantity(position.position)) : 0n;
    const pack = terms ? decimal(terms.packSize, true) : null;
    const minimum = terms ? decimal(terms.minimum) : 0n;
    const rounded = pack !== null && unrounded > 0n ? roundPack(unrounded > minimum ? unrounded : minimum, pack) : 0n;
    const remaining = nonnegative(rounded - signedQuantity(position.draftQuantity));
    const freight = policy?.freight ?? '0', duty = policy?.duty ?? '0';
    const productCost = terms ? remaining * decimal(terms.price) : null;
    const chargeCost = remaining > 0n ? (decimal(freight) + decimal(duty)) * SCALE : 0n;
    return {
      itemId: i.id, warehouse, supplierId, terms: terms ?? null, policy: policy ?? null,
      policyId: policy?.id ?? null, policyVersion: policy?.version ?? 0,
      leadDays, safetyStock, windowDays, reviewDays, windows,
      observedSold: selected.sold, soldPerDay: selected.soldPerDay, hasHistory: selected.hasHistory,
      learned, applied: { reorderPoint, reorderQuantity, maximum, method,
        quantitySource: terms?.reorderQuantity != null ? 'supplier' : 'policy' },
      ...position, ...stockProjection(c, position, selected.sold, windowDays),
      configured, low, autoDraft: policy?.autoDraft === true,
      unroundedNeed: format(unrounded), packSize: terms?.packSize ?? null, minimum: terms?.minimum ?? null,
      roundedQuantity: format(rounded), roundingAdded: format(rounded - unrounded > 0n ? rounded - unrounded : 0n),
      suggestedQuantity: format(remaining), draftIds: position.drafts.map(d => d.poId),
      unitPrice: terms?.price ?? null, freight, duty,
      productCost: productCost === null ? null : money(productCost),
      expectedLandedCost: productCost === null ? null : money(productCost + chargeCost),
      minimumValue: terms?.minimumValue ?? null,
      minimumValueUnmet: terms?.minimumValue != null && productCost !== null && productCost < decimal(terms.minimumValue) * SCALE,
      blockedReason: !configured ? 'Apply learned parameters or enter a reorder point and quantity/maximum.'
        : !terms ? 'Select a supplier with current item terms.'
          : remaining > MAX ? 'The suggested quantity exceeds one purchase line; split it into reviewed purchases.'
            : remaining > 0n && (remaining < minimum || remaining % pack! !== 0n) ? 'Existing draft coverage leaves a quantity below the supplier minimum or outside whole case packs; review those drafts together.'
            : null,
      assumption: 'Native shipment sell-through only. No seasonal, promotional, imported or channel history is inferred. Safety stock is buyer-entered; observed sales can be censored by stockouts. Drafts are coverage, never on-hand or committed supply.',
    };
  }));
}

export function replenishment(c: Context, type: string, p: any): Row | undefined {
  if (!['replenishment.save', 'replenishment.plan'].includes(type)) return;
  requireRole(c, ['buyer']);
  if (type === 'replenishment.plan') {
    if (p.policyId && !policies(c).some(policy => policy.id === p.policyId)) fail('NOT_FOUND', 'Replenishment policy not found.');
    const drafts = draftReplenishment(c, { autoOnly: false, policyId: p.policyId });
    return { id: c.commandId, version: 1, draftIds: drafts.map(draft => draft.id), drafts };
  }
  const i = item(c.s, p.itemId), warehouse = text(p.warehouse, 'Warehouse');
  if (!planningWarehouses(c).includes(warehouse)) fail('WAREHOUSE', 'Choose a warehouse containing a real bin.');
  const old = policies(c).find(policy => policy.itemId === i.id && policy.warehouse === warehouse);
  if (p.id && p.id !== old?.id) fail('POLICY', 'Policy identity must match the item and warehouse.');
  if (old) fresh(old, p.version);
  else if (p.version !== 0) fail('STALE', 'Review the current item-location policy version before saving.');
  if (get(c.s, 'parties', p.supplierId).kind !== 'supplier') fail('SUPPLIER', 'Choose a supplier.');
  const terms = c.s.supplierItems.find(t => t.itemId === i.id && t.supplierId === p.supplierId)
    ?? fail('SUPPLIER_TERMS', 'Create supplier-item terms before enabling replenishment.');
  if (!['fixed', 'upTo'].includes(p.method)) fail('METHOD', 'Choose fixed quantity or order up to maximum.');
  if (p.autoDraft !== undefined && typeof p.autoDraft !== 'boolean') fail('POLICY', 'Automatic drafting must be true or false.');
  if (p.applyLearned !== undefined && typeof p.applyLearned !== 'boolean') fail('POLICY', 'Applying learned parameters must be explicit.');
  const data: Record<string, any> = {
    itemId: i.id, warehouse, supplierId: p.supplierId, method: p.method,
    safetyStock: format(decimal(p.safetyStock)), leadDays: days(p.leadDays, 'Lead time', terms.leadDays),
    windowDays: days(p.windowDays, 'Sales window', 30, true), reviewDays: days(p.reviewDays, 'Review period', 30, true),
    reorderPoint: optionalQuantity(p.reorderPoint), reorderQuantity: optionalQuantity(p.reorderQuantity), maximum: optionalQuantity(p.maximum),
    autoDraft: p.autoDraft === true, freight: format(decimal(p.freight ?? '0')), duty: format(decimal(p.duty ?? '0')),
    approvedBy: c.actor.id, approvalRole: c.actor.role, approvedAt: c.now,
  };
  if (p.applyLearned) {
    if (p.stateVersion !== c.s.version) fail('STALE', 'Demand or supply changed. Reload before applying learned parameters.');
    const selected = sellThrough(c, i.id, warehouse, data.windowDays).find(window => window.days === data.windowDays)!;
    Object.assign(data, learnedParameters(selected.sold, data.windowDays, data.leadDays, data.reviewDays, data.safetyStock, i.unit));
    for (const key of ['reorderPoint', 'reorderQuantity', 'maximum']) decimal(data[key]);
    data.learnedApplication = { actorId: c.actor.id, at: c.now, stateVersion: c.s.version, sold: selected.sold, shipmentIds: selected.shipmentIds };
  } else data.learnedApplication = null;
  if (['each', 'ea', 'ea.'].includes(i.unit.trim().toLowerCase()))
    for (const key of ['safetyStock', 'reorderPoint', 'reorderQuantity', 'maximum'])
      if (data[key] !== null && decimal(data[key]) % SCALE !== 0n) fail('REPLENISHMENT_UNIT', `${key} must be a whole number for an each item.`);
  if (data.method === 'upTo' && data.maximum !== null && data.reorderPoint !== null && decimal(data.maximum) < decimal(data.reorderPoint))
    fail('MAXIMUM', 'Order-up-to maximum must be at least the reorder point.');
  if (data.autoDraft && (data.reorderPoint === null || (data.method === 'upTo' ? data.maximum === null : data.reorderQuantity === null && terms.reorderQuantity == null)))
    fail('POLICY', 'Apply or enter replenishment parameters before enabling automatic drafts.');
  if (old) { Object.assign(old, data, { version: old.version + 1 }); return old; }
  return row(c, 'replenishmentPolicies', data);
}

/** Called only inside a command admission, never from a state GET. */
export function draftReplenishment(c: Context, options: { policyId?: string; autoOnly?: boolean } = {}): Row[] {
  const autoOnly = options.autoOnly !== false;
  const candidates = forecast(c).filter(f => f.policy && (!options.policyId || f.policyId === options.policyId)
    && (!autoOnly || f.autoDraft) && f.low && !f.blockedReason && decimal(f.suggestedQuantity) > 0n);
  const groups = new Map<string, typeof candidates>();
  for (const candidate of candidates) {
    const key = JSON.stringify([candidate.supplierId, candidate.warehouse]);
    groups.set(key, [...(groups.get(key) ?? []), candidate]);
  }
  const drafts: Row[] = [];
  for (const group of groups.values()) {
    const leadDays = Math.max(...group.map(f => f.leadDays));
    const promiseDate = new Date(Date.parse(c.now) + leadDays * 86_400_000).toISOString().slice(0, 10);
    const draft = purchasing(c, 'po.draft', {
      supplierId: group[0].supplierId, destinationWarehouse: group[0].warehouse, promiseDate,
      freight: format(group.reduce((sum, f) => sum + decimal(f.freight), 0n)),
      duty: format(group.reduce((sum, f) => sum + decimal(f.duty), 0n)),
      reason: `Replenishment plan for ${group.length} buyer-applied item policies at ${group[0].warehouse}. Policy versions and shipment evidence are retained on this draft.`,
      lines: group.map(f => ({ itemId: f.itemId, quantity: f.suggestedQuantity, price: f.unitPrice })),
    })!;
    draft.replenishment = { plannedAt: c.now, policyVersions: group.map(f => ({ policyId: f.policyId, version: f.policyVersion })),
      evidence: group.map(f => ({ itemId: f.itemId, warehouse: f.warehouse, windowDays: f.windowDays,
        observedSold: f.observedSold, position: f.position, quantity: f.suggestedQuantity,
        shipmentIds: f.windows.find(window => window.days === f.windowDays)!.shipmentIds })),
      approvedBy: null, currency: 'USD', expectedLandedCost: money(group.reduce((sum, f) => sum + decimal(f.suggestedQuantity) * decimal(f.unitPrice!) + (decimal(f.freight) + decimal(f.duty)) * SCALE, 0n)) };
    drafts.push(draft);
  }
  return drafts;
}
