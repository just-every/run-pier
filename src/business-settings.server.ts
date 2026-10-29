import { createBusinessSettings } from './modules/business-settings/index.ts';
import { createOperatorAuth } from './modules/operator-auth/index.mjs';
import { authConfig, type Bindings } from './auth.server';
import { operatorMail } from './mail.server.mjs';

export const businessManifest = {settings:1 as const,values:['display_name' as const],team:{roles:{admin:'admin',member:'member'}}};
export function businessSettings(env:Bindings) {
  const auth=createOperatorAuth({db:env.DB,config:authConfig(env),mailSender:operatorMail(env),clientIp:request=>request.headers.get('CF-Connecting-IP')??''});
  return createBusinessSettings({db:env.DB,trust:env.RER_BUSINESS_TRUST,business:businessManifest,team:auth.businessTeam});
}
