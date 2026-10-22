// @ts-expect-error Base's mail runtime does not publish TypeScript declarations.
import { createMailSender } from "../modules/mail/index.mjs";
// @ts-expect-error Share the exact validation used by Base's provider facade.
import { validateMessage } from "../modules/mail/src/core/validation.mjs";
import type { Bindings } from "../auth.server";
import type { Correspondence } from "./correspondence-delivery-eligibility";
import type { MailSender } from "../modules/operator-auth/index.mjs";

type BusinessMessage = { deliveryId: string; from: string; to: string[]; subject: string; text: string; attachments?: {filename:string;contentType:string;content:Uint8Array}[] };
type BusinessMailSender = { send(message: BusinessMessage): ReturnType<MailSender["send"]> };

export const emailUnavailable = "Email is not available yet.";

export function businessMail(env: Bindings): BusinessMailSender | null {
  // RER Managed has no business-mail transport. Never attempt self-host egress.
  if (env.RER_DEMO === "1" || env.RER_OWNER_CLAIM_ISSUER || env.RER_MANAGEMENT_ORIGIN || env.RER_INSTALLATION_ID) return null;
  if (!env.MAIL_FROM || !["resend", "sendgrid", "cloudflare"].includes(env.MAIL_PROVIDER ?? "")) return null;
  try {
    const sender: BusinessMailSender = createMailSender({
      provider: env.MAIL_PROVIDER,
      mode: "production",
      apiKey: env.MAIL_API_KEY,
      ...(env.MAIL_PROVIDER === "cloudflare" ? { accountId: env.MAIL_ACCOUNT_ID } : {}),
    });
    // A malformed sender is configuration failure, before any network request.
    validateMessage({ deliveryId: "configuration-check", from: env.MAIL_FROM,
      to: [env.MAIL_FROM], subject: "Configuration", text: "Configuration" }, env.MAIL_PROVIDER);
    return sender;
  } catch { return null; }
}

export function businessMessage(env: Bindings, message: Correspondence) {
  const mail = { deliveryId: message.id, from: env.MAIL_FROM!, to: [message.recipient],
    subject: message.subject, text: message.body };
  // No supplied arbitrary headers, recipient lists or control-character headers.
  if (typeof message.subject !== "string" || !message.subject.trim() ||
      /[\u2028\u2029]/.test(message.subject)) throw new Error("Invalid subject");
  validateMessage(mail, env.MAIL_PROVIDER);
  return mail;
}
