import { Unzip, UnzipInflate } from "fflate";
import { XMLParser, XMLValidator } from "fast-xml-parser";
import { fail, Problem } from "./model";
const list = (value: any): any[] =>
  value === undefined ? [] : Array.isArray(value) ? value : [value];
const content = (value: any): string =>
  typeof value === "string"
    ? value
    : typeof value?.["#text"] === "string"
      ? value["#text"]
      : "";
const stringValue = (node: any) =>
  node?.t !== undefined
    ? content(node.t)
    : list(node?.r)
        .map((part) => content(part.t))
        .join("");
/** The only ZIP effect is bounded memory. No entry is written or fetched. */
export function spreadsheet(bytes: Uint8Array) {
  if (bytes.byteLength > 1024 * 1024)
    fail("IMPORT_SIZE", "Use a workbook up to 1 MiB.");
  const files = new Map<string, Uint8Array>();
  let entries = 0,
    total = 0;
  const unzip = new Unzip((file) => {
    if (
      ++entries > 200 ||
      file.name.includes("..") ||
      file.name.includes("\\") ||
      file.name.startsWith("/")
    )
      fail("SPREADSHEET", "Workbook ZIP paths or entry count are unsupported.");
    if (/vbaProject\.bin$/i.test(file.name))
      fail("SPREADSHEET", "Use a macro-free XLSX workbook.");
    if (file.name.endsWith("/")) return;
    if (
      ![
        "[Content_Types].xml",
        "xl/workbook.xml",
        "xl/_rels/workbook.xml.rels",
        "xl/sharedStrings.xml",
      ].includes(file.name) &&
      !/^xl\/worksheets\/[^/]+\.xml$/.test(file.name)
    )
      return;
    if (files.has(file.name))
      fail("SPREADSHEET", "The workbook repeats a required ZIP part.");
    if ((file.originalSize ?? 0) > 2 * 1024 * 1024)
      fail("IMPORT_SIZE", "A workbook XML part exceeds 2 MiB.");
    let size = 0;
    const chunks: Uint8Array[] = [];
    file.ondata = (error, chunk, final) => {
      if (error) fail("SPREADSHEET", "Workbook ZIP data is invalid.");
      size += chunk.length;
      total += chunk.length;
      if (size > 2 * 1024 * 1024 || total > 8 * 1024 * 1024) {
        file.terminate();
        fail(
          "IMPORT_SIZE",
          "Workbook expansion exceeds its bounded XML budget.",
        );
      }
      chunks.push(chunk);
      if (final) {
        const value = new Uint8Array(size);
        let offset = 0;
        for (const part of chunks) {
          value.set(part, offset);
          offset += part.length;
        }
        files.set(file.name, value);
      }
    };
    file.start();
  });
  unzip.register(UnzipInflate);
  try {
    for (let offset = 0; offset < bytes.length; offset += 1024)
      unzip.push(
        bytes.subarray(offset, offset + 1024),
        offset + 1024 >= bytes.length,
      );
  } catch (error) {
    if (error instanceof Problem) throw error;
    fail("SPREADSHEET", "Workbook ZIP data is invalid.");
  }
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    removeNSPrefix: true,
    parseTagValue: false,
    parseAttributeValue: false,
    trimValues: false,
  });
  const xml = (name: string) => {
    const bytes =
      files.get(name) ??
      fail("SPREADSHEET", `Required workbook part ${name} is missing.`);
    let source: string;
    try {
      source = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      fail("SPREADSHEET", "Workbook XML must use UTF-8.");
    }
    if (/<!DOCTYPE|<!ENTITY/i.test(source!))
      fail("SPREADSHEET", "Workbook entity declarations are not accepted.");
    if (XMLValidator.validate(source!) !== true)
      fail("SPREADSHEET", "Workbook XML is invalid.");
    try {
      return parser.parse(source!);
    } catch {
      fail("SPREADSHEET", "Workbook XML is invalid.");
    }
  };
  const types = xml("[Content_Types].xml");
  if (JSON.stringify(types).includes("macroEnabled"))
    fail("SPREADSHEET", "Use a macro-free XLSX workbook.");
  const sheets = list(xml("xl/workbook.xml")?.workbook?.sheets?.sheet);
  if (sheets.length !== 1)
    fail("SPREADSHEET", "Use one worksheet per customer-order workbook.");
  const relationship = list(
    xml("xl/_rels/workbook.xml.rels")?.Relationships?.Relationship,
  ).find((rel) => rel["@_Id"] === sheets[0]["@_id"]);
  if (
    !relationship ||
    relationship["@_TargetMode"] === "External" ||
    typeof relationship["@_Target"] !== "string" ||
    relationship["@_Target"].includes("..")
  )
    fail("SPREADSHEET", "The worksheet must be an internal workbook part.");
  const target = relationship["@_Target"].startsWith("/")
    ? relationship["@_Target"].slice(1)
    : "xl/" + relationship["@_Target"];
  if (!/^xl\/worksheets\/[^/]+\.xml$/.test(target))
    fail("SPREADSHEET", "The worksheet path is unsupported.");
  const shared = files.has("xl/sharedStrings.xml")
    ? list(xml("xl/sharedStrings.xml")?.sst?.si).map(stringValue)
    : [];
  if (shared.length > 20000)
    fail("IMPORT_ROWS", "Workbook shared-string count exceeds 20,000.");
  const rows = list(xml(target)?.worksheet?.sheetData?.row);
  if (rows.length > 1001)
    fail("IMPORT_ROWS", "Use one header row and at most 1,000 data rows.");
  const values: string[][] = [],
    sourceRows: number[] = [];
  let previous = 0;
  for (const row of rows) {
    const number = Number(row["@_r"]);
    if (!Number.isSafeInteger(number) || number <= previous || number > 1048576)
      fail(
        "SPREADSHEET",
        "Worksheet rows must have distinct increasing row numbers.",
      );
    previous = number;
    const cells = Array(12).fill("") as string[],
      seen = new Set<number>();
    for (const cell of list(row.c)) {
      const ref = /^([A-Z]+)([1-9]\d*)$/.exec(String(cell["@_r"] ?? ""));
      if (!ref || Number(ref[2]) !== number)
        fail(
          "SPREADSHEET",
          "Every worksheet cell needs its exact row/column reference.",
        );
      const index =
        [...ref![1]].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
      if (index >= 12 || seen.has(index))
        fail(
          "SPREADSHEET",
          "The order worksheet must contain exactly the twelve documented columns.",
        );
      seen.add(index);
      if (cell.f !== undefined)
        fail(
          "SPREADSHEET",
          `Formula cell ${cell["@_r"]} needs an explicit reviewed value.`,
        );
      const kind = cell["@_t"] ?? "n";
      let value = content(cell.v);
      if (kind === "s") {
        if (!/^\d+$/.test(value) || Number(value) >= shared.length)
          fail("SPREADSHEET", "A workbook shared-string reference is invalid.");
        value = shared[Number(value)];
      } else if (kind === "inlineStr") value = stringValue(cell.is);
      else if (!["n", "str", "d"].includes(kind))
        fail(
          "SPREADSHEET",
          `Cell ${cell["@_r"]} has an unsupported boolean or error value.`,
        );
      cells[index] = value;
    }
    if (cells.some(Boolean)) {
      values.push(cells);
      sourceRows.push(number);
    }
  }
  if (sourceRows[0] !== 1)
    fail("SPREADSHEET", "Put the exact order headers in worksheet row 1.");
  const quote = (v: string) =>
    /[",\r\n]/.test(v) ? '"' + v.replaceAll('"', '""') + '"' : v;
  return {
    csv: values.map((row) => row.map(quote).join(",")).join("\n"),
    sourceRows,
    sheetName: sheets[0]["@_name"] ?? "Worksheet",
  };
}
