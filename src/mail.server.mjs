import { createMailSender } from './modules/mail/index.mjs'
import { demoEffect } from './modules/demo/index.mjs'

const suppressed = () => createMailSender({ provider: 'development', mode: 'development' })

// Local dev suppresses mail silently (Base's development sender keeps nothing).
// A demo's mail would reach people, so it is mocked: operator-auth sees an
// accepted send (on the hosted demo's https origin too) and nothing is sent.
// A production install sends through its configured provider.
export function operatorMail(env) {
 if (env.RER_DEMO === '1') {
  const sender = suppressed()
  return { send: message => demoEffect(() => sender.send(message), { provider: 'development', status: 'accepted', providerMessageId: null }) }
 }
 if (env.AUTH_LOCAL === 'true') return suppressed()
 return env.MAIL_PROVIDER && env.MAIL_PROVIDER !== 'development' ? createMailSender({ provider: env.MAIL_PROVIDER, mode: 'production', apiKey: env.MAIL_API_KEY, ...(env.MAIL_PROVIDER === 'cloudflare' ? { accountId: env.MAIL_ACCOUNT_ID } : {}) }) : undefined
}
