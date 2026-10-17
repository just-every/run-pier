/** Pure GS1 SSCC/GS1-128 codec. Allocation and prefix ownership belong to the domain. */
export function validateGs1Prefix(prefix: string): boolean {
  return typeof prefix === 'string' && /^\d{4,12}$/.test(prefix);
}

export function gs1CheckDigit(body: string): string {
  if (!/^\d+$/.test(body)) throw new Error('SSCC: check digit input must be numeric');
  let sum = 0;
  for (let i = body.length - 1, weight = 3; i >= 0; i--, weight = 4 - weight) sum += Number(body[i]) * weight;
  return String((10 - sum % 10) % 10);
}

export function validateSscc(sscc: string): boolean {
  return typeof sscc === 'string' && /^\d{18}$/.test(sscc) && gs1CheckDigit(sscc.slice(0, 17)) === sscc[17];
}

export function issueSscc(prefix: string, sequence: string | number | bigint, extensionDigit = '0'): string {
  if (!validateGs1Prefix(prefix)) throw new Error('SSCC: GS1 Company Prefix must be 4–12 digits; ownership must be verified separately');
  if (!/^\d$/.test(extensionDigit)) throw new Error('SSCC: extension digit must be one digit');
  if (typeof sequence === 'number' && (!Number.isSafeInteger(sequence) || sequence < 0)) throw new Error('SSCC: sequence must be an exact nonnegative integer');
  const serial = String(sequence);
  const capacity = 16 - prefix.length;
  if (!/^\d+$/.test(serial) || serial.length > capacity) throw new Error('SSCC: serial sequence exhausted or invalid');
  const body = extensionDigit + prefix + serial.padStart(capacity, '0');
  return body + gs1CheckDigit(body);
}

// ISO/IEC 15417 symbol widths, indexed by Code 128 symbol value. Stop is seven runs.
const WIDTHS = [
  '212222','222122','222221','121223','121322','131222','122213','122312','132212','221213',
  '221312','231212','112232','122132','122231','113222','123122','123221','223211','221132',
  '221231','213212','223112','312131','311222','321122','321221','312212','322112','322211',
  '212123','212321','232121','111323','131123','131321','112313','132113','132311','211313',
  '231113','231311','112133','112331','132131','113123','113321','133121','313121','211331',
  '231131','213113','213311','213131','311123','311321','331121','312113','312311','332111',
  '314111','221411','431111','111224','111422','121124','121421','141122','141221','112214',
  '112412','122114','122411','142112','142211','241211','221114','413111','241112','134111',
  '111242','121142','121241','114212','124112','124211','411212','421112','421211','212141',
  '214121','412121','111143','111341','131141','114113','114311','411113','411311','113141',
  '114131','311141','411131','211412','211214','211232','2331112',
] as const;

/** Start C, FNC1, AI 00, 18 SSCC digits, weighted Mod-103 symbol check, stop. */
export function gs1128Symbols(sscc: string): number[] {
  if (!validateSscc(sscc)) throw new Error('SSCC: invalid 18-digit value or check digit');
  const digits = '00' + sscc;
  const symbols = [105, 102];
  for (let i = 0; i < digits.length; i += 2) symbols.push(Number(digits.slice(i, i + 2)));
  const check = symbols.reduce((sum, symbol, i) => sum + symbol * (i || 1), 0) % 103;
  return [...symbols, check, 106];
}

export function gs1128Svg(sscc: string): string {
  const symbols = gs1128Symbols(sscc);
  // 0.508 mm module, 31.75 mm bar height, and 10-module quiet zones.
  let x = 10;
  const bars: string[] = [];
  for (const symbol of symbols) {
    [...WIDTHS[symbol]].forEach((run, i) => {
      const width = Number(run);
      if (i % 2 === 0) bars.push(`<rect x="${x}" y="6" width="${width}" height="62.5"/>`);
      x += width;
    });
  }
  const width = x + 10;
  return `<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label="SSCC ${sscc}" width="${width * 0.508}mm" height="40.64mm" viewBox="0 0 ${width} 80"><rect width="${width}" height="80" fill="white"/><g fill="black" shape-rendering="crispEdges">${bars.join('')}</g><text x="${width / 2}" y="77" text-anchor="middle" font-family="monospace" font-size="6">(00) ${sscc}</text></svg>`;
}

/** 203 dpi, 4x6 inch Zebra label. Caller persists SSCC; reprint never allocates. */
export function gs1128Zpl(sscc: string): string {
  if (!validateSscc(sscc)) throw new Error('SSCC: invalid 18-digit value or check digit');
  // Mode N avoids firmware re-calculating the supplied GS1 Mod-10 digit.
  return `^XA\n^PW812\n^LL1218\n^FO60,60^A0N,36,36^FDSSCC^FS\n^FO60,120^BY4^BCN,254,N,N,N,N^FD>;>800${sscc}^FS\n^FO60,400^A0N,32,32^FD(00) ${sscc}^FS\n^XZ`;
}
