import type { Bindings } from "../auth.server";
import type { Row } from "./model";
import { businessMail, businessMessage, emailUnavailable } from "./correspondence-delivery-provider";
import { correspondenceEligible, type Correspondence } from "./correspondence-delivery-eligibility";
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
  WHERE o.id=json_extract(c.data,'$.approvedBy') AND o.status='active'
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
export async function deliverCorrespondence(env: Bindings, clock = new Date().toISOString()): Promise<CorrespondenceDelivery[]> {
  const db = env.DB, now = clock, sender = businessMail(env);
  // A crashed execution may have submitted mail. Surface that uncertainty, never retry it.
  await db.prepare(`UPDATE pier_mail_deliveries SET phase='uncertain',error=?,at=?
    WHERE phase='sending' AND at<?`)
    .bind("Delivery stopped before its outcome was recorded. Review before approving another send.",
      now, new Date(Date.now() - 5 * 60_000).toISOString()).run();
  const due = await db.prepare(`SELECT c.id,c.data,source.data AS sourceData
    FROM pier_records c LEFT JOIN pier_mail_deliveries d ON d.correspondence_id=c.id
    LEFT JOIN pier_records source ON source.id=json_extract(c.data,'$.recordId')
      AND source.kind=CASE WHEN json_extract(c.data,'$.kind')='customer-promise' THEN 'orders' ELSE 'purchaseOrders' END
    WHERE c.kind='correspondence' AND json_extract(c.data,'$.dueAt')<=?
      AND (d.correspondence_id IS NULL OR (?=1 AND d.phase='unavailable'))
      AND (json_extract(c.data,'$.kind')!='supplier-chase' OR EXISTS(
        SELECT 1 FROM pier_mail_deliveries initial
        WHERE initial.correspondence_id=json_extract(c.data,'$.purchaseMessageId') AND initial.phase='sent'))
    ORDER BY json_extract(c.data,'$.dueAt'),c.id LIMIT 10`)
    .bind(now, sender ? 1 : 0).all<{ id: string; data: string; sourceData: string | null }>();

  const results = await Promise.all(due.results.map(async candidate => {
    const message = JSON.parse(candidate.data) as Correspondence;
    const source = candidate.sourceData ? JSON.parse(candidate.sourceData) as Row : null;
    const eligible = message.id === candidate.id && correspondenceEligible(message, source);
    let phase: DeliveryPhase = sender ? "sending" : "unavailable";
    let error: string | null = sender ? null : emailUnavailable;
    let mail: ReturnType<typeof businessMessage> | undefined;
    if (sender) {
      try { mail = businessMessage(env, message); }
      catch { phase = "failed"; error = "The approved email has invalid message fields."; }
    }
    // Claim and current human authority are one SQL admission. Only unavailable
    // records (where no submission was attempted) may ever acquire another claim.
    const live = `${authority} AND ?=1 AND EXISTS(SELECT 1 FROM pier_records source
      WHERE source.id=json_extract(c.data,'$.recordId')
      AND source.kind=CASE WHEN json_extract(c.data,'$.kind')='customer-promise' THEN 'orders' ELSE 'purchaseOrders' END
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
      .bind(eligible ? 1 : 0, candidate.sourceData, phase,
        eligible ? 1 : 0, candidate.sourceData, error, now,
        candidate.id, candidate.data, now).first<CorrespondenceDelivery>();
    if (!claimed || claimed.phase !== "sending" || !sender || !mail) return claimed;

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
    // Never copy thrown errors, provider response bodies, credentials or message
    // content into diagnostics. If this write fails, the durable claim survives.
    return db.prepare(`UPDATE pier_mail_deliveries SET phase=?,provider_message_id=?,error=?,at=?
      WHERE correspondence_id=? AND phase='sending' RETURNING ${metadata}`)
      .bind(phase, providerMessageId, error, new Date().toISOString(), candidate.id)
      .first<CorrespondenceDelivery>();
  }));
  return results.filter((result): result is CorrespondenceDelivery => result !== null);
}
