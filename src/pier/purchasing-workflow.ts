import { longDate, sender, shipTo } from './business';
import { decimal, format, fresh, get, requireRole, row, text, fail, type Context, type Row } from './model';
import { money, usdText } from './money';
import { afterDays, backorderDates } from './backorders';
import { poMaterial } from './correspondence-delivery';

export function expectedLandedCost(po: Row) {
  const goods = po.lines.reduce((n: bigint, l: any) => n + decimal(l.quantity) * decimal(l.price), 0n);
  const charges = (decimal(po.freight ?? '0') + decimal(po.duty ?? '0')) * 1000000n;
  return { goods: money(goods), freight: po.freight ?? '0', duty: po.duty ?? '0', total: money(goods + charges) };
}
export function email(value: unknown) {
  const recipient = text(value, 'Recipient email');
  if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(recipient) || /[\r\n]/.test(recipient)) fail('EMAIL', 'Enter one valid email recipient.');
  return recipient;
}
function message(c: Context, kind: string, record: Row, recipient: string, subject: string, body: string, extra: any = {}) {
  return row(c, 'correspondence', { kind, recordId: record.id, recordVersion: record.version, recipient, subject, body,
    approvedBy: c.actor.id, approvalRole: c.actor.role, dueAt: c.now, ...extra });
}
function promiseMessage(c: Context, order: Row, expected: any, recipient: string, authority?: any) {
  const previousDate = order.promiseDate;
  order.promiseDate = expected.expectedDate;
  order.promiseHistory ??= [];
  order.promiseHistory.push({ previousDate, promiseDate: order.promiseDate, estimated: expected.estimated, sources: expected.lines, actorId: authority?.approvedBy ?? c.actor.id, at: c.now });
  order.version++;
  const from = sender(c);
  return message(c, 'customer-promise', order, recipient, `${from.name} order ${order.reference}: expected ${longDate(order.promiseDate)}`,
    `Your order ${order.reference} with ${from.name} now has an expected fulfilment date of ${longDate(order.promiseDate)}.${expected.estimated ? ' This is an estimate based on unconfirmed supply or supplier lead time.' : ' This date is based on confirmed inbound supply.'}\nPrevious promise: ${previousDate ? longDate(previousDate) : 'not set'}. We will update you if this changes.\n\n${from.name}`,
    { promiseDate: order.promiseDate, ...(authority ? { approvedBy: authority.approvedBy, approvalRole: authority.approvalRole, policyVersion: authority.version } : {}) });
}
export function purchasingWorkflow(c: Context, type: string, p: any): Row | undefined {
  if (type === 'po.pauseChases') {
    requireRole(c, ['buyer']); const po = get(c.s, 'purchaseOrders', p.poId); fresh(po, p.version);
    if (!po.chasePolicy) fail('POLICY', 'This PO has no chase schedule.');
    po.chasePolicy.enabled = false; po.version++; return po;
  }
  if (type === 'po.delete') {
    requireRole(c, ['buyer']);
    const po = get(c.s, 'purchaseOrders', p.poId); fresh(po, p.version);
    if (po.status !== 'draft') fail('PO_STATE', 'Only uncommitted drafts can be deleted.');
    c.s.purchaseOrders = c.s.purchaseOrders.filter(r => r.id !== po.id); return po;
  }
  if (['po.send', 'po.reply', 'po.confirm'].includes(type)) {
    requireRole(c, ['buyer']);
    const po = get(c.s, 'purchaseOrders', p.poId); fresh(po, p.version);
    if (po.status !== 'committed') fail('PO_STATE', 'Commit the exact buyer-approved purchase order first.');
    if (type === 'po.send') {
      const recipient = email(p.recipient);
      if (p.confirm !== true) fail('APPROVAL', 'Review the recipient and exact purchase order before sending.');
      const material = poMaterial(po);
      if (c.s.correspondence.some(m => m.kind === 'purchase-order' && m.recordId === po.id && m.approvedMaterial === material)) fail('ALREADY_SENT', 'This exact purchase order already has an approved send. Inspect its delivery outcome.');
      const everyDays = Number(p.chaseEveryDays ?? 3), count = Number(p.maxChases ?? 2);
      if (!Number.isInteger(everyDays) || everyDays < 1 || everyDays > 30 || !Number.isInteger(count) || count < 0 || count > 5) fail('POLICY', 'Choose 1–30 days between chases and at most five chases.');
      const cost = expectedLandedCost(po), from = sender(c);
      const body = `Purchase order ${po.reference} from ${from.name}\nSupplier: ${po.supplierSnapshot.name}\nShip to: ${from.name}${po.destinationWarehouse ? `, ${po.destinationWarehouse}` : ''}\n${shipTo(from, po.destinationWarehouse)}\nRequested delivery: ${longDate(po.promiseDate)}\n` +
        po.lines.map((l: any) => `${l.terms?.code ? `${l.terms.code} (our ${get(c.s, 'items', l.itemId).sku})` : get(c.s, 'items', l.itemId).sku}: ${l.quantity} ${get(c.s, 'items', l.itemId).unit} at ${usdText(l.price)}`).join('\n') +
        `\nGoods ${usdText(cost.goods)}; estimated freight ${usdText(cost.freight)}; duty ${usdText(cost.duty)}; expected landed total ${usdText(cost.total)}.\nPlease reply with confirmation, expected delivery date and our purchase order reference.\n\n${from.name}`;
      const sent = message(c, 'purchase-order', po, recipient, `${from.name} purchase order ${po.reference}`, body, { approvedMaterial: material, promiseDate: po.promiseDate });
      for (let n = 1; n <= count; n++) message(c, 'supplier-chase', po, recipient, `Confirmation requested: ${from.name} ${po.reference}`,
        `Please confirm purchase order ${po.reference} from ${from.name}, requested for ${longDate(po.promiseDate)}. Reply with the expected date and any changes.\n\n${body}`,
        { dueAt: afterDays(c.now, everyDays * n) + 'T09:00:00.000Z', approvedMaterial: material, promiseDate: po.promiseDate, purchaseMessageId: sent.id });
      po.chasePolicy = { enabled: true, approvedBy: c.actor.id, recipient, everyDays, maxChases: count, at: c.now };
      return sent;
    }
    const reply = { id: crypto.randomUUID(), source: text(p.source, 'Supplier message reference'), body: text(p.body, 'Supplier reply'), recordedBy: c.actor.id, at: c.now };
    po.supplierReplies ??= []; po.supplierReplies.push(reply);
    if (type === 'po.confirm') {
      const date = text(p.promiseDate, 'Confirmed date');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) fail('DATE', 'Use a valid confirmed date.');
      if (p.confirm !== true) fail('APPROVAL', 'Approve the supplier date and affected customer promise changes.');
      po.promiseDate = date;
      po.confirmation = { promiseDate: date, replyId: reply.id, approvedBy: c.actor.id, at: c.now };
      po.approval = { actorId: c.actor.id, version: po.version + 1, at: c.now };
    }
    po.version++; return po;
  }
  if (type === 'order.repromise' || type === 'order.promisePolicy') {
    requireRole(c, ['operator', 'buyer']);
    const order = get(c.s, 'orders', p.orderId); fresh(order, p.version);
    const recipient = email(p.recipient);
    if (p.confirm !== true) fail('APPROVAL', 'Approve the exact customer recipient and promise communication.');
    if (type === 'order.promisePolicy') {
      order.promisePolicy = { version: (order.promisePolicy?.version ?? 0) + 1, enabled: p.enabled === true,
        recipient, approvedBy: c.actor.id, approvalRole: c.actor.role, at: c.now };
      order.version++; return order;
    }
    const expected = backorderDates(c).find(r => r.orderId === order.id)!;
    if (!expected.expectedDate) fail('NO_DATE', 'Add supplier lead time or open supply before promising a date.');
    if (p.fingerprint !== expected.fingerprint) fail('STALE', 'Inbound supply changed. Review the recalculated date.');
    return promiseMessage(c, order, expected, recipient);
  }
}

/** Explicit human delegation: only computed dates and the approved customer can be emailed. */
export function refreshPromises(c: Context) {
  for (const expected of backorderDates(c)) {
    const order = get(c.s, 'orders', expected.orderId), policy = order.promisePolicy;
    if (!policy?.enabled || !expected.needsRepromise || !expected.expectedDate) continue;
    const role = c.automationActors?.[policy.approvedBy];
    if (!role || !['owner', 'operator', 'buyer'].includes(role)) continue;
    c.delegates ??= [];
    c.delegates.push({ actorId: policy.approvedBy, role, orderId: order.id, policyVersion: policy.version });
    promiseMessage(c, order, expected, policy.recipient, policy);
  }
}
