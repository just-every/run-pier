import { decimal, fail, format, SCALE, type Row } from './model';

// Native CSV amounts carry an ISO 4217 currency per batch or row; USD is the
// default. A non-USD amount keeps its source value and is valued in USD only
// through the conversion rate the owner entered and the batch records.
const ISO = new Set<string>(Intl.supportedValuesOf('currency'));

export function currencyCode(value: unknown, where: string): string {
  const code = String(value ?? '').trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(code) || !ISO.has(code)) fail('CURRENCY', `${where} has currency "${String(value ?? '')}", which is not an ISO 4217 code such as USD, AUD or CAD.`);
  return code;
}

/** Owner-entered rates, { AUD: "0.65" } meaning 1 AUD = 0.65 USD, recorded with who entered them. */
type Rate = { rate: string; recordedBy: string; recordedAt: string };
export function conversionRates(input: unknown, actorId: string, at: string): Record<string, Rate> {
  if (input === undefined || input === null) return {};
  if (typeof input !== 'object' || Array.isArray(input)) fail('CONVERSION_RATE', 'Give conversion rates as currency code and USD rate, for example AUD 0.65.');
  const rates: Record<string, Rate> = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    const code = currencyCode(key, 'A conversion rate');
    if (code === 'USD') continue;
    const rate = decimal(value, true);
    if (!rate) fail('CONVERSION_RATE', `The USD rate for ${code} must be above zero.`);
    rates[code] = { rate: format(rate), recordedBy: actorId, recordedAt: at };
  }
  return rates;
}

export function usdRate(batch: Row | undefined, currency: string | undefined): bigint | null {
  const code = currency ?? batch?.currency;
  if (code === 'USD') return SCALE;
  const rate = code ? batch?.conversionRates?.[code]?.rate : undefined;
  return rate ? decimal(rate) : null;
}

/** A six-place source amount in USD at six places (truncated past the sixth). */
export const inUsd = (amount: string, rate: bigint) => format(decimal(amount) * rate / SCALE);
