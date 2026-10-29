import { assertPurchaseApproval } from './purchase-approval';
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
/** Select only dated outstanding lines; one missing supplier date must not
 * prevent a human from updating another line's independently supported date. */
function selectedPromise(expected: any, ids: string[]) {
  const waiting = expected.lines.filter((line: any) => decimal(line.backorder) > 0n);
  if (!ids.length || new Set(ids).size !== ids.length || ids.some(id => !waiting.some((line: any) => line.orderLineId === id)))
    fail('PROMISE_LINES', 'Choose the backordered lines to re-promise.');
  const lines = waiting.filter((line: any) => ids.includes(line.orderLineId));
  if (lines.some((line: any) => !line.expectedDate)) fail('NO_DATE', 'Add supplier lead time or open supply for every selected line before promising a date.');
  return { ...expected, lines, expectedDate: lines.reduce((date: string, line: any) => line.expectedDate > date ? line.expectedDate : date, ''), estimated: lines.some((line: any) => line.estimated) };
}
function promiseMessage(c: Context, order: Row, expected: any, recipient: string, authority?: any) {
  const waiting = expected.lines.filter((line: any) => decimal(line.backorder) > 0n);
  const changes = waiting.map((line: any) => {
    const own = order.lines.find((candidate: any) => candidate.id === line.orderLineId);
    const previousDate = own.backorderPromiseDate ?? order.promiseDate ?? null;
    own.backorderPromiseDate = line.expectedDate;
    own.backorderPromisedQuantity = line.backorder;
    return { orderLineId: own.id, itemId: own.itemId, quantity: line.backorder, previousDate, promiseDate: line.expectedDate, estimated: line.estimated };
  });
  order.promiseHistory ??= [];
  order.promiseHistory.push({ promiseDate: expected.expectedDate, estimated: expected.estimated, lines: changes, sources: expected.lines, actorId: authority?.approvedBy ?? c.actor.id, at: c.now });
  order.version++;
  const from = sender(c);
  const detail = changes.map((line: any) => {
    const item = get(c.s, 'items', line.itemId);
    return `${item.name} (${item.sku}): ${line.quantity} ${item.unit}, expected ${longDate(line.promiseDate)}${line.estimated ? ' (estimate based on unconfirmed supply or supplier lead time)' : ' (confirmed inbound supply)'}. Previous promise: ${line.previousDate ? longDate(line.previousDate) : 'not set'}.`;
  }).join('\n');
  return message(c, 'customer-promise', order, recipient, `${from.name} order ${order.reference}: backorder dates`,
    `Backordered units on your order ${order.reference} with ${from.name} have updated expected fulfilment dates:\n${detail}\nThe promise for units already reserved remains ${order.promiseDate ? longDate(order.promiseDate) : 'not set'}. We will update you if this changes.\n\n${from.name}`,
    { promiseDate: expected.expectedDate, reservedPromiseDate: order.promiseDate ?? null, lines: changes, ...(authority ? { approvedBy: authority.approvedBy, approvalRole: authority.approvalRole, policyVersion: authority.version } : {}) });
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
      return queuePurchase(c, po, p);
    }
    const reply = { id: crypto.randomUUID(), source: text(p.source, 'Supplier message reference'), body: text(p.body, 'Supplier reply'), recordedBy: c.actor.id, at: c.now };
    po.supplierReplies ??= []; po.supplierReplies.push(reply);
    if (type === 'po.confirm') {
      assertPurchaseApproval(c, po, c.actor.id);
      const date = text(p.promiseDate, 'Confirmed date');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) fail('DATE', 'Use a valid confirmed date.');
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
    if (p.fingerprint !== expected.fingerprint) fail('STALE', 'Inbound supply changed. Review the recalculated date.');
    if (p.orderLineIds !== undefined && (!Array.isArray(p.orderLineIds) || p.orderLineIds.some((id: unknown) => typeof id !== 'string'))) fail('PROMISE_LINES', 'Choose valid backordered line identities.');
    const ids = p.orderLineIds ?? expected.lines.filter((line: any) => decimal(line.backorder) > 0n).map((line: any) => line.orderLineId);
    return promiseMessage(c, order, selectedPromise(expected, ids), recipient);
  }
}

/** Explicit human delegation: only computed dates and the approved customer can be emailed. */
export function refreshPromises(c: Context) {
  for (const expected of backorderDates(c)) {
    const order = get(c.s, 'orders', expected.orderId), policy = order.promisePolicy;
    if (!policy?.enabled || !expected.needsRepromise) continue;
    const ids = expected.lines.filter((line: any) => decimal(line.backorder) > 0n && line.expectedDate && line.expectedDate !== line.promiseDate).map((line: any) => line.orderLineId);
    if (!ids.length) continue;
    const role = c.automationActors?.[policy.approvedBy];
    if (!role || !['owner', 'operator', 'buyer'].includes(role)) continue;
    c.delegates ??= [];
    c.delegates.push({ actorId: policy.approvedBy, role, orderId: order.id, policyVersion: policy.version });
    promiseMessage(c, order, selectedPromise(expected, ids), policy.recipient, policy);
  }
}

export function queuePurchase(c: Context, po: Row, p: any, authority: any = {}) {
  assertPurchaseApproval(c, po, authority.approvedBy ?? c.actor.id);
  po.purchaseApprovalVersion = c.s.purchaseApprovalPolicies[0]?.version;
  const recipient = email(p.recipient);
  const material = poMaterial(po);
  if (c.s.correspondence.some(m => m.kind === 'purchase-order' && m.recordId === po.id && m.approvedMaterial === material)) fail('ALREADY_SENT', 'This exact purchase order already has an approved send. Inspect its delivery outcome.');
  const everyDays = Number(p.chaseEveryDays ?? 3), count = Number(p.maxChases ?? 2);
  if (!Number.isInteger(everyDays) || everyDays < 1 || everyDays > 30 || !Number.isInteger(count) || count < 0 || count > 5) fail('POLICY', 'Choose 1–30 days between chases and at most five chases.');
  const cost = expectedLandedCost(po), from = sender(c);
  const body = (c.actor.agent ? `Prepared by ${c.actor.name}\n\n` : '') + `Purchase order ${po.reference} from ${from.name}\nSupplier: ${po.supplierSnapshot.name}\nShip to: ${from.name}${po.destinationWarehouse ? `, ${po.destinationWarehouse}` : ''}\n${shipTo(from, po.destinationWarehouse)}\nRequested delivery: ${longDate(po.promiseDate)}\n` +
    po.lines.map((l: any) => `${l.terms?.code ? `${l.terms.code} (our ${get(c.s, 'items', l.itemId).sku})` : get(c.s, 'items', l.itemId).sku}: ${l.quantity} ${get(c.s, 'items', l.itemId).unit} at ${usdText(l.price)}`).join('\n') +
    `\nGoods ${usdText(cost.goods)}; estimated freight ${usdText(cost.freight)}; duty ${usdText(cost.duty)}; expected landed total ${usdText(cost.total)}.\nPlease reply with confirmation, expected delivery date and our purchase order reference.\n\n${from.name}`;
  const sent = message(c, 'purchase-order', po, recipient, `${from.name} purchase order ${po.reference}`, body, { approvedMaterial: material, purchaseApprovalVersion: po.purchaseApprovalVersion, promiseDate: po.promiseDate, ...authority });
  for (let n = 1; n <= count; n++) message(c, 'supplier-chase', po, recipient, `Confirmation requested: ${from.name} ${po.reference}`,
    `Please confirm purchase order ${po.reference} from ${from.name}, requested for ${longDate(po.promiseDate)}. Reply with the expected date and any changes.\n\n${body}`,
    { purchaseApprovalVersion: po.purchaseApprovalVersion, dueAt: afterDays(c.now, everyDays * n) + 'T09:00:00.000Z', approvedMaterial: material, promiseDate: po.promiseDate, purchaseMessageId: sent.id, ...authority });
  po.chasePolicy = { enabled: true, approvedBy: authority.approvedBy ?? c.actor.id, recipient, everyDays, maxChases: count, at: c.now };
  return sent;
}
