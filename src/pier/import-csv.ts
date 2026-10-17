import { fail } from "./model";
export function parseCSV(input: string) {
  const rows: string[][] = [];
  let row: string[] = [],
    cell = "",
    quoted = false,
    closed = false;
  // A leading UTF-8 BOM is encoding metadata; sourceFor retains its bytes.
  for (let n = input.startsWith("\uFEFF") ? 1 : 0; n < input.length; n++) {
    const ch = input[n];
    if (ch === '"') {
      if (quoted && input[n + 1] === '"') {
        cell += '"';
        n++;
      } else if (!quoted && (cell !== "" || closed))
        fail("CSV", "Unexpected quote in unquoted field.");
      else {
        closed = quoted;
        quoted = !quoted;
      }
    } else if (closed && ch !== "," && ch !== "\n" && ch !== "\r") {
      fail(
        "CSV",
        "Only a separator or line ending may follow a closing quote.",
      );
    } else if (ch === "," && !quoted) {
      row.push(cell);
      cell = "";
      closed = false;
    } else if ((ch === "\n" || ch === "\r") && !quoted) {
      if (ch === "\r" && input[n + 1] === "\n") n++;
      row.push(cell);
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = "";
      closed = false;
    } else cell += ch;
  }
  if (quoted) fail("CSV", "Unclosed quoted CSV field.");
  row.push(cell);
  if (row.some(Boolean)) rows.push(row);
  return rows;
}
