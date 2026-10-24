import type { Bindings } from "../../auth.server";
import { operatorMail } from "../../mail.server.mjs";
import type { Actor, Row } from "../model";
import { load } from "../storage";
import { beginProviderAttempt } from "../provider-audit";

// The owner's copy of a closed dispatch day, sent through the installation's
// own mail after the day-close record commits. Where this installation cannot
// send, the record says so plainly and the summary stays on screen.

const hours = (hhmm: string | null) => {
  if (!hhmm) return "—";
  const [h, m] = hhmm.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
};

const escape = (value: string) => value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function summaryText(day: Row, origin: string) {
  const s = day.summary, lines = [
    `Dispatch summary for ${s.date} (${s.timeZone})`,
    "",
    s.allOut ? `All ${s.ordersShipped} orders out by ${hours(s.lastShipmentAt)}.` : `${s.ordersShipped} orders shipped; last shipment ${hours(s.lastShipmentAt)}.`,
    `${s.shipments} shipments, ${s.units} units.`,
    "",
    "By carrier:",
    ...(s.byCarrier.length ? s.byCarrier.map((g: any) => `- ${g.carrier} · ${g.dock}: ${g.orders} orders, ${g.units} units${g.cutoff ? `, cut-off ${hours(g.cutoff)}` : ""}${g.late ? `, ${g.late} after cut-off` : ""}`) : ["- Nothing shipped."]),
    "",
    "By dock:",
    ...(s.byDock.length ? s.byDock.map((d: any) => `- ${d.dock}: ${d.orders} orders, ${d.units} units`) : ["- Nothing shipped."]),
    "",
    `Exceptions (${s.exceptions.length}):`,
    ...(s.exceptions.length
      ? s.exceptions.map((e: any) =>
          e.kind === "not shipped" ? `- ${e.order} did not ship: ${e.reason}`
          : e.kind === "partly shipped" ? `- ${e.order} partly shipped: ${e.shipped} of ${e.ordered} units out; the rest is ${e.reason}`
          : e.kind === "short pick" ? `- Wave ${e.wave}, ${e.order}: bin ${e.bin} short by ${e.moved === "0" ? e.unfilled : e.moved}${e.overflow ? `, picked from overflow ${e.overflow}` : ""}${e.unfilled !== "0" ? `, ${e.unfilled} not filled` : ""}`
          : e.kind === "late" ? `- ${e.order} left at ${hours(e.at)}, after the ${e.carrier} cut-off ${hours(e.cutoff)}`
          : `- ${e.purchaseOrder}: ${e.kind}, expected ${e.expected}, received ${e.received}`)
      : ["- None."]),
    "",
    `Open the dispatch day in Pier: ${origin}/app#floor/dispatch`,
  ];
  return lines.join("\n");
}

/** Sends the owner's copy and reports what happened, in words a person can act on. */
export async function sendSummary(env: Bindings, day: Row, actor: Actor, commandId: string): Promise<{ status: string; detail: string }> {
  if (env.RER_OWNER_CLAIM_ISSUER && env.RER_DEMO !== "1")
    return { status: "not available", detail: "Email is not available yet on RER Managed; the summary is kept here." };
  if (env.AUTH_LOCAL === "true" || env.RER_DEMO === "1")
    return { status: "not sent", detail: "This local installation does not send mail; the summary is kept here." };
  const sender = operatorMail(env);
  if (!sender || !env.MAIL_FROM || !env.OWNER_EMAIL)
    return { status: "not sent", detail: "No mail provider is set up for this installation; the summary is kept here." };
  const text = summaryText(day, env.AUTH_ORIGIN);
  const state = await load(env.DB);
  const finish = await beginProviderAttempt(env.DB, { actor, commandId, connectorId: 'mail', operation: 'dispatch.summary', direction: 'outbound', state, sources: [{ collection: 'dispatchDays', row: day }], documentIds: [day.id], requestId: `${day.id}-${day.version}` });
  try {
    const result = await sender.send({
      deliveryId: `${day.id}-${day.version}`,
      from: env.MAIL_FROM,
      to: [env.OWNER_EMAIL],
      subject: `Pier dispatch summary · ${day.summary.date} · ${day.summary.ordersShipped} orders shipped`,
      text,
      html: `<pre style="font:14px/1.5 ui-monospace,Menlo,monospace;white-space:pre-wrap">${escape(text)}</pre>`,
      headers: {},
    });
    await finish({ outcome: result.status === 'accepted' ? 'accepted' : 'refused', externalIds: [result.providerMessageId] });
    if (result.status === "accepted") return { status: "sent", detail: "Sent to the owner's email address." };
    return { status: "failed", detail: `The mail provider did not accept the message (${result.status}${result.code ? `, ${result.code}` : ""}). Close the day again to retry.` };
  } catch {
    await finish({ outcome: 'uncertain' });
    return { status: 'failed', detail: 'The mail provider did not confirm this submission. Review its retained attempt before sending another summary.' };
  }
}
