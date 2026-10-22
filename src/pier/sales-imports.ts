import { spreadsheet } from "./sales-spreadsheet";
import {
  fail,
  fresh,
  get,
  requireRole,
  row,
  text,
  type Context,
  type Row,
  Problem,
} from "./model";
import { parseCSV } from "./import-csv";
import { quoteLines, isoDay } from "./sales-quotes";
import { route, routingFrontier } from "./routing";
import { orders } from "./orders";
import { canonicalJson, sha256 } from "./import-kit";
import { barcodesOf, same } from "./floor/codes";
const frontier = (c: Context) =>
  sha256(
    canonicalJson([
      routingFrontier(c.s),
      c.s.items,
      c.s.priceLists,
      c.s.routingRules,
      c.now.slice(0, 10),
    ]),
  );
const headers = [
  "customer",
  "poReference",
  "item",
  "quantity",
  "unit",
  "price",
  "shipTo",
  "state",
  "postalCode",
  "country",
  "requestedDate",
  "warehouse",
];
export function salesImports(
  c: Context,
  type: string,
  p: any,
): Row | undefined {
  if (!["salesImport.stage", "salesImport.apply"].includes(type)) return;
  requireRole(c, []);
  if (type === "salesImport.stage") {
    let csv: string, original: any, sourceRows: number[] | undefined;
    if (p.xlsxBase64 !== undefined) {
      if (typeof p.xlsxBase64 !== "string" || p.xlsxBase64.length > 1400000)
        fail("IMPORT_SIZE", "Use a workbook up to 1 MiB.");
      let bytes: Uint8Array;
      try {
        bytes = Uint8Array.from(atob(p.xlsxBase64), (ch) => ch.charCodeAt(0));
      } catch {
        fail("SPREADSHEET", "Workbook encoding is invalid.");
      }
      const parsed = spreadsheet(bytes!);
      csv = parsed.csv;
      sourceRows = parsed.sourceRows;
      original = {
        format: "xlsx",
        base64: p.xlsxBase64,
        bytes: bytes!.length,
        sha256: sha256(bytes!),
        sheetName: parsed.sheetName,
      };
    } else {
      if (
        typeof p.csv !== "string" ||
        new TextEncoder().encode(p.csv).length > 1024 * 1024
      )
        fail("IMPORT_SIZE", "Use a CSV file up to 1 MiB.");
      csv = p.csv;
      const bytes = new TextEncoder().encode(csv);
      original = { format: "csv", bytes: bytes.length, sha256: sha256(bytes) };
    }
    const digest = original.sha256,
      prior = c.s.salesImports.find(
        (r) => r.digest === digest && r.status === "applied",
      );
    if (prior) return prior;
    const matrix = parseCSV(csv);
    if (JSON.stringify(matrix.shift()) !== JSON.stringify(headers))
      fail("CSV_HEADER", `Use these exact columns: ${headers.join(",")}`);
    if (!matrix.length || matrix.length > 1000)
      fail("IMPORT_ROWS", "Use one to 1,000 order lines.");
    const preview: any[] = [],
      groups: any[] = [];
    matrix.forEach((cells, index) => {
      const record: any = {
        row: sourceRows?.[index + 1] ?? index + 2,
        errors: [],
      };
      preview.push(record);
      try {
        if (cells.length !== headers.length)
          fail("CSV", "Row has the wrong number of cells.");
        const input = Object.fromEntries(
          headers.map((h, i) => [h, cells[i].trim()]),
        );
        record.source = input;
        const customers = c.s.parties.filter(
          (r) =>
            r.kind === "customer" && [r.id, r.name].includes(input.customer),
        );
        if (customers.length !== 1)
          fail("CUSTOMER", "Customer must resolve exactly once.");
        const customer = customers[0];
        record.customerId = customer.id;
        const po = text(input.poReference, "Customer PO reference");
        const shipTo = {
          address1: text(input.shipTo, "Ship-to address"),
          state: input.state.toUpperCase(),
          postalCode: input.postalCode,
          country: input.country.toUpperCase(),
        };
        const date = isoDay(input.requestedDate, "Requested date");
        const routed = route(c.s, "file", shipTo, null, input.warehouse);
        record.routing = routed;
        record.warehouse = routed.eligible[0] ?? null;
        if (routed.status === "waiting") fail("ROUTING_WAIT", routed.reason);
        if (
          input.warehouse &&
          !c.s.locations.some(
            (l) => l.kind === "bin" && l.warehouse === input.warehouse,
          )
        )
          fail("WAREHOUSE", "Choose an existing routed warehouse.");
        const matches = c.s.items.filter(
          (i) =>
            !i.archived &&
            ([i.sku, ...barcodesOf(i).map((b) => b.code)].some((code) =>
              same(code, input.item),
            ) ||
              i.references?.some(
                (r: any) =>
                  r.partyId === customer.id && same(r.code, input.item),
              )),
        );
        if (matches.length !== 1)
          fail(
            "ITEM",
            `Item code ${input.item} must resolve exactly once for this customer.`,
          );
        const line = quoteLines(c, {
          customerId: customer.id,
          lines: [
            {
              itemId: matches[0].id,
              quantity: input.quantity,
              unit: input.unit,
              ...(input.price ? { price: input.price } : {}),
            },
          ],
        })[0];
        if (line.price === null)
          fail("PRICE", "Blank price has no current customer price tier.");
        record.line = line;
        if (
          c.s.orders.some(
            (o) => o.customerId === customer.id && o.customerPO === po,
          )
        )
          fail(
            "DUPLICATE",
            "This customer PO reference already created an order.",
          );
        const key = JSON.stringify([customer.id, po]);
        let group = groups.find((g) => g.key === key);
        if (!group) {
          group = {
            key,
            customerId: customer.id,
            customerPO: po,
            warehouse: record.warehouse,
            routingSource: "file",
            shipTo,
            promiseDate: date,
            lines: [],
          };
          groups.push(group);
        }
        if (
          group.warehouse !== record.warehouse ||
          group.promiseDate !== date ||
          JSON.stringify(group.shipTo) !== JSON.stringify(shipTo)
        )
          fail(
            "ORDER_GROUP",
            "Every line of a customer PO needs the same warehouse, ship-to and requested date.",
          );
        group.lines.push(line);
      } catch (error) {
        if (!(error instanceof Problem)) throw error;
        record.errors.push({ code: error.code, message: error.message });
      }
    });
    const trial: Context = { ...c, s: structuredClone(c.s) };
    for (const group of groups) {
      const rows = preview.filter(
        (r) =>
          r.customerId === group.customerId &&
          r.source.poReference === group.customerPO,
      );
      if (rows.some((r) => r.errors.length)) continue;
      try {
        const proposed = orders(trial, "order.create", {
          ...group,
          channel: "customer-file",
        })!;
        for (const record of rows) {
          record.warehouse = proposed.warehouse;
          record.routing = structuredClone(proposed.routing);
        }
      } catch (error) {
        if (!(error instanceof Problem)) throw error;
        for (const record of rows)
          record.errors.push({ code: error.code, message: error.message });
      }
    }
    const data = {
      name: text(p.name, "File name"),
      csv,
      original,
      digest,
      preview,
      groups,
      status: "review",
      frontier: frontier(c),
      stagedBy: c.actor.id,
    };
    if (new TextEncoder().encode(JSON.stringify(data)).length > 1500000)
      fail(
        "IMPORT_SIZE",
        "The retained file and preview exceed the record budget. Split the file along complete customer PO boundaries.",
      );
    return row(c, "salesImports", data);
  }
  const batch = get(c.s, "salesImports", p.importId);
  if (batch.status === "applied") return batch;
  fresh(batch, p.version);
  if (batch.preview.some((r: any) => r.errors.length))
    fail(
      "IMPORT_ERRORS",
      "Resolve every named row error and preview the corrected file.",
    );
  if (batch.frontier !== frontier(c))
    fail(
      "STALE",
      "Stock, prices or order data changed. Preview this file again before approval.",
    );
  batch.orderIds = batch.groups.map((group: any) => {
    if (
      c.s.orders.some(
        (o) =>
          o.customerId === group.customerId &&
          o.customerPO === group.customerPO,
      )
    )
      fail("DUPLICATE", "Customer PO already imported.");
    const o = orders(c, "order.create", {
      ...group,
      channel: "customer-file",
    })!;
    const native = get(c.s, "orders", o.id);
    Object.assign(native, {
      customerPO: group.customerPO,
      shipTo: group.shipTo,
      salesImportId: batch.id,
    });
    native.lines.forEach(
      (line: any, i: number) =>
        (line.priceSnapshot = structuredClone(group.lines[i].priceSnapshot)),
    );
    return o.id;
  });
  batch.status = "applied";
  batch.approvedBy = c.actor.id;
  batch.approvedAt = c.now;
  batch.version++;
  return batch;
}
