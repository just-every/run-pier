import type { JsonSchema } from '../../modules/agent-door/index.ts';

const text = {type:'string'};
const integer = {type:'integer'};
const identity = {type:'object',required:['id','version'],properties:{id:text,version:integer}};
const record = (required:string[],properties:Record<string,JsonSchema>):JsonSchema => ({type:'object',required,properties});
const array = (items:JsonSchema):JsonSchema => ({type:'array',items});
const revision = record(['id','version','status'],{id:text,version:integer,status:text});

export const stockOutput = record(['version','items','locations','positions','proposals','purchases'],{
  version:integer,
  items:array(record(['id','version','sku','name','unit','packSize'],{id:text,version:integer,sku:text,name:text,unit:text,packSize:text,archived:{type:'boolean'}})),
  locations:array(record(['id','version','name','warehouse','kind'],{id:text,version:integer,name:text,warehouse:text,kind:text})),
  positions:array(record(['itemId','locationId','status','quantity','reserved','available'],{itemId:text,locationId:text,status:text,quantity:text,reserved:text,available:text})),
  proposals:array(revision),purchases:array(revision),purchase:revision,proposal:revision,
});
export const questionOutput = record(['kind','stateVersion','observedAt','uncertainty'],{
  kind:text,stateVersion:integer,observedAt:text,uncertainty:text,answer:{type:'object'},evidence:{type:['object','array']},orders:array(record(['id'],{id:text,version:integer})),
});
export const activityOutput = record(['events'],{
  events:array(record(['id','at','actorId','commandId','type','outcome','changes'],{id:text,at:text,actorId:text,commandId:text,type:text,outcome:text,changes:array({type:'object'})})),
});
export const preparationOutput = record(['id','version','kind','status','preparation'],{
  id:text,version:integer,kind:text,status:text,
  preparation:record(['actorId','at'],{actorId:text,at:text}),
});
export const purchaseOutput = record(['id','version','reference','supplierId','promiseDate','status','lines'],{
  id:text,version:integer,reference:text,supplierId:text,promiseDate:text,status:text,
  lines:array(record(['id','itemId','quantity'],{id:text,itemId:text,quantity:text,price:text,received:text})),
});
export const sendOutput = record(['id','version','kind','recordId','recipient','deliveries'],{
  id:text,version:integer,kind:text,recordId:text,recipient:text,
  deliveries:array(record(['correspondenceId','phase','providerMessageId','error','at'],{
    correspondenceId:text,phase:text,providerMessageId:{type:['string','null']},error:{type:['string','null']},at:text,
  })),
});
