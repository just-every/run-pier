import { createAgentDoor, type Trust } from '../../modules/agent-door/index.ts';
import { runtimeBindings, type Bindings } from '../../auth.server';
import { pierPeople } from './people';
import { pierTools } from './tools';

export const capabilities = ['tools','policy','pause','audit','idempotency'] as const;
export const notTools = [
  {clauses:['SCAN-001','SCAN-002','WMS-001','WMS-004','WMS-005'],reason:'device' as const},
  {clauses:['UX-001'],reason:'screen' as const},
  {clauses:['MIGRATE-001','MIGRATE-002'],reason:'import-door' as const},
  {clauses:['CHANNEL-001','CHANNEL-004','CHANNEL-005','CHANNEL-006'],reason:'connector' as const},
  {clauses:['SEC-001','SEC-002','API-001','SCALE-001','OPS-001','OPEN-001'],reason:'installation' as const},
];
function trust(env: Bindings):Trust|null {
  const issuer=env.RER_OWNER_CLAIM_ISSUER,installationId=env.RER_OWNER_CLAIM_INSTALLATION_ID,publicKeys=env.RER_OWNER_CLAIM_PUBLIC_KEYS;
  if (![issuer,installationId,publicKeys].some(Boolean)) return null;
  if (!issuer||!installationId||!publicKeys) throw new Error('Incomplete existing owner-claim trust');
  return {issuer,installationId,appOrigin:env.AUTH_ORIGIN,publicKeys:JSON.parse(publicKeys)};
}
export function pierAgentDoor(original:Bindings) {
  const env=runtimeBindings(original);
  return createAgentDoor({seed:'pier',name:'Pier',specialist:'inventory-controller',db:env.DB,origin:env.AUTH_ORIGIN,trust:trust(env),
    capabilities,people:pierPeople(env),tools:pierTools(env),resources:[],notTools});
}
