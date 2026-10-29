# Signed order webhooks

An installation owner opens Activity → Settings → Order webhooks. Save a draft with an exact public HTTPS destination, the permitted order fields and a private randomly generated signing secret of at least 32 characters. Keep the same secret securely at the receiver: Pier never returns it in state, exports, history or saved command replies. A draft sends nothing.

Preview an existing accepted sales order, inspect the destination and payload, then explicitly approve that exact scope. Future order changes queue notifications. The supported event is `order.changed`; its versioned envelope identifies the event, source order, source order version and command. The optional fields are fulfillment status (open, partly shipped or closed) and line quantities. Customer identities, contacts, addresses, prices and arbitrary custom fields are excluded. The native connection supplies no subscriber actions, purchase approvals, stock writes, receipt authority, Zapier connector or service credential.

Use `webhook.save`, `webhook.preview`, `webhook.approve`, `webhook.rotate`, `webhook.revoke` and `webhook.recover` at the authenticated `/api/pier/commands` door with a unique command identity. Repeat an interrupted command with the identical identity and payload to recover its existing result. `webhook.process` processes approved queued work; the ordinary schedule also processes it. Both paths recheck the approving owner's current authority, the exact subscription scope, destination and signing key before transmission. Only future changes are captured; previewing an existing order does not queue it.

## Receiver verification

The POST body is UTF-8 JSON, with schema `pier-order-webhook-v1`. Verify its exact received bytes before parsing or acting:

- `x-pier-timestamp` is the timestamp used to sign this attempt. Check a bounded timestamp window at the receiver.
- Compute HMAC SHA-256 with the current signing secret over the timestamp, a literal period and the exact body bytes. Compare the hexadecimal result in constant time with `x-pier-signature`, whose prefix is `v1=`.
- Require the signed body's event identity to equal `x-pier-event-id`. Deduplicate by that signed event identity. A reviewed recovery retains the same event and body; it creates a new `x-pier-attempt-id` and timestamp.
- `x-pier-key-version` identifies the signing key revision. Rotation takes effect immediately for future attempts, including queued notifications; coordinate the new secret with the receiver before confirming rotation. Old secrets do not authenticate new attempts.

A 2xx response records HTTP acceptance only. It proves no shipment, physical receipt or accounting outcome. Redirects are not followed. Other responses, lost responses and interrupted attempts stay visible in Delivery outcomes. Response bodies are not retained. No failed or uncertain attempt is automatically resent, including after a restart.

## Recovery and revocation

Inspect the event identity at the receiver before recovering a delivery. Record receiver evidence and explicitly choose either confirmed acceptance, which sends nothing, or confirmed non-acceptance, which queues one new attempt under the same event identity. Blind recovery can duplicate a receiver's effect; keep receiver deduplication even when no acceptance was found. Historical attempts and owner review remain inspectable.

Revocation stops queued work and removes the signing credential. It cannot retract bytes already transmitted. A removed owner's authority blocks delivery even when the subscription was approved earlier. Restoring an archive pauses subscriptions and pending deliveries and excludes signing credentials. Save fresh scope and a fresh secret, then preview and approve again; restored deliveries never resume automatically.

This native order connection is only part of API-002. The Zapier low-stock workflow and action permissions, and the other business event families, remain unfinished. The receiver fixture used by tests establishes the native protocol, not a live Zapier or subscriber-account qualification.
