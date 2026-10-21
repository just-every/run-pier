import { fail } from './model';
/** Scanner-decoded GS1 element strings: human-readable AIs or FNC1 separators. */
export function gs1(raw: unknown): {code:string;trace?:{lot?:string;serial?:string;expiry?:string;productionDate?:string}} | null {
  if(typeof raw!=='string')return null;
  let input=raw.replace(/^\](?:C1|d2|Q3)/,'');
  if(!input.startsWith('(01)')&&!/^01\d{14}/.test(input))return null;
  const fields:Record<string,string>={};
  if(input.startsWith('(')) {
    const re=/\((01|10|11|17|21)\)([^()]*)/g;let match,used='';
    while((match=re.exec(input))){if(fields[match[1]])fail('GS1','Repeated GS1 application identifier.');fields[match[1]]=match[2];used+=match[0];}
    if(used!==input)fail('GS1','Unsupported or malformed GS1 fields.');
  }else{
    while(input){input=input.replace(/^\x1d/,'');if(!input)break;const ai=input.slice(0,2);input=input.slice(2);const fixed=ai==='01'?14:['11','17'].includes(ai)?6:null;
      if(!['01','10','11','17','21'].includes(ai)||fields[ai])fail('GS1','Unsupported or repeated GS1 application identifier.');
      if(fixed){fields[ai]=input.slice(0,fixed);input=input.slice(fixed);}else{const at=input.indexOf('\x1d');fields[ai]=at<0?input:input.slice(0,at);input=at<0?'':input.slice(at+1);}
    }
  }
  if(!/^\d{14}$/.test(fields['01']??''))fail('GS1','A GS1 stock scan needs its 14-digit GTIN.');
  const date=(v:string)=>{if(!/^\d{6}$/.test(v))return fail('GS1_DATE','Use a GS1 YYMMDD date.');const year=2000+Number(v.slice(0,2)),month=Number(v.slice(2,4)),day=Number(v.slice(4));const d=day===0?new Date(Date.UTC(year,month,0)):new Date(Date.UTC(year,month-1,day));if(d.getUTCFullYear()!==year||d.getUTCMonth()!==month-1)return fail('GS1_DATE','Invalid GS1 date.');return d.toISOString().slice(0,10);};
  return {code:fields['01'],trace:{...(fields['10']?{lot:fields['10']}:{}),...(fields['21']?{serial:fields['21']}:{}),...(fields['17']?{expiry:date(fields['17'])}:{}),...(fields['11']?{productionDate:date(fields['11'])}:{})}};
}
