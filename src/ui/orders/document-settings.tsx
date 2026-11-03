import { Field, Form, text } from '../controls';
import type { RecordData, RunCommand } from '../api';

export function DocumentSettings({ settings, inboundSettings, run, busy }: {
  settings: RecordData; inboundSettings: RecordData; run: RunCommand; busy: boolean;
}) {
  return <details><summary>Document processing consent</summary>
    <Form key={`document-ai-${settings.version}`} title="Document extraction connection" submit="Authorize document processing"
      busy={busy} note="Only the owner can enable extraction. Each request separately confirms sending that entire original to OpenAI. Item-agent consent does not authorize this connection."
      onSubmit={d => run('document.configure', { version: settings.version, model: text(d, 'model'),
        ...(text(d, 'apiKey') ? { apiKey: text(d, 'apiKey') } : {}), consent: d.get('consent') === 'on', enabled: true })}>
      <Field label="Document extraction model" name="model" defaultValue={settings.model} />
      <Field label="Document OpenAI API key" name="apiKey" type="password" autoComplete="new-password" required={!settings.configured} />
      <label className="field"><input type="checkbox" name="consent" required /> I authorize selected customer and supplier originals to be processed by OpenAI for cited draft extraction.</label>
    </Form>
    {settings.enabled && <button disabled={busy} onClick={() => run('document.revoke', { version: settings.version })}>Revoke document processing</button>}
    <Form key={`document-inbox-${inboundSettings.version}`} title="Signed document inbox" submit="Authorize document inbox" busy={busy}
      note="Use a receiving domain you control and its SendGrid signed Inbound Parse verification public key. Incoming originals stay private and create no order automatically."
      onSubmit={d => run('document.inboundConfigure', {version:inboundSettings.version,provider:'sendgrid',recipient:text(d,'recipient'),verificationKey:text(d,'verificationKey'),consent:d.get('inboundConsent')==='on'})}>
      <Field label="Document receiving email" name="recipient" type="email" defaultValue={inboundSettings.recipient ?? ''} />
      <Field label="Inbound Parse verification public key" name="verificationKey" required={!inboundSettings.configured} />
      <label className="field"><input type="checkbox" name="inboundConsent" required /> I authorize signed mail to this address to retain originals in this private inbox.</label>
    </Form>
    {inboundSettings.enabled && <button disabled={busy} onClick={() => run('document.inboundRevoke',{version:inboundSettings.version})}>Disable document inbox</button>}
  </details>;
}
