import { type Context, type Row } from '../model';
import { amount, extended, money } from '../money';
import { returnCost } from '../returns-cost';
import type { BookDocument } from './adapters/types';

type Add = (key: string, kind: string, source: Row, sourceKind: string, reference: string, build: () => BookDocument) => void;
type Dollars = (value: string) => string;
const reference = (prefix: string, id: string) => `PIER-${prefix}-${id.replaceAll('-', '').slice(0, 24)}`;

export function planReturnBooks(c: Context, connection: Row, add: Add, dollars: Dollars) {
  // Only a retained credit's explicit owner authorization opens this financial door.
  for (const drop of c.s.dropships) {
    const order = c.s.orders.find(o => o.id === drop.orderId)!;
    for (const shipment of drop.shipments) {
      const credits = c.s.customerCredits.filter(credit => credit.dropshipId === drop.id && credit.shipmentId === shipment.id && credit.postingAuthorizedAt);
      if (!credits.length) continue;
      const party = { id: order.customerId, name: credits[0].customerName, kind: 'customer' as const };
      add(`dropship-invoice:${shipment.id}`, 'invoice', { ...shipment, orderId: order.id }, 'order', reference('DSINV', shipment.id), () => {
        const lines = shipment.lines.map((line: Row) => {
          const total = dollars(line.salesTotal);
          return { itemId: line.itemId, description: `Direct supplier shipment ${shipment.reference} · ${line.quantity}`, quantity: '1', unitPrice: total, amount: total, account: connection.revenueAccountId };
        });
        return { key: `dropship-invoice:${shipment.id}`, kind: 'invoice', date: shipment.shipDate, reference: reference('DSINV', shipment.id), party, lines, total: dollars(money(lines.reduce((n: bigint, line: Row) => n + amount(line.amount), 0n))) };
      });
      for (const credit of credits) add(`dropship-credit:${credit.id}`, 'credit', credit, 'customerCredit', reference('DSCR', credit.id), () => {
        const total = dollars(credit.amount);
        if (!amount(total)) throw new Error('A zero-value dropship credit needs accountant review.');
        return { key: `dropship-credit:${credit.id}`, kind: 'credit', date: credit.authorizedAt.slice(0, 10), reference: reference('DSCR', credit.id), creditForReference: reference('DSINV', shipment.id), party: { ...party, name: credit.customerName }, total, lines: [{ description: `${credit.reference} · ${credit.quantity} · ${credit.reason}`, quantity: '1', unitPrice: total, amount: total, account: connection.revenueAccountId }] };
      });
    }
  }
  for (const returned of c.s.returns) {
    const shipment = c.s.shipments.find(sh => sh.id === returned.shipmentId)!;
    const order = c.s.orders.find(o => o.id === shipment.orderId)!;
    const line = shipment.lines.find((l: any) => l.id === returned.shipmentLineId)!;
    const customer = c.s.parties.find(p => p.id === order.customerId)!;
    add(`credit:${returned.id}`, 'credit', returned, 'return', reference('CR', returned.id), () => {
      const orderLine = order.lines.find((l: any) => l.id === line.orderLineId);
      if (typeof orderLine?.price !== 'string') throw new Error('The dispatched line has no reviewed USD sales price. Review its pricing before issuing a credit.');
      const total = dollars(money(extended(returned.quantity, orderLine.price)));
      if (!amount(total)) throw new Error('A zero-value return credit needs an accountant decision.');
      return { key: `credit:${returned.id}`, kind: 'credit', date: returned.createdAt.slice(0, 10), reference: reference('CR', returned.id), creditForReference: reference('INV', shipment.id), party: { id: customer.id, name: customer.name, kind: 'customer' }, total, lines: [{ itemId: returned.itemId, description: `${c.s.items.find(i => i.id === returned.itemId)?.sku} · returned ${returned.quantity} · ${returned.reason}`, quantity: '1', unitPrice: total, amount: total, account: connection.revenueAccountId }] };
    });
    add(`return-cogs:${returned.id}`, 'journal', returned, 'return', reference('RETCOST', returned.id), () => {
      const cost = returnCost(c.s, returned, c.now);
      if (cost === null) throw new Error('The original dispatch has no reviewed USD cost. Resolve its valuation before reversing return cost.');
      const total = dollars(cost);
      if (!amount(total)) throw new Error('A zero-cost return needs an accountant decision.');
      return { key: `return-cogs:${returned.id}`, kind: 'journal', date: returned.createdAt.slice(0, 10), reference: reference('RETCOST', returned.id), total, lines: [{ description: 'Inventory returned from customer', quantity: '1', amount: total, account: connection.inventoryAccountId, debit: total }, { description: 'Reverse cost of returned goods', quantity: '1', amount: total, account: connection.cogsAccountId, credit: total }] };
    });
    if (returned.status === 'writtenoff') add(`return-writeoff:${returned.id}`, 'journal', returned, 'return', reference('WRITEOFF', returned.id), () => {
      if (!returned.writeOffAccountId) throw new Error('Map the damaged-stock expense account before posting this write-off.');
      if (returned.writeOffCostTotal === null || returned.writeOffCostTotal === undefined) throw new Error('The written-off units have no reviewed USD cost. Resolve their valuation before posting.');
      const total = dollars(returned.writeOffCostTotal);
      if (!amount(total)) throw new Error('A zero-cost write-off needs an accountant decision.');
      return { key: `return-writeoff:${returned.id}`, kind: 'journal', date: returned.dispositionAt.slice(0, 10), reference: reference('WRITEOFF', returned.id), total, lines: [{ description: `Damaged stock: ${returned.inspectionReason}`, quantity: '1', amount: total, account: returned.writeOffAccountId, debit: total }, { description: 'Inventory written off', quantity: '1', amount: total, account: connection.inventoryAccountId, credit: total }] };
    });
  }
}
