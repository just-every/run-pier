import { decimal, format, fresh, get, requireRole, row, text, fail, type Context, type State, type Row } from './model';
const owners = ['item','customer','supplier','order'];
function owner(s: State, kind: string, id: string) {
  if (!owners.includes(kind)) return fail('CUSTOM_OWNER','Choose item, customer, supplier or order.');
  const record = get(s,kind === 'item' ? 'items' : kind === 'order' ? 'orders' : 'parties',id);
  if (['customer','supplier'].includes(kind) && record.kind !== kind) fail('CUSTOM_OWNER','The record has a different owner type.');
  return record;
}
export function typedFields(s: State, kind: string, values: any) {
  if (!values || typeof values !== 'object' || Array.isArray(values) || Object.keys(values).length > 50) return fail('CUSTOM_FIELDS','Supply at most 50 named field values.');
  return Object.fromEntries(Object.entries(values).map(([key,value]) => {
    const definition = s.customFieldDefinitions.find(d=>d.ownerType === kind && d.key === key) ?? fail('CUSTOM_FIELD',`Unknown ${kind} custom field ${key}.`);
    if (value === null) return [key,null];
    if (definition.type === 'text') return [key,text(value,definition.label)];
    if (definition.type === 'number') return [key,format(decimal(value))];
    if (definition.type === 'boolean' && typeof value === 'boolean') return [key,value];
    if (definition.type === 'date' && typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value+'T00:00:00Z')) && new Date(value+'T00:00:00Z').toISOString().slice(0,10) === value) return [key,value];
    if (definition.type === 'choice' && definition.options.includes(value)) return [key,value];
    return fail('CUSTOM_VALUE',`Invalid ${definition.type} value for ${definition.label}.`);
  }));
}
export function customFieldCommands(c: Context, type: string, p: any): Row | undefined {
  if (!type.startsWith('customField.')) return;
  requireRole(c,[]);
  if (type === 'customField.define') {
    if (!owners.includes(p.ownerType) || typeof p.key !== 'string' || !/^[a-z][a-z0-9_]{0,49}$/.test(p.key) || !['text','number','boolean','date','choice'].includes(p.type)) fail('CUSTOM_DEFINITION','Choose an owner type, stable lowercase field key and supported type.');
    if (c.s.customFieldDefinitions.some(d=>d.ownerType === p.ownerType && d.key === p.key)) fail('CUSTOM_DEFINITION','Field keys and types are immutable. Use the existing definition or define a new key.');
    if (c.s.customFieldDefinitions.filter(d=>d.ownerType===p.ownerType).length >= 50) fail('CUSTOM_DEFINITION','At most 50 fields per owner type.');
    const options = p.type === 'choice' ? p.options : [];
    if (!Array.isArray(options) || (p.type === 'choice' && (!options.length || options.length>50 || options.some(v=>typeof v!=='string'||!v.trim()||v.length>200)||new Set(options).size!==options.length))) fail('CUSTOM_DEFINITION','Use 1 to 50 distinct nonempty choices.');
    return row(c,'customFieldDefinitions',{ownerType:p.ownerType,key:p.key,label:text(p.label),type:p.type,options});
  }
  if (type === 'customField.set') {
    const record = owner(c.s,p.ownerType,p.recordId); fresh(record,p.version);
    record.customFields = {...record.customFields,...typedFields(c.s,p.ownerType,p.values)};
    record.version++; return record;
  }
  if (type === 'customField.import') {
    if (p.stateVersion !== c.s.version) fail('STALE','Records changed. Review the import again.');
    if (!Array.isArray(p.rows) || !p.rows.length || p.rows.length>200) fail('CUSTOM_IMPORT','Import 1 to 200 reviewed rows.');
    const seen=new Set();
    const resolved = p.rows.map((entry:any)=>{
      const key=JSON.stringify([entry.ownerType,entry.recordId]);
      if(seen.has(key))fail('CUSTOM_IMPORT','Each record may occur only once.');seen.add(key);
      const record=owner(c.s,entry.ownerType,entry.recordId);fresh(record,entry.version);
      return {record,values:typedFields(c.s,entry.ownerType,entry.values)};
    });
    for(const {record,values} of resolved){record.customFields={...record.customFields,...values};record.version++;}
    return {id:c.commandId,version:1,records:resolved.map(({record}: {record: Row})=>record)};
  }
}
export function customFieldRead(c: Context, params: URLSearchParams) {
  requireRole(c,[]);
  const kind=params.get('ownerType')??'', key=params.get('field')??'';
  const definition=c.s.customFieldDefinitions.find(d=>d.ownerType===kind&&d.key===key)??fail('CUSTOM_FIELD','Choose a defined owner type and field.');
  let value:any;try{value=JSON.parse(params.get('value')??'null');}catch{return fail('CUSTOM_VALUE','Use a JSON-encoded typed value.');}
  value=typedFields(c.s,kind,{[key]:value})[key];
  const records=kind==='item'?c.s.items:kind==='order'?c.s.orders:c.s.parties.filter(p=>p.kind===kind);
  return {definition,records:records.filter(r=>Object.hasOwn(r.customFields??{},key)&&r.customFields[key]===value)};
}

// New arbitrary field content stays private until wider authority is approved.
export function customFieldProjection(value: unknown, actor: {role:string}, privateFields=false): any {
  if (actor.role === 'owner' || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(v=>customFieldProjection(v,actor,privateFields));
  return Object.fromEntries(Object.entries(value).filter(([key])=>!['customFields','customFieldDefinitions',...(privateFields?['imports']:[])].includes(key)).map(([key,v])=>[key,customFieldProjection(v,actor,privateFields)]));
}

export function privateFieldCustody(s: State) {
  return s.customFieldDefinitions.length > 0 || s.imports.some(batch=>batch.source?.records?.some((record:any)=>record.kind==='customFieldDefinitions'));
}

export const typedErasureRefusal = 'Erasure refused: subject attribution and governed erasure for arbitrary custom-field content and retained copies are not configured. Owner setup is required before Pier can identify and erase this subject’s content. No content was deleted by this request.';
