# Procurement interview implementation plan

## Feature scope

Requested outcome: apply the settled purchasing interview findings in small verified increments while BO clarifications are pending.

Affected journeys for the first increment: Purchasing order tracking, BO financial-clearance detail, and Receiving history -> saved PO supporting documents -> upload or open evidence. The document register records who saved each attachment and when.

Existing implementation: PO creation advances to Awaiting_Check_Issuance; BO clearance advances to Ready_for_Purchase; intake advances to Received_and_Closed. Evidence uses private /uploads references and role/department-scoped record access. No PO supporting-document relationship exists.

Allowed changes: an additive PO document register for online order confirmations, delivery receipts, claim slips, Statements of Account (SOA), signed RR, and signed MR; narrow UI integrations; accurate payment/document guidance. Document records do not constitute ordering, financial approval, receipt acknowledgment, payment, or Accounting acknowledgment.

Direct dependencies: additive Prisma model/migration, existing evidence access extended to references in the register, one authenticated document endpoint, reusable document panel, isolated regression tests.

Protected behavior: existing API payloads, workflow transitions, role permissions for decisions, original intake and evidence, audit-history meanings, Requesting Office returnId correction and declineId reuse, and saved request fields. Existing checkout changes remain independent.

Excluded from this increment: financial-price authority, automatic cancellations, new Accounting role, supplier communications, mandatory SOA, MR threshold selection, replacement of the damage action, automated reminders, and historical backfills.

Pipeline impact for the first increment: none. Later transitions depend on the BO answers and explicit capability scope.

Verification: isolated Node/tsx endpoint and evidence tests; TypeScript; lint on touched files; production build; responsive panel checks at 360, 768, and 1440 px when a browser is available. Migration/database verification must be reported separately from mocked tests. Never seed or clear working records.

## Sources and decisions

- Dulce Maria Frasco, CPATS Seven Follow Up Questions.pdf (18 November 2026), answers 1-7: Admin-approved PO leads to purchasing; claim slip/DR supports RR/MR; supplier document is SOA; SOA may follow goods; no existing proof of CSR-to-BO submission.
- RECEIVING REPORT AND MR FORM-FOR COMPUTERIZATION.xlsx: actual RR/MR layouts and signature fields. They are references for later document preparation; no signatures, receipt counts, classifications, or authorizations are inferred from sample entries.
- Ma'am Grace's completed interview: both Admin approvals and Requesting Office acknowledgment. These are business findings, not already implemented behavior.

## Capabilities and build order

| Capability | Result | Dependencies and readiness |
| --- | --- | --- |
| PO supporting documents | Save/open source files, including a late SOA and signed forms | Ready. Reuses current PO and evidence access. First delivery. |
| Payment terminology and guidance | Cash/check and supplier credit; SOA naming | Ready as guidance around current behavior. |
| PO finance and second Admin review | Review actual PO/BO inputs before ordering | Implemented for explicitly enrolled online cash POs in provisional policy v1. The need for two Admin approvals is interview-supported; payment timing and amount/revision authority remain provisional. Local cash and credit retain their existing routes. |
| Purchasing order event | Distinguish PO preparation from placing an order | Implemented for enrolled online cash POs: Purchasing records the reference, actual total and saved order evidence after check release, then Receiving becomes eligible. Broader credit/local-cash integration remains pending finance details. |
| Receiving and RR/MR preparation | Quantities, receiving documents, signatures | Manual/editable-prefill drafts, revision history, original-layout Excel export and signed-copy attachments implemented; see [RR/MR scope](rr-mr-preparation.md). Automatic eligibility, signature validation, cancellation, partial-goods release and numbering remain pending confirmed rules. |
| Department handover and subsequent documents | Acknowledgment and visible pending documents | Confirm closure rule and responsible positions. Accounting receipt must not be invented. |

## Supporting document contract

GET /api/po/documents?poId=<uuid> returns saved metadata and canAttach. Existing evidenceRecordScope determines read access, including department scoping. Purchasing and Receiving can add documents only where they can already read the PO. Other existing readers remain read-only. System Administrator gains no procurement access.

POST /api/po/documents accepts poId, kind, filePath, fileName, and optional notes. References must be private uploads accessible to the actor and physically present. Server assigns uploader and timestamp. Duplicate (PO, file reference) saves are idempotent with no metadata rewrite. Files already attached to another PO cannot be reassigned. New uploads append entries and preserve earlier files. A late SOA is allowed on a closed request. The register never changes PR/PO status, payment flags, items, or procurement audit events.

UI shows loading, empty, failed-load/retry, save failure, and saved states. It retains pending inputs after failure, disables uploads while pending, clears the form only after confirmed save, wraps long filenames, and uses stacked controls on phones. Uploading is optional and cannot block any existing workflow action.

## Remaining BO questions

### Step 2 review: second Admin approval and Purchasing ordering

Requested outcome: verify and complete these two capabilities without duplicating the steps already delivered in the provisional online cash build. Affected journeys are BO review -> second Admin authorization/return -> BO check release -> Purchasing order recording -> existing Receiving queue. This follow-up changes the roadmap and source assessment only; it does not change endpoints, records, office authority, or the existing local-cash/credit routes. Verification: inspect current policy, handler, callers and interview responses; rerun the focused policy/route/notification/report tests.

Interview evidence was visually rechecked against the saved source renders:

- Interview for Maam Grace.pdf, page 1, question 1: the highlighted response selects Admin approval at both stages. This supports a separate prepared-PO review in addition to initial requisition approval.
- CPATS Seven Follow Up Questions.pdf, page 1, answer 1: Dulce Maria Frasco describes Purchasing placing the order after Admin signs/approves the PO, with a claim slip or delivery receipt obtained from the seller. This supports recording ordering separately from preparing a PO.
- The same PDF, page 1, answer 3: for online cash purchases, the PO amount is reviewed by BO and Admin and forms the basis for a check; BO does not need to enter it a second time.
- The same PDF, pages 1-2, answers 3-4: the screenshot upon ordering may establish the final amount; changes may be handled through liquidation. These answers do not establish whether an unpaid checkout/reservation precedes the check, who authorizes a difference, whether increases and reductions follow the same approval rule, or the detailed liquidation process.

Assessment: enough evidence exists for the two basic responsibilities and their separation. Another policy assumption is unnecessary merely to add them again. Their current online cash implementation already includes role checks, exact-revision authorization, return feedback, order evidence and audit/notification events. The rules requiring check release before order recording, fresh approvals for every amount revision, and blocking post-release differences remain explicitly provisional. Do not present those rules as BO-confirmed or extend them to other payment routes by inference.

The focused policy, route, notification and report suite was rerun for this review: 11 tests passed. No live procurement decisions were submitted. See [the provisional workflow contract](provisional-online-purchases.md) for the implemented scope, previous build/browser verification, and remaining limitations.

Confirm online order/check timing; local cash process and payee; who authorizes final amount changes and liquidation; where credit prices are first recorded and how SOA is reconciled. Roly Espacia and Joy Cinco are the named BO contacts, with their exact responsibilities to be confirmed directly.

## First increment verification and activation

Implemented the register in PO tracking details, financial clearance (read-only), and Receiving history. Purchasing/Receiving can attach files with uploader/time metadata. The earlier signed forms and uploaded evidence are retained. No confirmation of payment, delivery, ordering, or Accounting receipt is inferred from an attachment.

Passed 52 isolated tests using `npx tsx --test tests/po-documents.test.ts tests/evidence-security.test.ts tests/workflow-safeguards.test.ts tests/queue-read-scope.test.ts tests/receiving-history.test.ts tests/workflow-guide.test.ts tests/purchasing-tracking.test.ts tests/request-drafts.test.ts tests/request-templates.test.ts`.

Prisma schema validation and client generation passed. Touched-code lint passed with one existing exhaustive-deps warning in the BO clearance page. An additional unchanged Business evaluation test fails because its harness lacks describeSubmissionIssue. Standalone TypeScript checking also exposed existing action-feedback test type errors and malformed generated .next/dev route declarations in the working checkout. These unrelated files were not repaired.

Built the current source successfully in an isolated temporary copy using `npm run build -- --webpack` and a disposable verification SESSION_SECRET. The default Turbopack run cannot use that temporary copy's node_modules junction. The working .next output and running development processes were preserved.

Headless Chrome checked the real document component with intercepted fixture requests at 360, 768, and 1440 px. Verified long-content overflow, loading/empty/read-only/error states, failed-save input retention, upload-reference reuse on retry, and confirmed-save feedback after a failed refresh. This is component/runtime verification, not live authenticated database verification.

The configured MySQL service initially refused connections. During follow-up diagnosis of the shared document-panel error, MySQL was available and migration status showed exactly one pending migration, 20261118010000_purchase_order_supporting_documents. Applied that additive migration with `npx prisma migrate deploy`, regenerated the Prisma client, and confirmed the schema is up to date. A real table/uploader-relation read succeeded. Direct read-only endpoint verification against existing active accounts and eligible POs returned HTTP 200 for Purchasing, Receiving, and Business Office. No procurement decisions or records were submitted. A live browser upload/reload remains to be verified; the user may need to refresh or restart the existing development server to clear any cached client.
