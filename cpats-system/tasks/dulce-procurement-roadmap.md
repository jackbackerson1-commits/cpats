# Ma’am Dulce’s procurement follow-up roadmap

[*CPATS Seven Follow Up Questions.pdf*](https://chatgpt.com/library?file_id=libfile_2bd3871ba19c819185d853309f089dac&account_id=personal), answers Q1–Q7. The answers describe office practice. The CPATS changes and decisions below are the project’s interpretation of that practice.

| Order | What Ma’am Dulce specifically described | CPATS work and completion check |
| --- | --- | --- |
| 1 | **Q3–Q4.** Purchasing writes the final online amount on the PO. When the amount changes, BO uses the screenshot as the basis for the check. | Provide a printable online PO review copy with the submitted total, revision, items, evidence reference and recorded approvals. Check that a pending or returned revision never prints as authorized. Confirm the school’s official PO layout before labeling an export as the official form. |
| 2 | **Q1.** Purchasing orders after Admin signs the prepared PO. The purchaser obtains a claim slip or delivery receipt. | Online cash already gates ordering through Admin and records the placed order. For local cash/check and supplier credit, add the second Admin decision and order handoff when BO confirms the exact clearance, release and receiving sequence. Confirm the return path and how already-cleared orders should be treated. Claim-slip and delivery-receipt uploads already exist. |
| 3 | **Q5.** CSR prepares an RR for consumables, and both RR and MR for applicable non-consumables or high-value purchases. She described three copies. | Add the form-selection guidance and a three-copy Excel print option. Keep staff selection. Confirm which classifications and signatures are required before enforcing them in Receiving. |
| 4 | **Q7.** Purchasing follows up on incomplete items still available from the supplier. Unavailable items appear as cancelled in the monthly PO report. | Track ordered, received, outstanding and cancelled quantities per PO line. Keep incomplete balances visible and include cancelled lines in the monthly report. Confirm who can cancel and how replacements, partial issuance and multiple deliveries are handled before changing receipt completion. |
| 5 | **Q6–Q7.** The signed RR/MR proves issuance to the requesting department. The requesting department or employee, purchaser and central supplier officer sign it, and the signed forms go to Accounting afterward. | Record department handover and Accounting forwarding as separate events. Link the exact signed revision. Confirm who can record each event and what should close the request. Her answer describes forwarding to Accounting and leaves the acknowledgement rule open. |
| 6 | **Q4 and Q6.** Price or seller changes can require liquidation. The supplier’s SOA may arrive after goods are issued and is used to process check payment. | Record how online differences are settled and, separately, how a supplier-credit SOA is paid. Confirm who can record or approve those events, acceptable evidence and how payments are matched. Existing late SOA attachments and the rule allowing goods to be issued before the SOA remain usable. |

Ma’am Dulce referred local cash handling to Business Office and described no fixed protocol for following up on a late SOA. The survey gives no exact MR price threshold or signed-copy routing rule for every case.

## First implementation scope

- **Outcome and roles.** Purchasing, Business Office and Admin can print the current submitted online PO revision from their existing workspace. Existing RR/MR export users can choose a three-copy print set from a saved revision.
- **Dependencies.** The online purchase read supplies linked requisition items and existing revision decisions. The RR/MR Excel exporter retains the school layout and adds the third set using a separate print area. The form workspace explains the documented RR/MR choices.
- **Protected behavior.** Keep the existing checkout submission, approval, release, Receiving, document permissions and closure rules. Retain existing Excel export behavior for two-copy requests and preserve saved file/revision associations. Printing creates no approval or status change.
- **Verification.** Cover printable information and approval states, three-copy worksheet and continuation layout, existing two-copy exports, authorization, and workflow regression tests.

The first implementation adds **Print PO review copy** to submitted online POs and **Export three-copy print set** to saved RR/MR revisions. The workflow changes in steps 2, 4, 5 and 6 remain pending the decisions in the table.
