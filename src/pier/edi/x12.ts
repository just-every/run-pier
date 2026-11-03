import { validateSscc } from './sscc';

export interface X12Identifier { qualifier: string; value: string }
export interface X12ShipTo { name: string; qualifier?: string; code?: string; address1?: string; address2?: string; city?: string; state?: string; postalCode?: string; country?: string }
export interface X12Line { lineNumber: string; quantity: string; unit: string; unitPrice?: string; identifiers: X12Identifier[]; status?: 'IA' | 'IB' | 'IR' | 'IQ'; ackQuantity?: string; reason?: string; arrivalDate?: string }
interface Controls { senderId: string; receiverId: string; interchangeControl: string; groupControl: string; transactionControl: string }
export interface Parsed850 extends Controls { poNumber: string; poDate: string; purposeCode: string; orderType: string; unmappedSegments: string[][]; arrivalDate?: string; shipTo?: X12ShipTo; lines: (X12Line & { unitPrice: string })[] }
export interface Parsed997 extends Controls { sourceGroupControl: string; sourceTransactionControl?: string; sourceTransactionType?: string; acknowledgment: 'A' | 'E' | 'R'; errors: string[][] }
export interface X12Input {
  senderId: string; receiverId: string; senderQualifier?: string; receiverQualifier?: string; usageIndicator?: 'T' | 'P';
  poNumber?: string; poDate?: string; groupControl?: string; transactionControl?: string;
  sourceGroupControl?: string; sourceTransactionControl?: string; sourceTransactionType?: string; sourceFunctionalCode?: string;
  acknowledgment?: 'A' | 'R'; ackType?: 'AD' | 'AC' | 'RD'; lines?: X12Line[]; shipTo?: X12ShipTo;
  shipmentId?: string; shipDate?: string; cartons?: { sscc: string; lines: X12Line[] }[];
  invoiceNumber?: string; invoiceDate?: string; totalCents?: string;
}
const fail = (message: string): never => { throw new Error(`X12: ${message}`); };
const required = (value: string | undefined, field: string): string => value?.trim() || fail(`${field} is required`);
function digits(value: string, field: string, min = 1, max = 9): string {
  if (!new RegExp(`^\\d{${min},${max}}$`).test(value)) fail(`${field} must have ${min}–${max} digits`);
  return value;
}
function decimal(value: string | undefined, field: string, positive = false): string {
  const v = required(value, field);
  if (!/^\d{1,10}(?:\.\d{1,6})?$/.test(v) || (positive && !/[1-9]/.test(v))) fail(`${field} must be an exact ${positive ? 'positive' : 'nonnegative'} decimal`);
  return v;
}
function date(value: string | undefined, field: string): string {
  const v = required(value, field).replaceAll('-', '');
  if (!/^\d{8}$/.test(v)) fail(`${field} must be YYYYMMDD or YYYY-MM-DD`);
  const iso = `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}`;
  const parsed = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== iso) fail(`${field} is not a calendar date`);
  return iso;
}
const compactDate = (value: string | undefined, field: string) => date(value, field).replaceAll('-', '');
const exactly = (rows: string[][], tag: string): string[] => {
  const found = rows.filter(row => row[0] === tag);
  if (found.length !== 1) fail(`expected exactly one ${tag} segment`);
  return found[0];
};

/** Bounded, single-interchange/single-group/single-transaction 004010 profile. */
function envelope(raw: string, type: string): { controls: Controls; body: string[][]; gs: string[] } {
  if (typeof raw !== 'string' || raw.length > 1048576 || !raw.startsWith('ISA') || raw.length < 106) fail('expected a bounded fixed-width ISA envelope');
  const element = raw[3], component = raw[104], terminator = raw[105];
  if (new Set([element, component, terminator]).size !== 3 || [element, component].some(c => !/^[\x21-\x7e]$/.test(c) || /[A-Za-z0-9]/.test(c)) || /[A-Za-z0-9]/.test(terminator)) fail('invalid or colliding delimiters');
  if (!raw.trimEnd().endsWith(terminator) && terminator !== '\n' && terminator !== '\r') fail('missing segment terminator');
  const pieces = raw.split(terminator);
  if (pieces.pop()?.trim()) fail('unterminated trailing segment');
  if (pieces.length > 20000) fail('too many segments');
  const rows = pieces.map(part => part.replace(/^[\r\n]+|[\r\n]+$/g, '').split(element));
  if (rows.some(row => !/^[A-Z0-9]{2,3}$/.test(row[0]) || row.some(value => /[\r\n]/.test(value)))) fail('invalid segment or embedded line break');
  const isa = exactly(rows, 'ISA'), gs = exactly(rows, 'GS'), st = exactly(rows, 'ST'), se = exactly(rows, 'SE'), ge = exactly(rows, 'GE'), iea = exactly(rows, 'IEA');
  const lengths = [2,10,2,10,2,15,2,15,6,4,1,5,9,1,1,1];
  if (isa.length !== 17 || lengths.some((n, i) => isa[i + 1].length !== n) || isa[12] !== '00401') fail('invalid ISA width or unsupported ISA version');
  if (!/^\d{6}$/.test(isa[9]) || !/^\d{4}$/.test(isa[10]) || !['P','T','I'].includes(isa[15])) fail('invalid ISA date, time or usage indicator');
  digits(isa[13], 'ISA13', 9, 9); digits(gs[6] || '', 'GS06'); digits(st[2] || '', 'ST02', 4, 9);
  const s = rows.indexOf(st), e = rows.indexOf(se);
  if (rows[0] !== isa || rows[1] !== gs || s !== 2 || e !== rows.length - 3 || rows.at(-2) !== ge || rows.at(-1) !== iea) fail('invalid envelope nesting');
  if (gs.length !== 9 || gs[7] !== 'X' || gs[8] !== '004010') fail('unsupported functional group version');
  if (st[1] !== type || gs[1] !== ({'850':'PO','997':'FA','856':'SH'} as Record<string,string>)[type]) fail(`expected ${type} transaction and matching functional group`);
  if (st.length !== 3 || se.length !== 3 || ge.length !== 3 || iea.length !== 3 || se[2] !== st[2] || ge[2] !== gs[6] || iea[2] !== isa[13]) fail('control number mismatch');
  if (!/^\d+$/.test(se[1]) || Number(se[1]) !== e - s + 1 || ge[1] !== '1' || iea[1] !== '1') fail('segment, transaction or group count mismatch');
  return { controls: {senderId: required(isa[6], 'ISA06'), receiverId: required(isa[8], 'ISA08'), interchangeControl: isa[13], groupControl: gs[6], transactionControl: st[2]}, body: rows.slice(s + 1, e), gs };
}

export function parse850(raw: string): Parsed850 {
  const {controls, body} = envelope(raw, '850');
  const beg = exactly(body, 'BEG');
  if (body[0] !== beg) fail('BEG must begin the 850');
  if (beg[1] !== '00') fail('amended or cancelled purchase orders require authorized resolution');
  const currencies = body.filter(row => row[0] === 'CUR');
  if (currencies.some(row => row[2] !== 'USD')) fail('only USD purchase orders are supported');
  const lines = body.filter(row => row[0] === 'PO1').map(row => {
    const identifiers: X12Identifier[] = [];
    for (let i = 6; i < row.length; i += 2) {
      if (!row[i] && !row[i + 1]) continue;
      if (!/^[A-Z0-9]{2}$/.test(row[i] || '') || !row[i + 1]) fail('PO1 identifier needs both qualifier and value');
      identifiers.push({qualifier: row[i], value: row[i + 1]});
    }
    if (identifiers.length > 10) fail('too many PO1 product identifiers');
    if (!identifiers.length) fail('PO1 needs at least one item identifier');
    if (!/^[A-Z0-9]{2}$/.test(row[3] || '')) fail('PO1 unit must be an X12 unit code');
    if (row[5] && row[5] !== 'PE') fail('unsupported PO1 price basis; explicit mapping required');
    return {lineNumber: required(row[1], 'PO101'), quantity: decimal(row[2], 'PO102', true), unit: row[3], unitPrice: decimal(row[4], 'PO104'), identifiers};
  });
  if (!lines.length || new Set(lines.map(line => line.lineNumber)).size !== lines.length) fail('missing or duplicate PO1 line numbers');
  const ctts = body.filter(row => row[0] === 'CTT');
  if (ctts.length > 1 || (ctts[0] && (!/^\d+$/.test(ctts[0][1]) || Number(ctts[0][1]) !== lines.length))) fail('CTT line count mismatch');
  const firstLine = body.findIndex(row => row[0] === 'PO1');
  const arrivals = body.slice(0, firstLine).filter(row => row[0] === 'DTM' && ['002', '067'].includes(row[1])).map(row => date(row[2], 'DTM arrival'));
  if (new Set(arrivals).size > 1) fail('conflicting arrival dates require partner mapping');
  let shipTo: X12ShipTo | undefined;
  let current: X12ShipTo | undefined;
  const mapped = new Set<string[]>([beg, ...currencies, ...body.filter(row => ['PO1','CTT'].includes(row[0]))]);
  for (const row of body.slice(0, firstLine).filter(row => row[0] === 'DTM' && ['002','067'].includes(row[1]))) mapped.add(row);
  for (const row of body) {
    if (row[0] === 'PO1') break;
    if (row[0] === 'N1') {
      current = undefined;
      if (row[1] === 'ST') {
        if (shipTo) fail('multiple ship-to loops require partner mapping');
        mapped.add(row);
        shipTo = current = {name: required(row[2], 'ship-to name'), ...(row[3] ? {qualifier: row[3], code: required(row[4], 'ship-to code')} : {})};
      }
    } else if (current && row[0] === 'N3') { if (current.address1) fail('multiple address segments require partner mapping'); mapped.add(row); current.address1 = row[1]; if (row[2]) current.address2 = row[2]; }
    else if (current && row[0] === 'N4') { if (current.city) fail('multiple geographic segments require partner mapping'); mapped.add(row); current.city = row[1]; current.state = row[2]; current.postalCode = row[3]; if (row[4]) current.country = row[4]; }
  }
  return {...controls, unmappedSegments: body.filter(row => !mapped.has(row) || (row[0] === 'BEG' && (Boolean(row[4]) || row.length > 6)) || (row[0] === 'CUR' && row.length > 3) || (row[0] === 'DTM' && row.length > 3) || (row[0] === 'N1' && row.length > 5) || (row[0] === 'N3' && row.length > 3) || (row[0] === 'N4' && row.length > 5) || (row[0] === 'CTT' && row.length > 2)), poNumber: required(beg[3], 'BEG03'), poDate: date(beg[5], 'BEG05'), purposeCode: required(beg[1], 'BEG01'), orderType: required(beg[2], 'BEG02'), ...(arrivals[0] ? {arrivalDate: arrivals[0]} : {}), ...(shipTo ? {shipTo} : {}), lines};
}

export function parse997(raw: string): Parsed997 {
  const {controls, body} = envelope(raw, '997');
  const ak1 = exactly(body, 'AK1'), ak9 = exactly(body, 'AK9');
  const ak2s = body.filter(row => row[0] === 'AK2'), ak5s = body.filter(row => row[0] === 'AK5');
  if (ak2s.length > 1 || ak5s.length > 1 || ak2s.length !== ak5s.length) fail('997 multiple or incomplete transaction responses require mapping');
  if (body[0] !== ak1 || body.at(-1) !== ak9) fail('invalid 997 segment order');
  if (!['A','E','R','P','M','W','X'].includes(ak9[1])) fail('unsupported AK9 acknowledgement');
  const codes = [ak9[1], ...ak5s.map(row => row[1])];
  if (codes.some(code => !['A','E','R','P','M','W','X'].includes(code))) fail('unsupported AK5 acknowledgement');
  if (![ak9[2],ak9[3],ak9[4]].every(v => /^\d+$/.test(v)) || Number(ak9[2]) !== 1 || Number(ak9[3]) > 1 || Number(ak9[4]) > Number(ak9[3])) fail('invalid AK9 counts');
  if (ak9[1] === 'A' && (ak9[3] !== '1' || ak9[4] !== '1')) fail('accepted AK9 must acknowledge one received and accepted transaction');
  return {...controls, sourceGroupControl: digits(required(ak1[2], 'AK102'), 'AK102'), ...(ak2s[0] ? {sourceTransactionControl: required(ak2s[0][2], 'AK202'), sourceTransactionType: required(ak2s[0][1], 'AK201')} : {}), acknowledgment: codes.some(code => ['R','M','W','X'].includes(code)) ? 'R' : codes.some(code => code !== 'A') ? 'E' : 'A', errors: body.filter(row => ['AK3','AK4'].includes(row[0]) || (row[0] === 'AK5' && row.length > 2) || (row[0] === 'AK9' && row.length > 5))};
}

function checkedLine(line: X12Line, price: boolean): string[] {
  if (required(line.lineNumber, 'lineNumber').length > 20) fail('line number exceeds 20 characters');
  decimal(line.quantity, 'quantity', true);
  if (line.quantity.replace('.', '').length > 9) fail('quantity exceeds the supported X12 numeric length');
  if (!/^[A-Z0-9]{2}$/.test(line.unit)) fail('unit must be an X12 unit code');
  if (price) decimal(line.unitPrice, 'unitPrice');
  if (!Array.isArray(line.identifiers) || !line.identifiers.length || line.identifiers.length > 10) fail('one to ten product identifiers required');
  return line.identifiers.flatMap(id => {
    if (!/^[A-Z0-9]{2}$/.test(id.qualifier)) fail('invalid item identifier qualifier');
    if (required(id.value, 'item identifier').length > 48) fail('product identifier exceeds 48 characters');
    return [id.qualifier, id.value];
  });
}

export function buildX12(type: '997' | '855' | '856' | '810', input: X12Input, now: string, control: string): string {
  const stamp = new Date(now);
  if (Number.isNaN(stamp.getTime())) fail('now must be an ISO timestamp');
  const day = stamp.toISOString().slice(0,10).replaceAll('-', ''), time = stamp.toISOString().slice(11,16).replace(':','');
  const ic = digits(control, 'interchange control', 9, 9), gc = digits(input.groupControl || control, 'group control'), tc = digits(input.transactionControl || control, 'transaction control', 4, 9);
  const sender = required(input.senderId, 'senderId'), receiver = required(input.receiverId, 'receiverId');
  if (sender.length > 15 || receiver.length > 15) fail('ISA identifiers exceed 15 characters');
  const sq = input.senderQualifier || 'ZZ', rq = input.receiverQualifier || 'ZZ';
  if (!/^[A-Z0-9]{2}$/.test(sq) || !/^[A-Z0-9]{2}$/.test(rq) || !['T','P'].includes(input.usageIndicator || 'T')) fail('invalid envelope qualifier or usage indicator');
  const rows: (string | number | undefined)[][] = [['ST',type,tc]];
  const emit = (...row: (string | number | undefined)[]) => { rows.push(row); };
  const po = () => { const value = required(input.poNumber, 'poNumber'); if (value.length > 22) fail('PO number exceeds 22 characters'); return value; };
  const shipTo = () => {
    const st = input.shipTo;
    if (!st) return;
    if (Boolean(st.qualifier) !== Boolean(st.code)) fail('shipTo qualifier and code must be paired');
    emit('N1','ST',required(st.name,'shipTo name'),st.qualifier,st.code);
    if (st.address1) emit('N3',st.address1,st.address2);
    if (st.city || st.state || st.postalCode) emit('N4',st.city,st.state,st.postalCode,st.country);
  };
  if (type === '997') {
    const ack = input.acknowledgment || 'A';
    if (!['A','R'].includes(ack)) fail('unsupported acknowledgement');
    emit('AK1',input.sourceFunctionalCode || 'PO',digits(required(input.sourceGroupControl,'sourceGroupControl'),'sourceGroupControl'));
    if (input.sourceTransactionControl) { emit('AK2',input.sourceTransactionType || '850',input.sourceTransactionControl); emit('AK5',ack); }
    emit('AK9',ack,1,1,ack === 'A' ? 1 : 0);
  } else if (type === '855') {
    emit('BAK','00',input.ackType || (input.acknowledgment === 'R' ? 'RD' : 'AD'),po(),compactDate(input.poDate,'poDate'));
    shipTo();
    for (const line of input.lines || []) {
      emit('PO1',line.lineNumber,line.quantity,line.unit,line.unitPrice,'',...checkedLine(line,true));
      const status = line.status || (input.acknowledgment === 'R' ? 'IR' : 'IA');
      if (!['IA','IB','IR','IQ'].includes(status)) fail('unsupported line acknowledgement');
      emit('ACK',status,decimal(line.ackQuantity || line.quantity,'ackQuantity'),line.unit,...(line.arrivalDate ? ['067',compactDate(line.arrivalDate,'arrivalDate')] : []));
      if (line.reason && line.reason.length > 264) fail('line reason exceeds 264 characters');
      if (line.reason) { emit('N9','L1',line.lineNumber); emit('MSG',line.reason); }
    }
    if (!input.lines?.length) fail('855 requires order lines');
    emit('CTT',input.lines!.length);
  } else if (type === '856') {
    emit('BSN','00',required(input.shipmentId,'shipmentId'),day,time,'0001');
    emit('DTM','011',compactDate(input.shipDate,'shipDate'));
    emit('HL',1,'','S'); shipTo(); emit('HL',2,1,'O'); emit('PRF',po());
    if (!input.cartons?.length) fail('856 requires packed cartons');
    let hl = 2;
    const seen = new Set<string>();
    for (const carton of input.cartons!) {
      if (!validateSscc(carton.sscc) || seen.has(carton.sscc)) fail('invalid or duplicate carton SSCC');
      seen.add(carton.sscc);
      const parent = ++hl; emit('HL',parent,2,'P'); emit('MAN','GM','00' + carton.sscc);
      if (!carton.lines.length) fail('empty carton');
      for (const line of carton.lines) { const ids = checkedLine(line,false); emit('HL',++hl,parent,'I'); emit('LIN',line.lineNumber,...ids); emit('SN1','',line.quantity,line.unit); }
    }
    emit('CTT',hl);
  } else if (type === '810') {
    emit('BIG',compactDate(input.invoiceDate,'invoiceDate'),required(input.invoiceNumber,'invoiceNumber'),compactDate(input.poDate,'poDate'),po());
    emit('CUR','SE','USD'); shipTo();
    if (!input.lines?.length) fail('810 requires invoiced lines');
    for (const line of input.lines!) emit('IT1',line.lineNumber,line.quantity,line.unit,line.unitPrice,'',...checkedLine(line,true));
    const cents = required(input.totalCents, 'totalCents');
    if (!/^\d{1,15}$/.test(cents)) fail('totalCents must be nonnegative integer cents');
    emit('TDS',cents); emit('CTT',input.lines!.length);
  } else fail('unsupported outbound transaction');
  emit('SE',rows.length + 1,tc);
  const functional = {'997':'FA','855':'PR','856':'SH','810':'IN'}[type];
  const all = [ ['ISA','00','          ','00','          ',sq,sender.padEnd(15),rq,receiver.padEnd(15),day.slice(2),time,'U','00401',ic,'0',input.usageIndicator || 'T',':'], ['GS',functional,sender,receiver,day,time,gc,'X','004010'], ...rows, ['GE',1,gc], ['IEA',1,ic] ];
  return all.map(row => {
    const values = row.map(value => value === undefined ? '' : String(value));
    while (values.at(-1) === '') values.pop();
    if (values.some((value,i) => /[*~\r\n]/.test(value) || (value.includes(':') && !(row[0] === 'ISA' && i === 16)) || /[^\x20-\x7e]/.test(value))) fail('element contains a delimiter or unsupported character');
    return values.join('*') + '~';
  }).join('\n');
}

/** Inbound shipment hierarchy; unsupported conditions require explicit review. */
export function parse856(raw: string) {
  const { controls, body } = envelope(raw, '856');
  const bsn = exactly(body, 'BSN');
  if (body[0] !== bsn || bsn[1] !== '00') fail('only an original 856 shipment notice is supported');
  const shipmentReference = required(bsn[2], 'BSN02'); date(bsn[3], 'BSN03');
  const nodes = new Map<string, {id:string;parent:string;kind:string;sscc?:string;po?:string;identifiers:X12Identifier[];quantity?:string;unit?:string}>();
  let current: ReturnType<typeof nodes.get>;
  for (const segment of body.slice(1)) {
    const [tag, ...values] = segment;
    if (tag === 'HL') {
      const [id, parent, kind] = values;
      if (!id || nodes.has(id) || !['S','O','T','P','I'].includes(kind) || (parent && !nodes.has(parent)) || (!parent && kind !== 'S')) fail('invalid or ambiguous shipment hierarchy');
      current = { id, parent, kind, identifiers: [] }; nodes.set(id, current);
    } else if (tag === 'PRF') {
      if (!current || current.kind !== 'O' || current.po) fail('PRF requires one order parent');
      current!.po = required(values[0], 'PRF01');
    } else if (tag === 'MAN') {
      if (!current || !['T','P'].includes(current.kind) || current.sscc || values[0] !== 'GM') fail('MAN requires a pallet or carton SSCC');
      const code = values[1]?.replace(/^00(?=\d{18}$)/, '');
      if (!validateSscc(code)) fail('invalid inbound SSCC'); current!.sscc = code;
    } else if (tag === 'LIN') {
      if (!current || current.kind !== 'I' || current.identifiers.length) fail('LIN requires one item hierarchy');
      for (let i = 1; i < values.length; i += 2) {
        if (!values[i] || !values[i+1]) fail('incomplete LIN item identifier');
        current!.identifiers.push({qualifier: values[i], value: values[i+1]});
      }
    } else if (tag === 'SN1') {
      if (!current || current.kind !== 'I' || current.quantity) fail('SN1 requires one item quantity');
      current!.quantity = decimal(values[1], 'SN102', true); current!.unit = required(values[2], 'SN103');
    } else if (!['DTM','CTT'].includes(tag)) fail(`unsupported inbound ${tag} condition; review the source before receiving`);
  }
  const ancestors = (node: NonNullable<typeof current>) => { const result = [node]; while (node.parent) { node = nodes.get(node.parent)!; result.push(node); } return result; };
  const items = [...nodes.values()].filter(node => node.kind === 'I');
  if (!items.length || items.length > 100 || items.some(node => !node.quantity || !node.identifiers.length)) fail('incomplete or excessive notice items');
  if (items.some(node => !ancestors(node).some(parent => parent.sscc) || !ancestors(node).some(parent => parent.po))) fail('each item requires an order and SSCC parent');
  const cartons = [...nodes.values()].filter(node => node.sscc).map(node => ({sscc: node.sscc!, lines: items.filter(item => ancestors(item).some(parent => parent.id === node.id)).map(item => ({sourceLine: item.id, poNumber: ancestors(item).find(parent => parent.po)!.po!, quantity: item.quantity!, unit: item.unit!, identifiers: item.identifiers}))}));
  if (!cartons.length || cartons.some(carton => !carton.lines.length) || new Set(cartons.map(carton => carton.sscc)).size !== cartons.length) fail('empty or duplicate SSCC containers');
  return {...controls, shipmentReference, cartons};
}
