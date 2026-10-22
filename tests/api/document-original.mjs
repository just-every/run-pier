/** A real multipage PDF original for intake journeys; no application state. */
export function documentOriginal(pages) {
  const objects=['','<< /Type /Catalog /Pages 2 0 R >>','','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
  const children=[];
  const escape=value=>value.replace(/[\\()]/g,'\\$&');
  for(const lines of pages){
    const index=objects.length;children.push(`${index} 0 R`);
    const stream=`BT /F1 11 Tf 15 TL 35 790 Td ${lines.map((line,i)=>`${i?'T* ':''}(${escape(line)}) Tj`).join('\n')} ET`;
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${index+1} 0 R >>`,`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  }
  objects[2]=`<< /Type /Pages /Kids [${children.join(' ')}] /Count ${pages.length} >>`;
  let result='%PDF-1.4\n';const offsets=[0];
  for(let i=1;i<objects.length;i++){offsets.push(result.length);result+=`${i} 0 obj\n${objects[i]}\nendobj\n`;}
  const xref=result.length;
  result+=`xref\n0 ${objects.length}\n0000000000 65535 f \n`+offsets.slice(1).map(n=>`${String(n).padStart(10,'0')} 00000 n \n`).join('')+`trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(result,'ascii');
}
