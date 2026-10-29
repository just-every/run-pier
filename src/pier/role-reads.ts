import { collections, Problem, positions, type Actor, type State } from './model';
import { physicalState, scoped } from './permissions';
import { costsVisible, pricesVisible } from './role-visibility';
import { stockPosition } from './stock-position';
import { floorState } from './floor';
import { pickFields } from './physical-documents';
import { orderView } from './orders';

const denied = (actor: Actor) => { throw new Problem(scoped(actor) ? 'SCOPE' : 'FORBIDDEN', 'This private door requires wider current authority.', null, 403); };
export function admitRead(actor: Actor, url: URL) {
  if (actor.role === 'owner') return;
  const path = url.pathname;
  if (['/api/pier/state', '/api/pier/scope-export'].includes(path)) return;
  if (path === '/api/pier/questions') {
    const kind = url.searchParams.get('kind') ?? 'stock';
    if (['stock', 'orders', 'shortage'].includes(kind) || ['late', 'supplier'].includes(kind) && costsVisible(actor)) return;
    return denied(actor);
  }
  if (/^\/api\/pier\/(?:orders|packs)\/[^/]+\/packing-slip$/.test(path) && actor.role === 'warehouse') return;
  if (['/api/pier/supplier-performance', '/api/pier/replenishment'].includes(path) && costsVisible(actor)) return;
  // Raw originals, financial exports, provider downloads, arbitrary audit
  // images and retained documents are owner doors, including after demotion.
  return denied(actor);
}

export function operationalState(full: State, actor: Actor) {
  const physicalActor = { ...actor, permissions: actor.permissions ?? { warehouses: [...new Set(full.locations.map(location => location.warehouse))], locationIds: [] } };
  const s = physicalState(full, physicalActor);
  const c = { s, actor, commandId: '', now: new Date().toISOString() };
  return { ...s, orders: s.orders.map(order => orderView(c, order, false)), actor, ...floorState(c), positions: positions(s), ...stockPosition(s),
    commands: [], operators: [], people: [], bookConnections: [], receiptClosures: [], deliveries: [], auditEvents: [], forecasts: [], reorder: [], tracePositions: [], customerProfiles: [], customerBalances: {} };
}

/** A finite collection matrix; new collection classes remain private. */
export function roleState(full: State, actor: Actor, view: any) {
  if (actor.role === 'owner') return view;
  const output: any = operationalState(full, actor);
  if (!scoped(actor)) {
    if (['buyer', 'agent'].includes(actor.role)) {
      output.parties = full.parties.filter(party => party.kind === 'supplier').map(party => pickFields(party, ['kind', 'name', 'email']));
      if (costsVisible(actor)) {
        for (const key of ['purchaseOrders', 'supplierItems', 'receipts', 'supplierReturns', 'replenishmentExceptions', 'replenishmentPolicies', 'replenishmentSettings', 'slowStockPolicies', 'slowStockExceptions'] as const) output[key] = view[key];
        output.forecasts = view.forecasts;
        output.reorder = view.reorder;
      } else if (actor.role === 'agent') {
        // Agents can follow a shared draft without receiving purchasing costs,
        // private supplier snapshots, approval identities or customer addresses.
        output.purchaseOrders = full.purchaseOrders.filter(po => !po.dropshipId).map(po => ({
          ...pickFields(po, ['reference', 'supplierId', 'status', 'promiseDate', 'destinationWarehouse']),
          approved: po.approval?.version === po.version,
          lines: po.lines.map((line: any) => pickFields(line, ['itemId', 'quantity', 'received'])),
        }));
      }
    }
    if (['operator', 'sales'].includes(actor.role)) {
      output.parties = full.parties.filter(party => party.kind === 'customer').map(party => pickFields(party, ['kind', 'name']));
      if (pricesVisible(actor)) {
        output.orders = view.orders;
        output.priceLists = full.priceLists;
      }
    }
  }
  // A recoverable physical action needs its own recorded identity, not another
  // person's command history or its commercial result.
  output.commands = (view.commands ?? []).filter((command: any) => command.actorId === actor.id);
  return output;
}

const privateCosts = new Set(['cost', 'costs', 'unitCost', 'costTotal', 'costTotalScale', 'costLayers', 'landedCost', 'landedTotal', 'landedUnitCost', 'insurance', 'otherLandedCost', 'expectedLandedCost', 'cash', 'margin', 'marginPercent', 'minimumMarginPercent', 'supplierSnapshot', 'terms']);
const moneyFields = new Set(['price', 'unitPrice', 'listPrice', 'freight', 'duty', 'tax', 'total', 'maxSpend', 'approvalRoute', 'priceSnapshot', 'quoteHistory', 'quoteApproval']);
export function commandProjection(value: any, actor: Actor): any {
  if (actor.role === 'owner' || !value || typeof value !== 'object') return value;
  if (value.kind === 'supplier-substitutes') return pickFields(value, ['kind', 'status', 'preparation']);
  if (Array.isArray(value)) return value.map(entry => commandProjection(entry, actor));
  if (!costsVisible(actor) && Array.isArray(value.lines) && (value.supplierId || value.poId)) value = {
    ...pickFields(value, ['reference', 'supplierId', 'approved', 'status', 'promiseDate', 'destinationWarehouse', 'poId', 'supplierReference', 'receivingId', 'variance', 'overReason']),
    lines: value.lines.map((line: any) => pickFields(line, ['itemId', 'poLineId', 'locationId', 'quantity', 'received', 'movementId', 'trace'])),
  };
  if (!pricesVisible(actor) && Array.isArray(value.lines) && value.customerId) value = {
    ...pickFields(value, ['reference', 'status', 'warehouse', 'promiseDate', 'documentType', 'acceptedAt', 'quoteApproval']),
    lines: value.lines.map((line: any) => pickFields(line, ['itemId', 'quantity', 'dispatched', 'cancelled', 'reserved', 'backorder', 'kit'])),
  };
  if (value.kind === 'item-review' && !costsVisible(actor)) value = { ...value,
    checks: value.checks.filter((check: any) => check.kind !== 'cost'),
    actions: value.actions.filter((action: any) => action.kind !== 'supplier-price'), ai: undefined };
  return Object.fromEntries(Object.entries(value).filter(([key]) => !(privateCosts.has(key) && !costsVisible(actor) || moneyFields.has(key) && !costsVisible(actor) && !pricesVisible(actor))).map(([key, entry]) => [key, commandProjection(entry, actor)]));
}

export function physicalResult(s: State, actor: Actor, result: any) {
  if (!scoped(actor)) return result;
  const visible = physicalState(s, actor);
  for (const key of collections) {
    const row = visible[key].find(row => row.id === result?.id);
    if (row) return row;
  }
  return denied(actor);
}
