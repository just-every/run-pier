import type { Bindings } from "../auth.server";
import { authority as actorAuthority, load } from "./storage";
import type { Actor, Row } from "./model";
import { businessMail, businessMessage, emailUnavailable } from "./correspondence-delivery-provider";
import { correspondenceEligible, type Correspondence } from "./correspondence-delivery-eligibility";
import { beginProviderAttempt } from './provider-audit';
export { poMaterial } from "./correspondence-delivery-eligibility";

export type DeliveryPhase = "sending" | "sent" | "failed" | "uncertain" | "unavailable" | "revoked";
export type CorrespondenceDelivery = {
  correspondenceId: string;
  phase: DeliveryPhase;
  providerMessageId: string | null;
  error: string | null;
  at: string;
};

const metadata = `correspondence_id AS correspondenceId,phase,
  provider_message_id AS providerMessageId,error,at`;
const authority = `EXISTS (
  SELECT 1 FROM oa_operators o
  LEFT JOIN pier_records role ON role.kind='roles' AND role.id=o.id
  WHERE o.id=json_extract(c.data,'$.approvedBy') AND o.status='active' AND (json_type(role.data,'$.permissions') IS NULL OR json_extract(role.data,'$.role')='owner')
  AND (json_extract(c.data,'$.approvalRole') IN ('owner','buyer') OR
    (json_extract(c.data,'$.kind')='customer-promise' AND json_extract(c.data,'$.approvalRole')='operator'))
  AND CASE WHEN role.data IS NOT NULL THEN json_extract(role.data,'$.role')
    WHEN o.role='owner' THEN 'owner' ELSE 'viewer' END IN
      ('owner','buyer',CASE WHEN json_extract(c.data,'$.kind')='customer-promise' THEN 'operator' ELSE 'buyer' END)
)`;

export async function correspondenceDeliveries(db: D1Database): Promise<CorrespondenceDelivery[]> {
  const result = await db.prepare(`SELECT ${metadata} FROM pier_mail_deliveries ORDER BY at,correspondence_id`).all<CorrespondenceDelivery>();
  return result.results;
}

/** Bounded, durable submissions. 'sent' records provider acceptance, not inbox delivery. */
export async function deliverCorrespondence(env: Bindings, clock = new Date().toISOString(), onlyId?: string, actor?: Actor): Promise<CorrespondenceDelivery[]> {
  const db = env.DB, now = clock, sender = businessMail(env);
  // A crashed execution may have submitted mail. Surface that uncertainty, never retry it.
  await db.prepare(`UPDATE pier_mail_deliveries SET phase='uncertain',error=?,at=?
    WHERE phase='sending' AND at<?`)
    .bind("Delivery stopped before its outcome was recorded. Review before approving another send.",
      now, new Date(Date.now() - 5 * 60_000).toISOString()).run();
  const due = await db.prepare(`SELECT c.id,c.data,source.data AS sourceData
    FROM pier_records c LEFT JOIN pier_mail_deliveries d ON d.correspondence_id=c.id
    LEFT JOIN pier_records source ON source.id=json_extract(c.data,'$.recordId')
      AND source.kind=CASE WHEN json_extract(c.data,'$.kind')='customer-promise' THEN 'orders' WHEN json_extract(c.data,'$.kind')='slow-stock' THEN 'slowStockExceptions' ELSE 'purchaseOrders' END
    WHERE c.kind='correspondence' AND COALESCE(json_extract(c.data,'$.restorePaused'),0)=0 AND (? IS NULL OR c.id=?) AND json_extract(c.data,'$.dueAt')<=?
      AND (d.correspondence_id IS NULL OR (?=1 AND d.phase='unavailable'))
      AND (json_extract(c.data,'$.kind')!='supplier-chase' OR EXISTS(
        SELECT 1 FROM pier_mail_deliveries initial
        WHERE initial.correspondence_id=json_extract(c.data,'$.purchaseMessageId') AND initial.phase='sent'))
    ORDER BY json_extract(c.data,'$.dueAt'),c.id LIMIT 10`)
    .bind(onlyId ?? null, onlyId ?? null, now, sender ? 1 : 0).all<{ id: string; data: string; sourceData: string | null }>();

  const results = await Promise.all(due.results.map(async candidate => {
    const message = JSON.parse(candidate.data) as Correspondence;
    const source = candidate.sourceData ? JSON.parse(candidate.sourceData) as Row : null;
    const eligible = message.id === candidate.id && correspondenceEligible(message, source, now);
    let phase: DeliveryPhase = sender ? "sending" : "unavailable";
    let error: string | null = sender ? null : emailUnavailable;
    let mail: ReturnType<typeof businessMessage> | undefined;
    if (sender) {
      try {
        const document = message.documentId ? (await load(db)).salesDocuments.find(document => document.id === message.documentId) : undefined;
        if (message.documentId && !document?.pdf) throw new Error('Retained purchase document is unavailable.');
        mail = businessMessage(env, message, message.documentAttachment === 'unavailable' ? undefined : document as { filename: string; pdf: string } | undefined);
      }
      catch { phase = "failed"; error = "The approved email has invalid message fields."; }
    }
    // Claim and current human authority are one SQL admission. Only unavailable
    // records (where no submission was attempted) may ever acquire another claim.
    const gate = actor ? actorAuthority(actor) : { sql: "1=1", params: [] };
    const live = `(${gate.sql}) AND ${authority} AND ?=1 AND EXISTS(SELECT 1 FROM pier_records source
      WHERE source.id=json_extract(c.data,'$.recordId')
      AND source.kind=CASE WHEN json_extract(c.data,'$.kind')='customer-promise' THEN 'orders' WHEN json_extract(c.data,'$.kind')='slow-stock' THEN 'slowStockExceptions' ELSE 'purchaseOrders' END
      AND source.data=?) AND (json_extract(c.data,'$.kind')!='supplier-chase' OR EXISTS(
        SELECT 1 FROM pier_mail_deliveries initial
        WHERE initial.correspondence_id=json_extract(c.data,'$.purchaseMessageId') AND initial.phase='sent'))`;
    const claimed = await db.prepare(`INSERT INTO pier_mail_deliveries(correspondence_id,phase,provider_message_id,error,at)
      SELECT c.id,CASE WHEN ${live} THEN ? ELSE 'revoked' END,NULL,
        CASE WHEN ${live} THEN ? ELSE 'Approval authority or the approved business record changed.' END,?
      FROM pier_records c WHERE c.kind='correspondence' AND c.id=? AND c.data=?
      AND json_extract(c.data,'$.dueAt')<=?
      ON CONFLICT(correspondence_id) DO UPDATE SET phase=excluded.phase,
        provider_message_id=NULL,error=excluded.error,at=excluded.at
        WHERE pier_mail_deliveries.phase='unavailable' AND excluded.phase!='unavailable'
      RETURNING ${metadata}`)
      .bind(...gate.params, eligible ? 1 : 0, candidate.sourceData, phase,
        ...gate.params, eligible ? 1 : 0, candidate.sourceData, error, now,
        candidate.id, candidate.data, now).first<CorrespondenceDelivery>();
    if (!claimed || claimed.phase !== "sending" || !sender || !mail) return claimed;

    const sourceKind = message.kind === 'customer-promise' ? 'orders' : message.kind === 'slow-stock' ? 'slowStockExceptions' : 'purchaseOrders';
    const finish = await beginProviderAttempt(db, {
      actor: actor ?? { id: message.approvedBy, role: message.approvalRole, name: '', sessionId: '', operatorVersion: 0 },
      commandId: message.id, connectorId: 'mail', operation: 'correspondence.send', direction: 'outbound', state: await load(db),
      sources: [{ collection: 'correspondence', row: message }, { collection: sourceKind, row: source! }],
      itemIds: (source?.lines ?? []).map((line: Row) => line.itemId).filter(Boolean), documentIds: [message.recordId], requestId: message.id,
      approval: { actorId: message.approvedBy, documentId: message.id, version: message.version, policyVersion: message.policyVersion ?? message.sendPolicyVersion ?? null },
    }, { sql: `EXISTS(SELECT 1 FROM pier_records c WHERE c.kind='correspondence' AND c.id=? AND c.data=? AND ${live})`,
      params: [candidate.id, candidate.data, ...gate.params, eligible ? 1 : 0, candidate.sourceData] });
    let providerMessageId: string | null = null;
    try {
      const outcome = await sender.send(mail);
      providerMessageId = outcome.providerMessageId;
      if (outcome.status === "accepted") { phase = "sent"; error = null; }
      else if (outcome.status === "rejected" || outcome.status === "rate_limited") {
        phase = "failed";
        error = outcome.status === "rate_limited" ? "The email provider declined this submission because of its rate limit."
          : "The email provider rejected this submission.";
      } else {
        phase = "uncertain";
        error = "The email provider did not confirm acceptance. Review before approving another send.";
      }
    } catch {
      phase = "uncertain";
      error = "The email submission ended without a confirmed outcome. Review before approving another send.";
    }
    await finish({ outcome: phase === 'sent' ? 'accepted' : phase === 'failed' ? 'refused' : 'uncertain', externalIds: [providerMessageId] });
    // Never copy thrown errors, provider response bodies, credentials or message
    // content into diagnostics. If this write fails, the durable claim survives.
    return db.prepare(`UPDATE pier_mail_deliveries SET phase=?,provider_message_id=?,error=?,at=?
      WHERE correspondence_id=? AND phase='sending' RETURNING ${metadata}`)
      .bind(phase, providerMessageId, error, new Date().toISOString(), candidate.id)
      .first<CorrespondenceDelivery>();
  }));
  return results.filter((result): result is CorrespondenceDelivery => result !== null);
}
