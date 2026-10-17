import { sha256 } from '../../import-kit';
import type { BookDocument, BooksAdapterConfig } from './types';
export class PantryRefusal extends Error {
  safeCreationRefusal=false;
  constructor(message:string,public status:number){super(message);}
}
export const PANTRY_CREDENTIAL=/^pantry_integration_[A-Za-z0-9_-]+$/;
/** Pantry's scoped integration API: a revocable bearer credential, never a person's session. */
export function pantryClient(config: BooksAdapterConfig) {
  const origin=new URL(config.baseUrl).origin;
  const request=async(path:string,body?:unknown,idempotencyKey?:string) => {
    const response=await (config.fetch ?? fetch)(origin+'/api/pantry/integration/v1/'+path,{method:body===undefined?'GET':'POST',redirect:'manual',headers:{authorization:`Bearer ${config.credentials.integrationToken}`,origin,'content-type':'application/json',...(idempotencyKey?{'idempotency-key':idempotencyKey}:{})},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(10000)});
    const value:any=await response.json().catch(()=>({}));
    if(!response.ok) throw new PantryRefusal(typeof value.error==='string'?value.error:'Pantry refused this request. Check its business setup and permissions.',response.status);
    return value;
  };
  const post=async(path:string,body:unknown,doc:BookDocument,operation:string)=>{
    // Bound the key independently of source-key length; each source operation
    // keeps the same identity after response loss, reconnect or restore.
    const key=`pier:${sha256(doc.key)}:${operation}`;
    try{return await request(path,body,key);}catch(error){
      if(error instanceof PantryRefusal&&['contacts','invoices','bills','journals','documents'].includes(path))error.safeCreationRefusal=true;
      throw error;
    }
  };
  const matching=(rows:any[],predicate:(r:any)=>boolean) => {
    const matches=rows.filter(predicate);
    if(matches.length>1) throw new PantryRefusal('More than one Pantry record has this Pier reference. Review the duplicates in Pantry before continuing.',409);
    return matches[0]??null;
  };
  const attachment=async(doc:BookDocument,linkedId?:string) => {
    if(!doc.attachment) return null;
    const rows=(await request('documents?name='+encodeURIComponent(doc.attachment.name))).documents;
    const found=matching(rows,r=>r.name===doc.attachment!.name);
    if(found && (found.sha256!==sha256(doc.attachment.content) || (linkedId && found.linked_id!==linkedId))) throw new PantryRefusal('The evidence with this Pier reference differs in Pantry. Review the source and attached document.',409);
    return found;
  };
  const upload=async(doc:BookDocument,linkedId?:string) => {
    const old=await attachment(doc,linkedId); if(old)return old;
    const bytes=new TextEncoder().encode(doc.attachment!.content);
    return post('documents',{name:doc.attachment!.name,mediaType:'text/plain',base64:btoa(String.fromCharCode(...bytes)),linkedKind:linkedId?'bill':'none',...(linkedId?{linkedId}:{}),note:`Pier source ${doc.key}. Goods receipt evidence; payment remains separate.`},doc,'evidence:'+sha256(doc.attachment!.name).slice(0,16));
  };
  const contact=async(doc:BookDocument) => {
    const kind=doc.party!.kind==='supplier'?'vendor':'customer';
    return post('contacts',{externalId:doc.party!.id,kind,name:doc.party!.name,termsDays:30},doc,'contact');
  };
  const payments=async(kind:'bill'|'invoice',id:string) => {
    const rows:any[]=[],seen=new Set<string>();
    let cursor:string|null=null;
    do {
      const query:URLSearchParams=new URLSearchParams({[kind+'Id']:id,...(cursor?{cursor}:{})});
      const page=await request('payments?'+query);
      if(!Array.isArray(page.payments)||(page.nextCursor!==null&&typeof page.nextCursor!=='string'))throw new PantryRefusal('Pantry returned an incomplete payment page. Restore payment visibility before reconciling.',502);
      rows.push(...page.payments);
      cursor=page.nextCursor;
      if(cursor){
        if(seen.has(cursor))throw new PantryRefusal('Pantry repeated a payment cursor. Restore payment visibility before reconciling.',502);
        seen.add(cursor);
      }
    }while(cursor);
    return rows;
  };
  return {request,post,matching,attachment,upload,contact,payments};
}
