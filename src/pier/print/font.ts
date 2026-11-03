import fontkit from "@pdf-lib/fontkit";
import { type PDFDocument, type PDFFont } from "pdf-lib";
import { notoSansBytes } from "./assets/noto-sans";

export async function businessFont(document: PDFDocument): Promise<PDFFont> {
  document.registerFontkit(fontkit);
  return document.embedFont(notoSansBytes, { subset: true });
}

/** Missing font glyphs must fail generation rather than corrupt business text. */
export function assertBusinessText(font: PDFFont, values: unknown): void {
  const supported = new Set(font.getCharacterSet());
  function check(value: unknown): void {
    if (typeof value === "string") {
      for (const character of value) {
        if (character === "\n" || character === "\r" || character === "\t") continue;
        const code = character.codePointAt(0)!;
        if (!supported.has(code) || code < 32 || (code >= 127 && code <= 159)) {
          throw Object.assign(
            new Error(`Document font does not support U+${code.toString(16).toUpperCase().padStart(4, "0")}. Review the document text before generating a PDF.`),
            { code: "DOCUMENT_TEXT" },
          );
        }
      }
    } else if (Array.isArray(value)) {
      value.forEach(check);
    } else if (value && typeof value === "object") {
      Object.values(value).forEach(check);
    }
  }
  check(values);
}

/** Wrap by measured glyph width, including long unbroken codes and URLs. */
export function wrapText(font: PDFFont, text: string, size: number, width: number): string[] {
  const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
  return text.replace(/\r\n?/g, "\n").replace(/\t/g, "    ").split("\n").flatMap((paragraph) => {
    const output: string[] = [];
    let line = "";
    for (const { segment } of segmenter.segment(paragraph)) {
      if (line && font.widthOfTextAtSize(line + segment, size) > width) {
        const breakAt = line.search(/\s+\S*$/u);
        if (breakAt > 0) {
          output.push(line.slice(0, breakAt));
          line = line.slice(breakAt).trimStart();
        } else {
          output.push(line.trimEnd());
          line = "";
        }
      }
      // A word moved from the preceding line may itself fill this line.
      if (line && font.widthOfTextAtSize(line + segment, size) > width) {
        output.push(line.trimEnd());
        line = "";
      }
      line += segment;
    }
    output.push(line.trimEnd());
    return output;
  });
}
