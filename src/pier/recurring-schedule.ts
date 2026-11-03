import type { Bindings } from "../auth.server";
import { load, activeAutomationActors } from "./storage";
import { execute } from "./api";
export async function runRecurringSchedule(
  env: Bindings,
  scheduledTime = Date.now(),
) {
  const now = new Date(scheduledTime).toISOString(),
    s = await load(env.DB),
    actors = await activeAutomationActors(env.DB);
  for (const schedule of s.recurringOrders
    .filter((r) => r.enabled && !r.cancelled && r.nextDue <= now.slice(0, 10))
    .slice(0, 10)) {
    if (actors[schedule.approvedBy] !== "owner") continue;
    const operator = await env.DB.prepare(
      `SELECT version,display_name FROM oa_operators WHERE id=? AND status='active'`,
    )
      .bind(schedule.approvedBy)
      .first<any>();
    if (!operator) continue;
    await execute(
      env,
      {
        id: schedule.approvedBy,
        name: operator.display_name,
        role: "owner",
        operatorVersion: operator.version,
        sessionId: "recurring-policy",
      },
      `recurring-${schedule.id}-${schedule.version}-${schedule.nextDue}-${Math.floor(scheduledTime / 60000)}`,
      "recurring.run",
      { scheduleId: schedule.id, version: schedule.version },
      () => now,
      {
        collection: "recurringOrders",
        id: schedule.id,
        version: schedule.version,
      },
    );
  }
}
