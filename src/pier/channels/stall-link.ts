import type { Bindings } from '../../auth.server';
import { sha256 } from '../import-kit';
import { publishedWarehouses } from '../routing';
import { decimal, format, positions, type Actor } from '../model';
import { orderView } from '../orders';
import { activeAutomationActors, load } from '../storage';
import { execute } from '../api';

// Stall reads Pier's stock and reserves paid orders through Pier itself. The
// owner creates Stall's key in Pier (Channels → the Stall connection); Pier keeps
// only its hash. Stall sends it as its Pier "session" cookie, and it admits only
// what Stall does: read stock and the shop customer's orders, create that
// customer's orders and dispatch them, under the connection's owner approval.

const KEY = /(?:^|;\s*)pier_channel=(pier_stall_[a-f0-9]{64})(?:;|$)/;
const ALLOWED = ['order.create', 'order.channelPayment', 'dispatch.create'];
export const newStallKey = () => 'pier_stall_' + Array.from(crypto.getRandomValues(new Uint8Array(32)), n => n.toString(16).padStart(2, '0')).join('');
export const stallKeyHash = (key: string) => sha256('pier-stall-link\u0000' + key);

const refuse = (message: string, status = 401) => Response.json({ ok: false, error: { code: 'STALL_KEY', message } }, { status });

export async function stallLink(request: Request, env: Bindings): Promise<Response | null> {
  const key = KEY.exec(request.headers.get('cookie') ?? '')?.[1];
  if (!key) return null;
  const url = new URL(request.url), s = await load(env.DB), hash = stallKeyHash(key);
  const channel = s.channels.find(ch => ch.provider === 'stall' && ch.stallLink?.keyHash === hash);
  if (!channel) return refuse('Pier does not recognise this Stall key. In Pier, open Channels, choose the Stall connection and create a new key for Stall.');
  if (!channel.enabled) return refuse('This Stall connection is paused in Pier.', 403);
  if ((await activeAutomationActors(env.DB))[channel.approvedBy] !== 'owner') return refuse('The Pier owner who connected Stall no longer holds owner authority. Reconnect Stall in Pier.', 403);
  const customerId = channel.stallLink.customerId;
  const op = await env.DB.prepare('SELECT version,display_name FROM oa_operators WHERE id=?').bind(channel.approvedBy).first<any>();
  const actor: Actor = { id: channel.approvedBy, role: 'owner', name: op.display_name, operatorVersion: op.version, sessionId: 'stall-link' };
  if (request.method === 'GET' && url.pathname === '/api/pier/state') {
    const c = { s, actor, commandId: '', now: new Date().toISOString() };
    const own = s.orders.filter(o => o.customerId === customerId);
    const eligible=publishedWarehouses(s,channel),visible=positions(s).filter(p=>eligible.includes(s.locations.find(l=>l.id===p.locationId)?.warehouse));
    const buffers=new Map<string,bigint>();
    for(const position of visible){const left=buffers.get(position.itemId)??decimal(channel.buffer??'0'),free=decimal(position.available),take=left<free?left:free;position.available=format(free-take);buffers.set(position.itemId,left-take);}

    return Response.json({
      items: s.items, locations: s.locations.filter(l=>eligible.includes(l.warehouse)), positions: visible,
      parties: s.parties.filter(p => p.id === customerId).map(({creditClearance,resaleCertificates,...p})=>p),
      orders: own.map(o => orderView(c, o)), shipments: s.shipments.filter(sh => own.some(o => o.id === sh.orderId)),
    }, { headers: { 'cache-control': 'no-store' } });
  }
  if (request.method !== 'POST' || url.pathname !== '/api/pier/commands') return refuse('A Stall key reads stock and reserves shop orders only.', 403);
  if (request.headers.get('origin') !== new URL(env.AUTH_ORIGIN).origin) return refuse('Send commands from this installation origin.', 403);
  let body: any;
  try { body = JSON.parse(await request.text()); } catch { return refuse('Malformed JSON.', 400); }
  const { commandId, type, payload = {} } = body ?? {};
  if (typeof commandId !== 'string' || !/^[-a-zA-Z0-9_]{8,100}$/.test(commandId) || !ALLOWED.includes(type) || !payload || typeof payload !== 'object')
    return refuse('A Stall key reserves and dispatches shop orders only.', 403);
  if (type === 'order.create' && payload.customerId !== customerId) return refuse('Stall orders belong to the shop customer chosen in Pier.', 403);
  if (['dispatch.create','order.channelPayment'].includes(type) && s.orders.find(o => o.id === payload.orderId)?.customerId !== customerId) return refuse('Stall dispatches only its own shop orders.', 403);
  const admitted=type==='order.create'?{...payload,fulfilment:undefined,channelId:channel.id,warehouse:channel.warehouse,routingSource:`channel:${channel.id}`} : payload;
  const outcome = await execute(env, actor, commandId, type, admitted, undefined, { collection: 'channels', id: channel.id, version: channel.version });
  if (!outcome) return Response.json({ ok: false, error: { code: 'BUSY', message: 'Retry the same command identity.' } }, { status: 409 });
  // Stall records the reservation after this reply; Pier's channel sync links the paid order then.
  return Response.json(outcome);
}
