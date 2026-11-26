# Provisional online cash purchase workflow

## Scope and assumptions authorized for this increment

The user explicitly asked to implement a temporary, reasoned payment sequence and amount-change authority while BO interviews are pending. Policy version 1 is an opt-in workflow for online cash purchases. It is a proposed working rule, not an institutional BO policy.

Purchasing attaches a saved checkout quotation/order screenshot and submits the total. BO reviews that exact revision, Admin authorizes it, BO records check release at that total and its payee, then Purchasing confirms the paid/placed order with saved evidence. Receiving becomes eligible only after that order event. A quotation or unpaid checkout screenshot is acceptable before money is released. BO does not overwrite Purchasing's amount. Both increases and decreases before release create a new revision and invalidate BO/Admin approvals. Released funds cannot be revised through this workflow; liquidation remains a BO follow-up.

## Journeys and boundaries

- Purchasing: Track orders -> Provisional online purchase -> quote/evidence -> submit or revise -> after release, record order -> Receiving queue.
- BO: financial clearance -> provisional workspace -> review/return -> after Admin, record check release and payee.
- Admin: existing approval page -> provisional workspace -> authorize/return the exact revision.
- Requesting Office: existing tracking and audit-linked updates. Each provisional decision is identified separately from PR approval.
- Receiving: existing queue/intake, which become eligible when the provisional order is recorded.

Existing POs enter the temporary flow only when Purchasing explicitly submits a quote before clearance. Credit/local cash POs without a plan retain their established path. The existing release endpoint rejects bypass attempts for an enrolled PO and points to the provisional workspace. The main request remains Awaiting_Check_Issuance during review/check/order preparation and changes to Ready_for_Purchase only on recorded ordering. A separate plan stage explains these intermediate steps without repurposing historical PR statuses.

Necessary dependencies: one additive plan table; nullable audit context fields to identify revision, amount, evidence, and notification event; narrow legacy release guard; shared workspace and links; role-scoped read endpoint and conditional write endpoint; notifications derived from committed audit events. Tracking and monthly reports expose the provisional aggregate amount separately from item unit prices. Monthly reports exclude provisional events when identifying the original PO preparer, so a later BO/Admin event cannot replace that attribution.

Protected: Requesting correction/reuse and original fields, legacy API payloads/transitions, cash and credit paths outside enrolled online POs, saved documents, receiving closure semantics, and unrelated checkout changes. No automatic cancellation, asset/MR classification, liquidation, supplier payments, external messages, or live decisions are performed.

## Contract and acceptance

GET /api/po/online-purchase accepts optional poId/prId and paginated page. Existing record/evidence scope applies. Lists pending cash/check POs and previously enrolled plans, including history. Returned plans include revision history and current stage. Only Purchasing, BO, and Admin can enter this workspace. Purchasing can enroll and record ordering, BO can review/release, and Admin can authorize. Other offices retain their existing tracking, audit, evidence and Receiving views.

POST actions SUBMIT, BO_APPROVE, BO_RETURN, ADMIN_APPROVE, ADMIN_RETURN, RELEASE_CHECK, RECORD_ORDER require poId and expected version (0 for first enrollment). Total has at most two decimal places, is positive, and is stored as Decimal(14,2). Evidence must be an ORDER_CONFIRMATION document belonging to this PO. Initial enrollment requires cash/check, no released check, and Awaiting_Check_Issuance. All writes conditionally claim the PO and request timestamps and the plan version. Stale/duplicate writes return 409 and roll back plan, financial flags, and audit. Every success appends actor, revision, amount, document context, provisional policy version, and timestamp. No check is recorded on BO/Admin review.

RECORD_ORDER also requires actualAmount. It must equal the authorized released amount; either direction of difference returns 409 with manual BO-resolution guidance. This feature deliberately provides no liquidation approval or post-release amount-edit action. Quotation evidence is not a supplier reservation guarantee. If a seller requires payment to reserve stock, Purchasing must wait or obtain a fresh quotation and review; the system does not represent an unpaid screenshot as a paid order.

Mobile at 360 px uses stacked fields and wrapped filenames/notes; tablet and desktop retain the same actions. Required checks include normal sequence, role denial, skipped approvals, evidence mismatch, both directions of amount revision, unchanged old audit amounts, after-release revision denial, legacy release bypass, stale saves/rollback, notification recipients, and legacy workflow regression tests.

## Delivery and verification

The additive migration `20261118020000_provisional_online_purchase` was applied to the configured local database on 18 November 2026; Prisma validation, client generation, and migration status passed. No existing PO was enrolled, no check released, and no live purchase decision submitted during verification.

The isolated policy, route, report, notification and neighboring-workflow suite passed 64 tests. This includes a legacy-clearance/enrollment race with an unchanged timestamp; the legacy write also requires no online plan to exist. An inverted Purchasing-authority check was rejected by the tests in a disposable validation copy, then restored. The isolated production build and its application TypeScript check passed. Touched-code lint has no errors; the existing BO effect-dependency and Admin image warnings remain. A standalone whole-project type check still reports the pre-existing ToastT/ToastToDismiss typing errors in tests/action-feedback.test.ts. These are outside this feature.

Isolated Chrome fixtures checked Purchasing, BO and Admin controls across five actionable stages at 360, 768 and 1440 px, with long identifiers, filenames, departments, feedback and email addresses. No horizontal document overflow was observed. The fixtures also verified stale-save input retention, required return feedback, check/order confirmations, success feedback and failed-load recovery. Requests were mocked; this does not establish real staff usability or execute a payment. A read-only check against the configured database confirmed the new relations are readable and that zero POs have been enrolled.

Start or restart the development server after schema/client updates. Open `/dashboard/po/online`, or use the links in Track Orders, Financial Clearance, and Executive Review. Purchasing explicitly submits an eligible PO to enroll it. No seed command is needed.

BO confirmation still needed: whether the school actually permits unpaid reservations before check release, whether BO has delegated authority for any amount difference, how reductions/refunds and liquidation are handled, and who releases the physical check. Policy version 1 is centralized in src/shared/online-purchase.ts. Future revisions must preserve recorded policy versions, approvals, amount snapshots, and existing enrolled records rather than rewriting history.
