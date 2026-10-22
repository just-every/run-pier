import { fail, text } from '../model';

export const MAX_DOCUMENT_BYTES = 1024 * 1024;
export const encode = (bytes: Uint8Array) => {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(binary);
};
export function decode(value: unknown) {
  if (typeof value !== 'string' || !value.length || value.length > Math.ceil(MAX_DOCUMENT_BYTES / 3) * 4 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value))
    return fail('DOCUMENT_SIZE', 'Supply a PDF, PNG or JPEG original of at most 1 MiB as canonical base64.');
  const bytes = Uint8Array.from(atob(value), c => c.charCodeAt(0));
  if (!bytes.length || bytes.length > MAX_DOCUMENT_BYTES || encode(bytes) !== value) fail('DOCUMENT_SIZE', 'Original must be between one byte and 1 MiB.');
  return bytes;
}
const unsafe = () => fail('DOCUMENT_UNSAFE', 'Use a conventional PDF without active content, encryption or embedded files, or a complete PNG/JPEG image.');
function dimensions(width: number, height: number) {
  if (!width || !height || width > 12000 || height > 12000 || width * height > 16000000) unsafe();
}
function png(bytes: Uint8Array) {
  if (bytes.length < 57 || encode(bytes.subarray(0, 8)) !== 'iVBORw0KGgo=') unsafe();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 8, first = true, pixels = false, end = false;
  while (offset + 12 <= bytes.length) {
    const length = view.getUint32(offset), type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
    if (length > bytes.length - offset - 12 || !/^[A-Za-z]{4}$/.test(type)) unsafe();
    let crc = 0xffffffff;
    for (const byte of bytes.subarray(offset + 4, offset + 8 + length)) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
    if (((crc ^ 0xffffffff) >>> 0) !== view.getUint32(offset + 8 + length)) unsafe();
    if (first) {
      if (type !== 'IHDR' || length !== 13) unsafe();
      dimensions(view.getUint32(offset + 8), view.getUint32(offset + 12));
      if (![0, 2, 3, 4, 6].includes(bytes[offset + 17]) || bytes[offset + 18] || bytes[offset + 19] || bytes[offset + 20] > 1) unsafe();
      first = false;
    } else if (type === 'IHDR' || type === 'acTL') unsafe();
    if (type === 'IDAT') pixels = true;
    offset += length + 12;
    if (type === 'IEND') { if (length || !pixels || offset !== bytes.length) unsafe(); end = true; break; }
  }
  if (!end) unsafe();
  return 1;
}
function jpeg(bytes: Uint8Array) {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes.at(-2) !== 0xff || bytes.at(-1) !== 0xd9) unsafe();
  let offset = 2, frame = false, scans = 0, ended = false;
  while (offset < bytes.length) {
    if (bytes[offset++] !== 0xff) unsafe();
    while (bytes[offset] === 0xff) offset++;
    const marker = bytes[offset++];
    if (marker === 0xd9) { ended = offset === bytes.length; break; }
    if (!marker || marker === 0xd8 || marker >= 0xd0 && marker <= 0xd7 || offset + 2 > bytes.length) unsafe();
    const length = bytes[offset] * 256 + bytes[offset + 1];
    if (length < 2 || offset + length > bytes.length) unsafe();
    if ([0xc0, 0xc1, 0xc2].includes(marker)) {
      if (length < 8 || frame) unsafe();
      dimensions(bytes[offset + 5] * 256 + bytes[offset + 6], bytes[offset + 3] * 256 + bytes[offset + 4]); frame = true;
    } else if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) unsafe();
    offset += length;
    if (marker === 0xda) {
      if (!frame || ++scans > 100) unsafe();
      while (offset < bytes.length) {
        if (bytes[offset++] !== 0xff) continue;
        while (bytes[offset] === 0xff) offset++;
        if (bytes[offset] === 0 || bytes[offset] >= 0xd0 && bytes[offset] <= 0xd7) { offset++; continue; }
        offset--; break;
      }
    }
  }
  if (!ended || !frame || !scans) unsafe();
  return 1;
}
function pdf(bytes: Uint8Array) {
  const raw = new TextDecoder('latin1').decode(bytes);
  if (!/^%PDF-1\.[0-7][\r\n]/.test(raw) || !/%%EOF\s*$/.test(raw)) unsafe();
  // PDF names may escape characters with #xx; inspect the decoded names too.
  const names = raw.replace(/#([a-f\d]{2})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
  if (/\/(?:JavaScript|JS|Launch|OpenAction|AA|EmbeddedFile|Filespec|RichMedia|XFA|Encrypt|ObjStm|GoToR|SubmitForm|ImportData)\b/.test(names)) unsafe();
  const count = [...names.matchAll(/\/Type\s*\/Page\b/g)].length;
  if (!/\/Type\s*\/Catalog\b/.test(names) || !/\/Type\s*\/Pages\b/.test(names) || count < 1 || count > 40) unsafe();
  return count;
}
/** Bounded format gate, never an instruction interpreter or remote URL fetcher. */
export async function validateOriginal(p: any) {
  const name = text(p.name, 'File name');
  if (name.length > 180 || /[\\/\x00-\x1f\x7f]/.test(name) || name === '.' || name === '..') fail('DOCUMENT_NAME', 'Use a plain file name without paths or control characters.');
  const bytes = decode(p.base64), mimeType = p.mimeType;
  const types: Record<string, { extension: RegExp; check: (bytes: Uint8Array) => number }> = {
    'application/pdf': { extension: /\.pdf$/i, check: pdf },
    'image/png': { extension: /\.png$/i, check: png },
    'image/jpeg': { extension: /\.jpe?g$/i, check: jpeg },
  };
  if (!Object.hasOwn(types, mimeType) || !types[mimeType].extension.test(name)) fail('DOCUMENT_TYPE', 'File extension, MIME type and signature must agree: PDF, PNG or JPEG.');
  const pageCount = types[mimeType].check(bytes);
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return { name, mimeType, size: bytes.length, sha256: [...hash].map(v => v.toString(16).padStart(2, '0')).join(''), pageCount, original: p.base64 as string };
}
