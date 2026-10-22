import { fail, fresh, get, requireRole, text, type Context } from './model';
import { currentQuote } from './sales-quotes';
import { requireQuoteApproval } from './quote-approval';
import { generateDocument } from './print/commands';

export async function salesDocuments(c:Context,type:string,p:any){
  if(!['quote.send','order.confirm'].includes(type))return;
  requireRole(c,[]);const order=get(c.s,'orders',p.orderId);fresh(order,p.version);
  if(type==='quote.send'){
    if(order.documentType!=='quote'||order.acceptedAt)fail('QUOTE_STATE','Choose an open quote.');
    currentQuote(c,order);requireQuoteApproval(c,order);
  }else if(order.documentType==='quote'&&!order.acceptedAt)fail('QUOTE_STATE','Accept the quote before confirming an order.');
  const recipient=text(p.recipient,'Approved recipient');
  if(!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(recipient))fail('EMAIL','Enter one valid recipient.');
  return generateDocument(c,{kind:type==='quote.send'?'quote':'order-confirmation',sourceId:order.id},recipient);
}
