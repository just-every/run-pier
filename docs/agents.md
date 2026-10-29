# Company agents in Pier

Pier's Inventory controller works for a named current person through `/mcp`.
Connect with a short-lived Business token for this installation's canonical MCP
address. Business must first bind its owner or teammate ID through signed
Business settings and adopt the company's signed policy. A token's email never
selects a native person. The native role and warehouse, location and commercial
visibility grants still apply on every call.

The released runtime and CLI are rer 0.2.91. This adoption declares tools, policy,
pause, audit and idempotency. Events, resource reads, prompts and subscriptions
are undeclared and receive typed `capability_not_declared` refusals. The complete
target in CONTRACT.md remains a target; this is a preparatory subset.

| Tool | Supported native job | Classes |
| --- | --- | --- |
| `pier.stock.read` | Current granted stock, item identities and preparation receipts; optional PO or proposal revision lookup | standard |
| `pier.questions.ask` | Native stock, shortage, outstanding purchase, supplier, allocation and margin questions, subject to native visibility | standard |
| `pier.activity.read` | Owner's native Activity, optionally by command identity | standard |
| `pier.proposals.prepare` | Evidence-backed proposals, item checks, bulk purchase/promise previews and edits | standard |
| `pier.purchasing.plan` | Draft and revise an uncommitted purchase; revisions invalidate native approval | standard |
| `pier.purchasing.send` | Send one committed purchase under its exact, current native human buyer send authority | external, commitment |

Preparation never approves a purchase, posts physical stock or applies a bulk
plan. The signed company policy decides autonomy, review, approval and refusal
for the declared work. A company approval does not replace Pier's independent
native human purchase approval or exact send delegation. Imported text is
untrusted evidence, never an instruction to grant authority.

For a send, the server reads the current PO, recipient, value and buyer authority.
A pending company approval shows the exact server summary and revision. The
named person decides at `/agents`; the agent cannot confirm as that person.
Activity and correspondence retain “agent for person”; native buyer approval
keeps its own named person. There is no native Undo for these preparation tools.

Every write needs `idempotency_key`. Reusing a key with changed arguments is a
conflict. Revisions come from native records; `expected_revision` can fence a
first effect. Pause, changed policy, revoked consent or agent, removed native
access and expired tokens prevent another effect or cached-result disclosure.
An agent-origin correspondence cannot later be submitted by a background human
send job. An uncertain provider outcome is retained for reconciliation and never
blindly resent.

The current Base monetary fact schema accepts integers. Pier refuses fractional
USD commitment measures with `monetary_precision_unsupported`; it does not round
or guess another currency unit. The exact native PO value remains a decimal.
No provider `cost` or spend-cap enforcement is registered; policy uses
`spend: {none: true}`. The test-only managed-mail relay validates native payloads
and supplies disposable receipts. It proves no production delivery account.

Native two-factor policy remains authoritative. Agent admission currently refuses
when that policy requires native human assurance; a company token is not that
proof. Local SDK, device, import and connector credentials keep their own
purposes and cannot become company-agent credentials. Standalone local bearer
issuance, multi-sponsor proof, resource refresh, cross-host handoffs and durable
queued agent execution remain unproved. Existing native scheduled automation
is not claimed as a Business-governed agent queue.

Capacity limits are the shared door's 600 requests per minute and 1 MiB request
body, plus Pier's native input and page limits. They are request capacities;
company dispositions and approval thresholds come from signed policy.

Use `/agents` for policy state, exact pending approvals, audit, review and local
Pause. The production Worker owns that page and both supported MCP eras through
one copied `createAgentDoor` entry. The executable declaration and disposable
native journey are in `agent-surface.json` and `tests/agent-door/`.

Native subject erasure is blocked while the door retains arguments, outcomes, approvals or audit identity evidence. Governed redaction and an atomic replay fence are required before that custody can be erased; ordinary human-only installations retain their existing erasure flow.
