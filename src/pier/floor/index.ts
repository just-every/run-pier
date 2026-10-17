import { requireRole, type Context, type Row } from "../model";
import { receiving } from "./receiving";
import { waves, waveView } from "./waves";
import { packing } from "./packing";
import { dayClose } from "./summary";

// The warehouse floor's commands: scan-to-receive, carrier pickups and pick
// waves, the pack step and the day's dispatch close.
const handlers: [string[], string[], (c: Context, type: string, p: any) => Row | undefined][] = [
  [["receiving.start", "receiving.scan", "receiving.remove", "receiving.post"], ["warehouse"], receiving],
  [["carrier.save", "order.carrier"], ["operator", "warehouse"], waves],
  [["wave.release", "pick.scan", "pick.short"], ["warehouse"], waves],
  [["pack.scan", "pack.carton", "pack.measure", "pack.close", "pack.dispatch"], ["warehouse"], packing],
  [["dispatch.close", "dispatch.delivered"], ["warehouse"], dayClose],
];

export function floor(c: Context, type: string, p: any): Row | undefined {
  const handler = handlers.find(([types]) => types.includes(type));
  if (!handler) return;
  requireRole(c, handler[1]);
  return handler[2](c, type, p);
}

export const floorState = (c: Context) => ({ waves: c.s.waves.map((w) => waveView(c, w)) });
