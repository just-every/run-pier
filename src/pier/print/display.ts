/** Business particulars render as labeled text rather than storage JSON. */
export function businessParticulars(value: unknown): string {
  if(value==null)return '';
  if(Array.isArray(value))return value.map(businessParticulars).join('; ');
  if(typeof value==='object')return Object.entries(value).filter(([,entry])=>entry!=null&&entry!=='').map(([key,entry])=>`${key.replace(/([a-z])([A-Z])/g,'$1 $2').replace(/^./,letter=>letter.toUpperCase())}: ${businessParticulars(entry)}`).join('\n');
  return String(value);
}
export function paymentTerms(terms:any):string{
  const labels:Record<string,string>={dueReceipt:'Due on receipt',net15:'Net 15',net30:'Net 30',net60:'Net 60',eom:'End of month'};
  if(terms?.kind==='earlyDiscount')return `${terms.discountPercent}% discount within ${terms.withinDays} days; net ${terms.netDays} days${terms.earlyDiscount?.through?` · discount through ${terms.earlyDiscount.through}`:''}. Full balance remains due until an approved credit is applied.`;
  return labels[terms?.kind]??'Not supplied';
}
