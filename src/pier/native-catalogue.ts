import { fail } from './model';
const fields: Record<string,string[]> = {
  items:['caseBarcode','barcodes','references','variantFamily','category','imageUrl','weight','dimensions','archived','customFields'],
  parties:['customFields'], orders:['customFields'],
};
export function nativeMetadata(kind:string, raw:unknown): Record<string,any> {
  if(raw === undefined || raw === '')return {};
  let value:any;try{value=JSON.parse(String(raw));}catch{return fail('NATIVE_METADATA','Metadata must be a JSON object in a quoted CSV cell.');}
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!fields[kind]?.includes(key)))fail('NATIVE_METADATA','Metadata contains unsupported fields for this record kind.');
  return value;
}
export function exitMetadata(kind:string, record:Record<string,any>) {
  const value=Object.fromEntries((fields[kind]??[]).filter(key=>record[key]!==undefined&&record[key]!==null&&record[key]!==false&&!(Array.isArray(record[key])&&!record[key].length)).map(key=>[key,record[key]]));
  return JSON.stringify(value);
}
