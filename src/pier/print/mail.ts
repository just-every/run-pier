import type { Bindings } from '../../auth.server';
import type { Actor } from '../model';
import { authority, load } from '../storage';
import { businessMail, emailUnavailable } from '../correspondence-delivery-provider';

/** Durable provider submission claim; the recipient consent binds the retained bytes. */
export async function deliverDocument(env:Bindings,actor:Actor,documentId:string){
  const doc=(await load(env.DB)).salesDocuments.find(d=>d.id===documentId);if(!doc?.recipient)return;
  const gate=authority(actor),sender=businessMail(env),now=new Date().toISOString();
  await env.DB.prepare("UPDATE pier_mail_deliveries SET phase='uncertain',error='Submission outcome is unknown; review before another send.',at=? WHERE correspondence_id=? AND phase='sending' AND at<?").bind(now,doc.id,new Date(Date.now()-300000).toISOString()).run();
  const claim=await env.DB.prepare(`INSERT INTO pier_mail_deliveries(correspondence_id,phase,provider_message_id,error,at)
    SELECT id,?,NULL,?,? FROM pier_records WHERE kind='salesDocuments' AND id=? AND (${gate.sql}) AND ?='owner'
    AND json_extract(data,'$.approvedBy')=? AND json_extract(data,'$.recipient')=?
    ON CONFLICT(correspondence_id) DO NOTHING RETURNING phase`).bind(sender?'sending':'unavailable',sender?null:emailUnavailable,now,doc.id,...gate.params,actor.role,actor.id,doc.recipient).first<any>();
  if(!claim||claim.phase!=='sending'||!sender)return;
  let phase='uncertain',providerId:string|null=null,error:string|null='Submission outcome is uncertain. No automatic retry.';
  try{
    const outcome=await sender.send({deliveryId:doc.id,from:env.MAIL_FROM!,to:[doc.recipient],subject:doc.subject,text:doc.body,
      attachments:[{filename:doc.filename,contentType:'application/pdf',content:Uint8Array.from(atob(doc.pdf),ch=>ch.charCodeAt(0))}]});
    providerId=outcome.providerMessageId;
    if(outcome.status==='accepted'){phase='sent';error=null;}else if(['rejected','rate_limited'].includes(outcome.status)){phase='failed';error='The provider declined this submission.';}
  }catch{/* Provider bodies and credentials never enter diagnostics. */}
  await env.DB.prepare("UPDATE pier_mail_deliveries SET phase=?,provider_message_id=?,error=?,at=? WHERE correspondence_id=? AND phase='sending'").bind(phase,providerId,error,new Date().toISOString(),doc.id).run();
}
