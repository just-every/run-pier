export function inboundNotice(poNumber, items, sscc = '006141411234567890') {
  const body = ['ST*856*0001', 'BSN*00*synthetic-pier-notice*20261023*1200', 'HL*1**S', 'HL*2*1*O', `PRF*${poNumber}`, 'HL*3*2*P', `MAN*GM*00${sscc}`];
  items.forEach((item, index) => body.push(`HL*${index + 4}*3*I`, `LIN**SK*${item.sku}`, `SN1**${item.quantity}*EA`));
  const isa = ['ISA','00',''.padEnd(10),'00',''.padEnd(10),'ZZ','SUPPLIER'.padEnd(15),'ZZ','PIER'.padEnd(15),'261023','1200','U','00401','000000001','0','T',':'].join('*');
  return `${isa}~GS*SH*SUPPLIER*PIER*20261023*1200*1*X*004010~${body.join('~')}~SE*${body.length + 1}*0001~GE*1*1~IEA*1*000000001~`;
}
