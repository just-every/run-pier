import { fail, requireRole, row, text, type Context, type Row } from './model';

// Who Pier's supplier and customer emails come from, and where suppliers ship.
export const BUSINESS = 'business';

export function business(c: Context, type: string, p: any): Row | undefined {
  if (type !== 'business.save') return;
  requireRole(c, []);
  const warehouses = new Set(c.s.locations.filter(l => l.kind === 'bin').map(l => l.warehouse));
  const shipTo: Record<string, string> = {};
  for (const [warehouse, value] of Object.entries(p.shipTo ?? {})) {
    if (!warehouses.has(warehouse)) fail('WAREHOUSE', `${warehouse} is not a warehouse in Stock.`);
    if (typeof value === 'string' && value.trim()) shipTo[warehouse] = text(value.trim(), `Ship-to address for ${warehouse}`);
  }
  const value = { name: text(p.name, 'Business name'), address: text(p.address, 'Business address'), shipTo };
  const old = c.s.businessProfile.find(r => r.id === BUSINESS);
  return old ? Object.assign(old, value, { version: old.version + 1 }) : row(c, 'businessProfile', { ...value, id: BUSINESS });
}

/** The business an email is from; sending waits until the owner has named it. */
export function sender(c: Context): Row {
  const profile = c.s.businessProfile.find(r => r.id === BUSINESS);
  if (!profile) return fail('BUSINESS_PROFILE', 'Add your business name and address in Purchasing → Your business first, so the email says who it is from and where to deliver.');
  return profile;
}
export const shipTo = (profile: Row, warehouse: string | null) => (warehouse && profile.shipTo?.[warehouse]) || profile.address;
/** "November 7, 2026" for a reader; the ISO date stays in the record. */
export const longDate = (date: string) => new Date(`${date}T00:00:00Z`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
