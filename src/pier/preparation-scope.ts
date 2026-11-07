import { collections, movementFrontier, positions, Problem, type Actor, type Row, type State } from './model';
import { pickFields } from './physical-documents';

export type PreparationGrant = { evidenceIds: string[]; expiresAt?: string };
const sources = ['items', 'locations', 'parties', 'supplierItems', 'orders', 'purchaseOrders', 'counts', 'imports'] as const;
const denied = () => { throw new Problem('SCOPE', 'Choose evidence inside your current preparation grant. Ask the owner to review its scope.', null, 403); };
export const preparationScoped = (actor: Actor) => actor.role === 'agent' && actor.preparationGrant !== undefined;

export function parsePreparationGrant(value: any, role: string, s: State): PreparationGrant | undefined {
  if (value === undefined) return;
  if (role !== 'agent' || !value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).some(key => !['evidenceIds', 'expiresAt'].includes(key)) || !Array.isArray(value.evidenceIds) ||
      !value.evidenceIds.every((id: any) => typeof id === 'string' && sources.some(key => s[key].some(row => row.id === id && (key !== 'parties' || row.kind === 'supplier'))))) return denied();
  if (value.expiresAt !== undefined && (typeof value.expiresAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value.expiresAt) || !Number.isFinite(Date.parse(value.expiresAt)) || Date.parse(value.expiresAt) <= Date.now())) return denied();
  return { evidenceIds: [...new Set<string>(value.evidenceIds)], ...(value.expiresAt ? { expiresAt: new Date(value.expiresAt).toISOString() } : {}) };
}

/** Exact named sources, with positive field lists. No originals, contacts,
 * arbitrary typed fields, prices, costs or another person's saved results. */
export function preparationState(full: State, actor: Actor): State {
  const grant = actor.preparationGrant;
  if (!grant || grant.expiresAt && Date.parse(grant.expiresAt) <= Date.now()) return denied();
  const ids = new Set(grant.evidenceIds), result = { version: full.version, movements: [], reservations: [] } as unknown as State;
  for (const key of collections) result[key] = [];
  const selected = (key: typeof sources[number]) => full[key].filter(row => ids.has(row.id));
  result.items = selected('items').map(row => pickFields(row, ['sku', 'name', 'unit', 'packSize', 'archived']));
  result.locations = selected('locations').map(row => pickFields(row, ['name', 'warehouse', 'kind']));
  const itemIds = new Set(result.items.map(row => row.id)), locationIds = new Set(result.locations.map(row => row.id));
  const completeLines = (row: Row) => row.lines.every((line: any) => itemIds.has(line.itemId));
  result.parties = selected('parties').filter(row => row.kind === 'supplier' && !row.privacyErasedAt).map(row => pickFields(row, ['kind', 'name']));
  const supplierIds = new Set(result.parties.map(row => row.id));
  result.supplierItems = selected('supplierItems').filter(row => itemIds.has(row.itemId) && supplierIds.has(row.supplierId)).map(row => pickFields(row, ['supplierId', 'itemId', 'packSize', 'minimum', 'leadDays']));
  result.orders = selected('orders').filter(completeLines).map(row => ({ ...pickFields(row, ['status', 'warehouse', 'promiseDate']), lines: row.lines.map((line: Row) => pickFields(line, ['itemId', 'quantity', 'dispatched', 'cancelled'])) }));
  result.purchaseOrders = selected('purchaseOrders').filter(row => !row.dropshipId && supplierIds.has(row.supplierId) && completeLines(row)).map(row => ({ ...pickFields(row, ['supplierId', 'status', 'promiseDate', 'destinationWarehouse']), lines: row.lines.map((line: Row) => pickFields(line, ['itemId', 'quantity', 'received'])) }));
  result.counts = selected('counts').filter(row => locationIds.has(row.locationId) && completeLines(row)).map(row => ({ ...pickFields(row, ['locationId', 'status', 'frontier']), lines: row.lines.map((line: Row) => pickFields(line, ['itemId', 'status', 'quantity', 'expected'])) }));
  result.imports = selected('imports').map(row => pickFields(row, ['status', 'mappingRevision']));
  result.movements = full.movements.filter(row => itemIds.has(row.itemId) && locationIds.has(row.locationId)).map(row => ({ ...row, actorId: '', commandId: '', documentId: '', reversalId: null, importId: null, reason: '' }));
  const orderIds = new Set(result.orders.map(row => row.id));
  result.reservations = full.reservations.filter(row => itemIds.has(row.itemId) && locationIds.has(row.locationId)).map(row => ({ ...row, orderId: orderIds.has(row.orderId) ? row.orderId : '', orderLineId: orderIds.has(row.orderId) ? row.orderLineId : '' }));
  const readable = new Set(sources.flatMap(key => result[key].map(row => row.id)));
  result.proposals = full.proposals.filter(row => row.preparation?.actorId === actor.id && row.preparation?.permissionVersion === actor.permissionVersion && row.evidence?.every((id: string) => readable.has(id)));
  return result;
}

export function preparationView(full: State, actor: Actor) {
  const s = preparationState(full, actor);
  return { ...s, actor, positions: positions(s), operators: [], people: [], commands: [], reorder: [] };
}

export function admitPreparationCommand(full: State, actor: Actor, type: string, p: any) {
  if (actor.role !== 'agent') return;
  if (!preparationScoped(actor)) {
    if (type === 'proposal.prepare') return denied();
    return;
  }
  if (type !== 'proposal.prepare') throw new Problem('FORBIDDEN', 'A preparation grant permits evidence review and proposals only. Human approval and business commands use their own authority.', null, 403);
  const s = preparationState(full, actor), readable = new Set(sources.flatMap(key => s[key].map(row => row.id)));
  if (!Array.isArray(p.evidence) || !p.evidence.length || !p.evidence.every((id: any) => typeof id === 'string' && readable.has(id))) return denied();
  const plan = p.plan ?? {}, has = (key: typeof sources[number], id: unknown) => s[key].some(row => row.id === id);
  if (p.kind === 'reallocation' && (!has('orders', plan.fromOrderId) || !has('orders', plan.toOrderId) || !has('items', plan.itemId)) ||
      p.kind === 'count-drift' && !has('counts', plan.countId) || p.kind === 'migration' && !has('imports', plan.batchId) ||
      p.kind === 'replenishment' && (plan.poId ? !has('purchaseOrders', plan.poId) : !has('items', plan.itemId) || !has('parties', plan.supplierId))) return denied();
}

export function preparationInputs(full: State, actor: Actor) {
  return { state: preparationScoped(actor) ? preparationState(full, actor) : full, frontier: movementFrontier(full) };
}
