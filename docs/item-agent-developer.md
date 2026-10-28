# Item-check developer notes

## Evidence and boundaries

`node --test --test-concurrency=1 tests/api/item-agent.test.mjs` exercises authenticated HTTP against the real Worker and D1. It covers no-key checks, source evidence, unchanged stock on preparation/application, human apply/reject/undo, denied agent authority, stale-input refusal, encrypted configuration on an empty installation, provider request/replay, visible provider failure, secret-free export, and removal. Only the paid provider edge is synthetic; the application does not substitute generated answers when the provider fails.

This is item-level native preparation. It does not establish live OpenAI account acceptance, hosted acceptance, seasonality/promotional forecasts, external channel history, supplier quote validation, physical stock accuracy, end-to-end agent optimization, or ledger reconciliation. Desktop/mobile browser evidence is recorded separately by the parent workstream.

## Native authority and the shared door

The current item-check flow enters `src/pier/api.ts` with the person's native session. Its domain commands use the current Pier role and warehouse/location grant, including commercial visibility, and `src/pier/storage.ts` fences the native session and role version inside the write transaction. An `agent` edition role remains preparation authority; it does not approve purchases, apply reviewed changes or post physical stock.

The source under `src/modules/agent-door` is not yet connected to those commands. Its presence does not make a Business access token a native session, establish a Business-to-Pier sponsor binding or authorize an item-check request. Use the existing authenticated product and command doors described in [Work an item](item-agent.md). Company-policy approval and native buyer approval must not be presented as interchangeable acts.
