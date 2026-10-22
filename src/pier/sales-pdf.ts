import { fail, get, type State, type Row } from "./model";
export function salesPDF(s: State, o: Row, kind: string): string {
  const lines = [
    kind === "quote" ? "QUOTE" : "ORDER CONFIRMATION",
    o.reference,
    get(s, "parties", o.customerId).name,
    `Record version ${o.version} | USD | Valid through ${o.validUntil ?? "not applicable"}`,
    ...o.lines.flatMap((l: any) => {
      const i = get(s, "items", l.itemId);
      return [
        `${i.sku} | ${l.commercialQuantity ?? l.quantity} ${l.commercialUnit ?? i.unit} | ${l.quantity} ${i.unit}`,
        `Unit USD ${l.price ?? "unpriced"} | line USD ${l.lineTotal ?? "unpriced"}`,
        ...(i.references ?? [])
          .filter((r: any) => r.partyId === o.customerId)
          .map((r: any) => `Customer item: ${r.code}`),
      ];
    }),
    `Discount ${o.discountPercent ?? "0"}% | subtotal ${o.subtotal ?? o.total ?? "unpriced"}`,
    `Tax ${o.tax?.amount ?? "pending"} | ${o.tax?.source ?? "Not calculated"}`,
    ...(o.tax?.certificate
      ? [
          `Exemption ${o.tax.certificate.number} (${o.tax.certificate.state}), valid through ${o.tax.certificate.expires}`,
        ]
      : []),
    `TOTAL USD ${o.total ?? "unpriced"}`,
  ];
  if (lines.some((l) => /[^\x20-\x7e]/.test(l)))
    fail(
      "DOCUMENT_TEXT",
      "PDF currently supports printable ASCII text. Review unsupported document characters; no document was generated.",
    );
  const escape = (s: string) => s.replace(/[\\()]/g, "\\$&");
  const pages = Array.from({ length: Math.ceil(lines.length / 45) }, (_, i) =>
    lines.slice(i * 45, (i + 1) * 45),
  );
  const objects = [
    "",
    "<< /Type /Catalog /Pages 2 0 R >>",
    "",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  const kids = [];
  for (const page of pages) {
    const n = objects.length;
    kids.push(`${n} 0 R`);
    const stream = `BT /F1 11 Tf 14 TL 35 800 Td ${page.map((l, i) => `${i ? "T* " : ""}(${escape(l)}) Tj`).join("\n")} ET`;
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${n + 1} 0 R >>`,
      `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    );
  }
  objects[2] = `<< /Type /Pages /Kids [${kids.join(" ")}] /Count ${pages.length} >>`;
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (let i = 1; i < objects.length; i++) {
    offsets.push(pdf.length);
    pdf += `${i} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const xref = pdf.length;
  pdf +=
    `xref\n0 ${objects.length}\n0000000000 65535 f \n` +
    offsets
      .slice(1)
      .map((n) => `${String(n).padStart(10, "0")} 00000 n \n`)
      .join("") +
    `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return btoa(pdf);
}
