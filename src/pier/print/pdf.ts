import { PDFDocument, PDFString, rgb, type PDFPage } from "pdf-lib";
import { businessFont, assertBusinessText, wrapText } from "./font";
import { pierLogoPaths } from "./assets/logo";
import type { BusinessPDFInput } from "./pdf-types";

export type { BusinessPDFInput } from "./pdf-types";

const PAPER = { width: 612, height: 792, margin: 40, bottom: 55 };
const INK = rgb(0.02, 0.06, 0.13);
const MUTED = rgb(0.30, 0.35, 0.42);
const RULE = rgb(0.84, 0.87, 0.90);
const BLUE = rgb(0.11, 0.31, 0.86);
type Line = BusinessPDFInput["lines"][number];
type Column = { label: string; key: keyof Line; width: number; right?: boolean };

/** Generate once; callers retain these exact bytes for immutable reprints. */
export async function businessPDF(input: BusinessPDFInput): Promise<string> {
  const document = await PDFDocument.create();
  const font = await businessFont(document);
  const { logoBase64, ...textInput } = input;
  assertBusinessText(font, textInput);
  document.setTitle(`${input.title} ${input.reference}`);
  document.setAuthor(input.company.name);
  document.setSubject(`Record version ${input.recordVersion}; template version ${input.templateVersion}`);
  document.setCreator("Pier");
  const width = PAPER.width - 2 * PAPER.margin;
  let page!: PDFPage;
  let y = 0;
  const newPage = () => {
    page = document.addPage([PAPER.width, PAPER.height]);
    y = PAPER.height - PAPER.margin;
  };
  const ensure = (height: number) => {
    if (y - height < PAPER.bottom) newPage();
  };
  const gap = (height = 9) => { y -= height; };
  const rule = (mayStartPage = true) => {
    if (!mayStartPage && y - 9 < PAPER.bottom) { y = PAPER.bottom; return; }
    ensure(9);
    page.drawLine({ start: { x: PAPER.margin, y }, end: { x: PAPER.width - PAPER.margin, y }, thickness: 0.6, color: RULE });
    y -= 9;
  };
  const text = (value: string, size = 10, available = width, color = INK, link?: string) => {
    for (const line of wrapText(font, value, size, available)) {
      const leading = size * 1.45;
      ensure(leading);
      const baseline = y - size;
      page.drawText(line, { x: PAPER.margin, y: baseline, font, size, color });
      if (link && line) {
        const annotation = document.context.obj({
          Type: "Annot", Subtype: "Link",
          Rect: [PAPER.margin, baseline - 2, PAPER.margin + font.widthOfTextAtSize(line, size), baseline + size + 2],
          Border: [0, 0, 0],
          A: { Type: "Action", S: "URI", URI: PDFString.of(link) },
        });
        page.node.addAnnot(document.context.register(annotation));
      }
      y -= leading;
    }
  };

  newPage();
  const hasLogo = Boolean(logoBase64 || input.logo);
  if (logoBase64) {
    const image = await document.embedPng(logoBase64);
    const dimensions = image.scaleToFit(52, 52);
    page!.drawImage(image, { x: PAPER.width - PAPER.margin - dimensions.width, y: y - dimensions.height, ...dimensions });
  } else if (input.logo) {
    for (const shape of pierLogoPaths) {
      const hex = shape.color.slice(1);
      page!.drawSvgPath(shape.path, {
        x: PAPER.width - PAPER.margin - 52, y, scale: 52 / 256,
        color: rgb(parseInt(hex.slice(0, 2), 16) / 255, parseInt(hex.slice(2, 4), 16) / 255, parseInt(hex.slice(4, 6), 16) / 255),
      });
    }
  }
  const logoTop = y;
  text(input.company.name, 17, hasLogo ? width - 68 : width);
  text(input.company.address, 9, hasLogo ? width - 68 : width, MUTED);
  if (hasLogo && document.getPageCount() === 1) y = Math.min(y, logoTop - 58);
  gap();
  text(input.title, 22);
  text(input.reference, 12);
  text(`Record version ${input.recordVersion}  ·  Template version ${input.templateVersion}`, 8, width, MUTED);
  gap();
  rule();
  if (input.recipient !== undefined) {
    text("Recipient", 8, width, MUTED);
    text(input.recipient);
    gap();
  }
  if (input.company.remitTo !== undefined) {
    text("Remit to", 8, width, MUTED);
    text(input.company.remitTo);
    gap();
  }
  for (const field of input.fields ?? []) {
    text(`${field.label}: ${field.value}`);
  }
  if (input.fields?.length) gap();

  const columns: Column[] = [
    { label: "Quantity", key: "quantity", width: 62, right: true },
    { label: "Unit", key: "unit", width: 58 },
    { label: "Unit price", key: "price", width: 82, right: true },
    { label: "Amount", key: "total", width: 88, right: true },
  ].filter((column) => input.lines.some((line) => line[column.key as keyof Line] !== undefined)) as Column[];
  columns.unshift({ label: "Description", key: "description", width: width - columns.reduce((sum, column) => sum + column.width, 0) });
  const tableHeader = () => {
    ensure(25);
    let x = PAPER.margin;
    page.drawRectangle({ x, y: y - 20, width, height: 20, color: rgb(0.95, 0.96, 0.98) });
    for (const column of columns) {
      const offset = column.right ? column.width - 6 - font.widthOfTextAtSize(column.label, 8) : 6;
      page.drawText(column.label, { x: x + offset, y: y - 13, size: 8, font, color: MUTED });
      x += column.width;
    }
    y -= 27;
  };
  if (input.lines.length) {
    ensure(55);
    tableHeader();
  }
  for (const line of input.lines) {
    const cells = columns.map((column) => wrapText(font, line[column.key] ?? "", 9, column.width - 12));
    const details: string[] = [];
    if (line.quantity !== undefined && line.unit !== undefined) details.push(`Commercial quantity: ${line.quantity} ${line.unit}`);
    if (line.itemCode !== undefined) details.push(`Item code: ${line.itemCode}`);
    if (line.baseQuantity !== undefined) details.push(`Base quantity: ${line.baseQuantity}`);
    if (line.lotSerial !== undefined) details.push(`Lot / serial: ${line.lotSerial}`);
    if (line.customFields !== undefined) details.push(`Custom fields: ${line.customFields}`);
    const detailLines = details.flatMap((detail) => wrapText(font, detail, 8, width - 12));
    const rows = Math.max(...cells.map((cell) => cell.length));
    const estimated = rows * 14 + detailLines.length * 12 + 10;
    // Keep ordinary rows together, while allowing arbitrarily long rows to flow.
    if (estimated < PAPER.height - PAPER.margin - PAPER.bottom - 27 && y - estimated < PAPER.bottom) {
      newPage();
      tableHeader();
    }
    for (let index = 0; index < rows; index++) {
      if (y - 14 < PAPER.bottom) { newPage(); tableHeader(); }
      let x = PAPER.margin;
      columns.forEach((column, cellIndex) => {
        const value = cells[cellIndex][index];
        if (value !== undefined) {
          const offset = column.right ? column.width - 6 - font.widthOfTextAtSize(value, 9) : 6;
          page.drawText(value, { x: x + offset, y: y - 9, size: 9, font, color: INK });
        }
        x += column.width;
      });
      y -= 14;
    }
    for (const detail of detailLines) {
      if (y - 12 < PAPER.bottom) { newPage(); tableHeader(); }
      page.drawText(detail, { x: PAPER.margin + 6, y: y - 8, size: 8, font, color: MUTED });
      y -= 12;
    }
    if (line.payNowUrl) text(`Pay this invoice: ${line.payNowUrl}`, 9, width, BLUE, line.payNowUrl);
    gap(5);
    rule(false);
  }
  for (const total of input.totals ?? []) text(`${total.label}: ${total.value}`, 11);
  if (input.totals?.length) gap();
  if (input.payNowUrl !== undefined) {
    const url = new URL(input.payNowUrl);
    if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("Pay-now links must use HTTP or HTTPS.");
    text("Pay now", 11, width, BLUE, input.payNowUrl);
    text(input.payNowUrl, 9, width, BLUE, input.payNowUrl);
    gap();
  }
  if (input.terms) {
    text("Terms", 9, width, MUTED);
    text(input.terms, 9);
    gap();
  }
  if (input.footer !== undefined) text(input.footer, 8, width, MUTED);

  const pages = document.getPages();
  pages.forEach((pdfPage, index) => {
    pdfPage.drawLine({ start: { x: PAPER.margin, y: 40 }, end: { x: PAPER.width - PAPER.margin, y: 40 }, thickness: 0.5, color: RULE });
    const label = `Page ${index + 1} of ${pages.length}`;
    pdfPage.drawText(label, { x: PAPER.width - PAPER.margin - font.widthOfTextAtSize(label, 8), y: 26, font, size: 8, color: MUTED });
  });
  return document.saveAsBase64({ useObjectStreams: false });
}
