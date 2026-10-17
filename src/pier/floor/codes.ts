import { SCALE, decimal, fail, type Row, type State } from "../model";

// What a scanned or typed code means on the warehouse floor. A camera, a USB or
// Bluetooth scanner (keyboard wedge) and a person typing all arrive here as the
// same text. Numeric retail codes compare as GTIN-14, so a UPC-A read as
// EAN-13 (leading zero) or printed on a case as GTIN-14 still matches.

const SYMBOLOGY = /^\][A-Za-z][0-9A-Za-z]/;
export function clean(code: unknown): string {
  if (typeof code !== "string") return fail("CODE", "Scan or type a code.");
  const value = code.replace(SYMBOLOGY, "").replace(/\s+/g, "");
  if (!value || value.length > 200) return fail("CODE", "Scan or type a code.");
  return value;
}
const gtin = (value: string) =>
  /^\d{8}$|^\d{12,14}$/.test(value) ? value.padStart(14, "0") : null;
export function same(a: unknown, b: unknown) {
  if (typeof a !== "string" || typeof b !== "string" || !a || !b) return false;
  const x = clean(a), y = b.replace(/\s+/g, "");
  const gx = gtin(x), gy = gtin(y);
  return gx && gy ? gx === gy : x.toLowerCase() === y.toLowerCase();
}

export type ItemScan = { item: Row; units: bigint; kind: "unit" | "case" | "sku" };
export type Scan = { item: ItemScan } | { bin: Row } | { unknown: string };

/** One code to an item (and how many base units it stands for) or a bin. Bin
 * names repeat across warehouses, so a name resolves in the working warehouse. */
export function resolve(s: State, raw: unknown, warehouse?: string): Scan {
  const code = clean(raw);
  for (const item of s.items) {
    if (item.archived) continue;
    if (same(code, item.barcode)) return { item: { item, units: SCALE, kind: "unit" } };
    if (same(code, item.caseBarcode))
      return { item: { item, units: decimal(item.packSize, true), kind: "case" } };
  }
  const bins = s.locations.filter(
    (l) => l.kind === "bin" && (same(code, l.barcode) || same(code, l.name)),
  );
  const bin = bins.find((l) => l.warehouse === warehouse) ?? (bins.length === 1 ? bins[0] : null);
  if (bin) return { bin };
  if (bins.length)
    return fail("AMBIGUOUS_BIN", `More than one warehouse has a bin called ${code}. Scan its bin label barcode.`, { warehouses: bins.map((l) => l.warehouse) });
  const sku = s.items.find((i) => !i.archived && same(code, i.sku));
  if (sku) return { item: { item: sku, units: SCALE, kind: "sku" } };
  return { unknown: code };
}

export function itemScan(s: State, raw: unknown, purpose: string): ItemScan {
  const scan = resolve(s, raw);
  if ("item" in scan) return scan.item;
  if ("bin" in scan)
    return fail("SCAN_BIN", `That is bin ${scan.bin.name}. Scan the item's barcode to ${purpose}.`);
  return fail("UNKNOWN_CODE", `Code ${scan.unknown} is not an item or bin barcode in Pier. Nothing was recorded.`, { code: scan.unknown });
}

/** The bin labels a picker may scan for a bin: its barcode or its printed name. */
export const binMatches = (bin: Row, raw: unknown) =>
  same(clean(raw), bin.barcode) || same(clean(raw), bin.name);

const natural = new Intl.Collator("en", { numeric: true, sensitivity: "base" });
/** Pick sequence: bins in a warehouse walked in natural name order (A-2 before A-10). */
export const pickSequence = (s: State, warehouse: string) =>
  s.locations
    .filter((l) => l.kind === "bin" && l.warehouse === warehouse)
    .sort((a, b) => natural.compare(a.name, b.name));
