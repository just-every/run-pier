import { decimal, fail, format, SCALE, text, type Context } from './model';
import { ceilDivide } from './replenishment-position';
import { sellThrough } from './replenishment-demand';

const DAY = 86_400_000;

/** Reviewed scenario bounds are assumptions, never a claimed service probability. */
export function forecastAssumptions(value: any) {
  if (value === undefined || value === null) return null;
  const factor = (input: any, name: string) => {
    if (!input) fail('FORECAST_ASSUMPTIONS', `Provide ${name} bounds and their source.`);
    const low = decimal(input.low, true), expected = decimal(input.expected, true), high = decimal(input.high, true);
    if (low > expected || expected > high || high > 10n * SCALE) fail('FORECAST_ASSUMPTIONS', `${name} factors must be ordered, positive and at most ten.`);
    return { low: format(low), expected: format(expected), high: format(high), source: text(input.source, `${name} source`) };
  };
  return { seasonality: factor(value.seasonality, 'Seasonality'), promotion: factor(value.promotion, 'Promotion') };
}

/** Reconstruct physical availability from the complete append-only movement history. */
function exposure(c: Context, itemId: string, warehouses: string[], from: number, through: number) {
  const locations = new Set(c.s.locations.filter(l => l.kind === 'bin' && warehouses.includes(l.warehouse)).map(l => l.id));
  const movements = c.s.movements.filter(m => m.itemId === itemId && m.status === 'sellable' && locations.has(m.locationId) && Date.parse(m.createdAt) <= through)
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt) || a.sequence - b.sequence);
  if (!movements.length || Date.parse(movements[0].createdAt) > from) return null;
  let balance = 0n, cursor = from, availableMs = 0;
  for (const movement of movements) {
    const at = Date.parse(movement.createdAt);
    if (at > from) { if (balance > 0n) availableMs += at - cursor; cursor = at; }
    balance += BigInt(movement.quantity);
  }
  if (balance > 0n) availableMs += through - cursor;
  return { availableMs, stockoutMs: through - from - availableMs, movementIds: movements.map(m => m.id) };
}

export function adjustedForecast(c: Context, f: any) {
  const span = f.windowDays * DAY, through = Date.parse(c.now), from = through - span;
  const availability = exposure(c, f.itemId, f.includedWarehousesForDemand ?? [f.warehouse], from, through);
  const observed = decimal(f.observedSold), assumptions = f.policy?.forecastAssumptions;
  const corrected = availability && availability.availableMs > 0 ? ceilDivide(observed * BigInt(span), BigInt(availability.availableMs)) : null;
  const base = corrected ?? observed;
  const estimate = (bound: 'low' | 'expected' | 'high') => assumptions
    ? ceilDivide(base * decimal(assumptions.seasonality[bound]) * decimal(assumptions.promotion[bound]), SCALE * SCALE) : base;
  const half = Math.floor(f.windowDays / 2);
  const split = through - half * DAY;
  const training = { ...c, now: new Date(split).toISOString() };
  const warehouses: string[] = f.includedWarehousesForDemand ?? [f.warehouse];
  const history = (context: Context, days: number) => warehouses.reduce((n, warehouse) => n + decimal(sellThrough(context, f.itemId, warehouse, days).find(w => w.days === days)!.sold), 0n);
  const trainingDays = f.windowDays - half;
  const trainingActual = history(training, trainingDays), heldOutActual = half > 0 ? history(c, half) : 0n;
  const predicted = half > 0 ? ceilDivide(trainingActual * BigInt(half), BigInt(trainingDays)) : 0n;
  return { observed: f.observedSold, correctedWindowDemand: corrected === null ? null : format(corrected),
    low: format(observed < estimate('low') ? observed : estimate('low')), expected: format(estimate('expected')), high: format(observed > estimate('high') ? observed : estimate('high')),
    availability, assumptions: assumptions ?? null,
    correctionStatus: corrected === null ? 'insufficient exposure history' : 'availability-normalized scenario',
    uncertainty: 'Scenario bounds include observed demand and reviewed seasonal and promotion factors. Lost sales are unobserved; this is not a confidence interval or service guarantee. A wholly unavailable or incompletely observed window is not extrapolated.',
    backtest: half > 0 ? { trainingFrom: new Date(from).toISOString(), through: new Date(split).toISOString(), holdoutThrough: c.now,
      trainingDays, holdoutDays: half, trainingActual: format(trainingActual), predicted: format(predicted), actual: format(heldOutActual),
      absoluteError: format(predicted > heldOutActual ? predicted - heldOutActual : heldOutActual - predicted),
      basis: 'Rolling-origin observed-rate baseline; only demand captured before the split trains it. Current reviewed factors are not fitted retrospectively. Holdout actuals may themselves be stockout-censored.' } : null };
}
