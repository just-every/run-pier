import { runReplenishmentSchedule } from "../../src/pier/scheduled";
import { pierResponse } from "../../src/pier/api";
import { authConfig, authResponse, runtimeBindings } from "../../src/auth.server";
import { devPersonas } from "../../src/dev-personas";
import { withDevIdentity } from "../../src/modules/operator-auth/dev/index.mjs";
// The local dev layer (as src/server.dev.ts) supplies the member persona; local mail is suppressed.
export default withDevIdentity({
  async scheduled(_event: any, env: any, ctx: any) { ctx.waitUntil(runReplenishmentSchedule(env, _event.scheduledTime)); },
  async fetch(request: Request, env: any) {
    // Clock control exists only in this test Worker. Product commands and all
    // authority/stock admission still execute through their real HTTP doors.
    const RealDate=Date, clock=request.headers.get('x-pier-test-now');
    if(clock){const at=RealDate.parse(clock);if(!Number.isFinite(at))throw new Error('Invalid test clock');const TestDate=function(...args:any[]){return Reflect.construct(RealDate,args.length?args:[at]);};Object.setPrototypeOf(TestDate,RealDate);TestDate.prototype=RealDate.prototype;(TestDate as any).now=()=>at;globalThis.Date=TestDate as unknown as DateConstructor;}
    try { return (
      (await pierResponse(request, env)) ??
      (await authResponse(request, env)) ??
      new Response("Not found", { status: 404 })
    ); } finally { globalThis.Date=RealDate; }
  },
}, { bindings: runtimeBindings, config: authConfig, personas: devPersonas });
