# Work an item

Open Stock, select an item, and choose **Run item checks**. This works without an AI account and does not change stock, purchase orders, supplier terms, or replenishment policies.

The saved review compares:

- Sellable on-hand quantities against outstanding sales demand and the remaining quantities on committed purchases. Expected purchases never become present stock.
- Each supplier's current item price against its most recent posted receipt with a reviewed USD cost. Reversed receipts and receipts without USD cost evidence do not establish a new price. Freight and duty stay separate.
- Each warehouse's reorder point against observed native shipments in the selected policy window, supplier lead days, and buyer-entered safety stock. No shipments means no learned point. Stockouts can censor observed demand.

The review retains source identities, input versions, its input fingerprint, assumptions, exact before/after fields, and the person or agent that prepared it. Open **Calculation and source records** or **Exact proposed change and source evidence** to inspect that evidence.

## Review a proposed change

A current buyer or owner enters a reason and applies or rejects an exact change. An agent can prepare checks and request an explanation but cannot apply, reject, or undo business changes. Current native session and role authority are checked in the same atomic admission as the write.

Available changes are deliberately bounded: update a supplier-item price to the last observed receipt cost; update an existing replenishment policy's reorder point to observed lead-time demand plus safety stock; or create a purchase draft using the existing policy's case-pack, supplier-minimum, open-demand, and expected-supply calculation. Missing supplier terms, a missing policy, absent shipment history, or an invalid order-up-to maximum can leave a check with no proposed change.

A purchase draft still needs its ordinary exact buyer approval and commitment. Applying an item review neither sends a supplier message nor posts a physical movement. Item-check and AI-setting commands do not trigger the installation's automatic replenishment drafting loop.

New item evidence invalidates an unapplied action. Run checks again after a changed order, receipt, shipment, supplier term, policy, or other relevant input. Rejection remains possible for an obsolete proposal. Each successful apply, reject, and undo records its actor, reason, command identity, time, and outcome in the item review and ordinary business export.

**Undo this change** restores the prior editable supplier price or reorder point only while that target still has the version produced by the action. A purchase draft can be removed only while it is unchanged, unapproved, and uncommitted. A reviewed, edited, or committed consequence requires its ordinary purchasing or policy workflow. Undo does not erase the review or command history. Undo after an unrelated evidence change does not make the other old proposals current again.

## Optional AI setup

Open **AI setup** (`/app#ai`). This page works on an empty installation, before any catalogue or warehouse exists. An installation owner supplies their own OpenAI API key, an exact model ID available in that account, and explicit consent to the provider's processing and charges. Check [OpenAI pricing](https://developers.openai.com/api/docs/pricing) and account spending limits before enabling it. Pier does not add a provider fee.

The key is encrypted using the installation secret. It is never returned in state, review history, or the business export. A blank key keeps an existing connection; **Remove AI key** replaces the encrypted credential with an empty credential object and stops new explanations. Installation archives exclude credentials, so reconnect after restoring or changing the installation secret.

After running item checks, **Explain with AI** sends only those checks, exact proposed changes, and cited record IDs to `https://api.openai.com/v1/responses`. It does not send customer contact details or the full catalogue. The shared AI client makes one request with `store: false`, no tools, a 45-second deadline, an output-token limit, and a bounded input. This follows the [official OpenAI Responses guidance](https://developers.openai.com/api/docs/guides/migrate-to-responses). The provider's own policies and charges still apply.

The explanation is advisory text about the saved evidence. It cannot add executable actions, approve a change, post inventory, create physical count evidence, or send a message. The human reviews the deterministic exact proposed action, and its fingerprint is checked again on apply.

Pier records that the explanation is starting before sending the paid request. Replaying a completed request returns its recorded result. Concurrent requests with the same identity cannot cause a second provider call. A failed or uncertain provider outcome is visible and is never automatically retried or sent to another model/provider. If execution stops after the claim, the review can remain **Requesting**: the result may be unknown and the request may have been billed. Run fresh item checks only if you choose to initiate a new paid request.

## Current limits

Item checks prepare changes for human approval. They do not establish physical stock accuracy, seasonal forecasts, supplier quote validation or an agent that runs the whole business loop. Your OpenAI account is required for explanations. [Item-check developer notes](item-agent-developer.md) list transport and test details.
