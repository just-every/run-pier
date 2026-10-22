import type { Bindings } from '../../auth.server';
import { seal } from '../channels/secrets';
import { fail, fresh, row, text, type Context } from '../model';
export const MAIL_EVENTS='pier-print-delivery';
export async function mailSettings(c:Context,type:string,p:any,env:Bindings){
  if(!['print.delivery.configure','print.delivery.revoke'].includes(type))return;
  const old=c.s.businessTemplates.find(r=>r.id===MAIL_EVENTS);if(old)fresh(old,p.version);else if(p.version!==0)fail('STALE','Reload delivery event settings.');
  if(type==='print.delivery.revoke'){
    if(!old)return fail('DELIVERY_SETUP','No delivery verification is configured.');
    Object.assign(old,{enabled:false,version:old.version+1});return old;
  }
  if(p.consent!==true||!['sendgrid','resend'].includes(p.provider))fail('DELIVERY_CONSENT','Authorize signed delivery notifications from SendGrid or Resend.');
  const key=text(p.verificationKey,'Delivery verification key');
  c.channelSecrets=[...(c.channelSecrets??[]),{channelId:MAIL_EVENTS,secret:await seal(env,MAIL_EVENTS,{key})}];
  const data={provider:p.provider,enabled:true,approvedBy:c.actor.id,approvedAt:c.now};
  return old?Object.assign(old,data,{version:old.version+1}):row(c,'businessTemplates',{id:MAIL_EVENTS,...data});
}
