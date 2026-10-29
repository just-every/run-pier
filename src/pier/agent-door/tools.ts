import { ToolRefusal, type ToolDefinition, type ToolContext, type JsonSchema, type JsonSchemaObject } from '../../modules/agent-door/index.ts';
import type { Bindings } from '../../auth.server';
import { stockOutput, questionOutput, activityOutput, preparationOutput, purchaseOutput, sendOutput } from './schemas';
import { nativeCommand, nativeView, refusal } from './native';
import { nativeActor } from './people';
import { load } from '../storage';
import { get, requireRole } from '../model';
import { admitScopedCommand } from '../permissions';
import { admitCommercialCommand } from '../role-visibility';
import { expectedLandedCost } from '../purchasing-workflow';
import { deliverCorrespondence } from '../correspondence-delivery';

const text = {type:'string',minLength:1,maxLength:2000};
const object = (properties: Record<string,JsonSchema>, required: string[]=[]): JsonSchemaObject => ({type:'object',properties,required,additionalProperties:false});
const stringList = {type:'array',minItems:1,items:text};
const line = object({itemId:text,quantity:text,price:text},['itemId','quantity','price']);
const purchase = object({supplierId:text,promiseDate:text,destinationWarehouse:text,freight:text,duty:text,tax:text,reason:text,lines:{type:'array',minItems:1,items:line},poId:text,version:{type:'integer'}},['supplierId','promiseDate','reason','lines']);
const proposal = object({kind:{type:'string',enum:['replenishment','reallocation','count-drift','migration']},evidence:stringList,assumptions:text,plan:{type:'object'}},['kind','evidence','assumptions']);
const bulk = object({rows:{type:'array',minItems:1,maxItems:50,items:object({type:{type:'string',enum:['po.revise','order.repromise']},payload:{type:'object'}},['type','payload'])},proposalId:text,version:{type:'integer'}},['rows']);

export function pierTools(env: Bindings): ToolDefinition[] {
  function read(name:string,title:string,kind:'stock'|'question'|'activity',schema:JsonSchemaObject,clauses:string[]):ToolDefinition {
    return {name,title,description:title,scope:`${kind}:read`,readOnly:true,inputSchema:schema,outputSchema:kind==='stock'?stockOutput:kind==='question'?questionOutput:activityOutput,classes:['standard'],clauses,
      classify:()=>[{class:'standard',facts:{measure:1}}],untrusted:true,
      run:async(args,ctx)=>({result:await nativeView(env,ctx,kind,args)})};
  }
  const draftCommand = (args:Record<string,unknown>) => args.operation === 'revise' ? 'po.revise' : 'po.draft';
  const prepareCommand = (args:Record<string,unknown>) => ({prepare:'proposal.prepare',check:'itemAgent.check',bulk_preview:'itemAgent.bulkPreview',bulk_edit:'itemAgent.bulkEdit'} as Record<string,string>)[String(args.operation)];
  async function admit(args:Record<string,unknown>,ctx:ToolContext,command:string) {
    const actor = await nativeActor(env,ctx.person), state = await load(env.DB);
    const roles = command.startsWith('po.') ? ['buyer','agent'] : command.startsWith('itemAgent.bulk') ? ['buyer','operator','agent'] : ['buyer','operator','warehouse','agent'];
    requireRole({s:state,actor,commandId:'',now:new Date().toISOString()},roles);
    admitScopedCommand(state,actor,command,args.payload); admitCommercialCommand(actor,command);
    return {actor,state};
  }
  const tools:ToolDefinition[] = [
    read('pier.stock.read','Inspect current stock and preparation receipts','stock',object({poId:text,proposalId:text}),['STOCK-001','TRACE-001','SURFACE-001']),
    read('pier.questions.ask','Ask a native stock, shortage or supplier question','question',object({kind:{type:'string',enum:['stock','orders','shortage','late','margin','supplier','allocation']},itemId:text,orderId:text,poId:text,supplierId:text,promiseDate:text,fromOrderId:text,toOrderId:text,from:text,to:text,quantity:text},['kind']),['AGENT-006']),
    read('pier.activity.read','Inspect current native activity','activity',object({commandId:text}),['AUDIT-001']),
    {name:'pier.proposals.prepare',title:'Prepare evidence for human review',description:'Prepare a proposal, item check or bulk review through the native command; this never approves or applies the proposed work.',scope:'proposals:write',readOnly:false,
      inputSchema:object({operation:{type:'string',enum:['prepare','check','bulk_preview','bulk_edit']},payload:{anyOf:[proposal,object({itemId:text},['itemId']),bulk]}},['operation','payload']),outputSchema:preparationOutput,classes:['standard'],clauses:['AGENT-001','AGENT-004','AGENT-005','SURFACE-002'],untrusted:true,
      classify:async(args,ctx)=>{const {state}=await admit(args,ctx,prepareCommand(args));return [{class:'standard',facts:{measure:args.operation==='check'?1:Math.max(1,Array.isArray((args.payload as any).rows)?(args.payload as any).rows.length:state.items.length)}}];},
      summary:async(args,ctx)=>{await admit(args,ctx,prepareCommand(args));return {target:{name:`${args.operation} preparation`},items:[String((args.payload as any).kind??(args.payload as any).itemId??'bulk review')]};},
      revision:async(args)=> typeof (args.payload as any).proposalId==='string' ? (await load(env.DB)).proposals.find(row=>row.id===(args.payload as any).proposalId)?.version??null : null,
      run:async(args,ctx)=>({result:await nativeCommand(env,ctx,prepareCommand(args),args.payload as Record<string,unknown>)})},
    {name:'pier.purchasing.plan',title:'Prepare a purchase draft',description:'Draft or revise purchasing through Pier; a current human buyer must approve and commit the exact purchase separately.',scope:'purchasing:write',readOnly:false,
      inputSchema:object({operation:{type:'string',enum:['draft','revise']},payload:purchase},['operation','payload']),outputSchema:purchaseOutput,classes:['standard'],clauses:['BUY-001','BUY-005','BUY-008','AGENT-002'],untrusted:true,
      classify:async(args,ctx)=>{await admit(args,ctx,draftCommand(args));return [{class:'standard',facts:{measure:(args.payload as any).lines.length}}];},
      summary:async(args,ctx)=>{const {state}=await admit(args,ctx,draftCommand(args));const p=args.payload as any;return {target:{...(p.poId?{id:p.poId}:{}),name:get(state,'parties',p.supplierId).name},items:p.lines.map((l:any)=>`${l.quantity} ${get(state,'items',l.itemId).sku}`)};},
      revision:async(args)=>typeof (args.payload as any).poId==='string' ? (await load(env.DB)).purchaseOrders.find(row=>row.id===(args.payload as any).poId)?.version??null:null,
      run:async(args,ctx)=>({result:await nativeCommand(env,ctx,draftCommand(args),args.payload as Record<string,unknown>)})},
    {name:'pier.purchasing.send',title:'Send one exact human-authorized purchase',description:'Send only an already committed purchase with current exact native buyer send authority; unknown provider outcomes are retained and never blindly resent.',scope:'purchasing:send',readOnly:false,
      inputSchema:object({poId:text,version:{type:'integer'}},['poId','version']),outputSchema:sendOutput,classes:['external','commitment'],clauses:['BUY-006','AGENT-003','SURFACE-003'],untrusted:true,
      classify:async(args,ctx)=>{const {state}=await admit({payload:args},ctx,'po.sendApproved');const po=get(state,'purchaseOrders',String(args.poId));const value=Number(expectedLandedCost(po).total);if(!Number.isSafeInteger(value))throw new ToolRefusal('monetary_precision_unsupported');return [{class:'external',facts:{measure:1,counterparty:state.parties.some(row=>row.id===po.supplierId)?'known':'new'}},{class:'commitment',facts:{measure:value,currency:'USD',counterparty:'known'}}];},
      summary:async(args,ctx)=>{const {state}=await admit({payload:args},ctx,'po.sendApproved');const po=get(state,'purchaseOrders',String(args.poId));return {target:{id:po.id,name:po.reference},recipients:po.sendPolicy?[po.sendPolicy.recipient]:[],amount:{value:Number(expectedLandedCost(po).total),currency:'USD'},payee:state.parties.find(row=>row.id===po.supplierId)?.name};},
      target:async(args,ctx)=>{const {state}=await admit({payload:args},ctx,'po.sendApproved');return {kind:'purchase-order',id:get(state,'purchaseOrders',String(args.poId)).id};},
      revision:async args=>(await load(env.DB)).purchaseOrders.find(row=>row.id===args.poId)?.version??null,
      run:async(args,ctx)=>{const actor=await nativeActor(env,ctx.person,ctx);const result=await nativeCommand(env,ctx,'po.sendApproved',args) as any;const deliveries=await deliverCorrespondence(env,new Date().toISOString(),result.id,actor);return {result:{...result,deliveries}};}}
  ];
  return tools.map(tool => ({...tool,
    classify: async (args,ctx) => {try {return await tool.classify(args,ctx);} catch(error) {return refusal(error);}},
    ...(tool.summary ? {summary: async (args:Record<string,unknown>,ctx:ToolContext) => {try {return await tool.summary!(args,ctx);} catch(error) {return refusal(error);}}} : {}),
    ...(tool.target ? {target: async (args:Record<string,unknown>,ctx:ToolContext) => {try {return await tool.target!(args,ctx);} catch(error) {return refusal(error);}}} : {}),
  }));
}
