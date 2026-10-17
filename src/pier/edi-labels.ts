import { fail, get, type State } from './model';
import { gs1128Svg, gs1128Zpl } from './edi/sscc';
const escape = (v: string) => v.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export function ediFile(s: State, path: string): Response | null {
  const headers = { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' };
  const documentMatch = path.match(/^\/api\/pier\/edi\/documents\/([-\w]+)$/);
  if (documentMatch) {
    const doc = get(s, 'ediDocuments', documentMatch[1]);
    return new Response(doc.x12, { headers: { ...headers, 'content-type': 'application/edi-x12', 'content-disposition': `attachment; filename="pier-${doc.kind}-${doc.id}.edi"` } });
  }
  const match = path.match(/^\/api\/pier\/edi\/labels\/([-\w]+)\/(\d{18})(\.svg|\.zpl)?$/);
  if (!match) return null;
  const doc = get(s, 'ediDocuments', match[1]);
  const carton = doc.cartons?.find((c: any) => c.sscc === match[2]);
  if (doc.kind !== '856' || !carton) fail('EDI_LABEL', 'Choose a carton from this ASN.');
  const svg = gs1128Svg(carton.sscc);
  if (match[3] === '.svg') return new Response(svg, { headers: { ...headers, 'content-type': 'image/svg+xml', 'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox" } });
  if (match[3] === '.zpl') return new Response(gs1128Zpl(carton.sscc), { headers: { ...headers, 'content-type': 'text/plain', 'content-disposition': `attachment; filename="sscc-${carton.sscc}.zpl"` } });
  const nonce = crypto.randomUUID();
  const order = s.ediOrders.find(o => o.id === doc.ediOrderId), partner = s.ediPartners.find(p => p.id === doc.partnerId);
  return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Carton ${escape(carton.sscc)}</title><style nonce="${nonce}">@page{size:4in 6in;margin:0}*{box-sizing:border-box}body{font:16px Arial;margin:0}.label{width:4in;min-height:6in;padding:.25in;border:1px solid #bbb}h1{font-size:22px}svg{width:100%;height:auto}li{margin:8px 0}.toolbar{padding:16px;background:#eee}@media print{.toolbar{display:none}.label{border:0}}</style></head><body><div class="toolbar"><button id="print">Print 4 × 6 label</button><p>Use 100% scale. Printing does not mark goods shipped. Record print or reprint reason in Pier.</p><a href="/app#edi">Return to EDI</a></div><main class="label"><h1>${escape(partner?.name || 'Retailer')}</h1><p>PO ${escape(order?.poNumber || '')}</p><p>${escape(order?.shipTo?.name || '')} ${escape(order?.shipTo?.code || '')}</p><h2>Carton ${escape(String(carton.number))}</h2><ul>${carton.lines.map((l: any) => `<li>${escape(s.items.find(i => i.id === l.itemId)?.sku || l.lineNumber || '')} · ${escape(l.quantity)} ${escape(s.items.find(i => i.id === l.itemId)?.unit || l.unit || '')}</li>`).join('')}</ul>${svg}<p>SSCC (00) ${escape(carton.sscc)}</p></main><script nonce="${nonce}">document.getElementById('print').addEventListener('click',()=>window.print())</script></body></html>`, { headers: { ...headers, 'content-type': 'text/html; charset=utf-8', 'content-security-policy': `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; base-uri 'none'; frame-ancestors 'none'` } });
}
