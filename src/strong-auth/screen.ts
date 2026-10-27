import { themeFrame } from '../base/theme-frame';
import branding from '../branding.json';
import type { securityState } from './routes';
const escape = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const hidden = (name: string,value: unknown) => `<input type="hidden" name="${name}" value="${escape(value)}">`;
const form = (action: string,body: string,button: string) => `<form method="post" action="/security">${hidden('action',action)}${body}<button>${button}</button></form>`;
const reason = '<label>Reason<input name="reason" required minlength="8" maxlength="300"></label>';
export async function securityPage(state: Awaited<ReturnType<typeof securityState>>, result: {secret?: string; notice: string; error: string; status: number}) {
  const frame = await themeFrame({href:'/rer-theme.css',productName:branding.name,accentColor:branding.primaryColor});
  const options = state.operators.map((operator: any) => `<option value="${escape(operator.id)}">${escape(operator.display_name)} — ${escape(operator.status)}</option>`).join('');
  const selector = `<label>Operator<select name="operatorId" required>${options}</select></label>`;
  const body = `<h1>Security</h1><p>${state.required ? 'Authenticator verification is required for every private session.' : 'Enroll an authenticator before requiring two-factor authentication.'}</p>
  ${result.error ? `<p role="alert">${escape(result.error)}</p>` : ''}${result.notice ? `<p role="status">${escape(result.notice)}</p>` : ''}
  <h2>Your authenticator</h2><p>${state.verified ? 'This session is verified.' : 'This session needs verification.'}</p>
  ${result.secret ? `<p>Enter this setup key in your authenticator. Keep it private.</p><code data-factor-secret>${escape(result.secret)}</code>` : ''}
  ${state.restorePaused ? `<p>Restored factors and sessions are inactive. A fresh native owner must authorize recovery.</p>${state.owner ? form('recover',hidden('operatorId',state.operatorId)+reason,'Recover restored factor') : ''}` : !state.enrolled ? form('enroll','','Start enrollment') : ''}
  ${!state.restorePaused ? form('verify','<label>Authenticator code<input name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" minlength="6" maxlength="6" required></label>','Verify code') : ''}
  ${state.manageable ? `<h2>Owner controls</h2>${!state.required ? form('require','','Require two-factor authentication') : ''}
  <h2>Sessions and devices</h2>${state.sessions.map((session: any) => `<p>${escape(session.display_name)} · ${escape(session.kind)} · ${escape(new Date(session.created_at).toISOString())}</p>${form('revoke',hidden('operatorId',session.operator_id)+hidden('sessionId',session.id)+reason,'Revoke session')}`).join('')}
  <h2>Operator recovery</h2><p>Recovery clears the factor and revokes prior sessions and links. Another assured native owner must recover a lost owner factor.</p>${form('recover',selector+reason,'Authorize recovery')}
  <h2>Revoke all devices</h2>${form('revoke',selector+reason,'Revoke all sessions')}
  <h2>Deprovision operator</h2>${form('deactivate',selector+reason,'Deactivate operator')}
  <h2>Security activity</h2><ul>${state.audit.map((entry: any) => `<li>${escape(entry.action)} · ${escape(entry.actor_id)} → ${escape(entry.target_id)} · ${escape(entry.reason)}</li>`).join('')}</ul>` : ''}
  <p><a href="/app">Return to Pier</a></p>`;
  return new Response(`<!doctype html><html lang="en"${frame.htmlClass}><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Security · ${escape(branding.name)}</title>${frame.head}</head><body><main>${frame.brand}${body}</main></body></html>`,{status:result.status,headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','referrer-policy':'no-referrer','x-content-type-options':'nosniff','content-security-policy':`default-src 'none'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'; ${frame.policy}`}});
}
