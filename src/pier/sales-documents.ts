import {
  fail,
  fresh,
  get,
  requireRole,
  row,
  text,
  type Context,
  type Row,
} from "./model";
import { currentQuote } from "./sales-quotes";
import { salesPDF } from "./sales-pdf";
import { requireQuoteApproval } from './quote-approval';
export function salesDocuments(
  c: Context,
  type: string,
  p: any,
): Row | undefined {
  if (!["quote.send", "order.confirm"].includes(type)) return;
  requireRole(c, []);
  const order = get(c.s, "orders", p.orderId);
  fresh(order, p.version);
  if (type === "quote.send") {
    if (order.documentType !== "quote" || order.acceptedAt)
      fail("QUOTE_STATE", "Choose an open quote.");
    currentQuote(c, order);
    requireQuoteApproval(c, order);
  } else if (order.documentType === "quote" && !order.acceptedAt)
    fail("QUOTE_STATE", "Accept the quote before confirming an order.");
  const recipient = text(p.recipient, "Approved recipient");
  if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(recipient))
    fail("EMAIL", "Enter one valid recipient.");
  const kind = type === "quote.send" ? "quote" : "order-confirmation";
  return row(c, "salesDocuments", {
    recordId: order.id,
    recordVersion: order.version,
    kind,
    recipient,
    subject: `${kind === "quote" ? "Quote" : "Order confirmation"} ${order.reference}`,
    body: `Please find the approved ${kind} ${order.reference} attached.`,
    pdf: salesPDF(c.s, order, kind),
    filename: `${order.reference}-v${order.version}-${kind}.pdf`,
    approvedBy: c.actor.id,
    approvedAt: c.now,
  });
}
