// @ts-expect-error Vendored provider signature verifier is JavaScript.
import { verifyWebhook } from '../../modules/mail/src/events/verify.mjs';
import type { Bindings } from '../../auth.server';
import { credentials } from '../channels/secrets';
import { load } from '../storage';
import { Problem } from '../model';
import { commandText } from '../documents/body';
import { MAIL_EVENTS } from './mail-settings';

export async function deliveryWebhook(request:Request,env:Bindings):Promise<Response|null>{
  if(new URL(request.url).pathname!=='/api/pier/print/delivery-events')return null;
  if(request.method!=='POST')return new Response(null,{status:405});
  const setup=(await load(env.DB)).businessTemplates.find(t=>t.id===MAIL_EVENTS&&t.enabled);
  if(!setup)return new Response(null,{status:503});
  const raw=await commandText(request),bytes=new TextEncoder().encode(raw),secret=await credentials(env,MAIL_EVENTS);
  if(!await verifyWebhook({provider:setup.provider,rawBody:bytes,headers:request.headers,key:secret.key,now:Date.now()}))throw new Problem('DELIVERY_SIGNATURE','Delivery signature was refused.',null,401);
  let parsed:any;try{parsed=JSON.parse(raw);}catch{throw new Problem('JSON','Invalid delivery event.',null,400);}
  const events=setup.provider==='sendgrid'?parsed:[parsed];if(!Array.isArray(events)||events.length>100)throw new Problem('DELIVERY_EVENT','Supply a bounded delivery event batch.',null,400);
  for(const event of events){
    const bounced=setup.provider==='sendgrid'?['bounce','dropped','spamreport'].includes(event.event):['email.bounced','email.failed','email.complained'].includes(event.type);
    if(!bounced)continue;
    const messageId=setup.provider==='sendgrid'?event.sg_message_id:event.data?.email_id,recipients=setup.provider==='sendgrid'?[event.email]:event.data?.to;
    const eventId=setup.provider==='sendgrid'?event.sg_event_id:request.headers.get('svix-id');
    if(typeof messageId!=='string'||typeof eventId!=='string'||eventId.length>512||!Array.isArray(recipients)||recipients.some(r=>typeof r!=='string'))throw new Problem('DELIVERY_EVENT','Delivery event identity is invalid.',null,400);
    const document=await env.DB.prepare("SELECT d.id FROM pier_records d JOIN pier_mail_deliveries m ON m.correspondence_id=d.id WHERE d.kind='salesDocuments' AND m.provider_message_id=? AND json_extract(d.data,'$.recipient') IN (SELECT value FROM json_each(?))").bind(messageId,JSON.stringify(recipients)).first<{id:string}>();
    if(!document)continue;
    const id=`print-event:${eventId}`,at=new Date().toISOString();
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO pier_guard(id,ok) VALUES(?,CASE WHEN EXISTS(SELECT 1 FROM pier_records cfg JOIN oa_operators o ON o.id=json_extract(cfg.data,'$.approvedBy') LEFT JOIN pier_records r ON r.kind='roles' AND r.id=o.id WHERE cfg.kind='businessTemplates' AND cfg.id=? AND cfg.version=? AND json_extract(cfg.data,'$.enabled')=1 AND o.status='active' AND COALESCE(json_extract(r.data,'$.role'),CASE WHEN o.role='owner' THEN 'owner' ELSE 'viewer' END)='owner') THEN 1 ELSE 0 END)`).bind(crypto.randomUUID(),MAIL_EVENTS,setup.version),
      env.DB.prepare("INSERT INTO pier_records(kind,id,version,data) VALUES('printMailEvents',?,1,?) ON CONFLICT(kind,id) DO NOTHING").bind(id,JSON.stringify({id,version:1,documentId:document.id,outcome:'failed',provider:setup.provider,createdAt:at})),
      env.DB.prepare("UPDATE pier_mail_deliveries SET phase='failed',error='The provider reported a bounced or rejected delivery.',at=? WHERE correspondence_id=?").bind(at,document.id),
      env.DB.prepare('UPDATE pier_meta SET version=version+1 WHERE id=1'),env.DB.prepare('DELETE FROM pier_guard'),
    ]);
  }
  return Response.json({ok:true},{headers:{'cache-control':'no-store'}});
}
