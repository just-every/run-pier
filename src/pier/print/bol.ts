import { PDFDocument, rgb, type PDFPage } from "pdf-lib";
import { assertBusinessText, businessFont, wrapText } from "./font";
import { pierLogoPaths } from "./assets/logo";
import type { BusinessPDFInput } from "./pdf-types";

// Form geography and field meanings: GS1 US Bill of Lading Guideline R4.0,
// sections 2.1, 4, 8 and 9. Legal text is exclusively the owner's template.
// https://documents.gs1us.org/adobe/assets/deliver/urn:aaid:aem:86fea182-579d-49bd-8897-72a5613bc1d8/Guideline-Bill-of-Lading-BOL.pdf
const LEFT = 30, WIDTH = 552, BOTTOM = 45;
const INK = rgb(0.02, 0.06, 0.13), GRAY = rgb(0.93, 0.94, 0.95);
const CARRIER_WIDTHS = [28, 38, 28, 38, 46, 22, 242, 62, 48];
const CARRIER_LABELS = ["QTY", "TYPE", "QTY", "TYPE", "WEIGHT", "H.M.", "COMMODITY DESCRIPTION", "NMFC #", "CLASS"];
type Overflow = { title: string; value: string };

/** A VICS portrait form, with supplements rather than clipped business data. */
export async function billOfLadingPDF(input: BusinessPDFInput): Promise<string> {
  const document = await PDFDocument.create(), font = await businessFont(document);
  const { logoBase64, ...textInput } = input;
  assertBusinessText(font, textInput);
  const used = new Set<string>(), extra: Overflow[] = [];
  const field = (label: string): string => {
    used.add(label);
    return (input.fields ?? []).filter((entry) => entry.label === label).map((entry) => entry.value).join("\n");
  };
  const required = ["Carrier", "Carrier SCAC", "PRO number", "Pickup date", "Pallet count", "Weight lb", "NMFC freight class", "Ship from", "Ship to", "Freight charge terms", "Package count", "Package type", "Handling unit type", "Pallet/slip", "Customer order weight lb", "Commodity description", "NMFC number"];
  const missing = required.filter((label) => !field(label).trim());
  if (missing.length) throw Object.assign(new Error(`Complete bill-of-lading fields: ${missing.join(", ")}.`), { code: "DOCUMENT_FIELDS" });
  const date = field("Pickup date"), number = field("Bill of lading number") || input.reference;
  const packages = field("Package count"), gross = field("Weight lb"), net = field("Customer order weight lb");
  const handling = field("Pallet count"), handlingType = field("Handling unit type");
  const orders = field("Customer order number") || field("Order");
  const carrier = field("Carrier"), scac = field("Carrier SCAC"), pro = field("PRO number");
  const terms = field("Freight charge terms"), billTo = field("Bill-to");
  if (/third|3rd/i.test(terms) && !billTo.trim()) throw Object.assign(new Error("Complete bill-of-lading field: Bill-to."), { code: "DOCUMENT_FIELDS" });
  document.setTitle(`${input.title} ${number}`);
  document.setAuthor(input.company.name);
  document.setSubject(`Record version ${input.recordVersion}; template version ${input.templateVersion}`);
  document.setCreator("Pier");
  let page = document.addPage([612, 792]);
  const draw = (value: string, x: number, top: number, size = 8, bold = false) => {
    page.drawText(value, { x, y: top - size, size, font, color: INK });
    if (bold) page.drawText(value, { x: x + 0.18, y: top - size, size, font, color: INK });
  };
  const box = (x: number, top: number, width: number, height: number, shade = false) => {
    page.drawRectangle({ x, y: top - height, width, height, borderWidth: 0.55, borderColor: INK, ...(shade ? { color: GRAY } : {}) });
  };
  const cell = (x: number, top: number, width: number, height: number, title: string, value: string, size = 8, bold = false) => {
    box(x, top, width, height);
    draw(title, x + 5, top - 3, 6.5);
    const lines = wrapText(font, value, size, width - 10), leading = size * 1.3;
    const capacity = Math.max(1, Math.floor((height - 18) / leading));
    const over = lines.length > capacity;
    lines.slice(0, over ? Math.max(0, capacity - 1) : capacity).forEach((line, index) => draw(line, x + 5, top - 15 - index * leading, size, bold));
    if (over) {
      draw("See supplement", x + 5, top - 15 - Math.max(0, capacity - 1) * leading, 7);
      extra.push({ title, value });
    }
  };
  const band = (title: string, top: number) => { box(LEFT, top, WIDTH, 17, true); draw(title, LEFT + 5, top - 3, 8, true); };
  const row = (top: number, widths: number[], values: string[], height: number, size = 8) => {
    let x = LEFT;
    widths.forEach((width, index) => {
      box(x, top, width, height);
      const value = values[index] ?? "", lines = wrapText(font, value, size, width - 8);
      const capacity = Math.max(1, Math.floor((height - 4 - size) / (size * 1.3)) + 1);
      lines.slice(0, capacity).forEach((line, lineIndex) => draw(line, x + 4, top - 4 - lineIndex * size * 1.3, size));
      if (lines.length > capacity) extra.push({ title: widths === CARRIER_WIDTHS ? CARRIER_LABELS[index] : "Customer order information", value });
      x += width;
    });
  };
  const headerRow = (top: number, widths: number[], labels: string[], height = 24) => row(top, widths, labels, height, 6.5);
  const carrierHeader = (top: number) => {
    band("CARRIER INFORMATION", top);
    box(LEFT, top - 17, 66, 14); draw("HANDLING UNIT", LEFT + 3, top - 20, 6.5);
    box(LEFT + 66, top - 17, 66, 14); draw("PACKAGE", LEFT + 69, top - 20, 6.5);
    box(LEFT + 132, top - 17, 310, 14);
    box(LEFT + 442, top - 17, 110, 14); draw("LTL ONLY", LEFT + 445, top - 20, 6.5);
    headerRow(top - 31, CARRIER_WIDTHS, CARRIER_LABELS, 23);
    return top - 54;
  };
  const supplement = (title: string) => {
    page = document.addPage([612, 792]);
    draw("SUPPLEMENT TO THE BILL OF LADING", LEFT, 762, 12, true);
    // Long identifiers remain complete in the particulars supplement below.
    const identifiers = `Date: ${date}   Bill of lading number: ${number}`;
    const lines = wrapText(font, identifiers, 9, WIDTH);
    lines.slice(0, 2).forEach((line, index) => draw(line, LEFT, 740 - index * 12, 9));
    if (lines.length > 2 && !extra.some((entry) => entry.title === "Bill of lading identification")) extra.push({ title: "Bill of lading identification", value: identifiers });
    band(title, 704);
    return 680;
  };

  draw("BILL OF LADING", LEFT + 200, 773, 15, true);
  const titleLines = wrapText(font, input.title, 8, 280);
  draw(titleLines[0] ?? "", LEFT + 200, 752, 8);
  if (titleLines.length > 1) extra.push({ title: "Document title", value: input.title });
  const issuer = wrapText(font, input.company.name, 9, 185);
  issuer.slice(0, 2).forEach((line, index) => draw(line, LEFT, 774 - index * 12, 9));
  extra.push({ title: "Document issuer", value: `${input.company.name}\n${input.company.address}` });
  if (input.company.remitTo) extra.push({ title: "Remit to", value: input.company.remitTo });
  if (input.recipient) extra.push({ title: "Recipient", value: input.recipient });
  if (logoBase64) {
    const logo = await document.embedPng(logoBase64), dimensions = logo.scaleToFit(32, 32);
    page.drawImage(logo, { x: 550, y: 750, ...dimensions });
  } else if (input.logo) {
    for (const shape of pierLogoPaths) {
      const hex = shape.color.slice(1);
      page.drawSvgPath(shape.path, { x: 550, y: 782, scale: 32 / 256, color: rgb(parseInt(hex.slice(0, 2), 16) / 255, parseInt(hex.slice(2, 4), 16) / 255, parseInt(hex.slice(4, 6), 16) / 255) });
    }
  }
  cell(LEFT, 735, 276, 28, "DATE", date);
  cell(LEFT + 276, 735, 276, 28, "BILL OF LADING NUMBER", number, 12, true);
  cell(LEFT, 707, 276, 67, "SHIP FROM", field("Ship from"));
  cell(LEFT, 640, 276, 75, "SHIP TO", field("Ship to"));
  cell(LEFT, 565, 276, 58, "THIRD-PARTY FREIGHT CHARGES BILL TO", billTo);
  const special = [field("Special instructions"), field("Accessorials") && `Accessorials: ${field("Accessorials")}`, field("Destination") && `Destination: ${field("Destination")}`].filter(Boolean).join("\n");
  cell(LEFT, 507, 276, 67, "SPECIAL INSTRUCTIONS", special);
  cell(LEFT + 276, 707, 276, 35, "BARCODE SPACE", "");
  cell(LEFT + 276, 672, 276, 32, "CARRIER NAME", carrier);
  cell(LEFT + 276, 640, 138, 32, "TRAILER NUMBER", field("Trailer number"));
  cell(LEFT + 414, 640, 138, 32, "SEAL NUMBER(S)", field("Seal numbers"));
  cell(LEFT + 276, 608, 98, 42, "SCAC", scac, 12, true);
  cell(LEFT + 374, 608, 178, 42, "PRO NUMBER", pro, 12, true);
  cell(LEFT + 276, 566, 276, 42, "FREIGHT CHARGE TERMS", terms);
  cell(LEFT + 276, 524, 276, 42, "MASTER BILL OF LADING / UNDERLYING BOLS", field("Master bill"));
  cell(LEFT + 276, 482, 276, 42, "SHIPMENT / LOCATION IDENTIFIERS", [
    `Shipment reference: ${input.reference}`,
    ...["SID", "CID", "Ship-to location", "FOB"].map((label) => { const value = field(label); return value ? `${label}: ${value}` : ""; }).filter(Boolean),
  ].join("\n"));

  band("CUSTOMER ORDER INFORMATION", 440);
  const orderWidths = [190, 52, 70, 65, 175];
  headerRow(423, orderWidths, ["CUSTOMER ORDER NUMBER", "# PKGS", "WEIGHT", "PALLET / SLIP", "ADDITIONAL SHIPPER INFO"], 23);
  const orderValues = [orders, packages, `${net} lb`, field("Pallet/slip"), field("Additional shipper info")];
  let x = LEFT;
  orderWidths.forEach((width, index) => { cell(x, 400, width, 38, "", orderValues[index], index === 0 ? 12 : 8, index === 0); x += width; });
  // Totals repeat owner-entered shipment totals, never infer pack counts from SKU quantities.
  row(362, orderWidths, ["GRAND TOTAL", packages, `${net} lb`, "", ""], 20);
  const carrierTop = carrierHeader(342);
  const commodity = [field("Commodity description"), ...input.lines.map((line) => [
    line.description,
    line.itemCode !== undefined ? `Item code: ${line.itemCode}` : "",
    line.quantity !== undefined ? `Commercial quantity: ${line.quantity}${line.unit !== undefined ? ` ${line.unit}` : ""}` : line.unit !== undefined ? `Unit: ${line.unit}` : "",
    line.baseQuantity !== undefined ? `Base quantity: ${line.baseQuantity}` : "",
    line.lotSerial !== undefined ? `Lot / serial: ${line.lotSerial}` : "",
    line.customFields !== undefined ? `Custom fields: ${line.customFields}` : "",
    line.price !== undefined ? `Unit price: ${line.price}` : "",
    line.total !== undefined ? `Amount: ${line.total}` : "",
    line.payNowUrl !== undefined ? `Payment link: ${line.payNowUrl}` : "",
  ].filter(Boolean).join("\n"))].join("\n\n");
  const carrierValues = [handling, handlingType, packages, field("Package type"), `${gross} lb`, field("Hazardous material"), commodity, field("NMFC number"), field("NMFC freight class")];
  const carrierCells = carrierValues.map((value, index) => wrapText(font, value, 8, CARRIER_WIDTHS[index] - 8));
  const initialLines = 3, lineHeight = 10.4;
  const continuedCommodity = carrierCells[6].length > initialLines;
  row(carrierTop, CARRIER_WIDTHS, carrierCells.map((lines, index) => index === 6 && continuedCommodity ? [...lines.slice(0, 2), "See supplement"].join("\n") : lines.slice(0, initialLines).join("\n")), 42);
  row(carrierTop - 42, CARRIER_WIDTHS, [handling, handlingType, packages, field("Package type"), `${gross} lb`, "", "GRAND TOTAL", "", ""], 20);
  const remaining = carrierCells.map((lines, index) => lines.slice(index === 6 && continuedCommodity ? 2 : initialLines));
  cell(LEFT, 226, 330, 30, "DECLARED VALUE / BASIS", field("Declared value"));
  cell(LEFT + 330, 226, 222, 30, "COD AMOUNT / FEE TERMS", [field("COD amount"), field("COD fee terms")].filter(Boolean).join(" / "));
  cell(LEFT, 196, WIDTH, 51, "TERMS", input.terms, 7);
  cell(LEFT, 145, 190, 70, "SHIPPER SIGNATURE / DATE", "");
  cell(LEFT + 190, 145, 172, 35, "TRAILER LOADED", "[ ] By shipper   [ ] By driver", 7);
  cell(LEFT + 190, 110, 172, 35, "FREIGHT COUNTED", "[ ] By shipper   [ ] Driver: pallets\n[ ] Driver: pieces", 7);
  cell(LEFT + 362, 145, 190, 70, "CARRIER SIGNATURE / PICKUP DATE", "");
  page.drawLine({ start: { x: LEFT + 8, y: 88 }, end: { x: LEFT + 182, y: 88 }, thickness: 0.5, color: INK });
  page.drawLine({ start: { x: LEFT + 370, y: 88 }, end: { x: LEFT + 544, y: 88 }, thickness: 0.5, color: INK });
  cell(LEFT, 75, WIDTH, 25, "RECEIVING STAMP / EXCEPTIONS", "");

  let detailY = 0;
  while (remaining.some((lines) => lines.length)) {
    supplement("CARRIER INFORMATION — CONTINUED");
    const top = carrierHeader(680), capacity = Math.floor((top - BOTTOM - 8) / lineHeight);
    const count = Math.min(capacity, Math.max(...remaining.map((lines) => lines.length)));
    const values = remaining.map((lines) => lines.splice(0, count).join("\n"));
    row(top, CARRIER_WIDTHS, values, count * lineHeight + 8);
    detailY = top - count * lineHeight - 20;
  }
  for (const total of input.totals ?? []) extra.push({ title: total.label, value: total.value });
  for (const entry of input.fields ?? []) if (!used.has(entry.label)) extra.push({ title: entry.label, value: entry.value });
  if (input.payNowUrl !== undefined) extra.push({ title: "Payment link", value: input.payNowUrl });
  if (input.footer !== undefined && input.footer !== "") extra.push({ title: "Document footer", value: input.footer });
  // Full particulars are carried alongside the fixed form, including long addresses/terms.
  let y = 0;
  if (detailY > BOTTOM + 80 && extra.length) {
    band("ADDITIONAL SHIPPER INFORMATION", detailY);
    y = detailY - 24;
  }
  for (let index = 0; index < extra.length; index++) {
    const entry = extra[index];
    const lines = wrapText(font, `${entry.title}\n${entry.value}`, 9, WIDTH - 12);
    while (lines.length) {
      if (y - 24 < BOTTOM) y = supplement("ADDITIONAL SHIPPER INFORMATION");
      const capacity = Math.floor((y - BOTTOM - 8) / 12), count = Math.min(capacity, lines.length);
      row(y, [WIDTH], [lines.splice(0, count).join("\n")], count * 12 + 8, 9);
      y -= count * 12 + 8;
    }
  }
  document.getPages().forEach((sheet: PDFPage, index, pages) => {
    const footer = `Record v${input.recordVersion} / Template v${input.templateVersion}     Page ${index + 1} of ${pages.length}`;
    sheet.drawText(footer, { x: LEFT, y: 27, font, size: 7, color: INK });
  });
  return document.saveAsBase64({ useObjectStreams: false });
}
