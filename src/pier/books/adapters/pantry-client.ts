import { sha256 } from '../../import-kit';
import type { BookDocument, BooksAdapterConfig } from './types';
export class PantryRefusal extends Error {
  safeCreationRefusal=false;
  constructor(message:string,public status:number){super(message);}
}
export function pantryClient(config: BooksAdapterConfig) {
  const origin=new URL(config.baseUrl).origin;
  const request=async(path:string,body?:unknown) => {
    const response=await (config.fetch ?? fetch)(origin+'/api/pantry/'+path,{method:body===undefined?'GET':'POST',redirect:'manual',headers:{cookie:config.credentials.sessionCookie,origin,'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(10000)});
    const value:any=await response.json();
    if(!response.ok) throw new PantryRefusal(typeof value.error==='string'?value.error:'Pantry refused this request. Check its business setup and permissions.',response.status);
    return value;
  };
  const command=async(action:string,body:unknown)=>{
    try{return await request('command/'+action,body);}catch(error){
      if(error instanceof PantryRefusal&&['contact.save','invoice.save-draft','bill.save','journal.save-draft','document.upload'].includes(action))error.safeCreationRefusal=true;
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
    const rows=(await request('documents')).documents;
    const found=matching(rows,r=>r.name===doc.attachment!.name);
    if(found && (found.sha256!==sha256(doc.attachment.content) || (linkedId && found.linked_id!==linkedId))) throw new PantryRefusal('The evidence with this Pier reference differs in Pantry. Review the source and attached document.',409);
    return found;
  };
  const upload=async(doc:BookDocument,linkedId?:string) => {
    const old=await attachment(doc,linkedId); if(old)return old;
    const bytes=new TextEncoder().encode(doc.attachment!.content);
    return command('document.upload',{name:doc.attachment!.name,mediaType:'text/plain',base64:btoa(String.fromCharCode(...bytes)),linkedKind:linkedId?'bill':'none',...(linkedId?{linkedId}:{}),note:`Pier source ${doc.key}. Goods receipt evidence; payment remains separate.`});
  };
  const contact=async(doc:BookDocument) => {
    const kind=doc.party!.kind==='supplier'?'vendor':'customer';
    const state=await request('state');
    const found=matching(state.contacts,r=>r.kind===kind&&r.name===doc.party!.name);
    if(found){if(!found.active)throw new PantryRefusal('The customer or supplier is inactive in Pantry. Reactivate it there or review the source party.',409);return found;}
    return command('contact.save',{kind,name:doc.party!.name,termsDays:30});
  };
  return {request,command,matching,attachment,upload,contact};
}
