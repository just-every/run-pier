import parsePDF from 'pdf-parse/lib/pdf-parse.js';
/** Read the actual generated PDF text, including its embedded Unicode mapping. */
export async function pdfText(bytes) {
  return (await parsePDF(Buffer.from(bytes))).text;
}
