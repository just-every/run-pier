# Item-check developer notes

## Evidence and boundaries

`node --test --test-concurrency=1 tests/api/item-agent.test.mjs` exercises authenticated HTTP against the real Worker and D1. It covers no-key checks, source evidence, unchanged stock on preparation/application, human apply/reject/undo, denied agent authority, stale-input refusal, encrypted configuration on an empty installation, provider request/replay, visible provider failure, secret-free export, and removal. Only the paid provider edge is synthetic; the application does not substitute generated answers when the provider fails.

This is item-level native preparation. It does not establish live OpenAI account acceptance, hosted acceptance, seasonality/promotional forecasts, external channel history, supplier quote validation, physical stock accuracy, end-to-end agent optimization, or ledger reconciliation. Desktop/mobile browser evidence is recorded separately by the parent workstream.
