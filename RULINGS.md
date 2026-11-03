# Pier rulings

Each ruling below shaped a clause of CONTRACT.md. The clause states the outcome; the ruling states why. RL-1 to RL-7 were moved out of the contract text, its Status Gap cells and the earlier version of this file in the 28 October 2026 contract cleanup; ct's own ruling pass numbers its entries from RL-101, and they are copied here verbatim.

### RL-1 — Owner-only custody of typed-field content

*Date:* 25 October 2026 · *Ruled by:* ct · *Governs:* CAT-003, ADMIN-001, DATA-001, DATA-002, SEC-002, PRINT-001

CT approved the owner-only typed-field custody default with riders on 25 October 2026 at review pin 84d697fae1c7deb512d94707012408049386c167. This records a scope ruling only; implementation and acceptance remain limited to the cited evidence, and CAT-001 remains partial.

The adopted default it approved, as the contract stated it:

Typed-field custody default: only the current owner may define, read, create, change, filter, import or export arbitrary custom-field content on items, customers, suppliers and orders. Only the current owner may generate, retrieve, download, reprint or export documents containing that content or retrieve retained native originals containing it. Current authority applies to direct requests, private projections, retained documents and recovered command results; non-owner responses omit protected content and retained originals. Owner authority alone does not authorize external disclosure: existing destination, field-scope, document and model consent requirements still apply.

Gaps: CAT-001 retains owner-facing controls for field definition, editing, importing and filtering across all four record types and their desktop and mobile proof. ADMIN-001 retains broader explicit role grants for typed-field content and field-bearing documents, including sensitive reads, writes and exports. DATA-002 retains subject attribution and governed erasure of arbitrary field content and retained copies. DATA-001, SEC-002 and PRINT-001 retain archive, authority, egress and document obligations as these doors expand. These remain product targets; this default does not mark them complete.

### RL-2 — Trade-buyer grants and cart follow-up consent

*Date:* 27 October 2026 · *Ruled by:* ct · *Governs:* SALES-005, SALES-009

The SALES-005 scope ruling is CT’s 27 October 2026 approval with riders at review pin `d6542ccd71fbf45894fc4a7ec6d1d4c2929d206b`; it is not a completion judgment.

**CT policy ruling, 27 October 2026 — APPROVE WITH RIDERS.** Adopt explicit current-owner approval of each trade buyer’s customer, item scope and routing destination. The integrating server retains the buyer credential; Pier stores its domain-separated hash. A grant authorizes only its named operations and current scope. Customer and item restrictions apply consistently to catalog, prices, history, status and tracking projections; customer-wide history disclosure requires explicit reviewed authority and cannot arise accidentally from a narrower catalog grant.

### RL-3 — Quote approval authority and the sales authority defaults

*Date:* 22 October 2026 · *Ruled by:* owner · *Governs:* SALES-001, SALES-007, SALES-010

Under the owner ruling of 22 October 2026, exact-version quote price/discount/margin approval uses a configurable human approver role defaulting to Owner; the owner may explicitly designate Sales operator or Buyer, with a retained reason. These authority/custody defaults are approved.

The routing defaults adopted at the same time, which ct then ruled on in RL-103:

Existing source doors use versioned routing before reservation. Zone precedence is ZIP5, ZIP3, state, country, default; eligibility order breaks ties. Splitting is denied until the owner explicitly records customer permission, and only an owner reroutes unpicked work with a reason. These authority defaults await ct approval; SALES-007 stays partial. SALES-005 and DOC-001 inherit this obligation before their new trade/extraction doors ship.

### RL-4 — Recurring order bounds

*Date:* 22 October 2026, 20:40Z · *Ruled by:* ct · *Governs:* SALES-004

ct approved these recurring bounds on 22 October 2026 at 20:40Z. The bounds are owner-only explicit enablement, the exact customer, UTC due day and cadence, a stock rule, a price ceiling and a separately reviewed expiring credit allowance, with at most one occurrence per scheduler pass and no mail or shipment.

### RL-5 — Draft-only workflow rules

*Date:* 23 October 2026, 08:45Z · *Ruled by:* ct · *Governs:* AUTO-002, BUY-002

Ruling to carry verbatim (ct 23 Oct 08:45Z, AUTO-002): rule revisions are pinned, an edit pauses the rule, draft POs carry the rule id and a draft mark, and there is no approval or outbound send by a rule.

The 23 October ct ruling pins rule revisions, pauses a rule on edit and requires generated POs to retain the rule identity and draft mark. The current draft rule grants no purchase approval or outbound send. Broader rule kinds and explicitly authorized approval policies remain required above.

### RL-6 — Native strong-authentication interim policy

*Date:* 27 October 2026 · *Ruled by:* ct · *Governs:* ADMIN-003, ADMIN-002

CT APPROVE WITH RIDERS; STAYS PARTIAL. Review pin `b901b1e3be947bc25a85ebe3e73f78e7467ef8ac`, against main `4a01612c9ef04e2d3442f7ac4e788e443c061f52`. This approves the native interim policy, grants no completion and retains provider boundaries. DONE-RIDERS rows 3, 8 and 9 remain applicable.

CT-approved native interim policy: requiring two-factor authentication, resetting another operator’s factor, revoking sessions and deprovisioning local users require a current native owner session with verified second-factor assurance. Live recovery of an owner’s lost factor requires a different assured native owner. Ordinary sign-in and imported identities are not recovery grants. Recovery invalidates the target’s old factor and session assurance; required private access resumes only after fresh enrollment and verification. Restore excludes factor secrets and session proofs, preserves the authentication requirement and pauses enrollment until explicit audited fresh native owner recovery. That recovery reopens enrollment without itself granting private access, and restored historical identities confer no authority. Onboarding must explain the loss-of-all-assured-owners limit and support preparing another assured native owner. Owner-only administration is an interim policy, not the completed scope: owner-issued, revocable and expiring grants to named assured human administrators must support factor reset, session revocation and local deprovisioning for explicitly named non-owner users or bounded warehouse teams. Such grants confer no business permissions, live self-recovery, owner recovery, delegation management or authority to change organization authentication policy.

Acceptance rider (additive; existing obligations retained):

Exercise an assured owner requiring 2FA, resetting another operator’s factor, revoking existing sessions and deprovisioning a local user; assert the audit actor, target and outcome. Refuse these administrative operations for an unassured owner, an ordinary member and an agent, and refuse live owner self-recovery or recovery without another assured native owner. Assert that recovery invalidates old factors and session assurance and that required private access remains refused until fresh enrollment and verification. Restore an archive with required 2FA and assert absent factors and proofs, preserved enforcement, refused enrollment until explicit fresh native owner recovery, and refused private access until fresh factor verification. Exercise permitted administration under a scoped human grant and refuse foreign targets, owner targets, live self-recovery and organization-policy changes. Revocation or expiry must refuse a prepared delegated operation without changing authority, stock, documents or a successful command result.

Approved replacement Gap:

ADMIN-002 remains partial. Scoped human security delegation, recovery-readiness guidance, sole-owner and loss-of-all-assured-owners recovery, and exact-SHA proof of the added acceptance riders remain outstanding. Existing native evidence establishes only its described subset. Google Workspace and Microsoft Entra ID enrollment and sign-in, fail-closed provider-outage behavior, imported-identity refusal, SSO-linked deprovisioning, revoked existing and new private access, and separately scoped, rotated and revocable service and agent credentials remain unproved. At this pin, the Google redirect URI and test user and a licensed Entra mailbox are not set up. Native journeys establish no provider-operated recovery, hosted security or legal compliance assurance. These boundaries retain ADMIN-002’s scope; owner-only administration is an interim default.

### RL-7 — Owner-only originals and full-original model consent

*Date:* 23 October 2026 · *Ruled by:* ct · *Governs:* DOC-001, SEC-002

Implementation default, 23 October 2026 (ct approval pending): the owner alone retains/downloads originals and reviews inbox mail. Each extraction separately consents to sending the entire original to the fixed OpenAI Responses destination and selected exact model. Signed inbound mail never grants identity or starts a business action; originals remain retained until DATA-001/002 supplies its governed archive/erasure doors. SEC-002 inherits the wider attachment/egress obligation.

The ruling stays in force: on 28 October 2026 ct recorded the old pending marker as stale ("Resolved on main — DOC-001"), resolved by commit `ac98f9b646e6e259841feef47e296b30dec909fb`.

### RL-101 — Commercial custody separate from physical warehouse grants

- Date: 2026-10-28
- Ruler: ct
- Governs: ADMIN-001, SALES-002, SEC-002
- Outcome: **adopt with rider** — Adopt owner-only access to unqualified commercial/customer/financial and arbitrary field-bearing data while explicit current warehouse/location grants authorize only finite physical projections and operations; role, cost/price restrictions and current-result authority must be checked at atomic admission, and physical grants never imply sales, finance, originals or egress authority.

**Question:** May customer/financial/typed-field commercial data remain owner-only while scoped physical work grants ship?

**Adopted default:** Owner-only customer profiles, contacts, addresses, terms, representatives, receivables, financial exports and arbitrary field-bearing content/documents; explicit bounded physical grants; future sales/accountant/field delegation remains unfinished.

**Incumbent behavior and why:** Cin7 permits fine-grained customer/sales access and separately protected financial reporting. No common norm requires all commercial content to remain owner-only. Adopt the narrower current boundary as an interim implementation fence rather than a replacement for role delegation. Preserve the 23 October approved SALES-002 owner-only controls, physical-only scoped grant rider, optional UTC expiry and immediate revocation. SEC-002’s separately approved DOC-001 full-original disclosure boundary remains in force.

**Single placement:** ADMIN-001 owns the interim capability boundary once; SALES-002 and SEC-002 cite it for their receiving reads/commands, while SEC-002 retains its separate connection/egress delta.

**Engineering/proof boundary:** Explicit scoped sales/accountant/customer/typed-field delegation remains required engineering work and no longer awaits a product-policy choice. Credit/overdue enforcement, overrides, imported history, statements, refund/ledger reconciliation and rep reporting remain SALES-002 duties; existing owner-only proof cannot satisfy broader roles.

**Sources:**
- [Customer access is permissioned; used customer records cannot simply be deleted.](https://help.core.cin7.com/hc/en-us/articles/9034481027983-Customer-Management)
- [Financial transaction reports require Financial Reporting permission.](https://help.core.cin7.com/hc/en-us/articles/9034435885071-Financial-Transactions-Report)
- [Invited users receive roles controlling their authority.](https://help.core.cin7.com/hc/en-us/articles/11282072728975-Introduction-to-users)

### RL-102 — Dependency-aware erasure with opaque stock accountability

- Date: 2026-10-28
- Ruler: ct
- Governs: DATA-002, AUDIT-001
- Outcome: **adopt with rider** — Adopt exact current-owner dependency-reviewed erasure/anonymization with hold priority, cancellation/revocation, durable content-free receipts and restore journals; retain only justified opaque stock/accounting evidence, refuse unsupported destructive scope explicitly and never claim complete erasure while immutable personal or external copies remain unresolved.

**Question:** May current-owner reviewed erasure retain justified opaque stock/financial evidence and hold unsupported dependencies unresolved?

**Adopted default:** Exact dependency preview, explicit audited owner confirmation, no automatic deletion; retain opaque stock/financial facts; cancel sends/revoke access; refuse unsupported custody, immutable personal content, holds and unresolved remote effects; old archives fenced.

**Incumbent behavior and why:** Cin7 prevents deleting customers already used in sales and distinguishes personal retention/deidentification obligations. That supports preserving transaction provenance, not permanent retention of arbitrary personal content. No common norm establishes Pier’s full dependency/refusal matrix. Choose safe explicit review with honest partial outcomes, governed removal of removable content and separately justified retained minima.

**Single placement:** DATA-002 owns the erasure/retention authority rule once; AUDIT-001 cites it and owns only append-only redacted attribution and outcome provenance.

**Engineering/proof boundary:** Complete subject erasure, unsupported import/sales-file/EDI/channel custody, immutable personal histories and remote-copy confirmation remain required work. Complete sensitive-edit schemas and provider crash/refund audit coverage remain AUDIT-001 engineering/proof; no policy ruling substitutes for them. DOC-001’s old no-erase-door wording must follow the governed DATA-002 door when it exists, not prohibit all later erasure.

**Sources:**
- [Customer access is permissioned; used customer records cannot simply be deleted.](https://help.core.cin7.com/hc/en-us/articles/9034481027983-Customer-Management)
- [Retention considers collection purposes and legal obligations; deidentified data stays deidentified.](https://www.cin7.com/hubfs/PDFs/2025-Updated-Cin7-Privacy-Policy_FINAL.pdf)

### RL-103 — Reviewed reroutes and explicit split permission

- Date: 2026-10-28
- Ruler: ct
- Governs: SALES-007
- Outcome: **adopt with rider** — Adopt current-owner reasoned rerouting of unpicked work only to eligible warehouses with atomic release/re-reservation and audit; permit split shipments only under the customer’s explicit current split policy, otherwise apply the documented no-split fallback, and keep rule/source/version provenance and reviewed dry runs.

**Question:** May only the owner reroute currently unpicked work while splitting requires explicit customer permission?

**Adopted default:** Owner-only audited unpicked reroute among eligible warehouses with reason; deny split until explicit customer permission; routing rules/version/dry-run and atomic reservations retained.

**Incumbent behavior and why:** Cin7 prompts explicit split or backorder decisions under shortages and assigns role-based operational authority. No common norm requires owner-only reroutes or this exact customer split-consent record. Preserve the 22 October ct approval of these conservative routing defaults and the related SALES-001 configurable approver role defaulting to Owner; no extra owner decision is needed to rule them.

**Single placement:** SALES-007 owns routing/reroute/split semantics once; SALES-005 and DOC-001 cite it before their new order doors ship, and SALES-001 retains its own configurable approval-role rule.

**Engineering/proof boundary:** Faire transport/account proof, literal import/publication and multi-location channel stock writes remain unfinished. The owner-only current door does not drop future authorized-user delegation; channel assignments never create authority or eligible stock that the configured rule did not grant.

**Sources:**
- [Short stock prompts an explicit split-order or backorder choice.](https://help.core.cin7.com/hc/en-us/articles/9034481552783-Getting-started-with-Cin7-Core)
- [Invited users receive roles controlling their authority.](https://help.core.cin7.com/hc/en-us/articles/11282072728975-Introduction-to-users)
