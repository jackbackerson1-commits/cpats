# Procurement survey coverage review

Date: 28 September 2026

This is the project team's companion to revision 2 of the Ma'am Grace survey. Send the survey to respondents; use this document to check the returned answers before implementation. It reviews the Priority summary and G01–G12 in `proposal-workflow-gap-assessment-2026-09-26.md`, with their necessary dependencies in the current checkout. It does not authorize application changes or claim to cover every possible future procurement feature.

## Finding from the review

The original 16-question survey was not sufficient to begin all proposed features without further policy decisions. It named the main subjects but combined independent decisions and left required branches open. In particular:

- Business review results and Admin authorizations were combined, including the difference between affirming sufficient funds and recording a completed review that found insufficient funds.
- A return question offered removing Requesting Office participation without explaining the protected correction route.
- Reviewer assignment and Purchasing clearance alerts were bundled into choices that did not allow every valid combination.
- Partial and damaged deliveries were combined; excess, substituted, entirely rejected and later replacement deliveries were not resolved.
- Repeated receipts, actual arrival dates, missing evidence, permitted exceptions, quantity units and the distinction between physically received and accepted quantities were missing.
- Official forms, numbering, signatories, suppliers, several POs per request and versioned approved-versus-billed data were insufficiently specified.
- Accounting dispatch, external acknowledgment, in-system receipt, incomplete packages and the meaning of closure were insufficiently separated.
- Permissions were not specified per audience, document type and export capability.
- The Audit indicator's meaning, report event dates, repeated decisions and counting units were not fully defined.
- Reminder clocks, working days, repeat limits, escalation, pause rules and assignment coverage were missing.
- Existing open and closed records, unavailable templates and authority to approve policy changes had no explicit treatment.

Revision 2 uses 30 focused question groups, conditional follow-ups, separate scenario rows and an answer-completion check. This is broader than the initial survey but avoids making technical implementation choices the respondent's responsibility. No answer is preselected. "Consult another office" is an unresolved item, not approval or a default.

## Coverage of every priority finding

| Finding | What the current code shows | Revision 2 questions | Required result before implementing the affected policy |
|---|---|---|---|
| G01 Requester department scoping | The queue already rejects a foreign department for a Requesting Office user and derives its query department from the authenticated user. | No new institutional policy question; Q23 preserves own-department scope. | Verify the existing repair and preserve other authorized queues. Do not present the September 26 defect as still unfixed or reopen requester access by survey implication. |
| G02 Pre-approved letter route | All new requests still enter Business review. The boolean name does not create a bypass. | Q1–2, Q5, Q29 | Exact route, verifier, signer/validity limits, failure path, changed or reused letter handling, downstream financial clearance, start policy. |
| G03 Review attestations | Check states and approval method are absent from decision payloads and stored evidence. | Q3–5, Q8, Q29 | Separate Business positive/negative outcomes and Admin authorizations; approval versus return/decline requirements; fresh confirmation versus evidence-derived checks; signatory/recorder identity, proof, substitutes and treatment of older records. |
| G04 Printable PR and PO | PO creation records number, reference, QR and finance fields; current print action is an asset tag. Supplier is not a structured PO field. | Q7–11, Q23, Q30 | Approved samples or an explicit external/draft fallback; fields, document authority, numbering and signatures; supplier/line allocation; immutable issued versions; print/export audience. |
| G05 Purchase and transmission evidence | Financial readiness advances to receiving without a separate order/transmission event. | Q12–14, Q23, Q27, Q29 | Event meaning per payment method, actor, actual date/evidence, whole PO versus lines, whether it gates receiving, exceptions, failed or cancelled purchase treatment and recipients. |
| G06 Received quantities and discrepancies | Receiving has no per-line actual counts; its submit handler closes for Good or Damaged. | Q11, Q15–19, Q29 | Quantity baseline and units; received/accepted/rejected counts; partial, damaged, excess and substitute policy; repeated delivery/replacement treatment; evidence exceptions; who resolves and finalizes; closure. |
| G07 Received history and printable RR | Active receiving queue excludes POs with receipts; no dedicated history/official RR mechanism. | Q8–10, Q17–19, Q23–24 | Per-delivery/final RR numbering, source format, arrival versus entry dates, history audience, evidence access, correction/reprint history and report counting. |
| G08 Accounting handoff | Receiving closes immediately; no Accounting role or handoff package exists. | Q19–23, Q27, Q29–30 | Manual versus authenticated acknowledgment, exact Accounting actions, sender/recipient, package requirements by payment mode and partial delivery, rejection/resubmission, proof, closure relation, permissions and named decision owner. |
| G09 Audit evidence and indicator | The report omits receiving relations, while the page consumes them and labels a local calculation as COA matching/compliance. | Q23, Q25, Q29 | Repair the demonstrated response mismatch; approve evidence audience and indicator semantics separately. No official compliance claim without supplied criteria. Missing historical evidence remains explicit. |
| G10 Monitoring audience and filters | Audit-only endpoint; Admin decision history and Purchasing monthly report already exist; PAMU seed uses the receiving role. | Q23–25, Q30 | Role/stage/document/export matrix; PAMU identity; current status versus historical decisions; event/month/approval office; repeated decision count; request/PO/receipt rows; totals and official criteria. Preserve existing Purchasing report definition. |
| G11 Reminders | Event notifications exist, but reminder policy and scheduler do not. | Q26–28 | Manual/automatic choice, eligible waiting stages, sender/recipient, first delay, repeat gap/limit, calendar/working days, holidays, sending hours, restart/pause rules, escalation and message/channel policy. |
| G12 Assignment and clearance notifications | Shared role recipients; finance readiness targets Receiving; Purchasing lacks its own dedicated clearance alert. | Q26–27 | Shared versus assigned responsibility; viewing versus action restriction; assigner/substitute/unassigned behavior; independent event-recipient decisions; Receiving early notice versus order notice; channel ownership. |

## Necessary dependencies and separately bounded options

- Approved versus billed values: Q7, Q9–13 and Q24. The release handler can overwrite names and quantities along with prices. Official PR/PO copies and quantity reconciliation need a trustworthy approved/order baseline, stable item references and retained versions. This is a direct dependency of those features, not permission for a general financial redesign.
- Several suppliers/POs and repeat delivery: Q11, Q13–19. The schema has one-to-many relations, but current queue eligibility and transitions do not provide a complete split-order or multi-delivery workflow. Do not infer permission from the relation alone. Implement only the selected arrangement.
- Supporting-record corrections: Q8, Q10, Q17 and Q22. Define who authorizes corrections after a document or package has been used and what must be rechecked. Keep original evidence; never silently overwrite a completed audit event.
- Optional personal mobile signatory approval: Q5d. Explicitly include or retain the authorized staff-and-proof method. An ordinary responsive page does not by itself establish the head's authority or a delegated signatory account.
- Accounting scope: Q20. Dispatch/acknowledgment does not imply a general ledger, accounts-payable module, automated payment, or bank integration. A requested later Accounting task must be named and specified before it enters scope.
- Supplier order cancellation: Q14 and Q19. Included only because a required purchase/receipt event can leave a failed or unfulfilled order waiting forever without an operational resolution. It is not blanket authority to add every cancellation/refund workflow.
- SMS/Messenger or another delivery channel: Q27. A requirement for a new channel needs a named owner and integration scope. Sending this survey by Messenger is not a requirement for Messenger notifications.
- Historical and in-flight records: Q29. Missing attestations, dates, quantities and acknowledgments must not be backfilled from a current status. A policy for open records must be established before new mandatory fields are enforced.

## Source observations that refine the earlier assessment

1. `src/app/api/pr/queue/route.ts` now contains the G01 foreign-department rejection. Treat G01 as implemented in code and subject to verification, not an outstanding coding task by default.
2. `src/app/dashboard/pr/approve-admin/page.tsx` currently selects all three checks when selecting a pending Admin request, not only a fast-track request. Q4 explicitly asks about fresh confirmations. Business also preselects checks in some fast-track/Admin-return entry paths.
3. Business's page requires both positive checks before any decision, including return/decline. Q3b addresses the concrete case of a completed review that finds funds unavailable. Do not silently equate "reviewed" with "satisfactory."
4. `src/app/api/upload/route.ts` stores files under public uploads and does not call authorization. `ReviewPRSchema` expects an absolute URL while that upload response gives a relative path. File-access enforcement and legitimate proof-path validation need focused review as dependencies of the evidence/permission features. Asking Ma'am Grace whether to accept an invalid payload is unnecessary; ask which people and evidence are authorized. No live access exploit or download was attempted.
5. `src/app/dashboard/pr/new/page.tsx` combines category/specification into the saved item name. Receiving and document changes must preserve these existing descriptions rather than assuming an independent specification column exists.
6. `src/app/api/po/release-check/route.ts` writes the submitted billing list to the PR and sets `isCheckIssued` for both credit and cash/check. Preserve source versions and report actual payment modality; do not claim credit clearance proves a physical check or settlement.
7. `src/app/api/receiving/create/route.ts` creates a report and closes for either condition. The queue's `receivingReports: none` rule means partial receipt support affects both the write path and subsequent queue visibility. A new quantity field alone cannot implement repeat receiving correctly.
8. The receiving page supplies a standard Good remark that says quantities match. That wording must be driven by actual chosen quantities in the affected change; a Good condition alone cannot prove a complete quantity.
9. The Audit formula checks evidence across purchase orders and has local minimum/empty-result display behavior. Once the meaning is settled in Q25, verify the arithmetic, missing-data state, and association to the correct PO/delivery. Do not ask a stakeholder to decide whether an arithmetic bug should remain.
10. `src/shared/monthly-report.ts` and `/api/po/reports/monthly` already report POs by Philippine calendar month of PO creation using current stored items and the latest receipt. New report meanings and repeat receiving need explicit integration tests, not a claim that reporting is absent.
11. `/api/pr/return-correction` and the Business PATCH path both use conditional status writes. Preserve the Requesting correction action for Business and Admin returns, the same-request return resubmission, and declined-template creation of a new request. The return path, retained fields and feedback are non-regression requirements.

## Decisions the implementation team should make without another stakeholder survey

- Narrow endpoint/model/component design, preserving external contracts unless an approved outcome requires an extension.
- Authentication, enforcement of the chosen access matrix, parameter validation, safe attachment handling and scoped queries.
- Conditional writes, duplicate submission protection and understandable stale-record messages; no last-writer overwrite of another office's committed decision.
- Transactional event recording and notifications derived from committed events; reading or filing alerts must not change procurement state.
- Responsive layout, keyboard/touch access, loading/error/empty states, search labels and display formatting within the selected business meaning.
- Truthful historical labels, immutable source evidence and traceable revisions; no fabricated approvals, purchases, quantities or payments.
- Date conversions and period boundary tests implementing the chosen event dates in Philippine time.

These defaults solve technical work; they cannot be used to invent a new approval authority, threshold, required document, access audience or closure rule.

## Checks on returned answers before coding the package

1. Route consistency: Q1–2 versus Q3–5 and Q12. A bypass must name verification authority and not leave fiscal clearance undefined.
2. Return consistency: Q6 must preserve existing requester correction/reuse unless the user explicitly authorizes a later change. Any coordination preference must not silently block another office's existing action.
3. Issued-data consistency: Q7–11 must distinguish approved, ordered and billed values and explain revisions. All required form inputs must have an owner/source.
4. Purchase/receiving consistency: Q11 and Q13–19 must agree on single/split orders, line allocation, purchase prerequisite, repeated deliveries, replacements, exceptions, cancelled balances and finality. No route may leave required follow-up with no eligible actor.
5. Accounting consistency: Q19–22 must agree about what closes the PR. Acknowledgment cannot be a closure prerequisite if Q20 leaves the handoff wholly outside CPATS without a recorded acknowledgment method.
6. Permissions consistency: Q5, Q8, Q20 and Q23 must name roles that can actually perform selected actions and open their required files. Monitoring permission must not imply workflow action permission.
7. Reporting consistency: Q24–25 must distinguish status from historical decisions, correctly associate PO/receipt evidence, count repeat events as agreed, separate credit from a physical check, and distinguish billed value from actual payment.
8. Communication consistency: Q26–28 must identify recipients even when no one is assigned, when staff are absent, and when a request changes stage. Every automated schedule needs complete timing, repeat and stop rules.
9. Start consistency: Q29 must provide a usable path for every existing open stage that new mandatory fields affect. Keep closed history truthful and attributable.
10. Completion: Q30 must identify missing samples, approvals or external participation. An unresolved answer is not silently filled in. Resolve all policy blockers for the selected package before implementation, or obtain an explicit decision to keep that part external/deferred.

## What this revision can and cannot establish

Every G01–G12 topic now has a question mapping or a documented technical correction/verification path. That is coverage of known decisions, not proof that the future answers are complete or mutually consistent. A respondent can still give an incomplete answer, another office may withhold authorization, or implementation may reveal an unforeseen constraint. The pre-implementation consistency review is the practical way to avoid preventable interruptions; an unconditional promise of no future questions would be misleading.

Review was read-only for application code. Only the survey and this coverage document were changed or created. No database records, permissions or procurement transitions were altered, and no production behavior was certified.
