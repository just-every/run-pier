import type { Row } from "./model";

export type Correspondence = Row & {
  kind: "purchase-order" | "supplier-chase" | "customer-promise" | "slow-stock";
  recordId: string;
  recordVersion: number;
  recipient: string;
  subject: string;
  body: string;
  approvedBy: string;
  approvalRole: string;
  dueAt: string;
  approvedMaterial?: string;
  promiseDate?: string;
  policyVersion?: number;
  sendPolicyVersion?: number;
  purchaseMessageId?: string;
};

/** Receipt progress and record identities do not change the approved purchase. */
export function poMaterial(po: Row): string {
  return JSON.stringify({
    supplierId: po.supplierId,
    destinationWarehouse: po.destinationWarehouse ?? null,
    promiseDate: po.promiseDate,
    freight: po.freight ?? "0",
    duty: po.duty ?? "0",
    lines: po.lines.map((line: Row) => ({
      itemId: line.itemId,
      quantity: line.quantity,
      price: line.price,
    })),
  });
}

function quantity(value: unknown): bigint {
  if (typeof value !== "string" || !/^\d{1,10}(\.\d{1,6})?$/.test(value))
    throw new Error("Invalid quantity");
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * 1000000n + BigInt(fraction.padEnd(6, "0"));
}

/** Fail closed when a formerly approved message no longer describes live work. */
export function correspondenceEligible(message: Correspondence, source: Row | null, now = new Date().toISOString()): boolean {
  const roles = message.kind === "customer-promise" ? ["owner", "operator", "buyer"] : ["owner", "buyer"];
  if (!source || !message.approvedBy || !roles.includes(message.approvalRole)) return false;
  try {
    if (message.kind === 'slow-stock') return source.status === 'open' && source.notificationEnabled === true &&
      source.policyVersion === message.policyVersion && source.assigneeId === message.approvedBy && source.messageId === message.id;
    if (message.kind === "customer-promise") {
      if (message.policyVersion !== undefined) {
        const policy = source.promisePolicy;
        if (!policy?.enabled || policy.version !== message.policyVersion ||
            policy.recipient !== message.recipient || policy.approvedBy !== message.approvedBy) return false;
      }
      return typeof message.promiseDate === "string" && !!message.promiseDate &&
        source.promiseDate === message.promiseDate &&
        source.lines.some((line: Row) =>
          quantity(line.quantity) > quantity(line.dispatched) + quantity(line.cancelled));
    }
    if (!["purchase-order", "supplier-chase"].includes(message.kind) ||
        source.status !== "committed" || typeof message.approvedMaterial !== "string" ||
        message.approvedMaterial !== poMaterial(source)) return false;
    if (message.sendPolicyVersion !== undefined &&
        (!source.sendPolicy?.enabled || source.sendPolicy.version !== message.sendPolicyVersion ||
         source.sendPolicy.approvedBy !== message.approvedBy || source.sendPolicy.recipient !== message.recipient ||
         (message.kind === 'purchase-order' && source.sendPolicy.expiresAt <= now))) return false;
    if (message.kind === "supplier-chase") {
      const policy = source.chasePolicy;
      return !!policy && policy.enabled !== false && policy.approvedBy === message.approvedBy &&
        policy.recipient === message.recipient && !source.confirmation && source.lines.some((line: Row) =>
        quantity(line.quantity) > quantity(line.received));
    }
    return true;
  } catch { return false; }
}
