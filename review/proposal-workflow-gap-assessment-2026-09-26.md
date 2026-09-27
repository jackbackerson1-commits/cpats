# CPATS proposal-to-system workflow inspection

**Inspection date:** 26 September 2026  
**Scope:** Current working-tree implementation compared with Sir Lugo’s purchasing-cycle PDF and workbook.  
**Outcome:** Findings and recommendations only. No application, endpoint, permission, status, database, or procurement pipeline changes were made during this inspection.

## 1. Executive assessment

CPATS implements the main Requesting Office → Business Office → Admin Office → Purchasing Office → financial clearance → Receiving Custodian sequence. It also provides useful additions: correction forms with saved inputs, declined-request reuse, office decision histories, notifications, Purchasing tracking, monthly CSV reports, and receiving photos/QR identification.

The largest proposal gaps occur **around purchasing documentation, evidence of actual purchase, receiving records, the Accounting handoff, and institution-wide monitoring**. There are also two significant implementation findings: Requesting Office queue scoping accepts a caller-supplied department, and the Audit screen expects receiving data that its endpoint does not supply.

The pre-approved-letter route differs deliberately from the proposal. The proposal permits going directly to PO; current code retains Business and Admin review. This is a stakeholder decision to resolve with Ma’am Grace, not authorization to bypass existing approvals.

Sir Lugo’s retirement does not itself change an office’s authority. No interview record establishing Ma’am Grace’s approved deviations was supplied. Therefore this report distinguishes explicit proposal content, implementation defects, optional alternatives, and recommended improvements.

### Priority summary

| Priority | Finding | Affected offices | Why it matters |
|---|---|---|---|
| High | G01: Own-department queue restriction is not enforced against a supplied department ID | Requesting Office | Conflicts with the proposal’s explicit office-only visibility rule |
| High | G09: Audit receiving evidence is omitted by its endpoint | Audit | Completed transactions can appear unmatched and receiving evidence unavailable |
| High | G03: Required review attestations exist only in the client | Business, Admin | Stored decisions do not independently demonstrate completion of the required checks |
| High planning priority | G06–G08: Actual receiving quantities, reusable receiving reports, and Accounting handoff | Receiving, Accounting | The proposed documentation chain is incomplete in the application |
| Medium | G04–G05: Printable purchasing documents and actual purchase/transmission evidence | Purchasing | Creating a PO record is not evidence that goods were ordered or purchased |
| Medium | G10: Monitoring permissions and filtering are incomplete | PAMU, Admin, Audit | The proposal’s viewing/reporting audience cannot use the same monitoring capability |
| Decision required | G02: Direct PO for pre-approved letters | Requesting, Business, Admin, Purchasing | Current implementation intentionally follows a different route |
| Clarification first | G11–G12: Reminders and notification assignment | Reviewing offices, Purchasing | Workbook notes do not define the operating rules |

Priorities are recommendations for planning, not permission to implement changes.

## 2. Evidence and limits

### Proposal sources

- **PDF:** `C:/Users/James Ian/Downloads/Proposed Online Purchasing Cycle_manual-1-1.pdf`, five pages. All five pages were visually inspected, alongside extracted text. Page references below use one-based PDF page numbers.
- **Workbook:** `C:/Users/James Ian/Downloads/Online Purchasing Cycle.xlsx`, `Sheet1`. Inspection included populated cells, diagram shapes, and all three embedded images. Some diagram content extends below the populated cell range; inspecting cell values alone would miss it.
- Workbook receiving form: drawing **“Rectangle: Folded Corner 9”**, approximately `AY18:BC32`, explicitly shows supplier, quantity ordered, quantity received, and condition.
- Workbook monitoring images: **“Picture 10”** approximately `BL4:BT46` and **“Picture 11”** approximately `BL49:BT68`. The latter contains the monitoring-access requirements.
- Workbook reminder annotations: `BM3` and `BU5`. These add reminder wording without defining recipients, timing, or escalation.

### Repository sources and constraints

Read `AGENTS.md`, `FEATURE_IMPLEMENTATION.md`, and `STATUS.md`; inspected Prisma models, validation schemas, API handlers, role restrictions, notifications, and consuming pages. The report describes the **current working tree**, including changes that already existed before this inspection. It is not limited to the last commit.

This is a static implementation review. No real transactions were submitted, no department-access exploit was attempted, and no production database, deployed configuration, SMTP delivery, or external paper process was verified. “Implemented” means supporting code exists; it does not certify live operation. Absence findings refer to this repository, not to work performed manually by office staff.

Code references below are repository-relative and include selected line anchors for locating positive evidence. For absent capabilities, the evidence is the relevant model/schema/handler together with the available API and page inventory.

## 3. What is already implemented

| Proposal requirement or existing capability | Implementation assessment | Evidence |
|---|---|---|
| Request description, quantity, justification, department, submission | Present | `src/validation/pr.schema.ts`; `src/app/api/pr/create/route.ts` |
| Automatically assigned request reference | Present through generated request ID; abbreviated references also appear in notifications | `prisma/schema.prisma`; `src/shared/notifications.ts` |
| Business necessity/budget review and approve/decline/return | Present, with attestation limitation in G03 | `src/app/dashboard/pr/evaluate-business/page.tsx`; `src/app/api/pr/evaluate-business/route.ts` |
| Approved Business review forwarded to Admin | Present | Business evaluation handler |
| Admin approve/decline/return | Present | `src/app/api/pr/review/route.ts` |
| Three Admin approval checkboxes | Present in the screen; server evidence incomplete | `src/app/dashboard/pr/approve-admin/page.tsx:389`; G03 |
| Option 1 communication-proof upload | Present as an optional UI mode with proof validation | Admin approval page and review handler |
| Initial notifications to Business, Admin, Purchasing | Present | `src/shared/notifications.ts` |
| Purchasing-controlled PO creation | Present | `src/app/api/po/create/route.ts` and role authorization |
| Cash check waiting and release | Present | PO creation and `src/app/api/po/release-check/route.ts` |
| Good/damaged receiving assessment and invoice attachment | Present | `src/validation/receiving.schema.ts`; receiving create handler |
| Request tracking and declined status | Present, with department-scoping defect in G01 | Request queue and Track Requests page |
| Returned request modified using saved values | Present and explicitly protected by repository instructions | `src/app/dashboard/pr/track/page.tsx:458`; `/api/pr/return-correction`; New Request template loading |
| Declined request reused as a new request | Present; original remains terminal | Track page `:469`; `/api/pr/declined-template`; New Request page |
| Separate Decline Notice filter | Present in current working tree | `src/app/dashboard/pr/track/page.tsx:1043` |
| Business/Admin decision history | Present | `/api/pr/business-history`; `/api/pr/admin-history`; respective pages |
| Business revision after an Admin return | Present as an existing extension; must coexist with requester correction | PATCH `/api/pr/evaluate-business` |
| Purchasing tracking and monthly CSV | Present | `/api/po/tracking`; `/api/po/reports/monthly` |
| Audit status filtering and chronological sorting | Present | Audit page and `/api/audit/report` |

The proposal’s sample `PR-2026-001` does not clearly establish a mandatory sequential numbering standard. UUID-based references should not be classified as noncompliance solely because the sample looks different.

## 4. Detailed findings by role

### G01 — Requesting Office: own-office visibility has a server-side scoping defect

**Classification:** Confirmed static code defect against an explicit proposal restriction. **Priority:** High.

**Proposal:** PDF p4 says requesting offices may monitor requests created by their office only. Workbook “Picture 10” repeats this.

**Current behavior:** `src/app/api/pr/queue/route.ts:33` derives `targetedDepartmentId` from the submitted `departmentId` before falling back to the signed-in user’s department. The Requesting Office branch then queries that department at line 38. The role check prevents impersonating a different role, but does not prevent selecting a different department within the requester role.

**Impact:** A signed-in requester who supplies another valid department ID appears able to retrieve that department’s requests and audit history. This was identified by reading code; no cross-office retrieval was attempted.

**Recommended acceptance criteria:** Requester queries always use the authenticated department; a supplied foreign department is rejected or ignored consistently. Authorized cross-office viewers retain their separately approved access. Verify this at the endpoint, not only by hiding department controls.

**Boundary:** Authorization code would change. This inspection leaves it untouched; approve a focused correction separately.

### G02 — Pre-approved letters: the proposed direct-PO option is not available

**Classification:** Confirmed implementation difference requiring stakeholder confirmation.

**Proposal:** PDF p1 and workbook `H7` allow previously approved letters to proceed directly to PO without the PR process.

**Current behavior:** `src/app/api/pr/create/route.ts:28–29` explicitly places even pre-approved-letter requests into `Pending_Business_Approval`. The application stores the letter and marks the request for fast-track recording, but still uses Business and Admin review.

**Impact:** “Pre-approved” currently means expedited review within the existing route, not direct PO eligibility. Implementing the proposal literally would change approval authority and queue eligibility.

**Recommendation:** Ask Ma’am Grace whether this is an approved replacement for the original proposal. If yes, document the revised rule and describe it accurately in the UI. If no, specify who validates the letter and what authorizes PO preparation before designing any alternate route.

**Boundary:** Pipeline change. Do not implement solely because the proposal mentions it.

### G03 — Business/Admin: review controls are visible but not independently recorded or validated by the server

**Classification:** Partial implementation. **Priority:** High for approval integrity.

**Proposal:** PDF pp1–3 requires necessity/budget review and three mandatory Admin confirmations. Workbook `AB28`, `AB30`, `AB32`, `AB34` names the three authorizations; `AI8:AI10` describes Option 1 proof.

**Current behavior:** Business has necessity/budget checkboxes. Admin requires all three approval checkboxes in its submit handler and requires an attachment when Option 1 is enabled (`approve-admin/page.tsx:389` onward). However:

- Business payload/schema contains request ID, action, and remarks, without individual review attestations.
- Admin payload/schema contains request ID, action, remarks, and optional proof URL, without the three attestations or an approval-mode field (`src/validation/review.schema.ts`).
- The server cannot distinguish a direct sign-off from Option 1 to enforce mode-specific proof. It records an actor/decision and optional proof, but not each confirmation separately.
- Fast-track screens preselect review checks. Whether this represents acceptable confirmation of an existing letter needs stakeholder agreement.

**Impact:** The normal screen guides staff, but API acceptance and stored evidence do not establish that every mandatory confirmation was made. This does not prove that staff skipped their review.

**Recommended acceptance criteria:** After stakeholder agreement, required confirmations are validated and associated with the approving actor and time; Option 1 has identifiable proof; decline/return behavior remains appropriate; past records are not retroactively portrayed as having attestations that were never stored.

**Boundary:** Payload, validation, and possibly supporting-data changes require approval. An automated budget ledger is **not** explicitly required by the proposal; do not expand a manual budget review into a financial integration without a separate decision.

### G04 — Purchasing: PO registration exists, but printable PR/PO documents are incomplete

**Classification:** Partial implementation. **Priority:** Medium.

**Proposal:** PDF p3 and workbook `AO19:AO22` call for reviewing/printing the approved request, preparing/printing the PO, then purchasing or transmitting it to the supplier. `AO4` assigns PO custody/control to Purchasing.

**Current behavior:** PO creation stores a PO number, request link, QR token, and financial flags. `prisma/schema.prisma:103` has no supplier or generated PO-document record. The PO screen’s print action (`src/app/dashboard/po/new/page.tsx:241`) prints an asset-tag sticker. Its custody checkbox affirms that a hard-copy PO has already been prepared/printed; it does not generate that procurement document.

**Impact:** The application supports registering and identifying a PO, but staff still need an external method to produce the actual approved PR and PO. Supplier information shown in the workbook receiving mockup is not a structured PO field.

**Recommendation:** Confirm the institution’s approved document templates and whether paper preparation is intentionally external. An additive printable view of existing approved data can be planned first; new supplier/document fields need a defined data source and custody policy. Preserve the approved item details and make the printed record identifiable and reproducible.

**Boundary:** Printing existing data can be additive. Changing PO eligibility, mandatory fields, or approval content is a separate decision.

### G05 — Purchasing: “Purchased” and supplier transmission are not separately evidenced

**Classification:** Missing proposal milestone. **Priority:** Medium.

**Proposal:** PDF pp3–5 includes purchase/transmission and a distinct Purchased status; workbook `AO22` and “Picture 10” reflect these concepts.

**Current behavior:** `PRStatus` (`prisma/schema.prisma:24`) moves from financial waiting to `Ready_for_Purchase`, then receiving closure. No dedicated purchased/transmitted event, date, or supplier acknowledgment was found. Purchasing tracking exists, but derives from those existing states.

**Impact:** “Ready” shows permission/readiness; it does not establish that Purchasing placed an order or completed a purchase. Requesters cannot distinguish these real-world events using a recorded purchase milestone.

**Recommendation:** Define what “Purchased” means for cash versus supplier credit and who records it. Consider a supporting event if it only adds visibility; if it becomes a receiving prerequisite, it is a pipeline change. Never relabel all ready records as purchased without evidence.

### G06 — Receiving: actual quantities and discrepancies are not captured

**Classification:** Missing structured requirement. **Priority:** High planning priority.

**Proposal:** PDF p4 requires quantity/condition verification. Workbook receiving drawing “Rectangle: Folded Corner 9” explicitly distinguishes Quantity Ordered and Quantity Received and identifies the supplier.

**Current behavior:** The screen has a quantity-verification checkbox (`src/app/dashboard/receiving/new/page.tsx:319,597`). Its schema and `ReceivingReport` model store condition, invoice, photo, and remarks, without received quantities or per-item receiving lines. The checkbox itself is not a required server payload field.

**Impact:** If ten units are ordered and eight arrive, there is no structured record of eight received or two outstanding. A statement that quantities were checked cannot support quantity reconciliation or a report of actual receipts.

**Recommended acceptance criteria:** Receiving can compare ordered and actual quantities per line, identify the supplier/PO, and preserve discrepancies. Define treatment of partial, excess, and damaged deliveries with Ma’am Grace before making any of them control closure.

**Boundary:** Supporting quantities require data/schema design. Partial-delivery and closure rules require explicit pipeline authorization.

### G07 — Receiving: record creation is present; printable RR and received-history access are missing

**Classification:** Partial implementation. **Priority:** High planning priority.

**Proposal:** PDF p4 lists Received Items and Generate Receiving Report, and requires generating/printing that report. Workbook `BD24` and the Receiving dashboard drawing repeat this.

**Current behavior:** `/api/receiving/create` creates a database ReceivingReport. There is no dedicated printable RR template or report-number mechanism in the reviewed code. The custodian queue (`src/app/api/pr/queue/route.ts`, Receiving branch) returns ready POs with no receiving reports; completed receipts disappear from that active queue. No separate custodian received-items history endpoint/page was found in the route inventory.

**Impact:** Saving a receiving row does not provide the reusable document or received-items workspace described by the proposal. Later invoice/receipt retrieval cannot rely on the active queue.

**Recommendation:** Add an authorized read-only receiving history and printable RR based on recorded evidence. Define the approved form and numbering convention; the proposal does not prescribe a specific numbering format. Historical records must remain read-only and must not be resubmitted through the receiving action.

**Boundary:** History/printing can be additive if permissions and closure remain unchanged; any new access audience needs approval.

### G08 — Receiving → Accounting: document forwarding is not recorded

**Classification:** Missing handoff. **Priority:** High planning priority.

**Proposal:** PDF p4 and workbook `BD25:BD26` require invoice/supporting documents and forwarding the complete package to Accounting for recording and payment processing.

**Current behavior:** An invoice and asset photo are stored. The receiving handler immediately sets `Received_and_Closed` (`src/app/api/receiving/create/route.ts:50–60`). No forwarding action, package-completeness record, Accounting destination, acknowledgment, or Accounting workspace was found. The Role enum has no Accounting role.

**Impact:** CPATS cannot demonstrate that Accounting received the complete transaction package. “Closed” currently means receiving completed, not proof of Accounting receipt or payment recording.

**Recommendation:** First establish whether forwarding is manual or in-system and which documents constitute the package. A recorded manual dispatch/acknowledgment may satisfy the operational requirement without building a full Accounting module. If Accounting must receive and act within CPATS, define its access and responsibility explicitly.

**Boundary:** A supporting handoff record may be additive; changing what closes a request or adding Accounting authority changes the pipeline. The proposal does not require a complete general ledger or accounts-payable subsystem.

### G09 — Audit: receiving evidence is omitted from the API response consumed by its screen

**Classification:** Confirmed client/server mismatch, plus incomplete document presentation. **Priority:** High.

**Proposal:** PDF p5 provides Audit viewing/reporting access. The complete receiving document package originates in p4.

**Current behavior:** `/api/audit/report` selects only `poNumber` and `isCheckIssued` under purchase orders. The Audit page expects nested `receivingReports` and checks them for a Good receipt (`src/app/dashboard/audit/page.tsx:165–170`), and later tries to display receiving evidence. Those nested rows are absent from this endpoint’s response.

**Impact:** Even a recorded Good receipt cannot contribute to the screen’s “3/3” calculation through this response. Receipt/evidence views depending on that relation remain empty. Moreover, the screen’s “COA Audit Compliance” label is a local derived indicator, not evidence of an externally validated compliance assessment; neither proposal specifies that formula.

**Recommended acceptance criteria:** An authorized auditor can see the actual receiving record and its permitted attachments; completed Good receipts are reflected accurately; missing evidence remains explicit; credit transactions are not represented as physically issued checks merely because the shared clearance flag is true. Confirm the meaning and label of any derived match indicator with Audit.

**Boundary:** Read-only response/presentation repair can preserve transitions. New evidence access and compliance semantics must be reviewed explicitly.

### G10 — PAMU/Admin/Audit: monitoring audience and filters are incomplete

**Classification:** Partial implementation. **Priority:** Medium.

**Proposal:** PDF p5 and workbook “Picture 11” grant viewing/reporting to Asset Management, Audit, and Admin, with date/month/department/status/approved/declined filtering.

**Current behavior:**

- Global Audit route and report endpoint allow only `Global_Auditor` (`src/shared/rbac.ts:16`; audit report handler).
- The seed maps PAMU to `Receiving_Custodian` (`prisma/seed.ts:14,23`). Therefore Asset Management is represented organizationally, but its current role lacks the proposed broad monitoring view. A new role is not automatically necessary.
- Admin has decision history, which is useful but not a full institution-wide downstream report.
- The Audit API supports department and date ranges (`src/validation/audit.schema.ts`). The Audit screen sends only status and sort order (`audit/page.tsx:112–119`) and exposes those controls, without date/month/department controls.
- Purchasing has a monthly report and CSV export. That capability must not be reported as absent, but it does not fulfill the other offices’ access requirement.

**Recommendation:** Agree on a role-by-role read-only visibility matrix. Expose existing permitted date/department filtering; clarify whether “approved” means current status or any historical approval, since approved requests later move through purchasing and receiving. Month filtering can be represented by a clearly defined date range.

**Boundary:** Filters for an existing authorized audience can be additive. Expanding role access requires explicit authorization.

### G11 — Cross-office reminders: workbook annotations are not implemented

**Classification:** Missing but underspecified spreadsheet addition.

**Proposal:** Workbook `BM3` says “with ‘reminding’ button”; `BU5` says “With a ‘reminder’ feature.” These annotations do not define who reminds whom, how often, or whether the feature is manual or scheduled.

**Current behavior:** Event notifications and optional email delivery exist. No reminder action, reminder schedule, or overdue-reminder model was found. An approval notification is not equivalent to a reminder about an unresolved request.

**Recommendation:** Define sender, recipient, permitted states, message content, duplicate prevention, and whether reminders are manual or time-based. Treat a reminder as communication about the recorded state; sending or reading one must not advance the request. Do not assume an escalation policy from these two short annotations.

### G12 — Notification assignment and financial-clearance handoff need clarification

**Classification:** Partial correspondence and operational recommendation.

**Proposal:** PDF pp1–3 and workbook `L3`, `AB3`, `AO3` describe notifications, including assigned Business personnel.

**Current behavior:** Notifications are selected by role (`src/shared/notifications.ts`), without a per-request assigned reviewer. At `Ready_for_Purchase`, the target role is Receiving Custodian; requester wording also describes readiness for receiving. Purchasing receives the initial Admin-approved notification, but is not the target of a dedicated clearance-ready notification.

**Impact:** Role-wide alerts may be entirely appropriate for a shared office queue, but do not establish individual assignment. Purchasing must inspect tracking to learn that clearance is complete. Ready-for-purchase wording can imply more progress than is recorded (G05).

**Recommendation:** Confirm whether assignment means an individual or the whole office. Consider a Purchasing clearance alert derived from the existing committed event, without changing recipients’ authority or any status. This later Purchasing alert is a recommended improvement, not an explicit additional alert specified in the PDF.

Optional email delivery is implemented, but successful live delivery was not tested. Configuration and delivery reliability should be checked separately before promising email/mobile notifications to stakeholders.

## 5. Proposal alternatives and additional integrity concerns

### Optional mobile signatory approval

PDF pp2–3 and workbook `AI12:AI14` present direct approval from the head’s mobile device as **Option 2**, an alternative to the communication/proof approach. No dedicated signatory-device integration or separate head-approval identity was identified. Responsive pages and email links should not automatically be described as that integration.

This is an **optional unimplemented alternative**, not a mandatory gap if Option 1 is the approved approach. Ask which option the institution selected before proposing device enrollment, approval delegation, or new permissions.

### Approved item values can be replaced during financial clearance

`src/app/api/po/release-check/route.ts:61–67` replaces the PR’s `itemsPayload` with submitted billing items. Those items include name and quantity as well as unit price. The original approved item list is not separately retained as a versioned snapshot by these models.

This is an audit-integrity concern, not an explicit proposal requirement for versioning. Verify whether BO is meant to enter prices only. A future solution should preserve what was approved and distinguish billing values, without silently changing BO’s authority. Monthly reports currently read the request’s current item data, so later edits can affect how original approvals are interpreted.

### Damaged and partial delivery policy is undefined

The proposal offers Good/Damaged and quantity checks, but does not prescribe a full discrepancy-resolution process. Current receiving closes the request for either condition. Clarify whether damaged goods are accepted with remarks, replaced, rejected, or held. Do not invent new return-to-supplier statuses from the drawing alone.

### Credit terms and the check-issued flag

All new POs initially await BO clearance; BO later chooses cash/check or credit terms. Both paths set `isCheckIssued = true` in the release handler. Credit handling is an existing extension; the proposal explicitly describes the cash path without fully specifying credit behavior.

Confirm this extension with Ma’am Grace. Reporting should distinguish financial clearance from a physical check, especially in Audit. Check numbers currently appear in audit remarks rather than a dedicated field; structured search is a potential convenience, not an explicit proposal requirement.

### Concurrent decisions deserve a focused follow-up review

Several handlers read an eligible state and later update by ID. The newer returned-request paths use conditional updates, but that safeguard is not uniform across all decision/receiving handlers. A transaction alone does not establish that every stale submission is rejected under the deployed database’s isolation behavior.

No concurrency test was performed. Before future workflow changes, review competing submissions and duplicate receiving/PO behavior with targeted tests. This is a reliability recommendation, not a claim that duplicate production records exist.

## 6. Proposed order of work — subject to approval

1. **Validate and correct demonstrated implementation defects:** requester department scoping (G01) and Audit response/presentation mismatch (G09). Scope each separately and preserve existing transitions.
2. **Confirm the operating rules with Ma’am Grace:** pre-approved route, approval evidence, who counts as the head signatory, credit handling, damaged/partial receipt policy, and Accounting’s expected participation.
3. **Plan additive visibility/document work:** existing Audit filters, received-history view, printable approved PR/PO/RR, and accurate status explanations. Define the approved document formats first.
4. **Design supporting evidence:** actual received quantities, approved-versus-billed item records, purchase/transmission evidence, and Accounting dispatch/acknowledgment.
5. **Approve any necessary workflow or permission changes explicitly:** direct PO route, new closure criteria, monitoring audience expansion, or an Accounting role.
6. **Specify reminders and optional mobile approval only after their operational rules are agreed.**

For every later UI feature, repository acceptance requirements still apply: compact phone, tablet, and desktop behavior (including 360, 768, and 1440 px checks), keyboard/touch access, long-content handling, and preservation of existing requester correction/reuse links. Historical and declined records must remain historical; opening a report, reminder, or notification must never change workflow state.

## 7. Questions for Ma’am Grace and the affected offices

1. Has the pre-approved-letter route formally changed from direct PO to Business/Admin digital recording? Who validates the letter’s authenticity and scope?
2. Is Admin Office itself the final signatory, or does staff record a decision made by a separate head? Is Option 1 the selected approach, and when is proof mandatory?
3. Must the three Admin confirmations be newly checked each time, including pre-approved requests?
4. Does “assigned Business personnel” mean a shared office queue or an individually assigned reviewer?
5. What are the approved PR, PO, and RR templates? Are they intentionally prepared outside CPATS today?
6. What event proves “Purchased”: PO sent, supplier acceptance, order placement, payment, or another action?
7. May BO revise item descriptions/quantities after approval, or only record billing prices?
8. How should partial, excess, or damaged deliveries affect acceptance and closure?
9. What exact documents must reach Accounting? Is manual handoff with recorded receipt sufficient, or must Accounting work within CPATS?
10. Which downstream records and attachments may Admin and PAMU view? Is PAMU’s existing custodian account the intended monitoring identity?
11. What do approved/monthly reports measure: submission month, approval month, PO month, receipt month, current status, or historical decisions?
12. Who may send reminders, to whom, and under what timing and repeat rules?

## 8. Inspection completion

Both proposal files were inspected, including workbook drawings and embedded images. Findings were checked against current handlers, schemas, models, screens, and role restrictions. No code tests or build were run because this was a read-only audit rather than an implementation change. No live workflow, email delivery, deployed permission behavior, or physical office practice was certified.

The only project artifact added by this inspection is this report. Existing uncommitted application and instruction-file changes were preserved. The report does not authorize any of its suggested pipeline changes.
