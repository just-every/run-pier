import type { Bindings } from '../../auth.server';
import type { Row } from '../model';
import { load } from '../storage';
import { providerOperation } from '../provider-audit';
import { find } from '../invoices/state';
import type { PaymentAuthority } from './transport';

/** The durable payment claim still owns replay; this records each actual effect. */
export async function paymentRequest<T>(env: Bindings, authority: PaymentAuthority, session: Row, operation: string, remote: () => Promise<T>) {
  const state = await load(env.DB), invoice = find(state, 'invoices', session.invoiceId);
  return providerOperation(env.DB, { ...authority, commandId: session.requestKey, connectorId: 'stripe', operation: 'payment.' + operation,
    direction: operation === 'read' ? 'inbound' : 'outbound', state,
    sources: [{ collection: 'invoicePaymentSessions', row: session }, { collection: 'invoices', row: invoice }, { collection: 'paymentConnections', row: find(state, 'paymentConnections', session.connectionId) }],
    itemIds: invoice.lines.map((line: any) => line.itemId).filter(Boolean), documentIds: [invoice.id, session.linkId],
    externalIds: [session.providerSessionId], requestId: session.requestKey,
  }, remote, value => ({ externalIds: typeof value === 'object' && value !== null && 'id' in value ? [(value as any).id] : [] }));
}
