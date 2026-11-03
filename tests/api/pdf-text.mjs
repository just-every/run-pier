import parsePDF from 'pdf-parse/lib/pdf-parse.js';
/** Read generated PDF bytes with an owned array: the legacy parser transfers
 * its input buffer, so a pooled Node Buffer can corrupt later document reads. */
export async function pdfText(bytes) {
  return (await parsePDF(Uint8Array.from(bytes))).text;
}
