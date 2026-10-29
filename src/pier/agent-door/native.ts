import type { Bindings } from '../../auth.server';
import { ToolRefusal, type ToolContext } from '../../modules/agent-door/index.ts';
import { execute } from '../api';
import { nativeActor } from './people';
import { sha256, canonicalJson } from '../import-kit';
import { load } from '../storage';
import { Problem, positions } from '../model';
import { admitRead, commandProjection, roleState } from '../role-reads';
import { privateFieldCustody, customFieldProjection } from '../custom-fields';
import { pickFields } from '../physical-documents';
import { physicalState } from '../permissions';
import { liveQuestion } from '../item-agent/questions';
import { auditRows } from '../audit';

// Finite native agent work; never accepts an arbitrary command from an MCP caller.
const commands = new Set(['proposal.prepare','po.draft','po.revise','po.sendApproved','itemAgent.check','itemAgent.bulkPreview','itemAgent.bulkEdit','replenishment.compare','replenishment.review','po.approvalRoute']);
export async function nativeCommand(env: Bindings, ctx: ToolContext, type: string, payload: Record<string,unknown>) {
  if (!commands.has(type)) throw new ToolRefusal('native_human_required');
  try {
    const actor = await nativeActor(env, ctx.person, ctx);
    const key = `door-${sha256(canonicalJson({agent:ctx.agent.id,key:ctx.idempotencyKey}))}`;
    const response = await execute(env, actor, key, type, payload);
    if (!response) throw new ToolRefusal('native_busy');
    const state = await load(env.DB);
    return JSON.parse(JSON.stringify(customFieldProjection(commandProjection(response.result,actor),actor,privateFieldCustody(state))));
  } catch (error) { return refusal(error); }
}
export function refusal(error: unknown): never {
  if (error instanceof Problem) throw new ToolRefusal(error.code === 'STALE' ? 'revision_conflict' : error.code.toLowerCase());
  throw error;
}
export async function nativeView(env: Bindings, ctx: ToolContext, kind: 'stock'|'question'|'activity', args: Record<string,unknown>) {
  try {
    const actor = await nativeActor(env,ctx.person,ctx), full = await load(env.DB);
    if (kind === 'activity') {
      admitRead(actor,new URL('/api/pier/audit',env.AUTH_ORIGIN));
      return { events: (await auditRows(env.DB)).filter(event => !args.commandId || event.commandId === args.commandId) };
    }
    if (kind === 'question') {
      const params = new URLSearchParams(Object.entries(args).filter(([,v])=>typeof v==='string') as [string,string][]);
      admitRead(actor,new URL(`/api/pier/questions?${params}`,env.AUTH_ORIGIN));
      return liveQuestion(full,actor,params);
    }
    admitRead(actor,new URL('/api/pier/state',env.AUTH_ORIGIN));
    const visible = roleState(full,actor,{...full,positions:positions(physicalState(full,actor))} );
    // A stable native witness with the same location and field visibility as Stock.
    const purchase = full.purchaseOrders.find(row=>row.id===args.poId);
    const proposal = visible.proposals.find((row:any)=>row.id===args.proposalId && row.preparation?.actorId===actor.id);
    return { ...(purchase && visible.purchaseOrders.some((row:any)=>row.id===purchase.id) ? {purchase:{id:purchase.id,version:purchase.version,status:purchase.status}}:{}), ...(proposal?{proposal:{id:proposal.id,version:proposal.version,status:proposal.status}}:{}), version:full.version, items:visible.items.map((row:any)=>pickFields(row,['sku','name','unit','packSize','archived'])), locations:visible.locations, positions:visible.positions,
      proposals: visible.proposals.filter((row:any)=>row.preparation?.actorId===actor.id).map((row:any)=>({id:row.id,version:row.version,status:row.status,kind:row.kind,preparation:row.preparation})),
      purchases: visible.purchaseOrders.map((row:any)=>({id:row.id,version:row.version,status:row.status})) };
  } catch(error) { return refusal(error); }
}
