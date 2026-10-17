import { fail } from './model';

/** A source promise is a calendar date. Validate a local export time, retain
 * the original in custody, and keep its date without a timezone shift. */
export function sourcePromiseDate(value: string, dateFormat?: string) {
  let date = value.trim();
  if (dateFormat === 'M/D/YYYY') {
    const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T]([01]?\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?)?$/.exec(date)
      ?? fail('DATE', 'Map an explicit M/D/YYYY promise date, optionally followed by a 24-hour time (H:MM or H:MM:SS). A blank source date needs a reviewed date column or explicit fixed value.');
    date = `${match[3]}-${match[1].padStart(2, '0')}-${match[2].padStart(2, '0')}`;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date)
    fail('DATE', 'Use a valid explicit source promise date. Check the date column, selected format or reviewed fixed value.');
  return date;
}
