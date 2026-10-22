import { decimal, format, get, type State } from '../model';

const escape = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]!));

/** A pack's physical contents, never the order's outstanding demand or shipment history. */
export function packDocument(s: State, packId: string): Response {
  const pack = get(s, 'packs', packId), order = get(s, 'orders', pack.orderId);
  const wave = get(s, 'waves', pack.waveId), customer = get(s, 'parties', order.customerId);
  const tote = wave.orders.find((entry: any) => entry.orderId === order.id)?.tote;
  const cartons = pack.cartons.map((carton: any) => {
    const groups = [...new Set<string>(carton.lines.map((line: any) => line.orderLineId))].map(orderLineId => {
      const commercial = order.lines.find((line: any) => line.id === orderLineId);
      const parent = get(s, 'items', commercial.itemId);
      const contents = carton.lines.filter((line: any) => line.orderLineId === orderLineId).map((line: any) => {
        const item = get(s, 'items', line.itemId);
        // Picks retain their source bins; untracked pack scans do not select a bin.
        const bins = [...new Set<string>(wave.lines.filter((pick: any) => pick.orderId === order.id && pick.orderLineId === orderLineId && pick.itemId === line.itemId && decimal(pick.picked) > 0n).map((pick: any) => pick.locationId))];
        const sources = bins.map(id => { const bin = get(s, 'locations', id); return `${escape(bin.warehouse)} / ${escape(bin.name)}`; }).join('; ');
        const identities = (line.trace ?? []).map((part: any) => {
          const identity = get(s, 'traceIdentities', part.identityId);
          return `<li>${escape(format(BigInt(part.quantity)))} ${escape(item.unit)}${identity.lot ? ` · Lot ${escape(identity.lot)}` : ''}${identity.serial ? ` · Serial ${escape(identity.serial)}` : ''}${identity.expiry ? ` · Expiry ${escape(identity.expiry)}` : ''}</li>`;
        }).join('');
        return `<li><strong>${escape(item.sku)} · ${escape(item.name)}</strong><p>Packed: ${escape(line.quantity)} ${escape(item.unit)}</p><p>Picked bins for this wave line: ${sources || 'No recorded pick bin'}</p>${identities ? `<ul>${identities}</ul>` : ''}</li>`;
      }).join('');
      return `<section><h3>${escape(parent.sku)} · ${escape(parent.name)}</h3>${commercial.kit ? `<p>Kit definition ${escape(commercial.kit.revision)} · packed components below</p>` : ''}<ul>${contents}</ul></section>`;
    }).join('');
    return `<article><h2>Carton ${escape(carton.number)}</h2>${carton.weight ? `<p>${escape(carton.weight)} lb · ${escape(carton.length)} × ${escape(carton.width)} × ${escape(carton.height)} in</p>` : ''}${groups || '<p>No items packed in this carton yet.</p>'}</article>`;
  }).join('');
  const nonce = crypto.randomUUID();
  return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(order.reference)} · Packing slip</title><style nonce="${nonce}">*{box-sizing:border-box}body{font:16px system-ui;margin:0;padding:24px;overflow-wrap:anywhere}main,.toolbar{max-width:900px;margin-inline:auto}h1{font-size:28px}h2{font-size:22px}h3{font-size:18px}article{border-top:1px solid #aaa;margin-top:24px;padding-top:12px;break-inside:avoid}ul{padding-left:24px}li{margin-block:12px}p{margin-block:8px}button{font:inherit;padding:8px 16px}.toolbar{margin-bottom:24px}@media print{.toolbar{display:none}body{padding:0}@page{margin:16mm}}</style></head><body><div class="toolbar"><button id="print" type="button">Print packing slip</button><p>Printing does not dispatch stock.</p></div><main><h1>Packing slip · ${escape(order.reference)}</h1><p>${escape(customer.name)}</p><p>Pack ${escape(pack.id)} · ${escape(pack.status)}</p><p>Wave ${escape(wave.number)} · Tote ${escape(tote)} · ${escape(wave.warehouse)} · ${escape(wave.dock)}</p><p>Only the contents currently scanned into this pack are listed.</p>${cartons}</main><script nonce="${nonce}">document.getElementById('print').addEventListener('click',()=>window.print())</script></body></html>`, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      'content-security-policy': `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; base-uri 'none'; frame-ancestors 'self'`,
    },
  });
}
