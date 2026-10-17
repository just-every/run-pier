import { runReplenishmentSchedule } from "../../src/pier/scheduled";
import { pierResponse } from "../../src/pier/api";
import { authConfig, authResponse, runtimeBindings } from "../../src/auth.server";
import { devPersonas } from "../../src/dev-personas";
import { withDevIdentity } from "../../src/modules/operator-auth/dev/index.mjs";
// The local dev layer (as src/server.dev.ts) supplies the member persona; local mail is suppressed.
export default withDevIdentity({
  async scheduled(_event: any, env: any, ctx: any) { ctx.waitUntil(runReplenishmentSchedule(env, _event.scheduledTime)); },
  async fetch(request: Request, env: any) {
    return (
      (await pierResponse(request, env)) ??
      (await authResponse(request, env)) ??
      new Response("Not found", { status: 404 })
    );
  },
}, { bindings: runtimeBindings, config: authConfig, personas: devPersonas });
