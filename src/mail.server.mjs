import { createMailSender } from './modules/mail/index.mjs'

// Local dev and demos suppress mail silently (Base's development sender keeps
// nothing); operator-auth accepts that result there, so a demo's sign-in link or
// invitation completes and nothing is sent. A production install sends through
// its configured provider.
export function operatorMail(env) {
 if (env.RER_DEMO === '1' || env.AUTH_LOCAL === 'true') return createMailSender({ provider: 'development', mode: 'development' })
 return env.MAIL_PROVIDER && env.MAIL_PROVIDER !== 'development' ? createMailSender({ provider: env.MAIL_PROVIDER, mode: 'production', apiKey: env.MAIL_API_KEY, ...(env.MAIL_PROVIDER === 'cloudflare' ? { accountId: env.MAIL_ACCOUNT_ID } : {}) }) : undefined
}
