import { Problem, type Actor } from './model';

export type Visibility = { costs?: boolean; prices?: boolean };
export const costsVisible = (actor: Actor) => actor.role === 'owner' || actor.role === 'buyer' && !actor.permissions && actor.visibility?.costs !== false;
export const pricesVisible = (actor: Actor) => actor.role === 'owner' || ['operator', 'sales'].includes(actor.role) && !actor.permissions && actor.visibility?.prices !== false;

/** These switches only remove existing role authority. They never delegate it. */
export function parseVisibility(value: any, role: string): Visibility | undefined {
  if (value === undefined) return;
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !['costs', 'prices'].includes(key)) ||
      Object.values(value).some(flag => typeof flag !== 'boolean') || value.costs === true && !['owner', 'buyer'].includes(role) || value.prices === true && !['owner', 'operator', 'sales'].includes(role))
    throw new Problem('VISIBILITY', 'Visibility can only restrict the selected role. Wider commercial delegation requires owner authority.', null, 403);
  return { ...value };
}

export function admitCommercialCommand(actor: Actor, type: string) {
  if (actor.role === 'owner') return;
  if (type === 'quote.approve' && actor.visibility?.prices === false)
    throw new Problem('VISIBILITY', 'Quote approval requires current sales price visibility.', null, 403);
  if (['supplierItem.save', 'itemAgent.explain'].includes(type) && !costsVisible(actor) || type === 'priceList.save' && !pricesVisible(actor))
    throw new Problem('FORBIDDEN', 'Your current role cannot access this commercial operation.', null, 403);
  const costCommand = /^(?:po\.|supplierItem\.|supplierReturn\.|supplierBill\.|replenishment\.|slowStock\.)/.test(type) || ['priceList.save', 'itemAgent.bulkPreview', 'itemAgent.bulkEdit', 'itemAgent.bulkApply'].includes(type);
  const priceCommand = /^(?:quote\.|order\.)/.test(type) && !['order.carrier', 'order.releaseBackorders'].includes(type);
  if (costCommand && actor.role === 'buyer' && !costsVisible(actor) || priceCommand && ['operator', 'sales'].includes(actor.role) && !pricesVisible(actor))
    throw new Problem('VISIBILITY', 'This operation requires commercial visibility that your current role does not hold.', null, 403);
}
