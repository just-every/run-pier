import type { Bindings } from '../auth.server';
import type { Actor } from './model';
import { fail } from './model';
import { authority, load } from './storage';
import { businessMail, emailUnavailable } from './correspondence-delivery-provider';
/** Claim before egress. A lost provider response is visible and cannot resend. */
export async function deliverSalesDocument(env: Bindings,actor: Actor,documentId: string) {
  const s=await load(env.DB),doc=s.salesDocuments.find(r=>r.id===documentId) ?? fail('DOCUMENT','The retained document is unavailable.');
  const gate=authority(actor),sender=businessMail(env),now=new Date().toISOString();
  await env.DB.prepare("UPDATE pier_mail_deliveries SET phase='uncertain',error='Submission outcome was not recorded; review before another send.',at=? WHERE correspondence_id=? AND phase='sending' AND at<?").bind(now,doc.id,new Date(Date.now()-300000).toISOString()).run();
  const claim=await env.DB.prepare(`INSERT INTO pier_mail_deliveries(correspondence_id,phase,provider_message_id,error,at)
    SELECT d.id,?,NULL,?,? FROM pier_records d JOIN pier_records o ON o.kind='orders' AND o.id=json_extract(d.data,'$.recordId')
    WHERE d.kind='salesDocuments' AND d.id=? AND (${gate.sql}) AND ?='owner'
      AND json_extract(d.data,'$.approvedBy')=? AND json_extract(o.data,'$.version')=json_extract(d.data,'$.recordVersion')
    ON CONFLICT(correspondence_id) DO NOTHING RETURNING phase`)
    .bind(sender?'sending':'unavailable',sender?null:emailUnavailable,now,doc.id,...gate.params,actor.role,actor.id).first<any>();
  if(!claim||claim.phase!=='sending'||!sender) return;
  let phase='uncertain',providerId:string|null=null,error:string|null='Submission outcome is uncertain. Review before another send.';
  try {
    const outcome=await sender.send({deliveryId:doc.id,from:env.MAIL_FROM!,to:[doc.recipient],subject:doc.subject,text:doc.body,
      attachments:[{filename:doc.filename,contentType:'application/pdf',content:Uint8Array.from(atob(doc.pdf),ch=>ch.charCodeAt(0))}]});
    providerId=outcome.providerMessageId;
    if(outcome.status==='accepted'){phase='sent';error=null;}
    else if(['rejected','rate_limited'].includes(outcome.status)){phase='failed';error='The email provider declined the submission.';}
  } catch { /* Never retain a thrown provider body or credential. */ }
  await env.DB.prepare("UPDATE pier_mail_deliveries SET phase=?,provider_message_id=?,error=?,at=? WHERE correspondence_id=? AND phase='sending'").bind(phase,providerId,error,new Date().toISOString(),doc.id).run();
}
