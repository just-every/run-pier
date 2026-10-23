import { compareReplenishment } from './replenishment-alternatives';
import { kitDefinition } from './kits';
import { decimal, fail, format, fresh, get, item, MAX, requireRole, row, SCALE, text, type Context, type Row } from './model';
import { money } from './money';
import { purchasing } from './purchasing';
import { learnedParameters, sellThrough, stockProjection } from './replenishment-demand';
import { planningWarehouses, roundPack, signedQuantity, supplyPosition } from './replenishment-position';

import { companyHistory, companyPosition, effectivePolicy, planningScope, scopeCommand } from './replenishment-scope';

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
export function forecast(c: Context, overrides: { itemId: string; warehouse: string; supplierId?: string }[] = []) {
  const scope = planningScope(c);
  if (!scope.valid) return [];
  return c.s.items.filter(i => !i.archived && (!kitDefinition(c.s,i.id) || c.s.movements.filter(m=>m.itemId===i.id).reduce((n,m)=>n+BigInt(m.quantity),0n)>0n)).flatMap(i => (scope.company ? [scope.destination] : scope.warehouses).map(warehouse => {
    const effective = effectivePolicy(c, i.id, warehouse);
    const defaults = effective.defaults, local = effective.local;
    const policy = scope.company ? defaults ?? effective.policy ?? scope.warehouses.map(w => effectivePolicy(c, i.id, w).policy).find(Boolean) : effective.policy;
    const override = overrides.find(o => o.itemId === i.id && o.warehouse === warehouse);
    const supplierId = override?.supplierId ?? policy?.supplierId ?? i.defaultSupplierId ?? null;
    const terms = c.s.supplierItems.find(t => t.itemId === i.id && t.supplierId === supplierId);
    const leadDays = override?.supplierId ? terms?.leadDays ?? 0 : policy?.leadDays ?? terms?.leadDays ?? 0;
    const safetyStock = policy?.safetyStock ?? '0', windowDays = policy?.windowDays ?? 30, reviewDays = policy?.reviewDays ?? 30;
    const windows = scope.company ? companyHistory(c, i.id, scope.warehouses, windowDays) : sellThrough(c, i.id, warehouse, windowDays);
    const selected = windows.find(window => window.days === windowDays)!;
    const learned = learnedParameters(selected.sold, windowDays, leadDays, reviewDays, safetyStock, i.unit);
    const position = scope.company ? companyPosition(c, i.id, scope.warehouses) : supplyPosition(c, i.id, warehouse);
    const method = policy?.method ?? 'fixed';
    const summedPoints = scope.warehouses.map(w => effectivePolicy(c, i.id, w).policy?.reorderPoint);
    const reorderPoint = scope.company ? defaults?.companyReorderPoint ?? (summedPoints.some(p => p != null) ? format(summedPoints.reduce((sum, p) => sum + decimal(p ?? '0'), 0n)) : null) : policy?.reorderPoint ?? null;
    const reorderQuantity = terms?.reorderQuantity ?? policy?.reorderQuantity ?? null;
    const maximum = policy?.maximum ?? null;
    const configured = reorderPoint !== null && (method === 'upTo' ? maximum !== null : reorderQuantity !== null);
    const low = configured && signedQuantity(position.position) <= decimal(reorderPoint);
    const unrounded = low ? nonnegative((method === 'upTo' ? decimal(maximum) : decimal(reorderPoint) + decimal(reorderQuantity)) - signedQuantity(position.position)) : 0n;
    const pack = terms ? decimal(terms.packSize, true) : null;
    const minimum = terms ? decimal(terms.minimum) : 0n;
    const rounded = pack !== null && low ? roundPack(unrounded > minimum ? unrounded : minimum, pack) : 0n;
    const remaining = nonnegative(rounded - signedQuantity(position.draftQuantity));
    const freight = policy?.freight ?? '0', duty = policy?.duty ?? '0';
    const productCost = terms ? remaining * decimal(terms.price) : null;
    const chargeCost = remaining > 0n ? (decimal(freight) + decimal(duty)) * SCALE : 0n;
    return {
      itemId: i.id, warehouse, scope: scope.company ? 'company' : 'location', includedWarehouses: scope.warehouses, defaults: defaults ?? null, localPolicy: local ?? null, supplierId, terms: terms ?? null, policy: policy ?? null,
      policyId: policy?.id ?? null, policyVersion: policy?.version ?? 0,
      leadDays, safetyStock, windowDays, reviewDays, windows,
      observedSold: selected.sold, soldPerDay: selected.soldPerDay, hasHistory: selected.hasHistory,
      learned, applied: { reorderPoint, reorderQuantity, maximum, method,
        quantitySource: terms?.reorderQuantity != null ? 'supplier' : scope.company ? policy?.scope === 'sku' ? 'sku' : 'location' : local?.reorderQuantity != null ? 'location' : 'sku' },
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
      assumption: 'Observed demand combines native shipments with mapped native channel orders net of cancellations, counted once at their first Pier capture in the routed or connection warehouse. Linked shipments are excluded from the shipment contribution. No provider sale dates, imported history, seasonal effects or promotions are inferred. Safety stock is buyer-entered; observed sales can be censored by stockouts. Drafts are coverage, never on-hand or committed supply.',
    };
  }));
}

export function replenishment(c: Context, type: string, p: any): Row | undefined {
  const settings = scopeCommand(c, type, p);
  if (settings) return settings;
  if (type === 'replenishment.check') { requireRole(c, ['buyer']); refreshReorderExceptions(c); return { id: c.commandId, version: 1 }; }
  if (type === 'replenishment.compare') {
    requireRole(c, ['buyer', 'agent']);
    const f = forecast(c, [{ itemId: p.itemId, warehouse: p.warehouse, supplierId: p.supplierId }]).find(f => f.itemId === p.itemId && f.warehouse === p.warehouse)
      ?? fail('NOT_FOUND', 'Choose an active item in the current planning scope.');
    return { id: c.commandId, version: 1, stateVersion: c.s.version + 1, itemId: f.itemId, warehouse: f.warehouse,
      supplierId: f.supplierId, ...compareReplenishment(f, p.cashCeiling) };
  }
  if (!['replenishment.save', 'replenishment.plan'].includes(type)) return;
  requireRole(c, ['buyer']);
  if (type === 'replenishment.plan') {
    if (p.policyId && !policies(c).some(policy => policy.id === p.policyId)) fail('NOT_FOUND', 'Replenishment policy not found.');
    if (p.lines !== undefined && (!Array.isArray(p.lines) || !p.lines.length)) fail('LINES', 'Select reorder lines to draft.');
    if (p.stateVersion !== undefined && p.stateVersion !== c.s.version) fail('STALE', 'Stock or terms changed. Review the reorder list.');
    const drafts = draftReplenishment(c, { autoOnly: false, policyId: p.policyId, selected: p.lines });
    return { id: c.commandId, version: 1, draftIds: drafts.map(draft => draft.id), drafts };
  }
  const i = item(c.s, p.itemId), skuDefault = p.scope === 'sku', warehouse = skuDefault ? null : text(p.warehouse, 'Warehouse');
  if (!skuDefault && !planningWarehouses(c).includes(warehouse!)) fail('WAREHOUSE', 'Choose a warehouse containing a real bin.');
  const old = policies(c).find(policy => policy.itemId === i.id && (skuDefault ? policy.scope === 'sku' : policy.scope !== 'sku' && policy.warehouse === warehouse));
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
    itemId: i.id, warehouse, scope: skuDefault ? 'sku' : 'location', supplierId: p.supplierId, method: p.method,
    safetyStock: format(decimal(p.safetyStock)), leadDays: days(p.leadDays, 'Lead time', terms.leadDays),
    windowDays: days(p.windowDays, 'Sales window', 30, true), reviewDays: days(p.reviewDays, 'Review period', 30, true),
    companyReorderPoint: optionalQuantity(p.companyReorderPoint), reorderPoint: optionalQuantity(p.reorderPoint), reorderQuantity: optionalQuantity(p.reorderQuantity), maximum: optionalQuantity(p.maximum),
    autoDraft: p.autoDraft === true, freight: format(decimal(p.freight ?? '0')), duty: format(decimal(p.duty ?? '0')),
    approvedBy: c.actor.id, approvalRole: c.actor.role, approvedAt: c.now,
  };
  if (p.applyLearned) {
    if (p.stateVersion !== c.s.version) fail('STALE', 'Demand or supply changed. Reload before applying learned parameters.');
    const selected = (skuDefault ? companyHistory(c, i.id, planningScope(c).warehouses, data.windowDays) : sellThrough(c, i.id, warehouse!, data.windowDays)).find(window => window.days === data.windowDays)!;
    Object.assign(data, learnedParameters(selected.sold, data.windowDays, data.leadDays, data.reviewDays, data.safetyStock, i.unit));
    for (const key of ['reorderPoint', 'reorderQuantity', 'maximum']) decimal(data[key]);
    data.learnedApplication = { actorId: c.actor.id, at: c.now, stateVersion: c.s.version, sold: selected.sold, shipmentIds: selected.shipmentIds, channelOrderIds: selected.channelOrderIds };
  } else data.learnedApplication = null;
  if (['each', 'ea', 'ea.'].includes(i.unit.trim().toLowerCase()))
    for (const key of ['safetyStock', 'reorderPoint', 'reorderQuantity', 'maximum', 'companyReorderPoint'])
      if (data[key] !== null && decimal(data[key]) % SCALE !== 0n) fail('REPLENISHMENT_UNIT', `${key} must be a whole number for an each item.`);
  if (data.method === 'upTo' && data.maximum !== null && data.reorderPoint !== null && decimal(data.maximum) < decimal(data.reorderPoint))
    fail('MAXIMUM', 'Order-up-to maximum must be at least the reorder point.');
  if (data.autoDraft && (data.reorderPoint === null || (data.method === 'upTo' ? data.maximum === null : data.reorderQuantity === null && terms.reorderQuantity == null)))
    fail('POLICY', 'Apply or enter replenishment parameters before enabling automatic drafts.');
  if (old) { Object.assign(old, data, { version: old.version + 1 }); return old; }
  return row(c, 'replenishmentPolicies', data);
}

/** Called only inside a command admission, never from a state GET. */
export function draftReplenishment(c: Context, options: { policyId?: string; autoOnly?: boolean; selected?: { itemId: string; warehouse: string; supplierId?: string; quantity?: string }[] } = {}): Row[] {
  if (!planningScope(c).valid) fail('WAREHOUSE', 'Planning warehouses changed. Save the current planning scope before drafting.');
  const autoOnly = options.autoOnly !== false;
  const selected = options.selected;
  if (selected?.some(l => !l || typeof l.itemId !== 'string' || typeof l.warehouse !== 'string' || (l.supplierId !== undefined && typeof l.supplierId !== 'string'))) fail('LINES', 'Select item, warehouse and supplier identities.');
  if (selected && new Set(selected.map(l => JSON.stringify([l.itemId, l.warehouse]))).size !== selected.length) fail('LINES', 'Select each reorder line once.');
  const available = forecast(c, selected);
  if (selected?.some(l => !available.some(f => f.itemId === l.itemId && f.warehouse === l.warehouse && f.low && !f.blockedReason))) fail('REPLENISHMENT_SELECTION', 'A selected line is no longer low or has unavailable supplier terms.');
  const candidates = available.filter(f => f.policy && (!options.policyId || f.policyId === options.policyId)
    && (!selected || selected.some(l => l.itemId === f.itemId && l.warehouse === f.warehouse))
    && (!autoOnly || f.autoDraft) && f.low && !f.blockedReason && decimal(f.suggestedQuantity) > 0n);
  for (const candidate of candidates) {
    const choice = selected?.find(l => l.itemId === candidate.itemId && l.warehouse === candidate.warehouse);
    if (choice?.quantity !== undefined) {
      const q = decimal(choice.quantity, true), pack = decimal(candidate.terms!.packSize, true);
      if (q < decimal(candidate.terms!.minimum) || q % pack !== 0n) fail('REPLENISHMENT_QUANTITY', 'Edited quantities must meet supplier minimum and whole case packs.');
      candidate.suggestedQuantity = format(q);
    }
  }
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
      reason: `Replenishment plan for ${group.length} buyer-applied item policies at ${group[0].warehouse}. Policy versions and demand evidence are retained on this draft.`,
      lines: group.map(f => ({ itemId: f.itemId, quantity: f.suggestedQuantity, price: f.unitPrice })),
    })!;
    draft.replenishment = { plannedAt: c.now, policyVersions: group.map(f => ({ policyId: f.policyId, version: f.policyVersion })),
      evidence: group.map(f => ({ itemId: f.itemId, warehouse: f.warehouse, windowDays: f.windowDays,
        observedSold: f.observedSold, position: f.position, quantity: f.suggestedQuantity,
        shipmentIds: f.windows.find(window => window.days === f.windowDays)!.shipmentIds,
        channelOrderIds: f.windows.find(window => window.days === f.windowDays)!.channelOrderIds })),
      approvedBy: null, currency: 'USD', expectedLandedCost: money(group.reduce((sum, f) => sum + decimal(f.suggestedQuantity) * decimal(f.unitPrice!) + (decimal(f.freight) + decimal(f.duty)) * SCALE, 0n)) };
    drafts.push(draft);
  }
  return drafts;
}

/** One persistent open exception per item/planning scope, closed by real supply. */
export function refreshReorderExceptions(c: Context) {
  const low = forecast(c).filter(f => f.configured && f.low);
  const key = (r: { [key: string]: any }) => JSON.stringify([r.itemId, r.scope ?? 'location', r.warehouse]);
  const keys = new Set(low.map(key));
  for (const e of c.s.replenishmentExceptions.filter(e => e.status === 'open')) if (!keys.has(key(e))) Object.assign(e, { status: 'closed', closedAt: c.now, version: e.version + 1, reason: 'Position is above the reorder point or planning scope changed.' });
  for (const f of low) if (!c.s.replenishmentExceptions.some(e => e.status === 'open' && key(e) === key(f))) row(c, 'replenishmentExceptions', { itemId: f.itemId, warehouse: f.warehouse, scope: f.scope, status: 'open', assigneeId: f.policy?.approvedBy, nextAction: 'Review current supply and prepare a purchase draft.' });
}
