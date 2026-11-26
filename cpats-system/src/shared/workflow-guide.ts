import { Role } from '@prisma/client';

export interface GuideTask { title: string; description: string; href: string }
export interface GuideAnswer { question: string; answer: string }
export interface WorkflowGuide { roleLabel: string; purpose: string; tasks: GuideTask[]; answers: GuideAnswer[] }

const notifications: GuideTask = { title: 'Notifications', description: 'Read updates, open the referenced record, and manage your notification preferences.', href: '/dashboard/notifications' };
const assets: GuideTask = { title: 'Asset register', description: 'Find individual equipment labels, serial numbers and their linked purchase order.', href: '/dashboard/assets' };
const commonAnswers: GuideAnswer[] = [
  { question: 'Does archiving or deleting a notification change the request?', answer: 'No. These actions organize your alerts. They do not approve, decline, return or delete a procurement request, or change its audit history.' },
  { question: 'Why is an older notification no longer actionable?', answer: 'Another office may already have advanced the record. Open its available history or tracking view and check the current status. An old notification does not restore a previous action.' },
  { question: 'What should I do when a save or submission fails?', answer: 'Read the error and keep your current inputs. Check the latest record before trying again. A success message appears only after the operation is confirmed; reopening a stale form does not grant permission to act.' },
];

export const WORKFLOW_GUIDES: Record<Role, WorkflowGuide> = {
  [Role.Requesting_Office]: {
    roleLabel: 'Requesting Office', purpose: 'Prepare your department’s requests and follow their progress through the offices.',
    tasks: [
      { title: 'New request and saved drafts', description: 'Enter items and justification, save unfinished work, or resume and remove your own saved drafts.', href: '/dashboard/pr/new' },
      { title: 'Track requests', description: 'Check your department’s records, read evaluator feedback, and open correction or reuse actions.', href: '/dashboard/pr/track' }, notifications,
    ],
    answers: [
      { question: 'Does Save draft send my request for approval?', answer: 'No. It saves an unfinished copy private to your account. Submit request sends the request to Business Office review. After saving, look for the Draft saved toast and the last-saved time.' },
      { question: 'What happens when I remove a saved draft?', answer: 'Confirm Remove draft in your saved drafts list. This permanently removes the saved copy, not a submitted request. If that draft is currently open, the form contents stay available as unsaved work. Save again to keep a new copy.' },
      { question: 'How do I correct a returned request?', answer: 'Open Track Requests and use the returned record’s correction action. The form restores the saved fields and evaluator feedback. Resubmitting updates the same request and sends it to Business Office review, whether Business or Admin issued the return.' },
      { question: 'Can I reuse a declined request?', answer: 'Use the declined record’s reuse action in Track Requests. Review its saved items, justification, proof and feedback before submitting. This creates a new request; the original request remains declined.' },
    ],
  },
  [Role.Business_Office]: {
    roleLabel: 'Business Office', purpose: 'Evaluate requests, review recorded decisions and complete eligible financial clearances.',
    tasks: [
      { title: 'Fiscal evaluation and history', description: 'Review the current action queue or switch to recorded evaluation history.', href: '/dashboard/pr/evaluate-business' },
      { title: 'Financial clearance', description: 'Open eligible purchase orders and record the existing cash/check or credit-terms clearance.', href: '/dashboard/po/release-check' }, notifications,
    ],
    answers: [
      { question: 'What happens after my fiscal evaluation?', answer: 'An approval sends the request to Admin Office review. A return gives the Requesting Office feedback for correction. A decline is final for that original request. Record remarks that explain your decision.' },
      { question: 'Is my decision history the current request status?', answer: 'No. History shows your recorded evaluation. A request may have moved to another office since then. Check both the Business decision and current status; history entries do not authorize another decision.' },
      { question: 'What can happen after an Admin return?', answer: 'For an eligible Admin-returned request, Business can record a revised evaluation and send it back to Admin. The Requesting Office can also correct and resubmit the returned request. Check the current status before saving; if it has changed, follow the stale-record message.' },
      { question: 'Does financial clearance reconcile an invoice automatically?', answer: 'No. This action records the current payment modality, clearance and billing information and advances the request to Ready for Purchase. The Receiving Custodian records the supplier invoice during receiving. Invoice visibility is not automatic PO, receipt and invoice matching.' },
      { question: 'Where can I review Purchasing’s supporting files?', answer: 'Select the PO in Financial clearance and open its PO supporting documents. Order confirmations, delivery evidence, signed forms and a supplier Statement of Account (SOA) appear with their uploader and saved date. These attachments are supporting evidence for your review.' },
    ],
  },
  [Role.Admin_Office]: {
    roleLabel: 'Admin Office', purpose: 'Review requests awaiting administrative approval and inspect your recorded decisions.',
    tasks: [{ title: 'Executive review and history', description: 'Review eligible requests or switch to read-only decision history.', href: '/dashboard/pr/approve-admin' }, notifications],
    answers: [
      { question: 'Where does an approval send the request?', answer: 'Approval sends the request to Purchasing Office for purchase-order preparation. Review the request details and available evidence before recording your decision and remarks.' },
      { question: 'What is the difference between Return and Decline?', answer: 'Return for correction keeps a revision path available and preserves your feedback. Decline is final for the original request. The Requesting Office may reuse a declined record to prepare a separate new request.' },
      { question: 'Can I act on a record in decision history?', answer: 'History is read-only. It shows your recorded decision separately from the request’s current status. Use the active queue only when the record is eligible for administrative review.' },
    ],
  },
  [Role.Purchasing_Office]: {
    roleLabel: 'Purchasing Office', purpose: 'Prepare approved purchase orders and follow them through financial clearance and receiving.',
    tasks: [
      { title: 'Prepare purchase order', description: 'Select an approved request and record a unique PO reference.', href: '/dashboard/po/new' },
      { title: 'Track orders', description: 'Follow purchase-order progress and available receiving evidence.', href: '/dashboard/po/track' },
      { title: 'Monthly reports', description: 'Review the selected month’s transaction register and export CSV for Excel.', href: '/dashboard/po/reports' }, assets, notifications,
    ],
    answers: [
      { question: 'What happens after I create a purchase order?', answer: 'The request moves to Business Office financial clearance. Creating a PO does not record a delivery or close the request.' },
      { question: 'Is the order QR code an individual asset label?', answer: 'No. The order QR identifies the entire purchase order for receiving lookup. Individual equipment labels are registered separately by the Receiving Custodian after a receiving report is saved.' },
      { question: 'Can I register equipment from the Asset register?', answer: 'Purchasing can inspect permitted asset records and labels. Individual asset registration belongs to the Receiving Custodian.' },
      { question: 'Where do I keep order confirmations and delivery paperwork?', answer: 'Open Track orders, choose View details, and use PO supporting documents. Purchasing and Receiving can attach online order confirmations, delivery receipts, claim slips, supplier Statements of Account (SOA), and signed RR or MR copies. Saved files retain their uploader and date. Financial and receiving decisions remain in their existing workspaces.' },
      { question: 'Does credit mean a credit card?', answer: 'Supplier credit means the supplier is paid later, commonly after issuing a Statement of Account (SOA). Online purchases funded through a purchaser check are cash/check purchases. The current payment controls use Cash / Check and Credit Terms. Confirm local cash and liquidation details with Business Office.' },
    ],
  },
  [Role.Receiving_Custodian]: {
    roleLabel: 'Receiving Custodian', purpose: 'Inspect eligible deliveries, retain evidence and register individual equipment labels.',
    tasks: [
      { title: 'Receive delivery', description: 'Find the PO, attach the supplier invoice and delivery photo, and record its condition.', href: '/dashboard/receiving/new' },
      { title: 'Receiving history', description: 'Review completed inspections and recorded damage, with their evidence.', href: '/dashboard/receiving/history' }, assets, notifications,
    ],
    answers: [
      { question: 'What do I need before finalizing a receiving report?', answer: 'Select an eligible purchase order and attach the supplier invoice and a delivery photo. Choose Good or Damaged. For damaged cargo, the form requires inspection remarks describing the issue.' },
      { question: 'What happens if the delivery is damaged?', answer: 'Select Damaged and describe the issue. In the current system, finalizing still changes the request to Received and Closed. Damage remains recorded in history, but CPATS does not track a supplier return, replacement or resolution. Confirm the office’s handling procedure before finalizing; a closed request does not prove the damage was resolved.' },
      { question: 'Can I record a partial delivery separately?', answer: 'The current intake records a condition for the order and closes the request. It does not record per-item delivered quantities or manage a partial-delivery balance. Do not interpret a receiving report as proof that a partial-delivery issue has been resolved.' },
      { question: 'How do I label individual equipment?', answer: 'After saving the receiving report, use Asset register to select the order, item line and physical units. Enter known serial numbers and generate individual labels. Each unit label is separate from the order QR.' },
      { question: 'Can I attach a supplier statement after receiving?', answer: 'Yes. Open Receiving history, select the saved inspection, and use PO supporting documents to attach a Statement of Account (SOA), delivery or claim slip, or signed RR/MR. A supplier SOA may arrive after the goods. Uploading it records supporting evidence; payment processing remains with Business Office.' },
    ],
  },
  [Role.Global_Auditor]: {
    roleLabel: 'Global Auditor', purpose: 'Inspect procurement history and evidence through the existing read-only views.',
    tasks: [{ title: 'Audit ledger', description: 'Search records and inspect their workflow events, financial evidence and receiving reports.', href: '/dashboard/audit' }, assets, notifications],
    answers: [
      { question: 'Can the audit ledger approve or change a request?', answer: 'No. The ledger is read-only. Recorded events show who acted and what status was saved. They do not grant approval authority or certify the completeness of institutional procedures.' },
      { question: 'What should I check for a damaged delivery?', answer: 'Inspect the saved condition, remarks, photo, supplier invoice and workflow events. The current receiving handler closes requests even when Damaged was selected. Closure alone is not evidence of replacement, return or damage resolution.' },
      { question: 'Why distinguish an office decision from current status?', answer: 'A historical approval, return or decline records that office’s action at that time. The record may have progressed afterward. Reconstruct the sequence using recorded events and timestamps.' },
    ],
  },
  [Role.System_Administrator]: {
    roleLabel: 'System Administrator', purpose: 'Maintain staff accounts and departments within the existing access-management rules.',
    tasks: [{ title: 'Staff accounts and departments', description: 'Manage departmental accounts, invitations, reset links and eligible access changes.', href: '/dashboard/system/accounts' }, notifications],
    answers: [
      { question: 'Does my account grant procurement approval authority?', answer: 'No. System Administrator manages account access. Fiscal review, administrative approval, purchasing and receiving remain with their respective roles.' },
      { question: 'How does staff account setup work?', answer: 'Create the account with its permitted role and department, then use the activation invitation. Pending accounts can receive another invitation. Eligible active accounts can receive a password-reset link.' },
      { question: 'What should I check when a staff member cannot sign in?', answer: 'Check the account’s department, assigned role and access status. Use the available invitation, reset or enable-access action as appropriate. The receiving staff member completes their own activation or password reset.' },
    ],
  },
};

export function getWorkflowGuide(role: Role): WorkflowGuide {
  const guide = WORKFLOW_GUIDES[role];
  return { ...guide, answers: [...guide.answers, ...commonAnswers] };
}

export function matchesGuideSearch(query: string, ...texts: string[]): boolean {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const content = texts.join(' ').toLocaleLowerCase();
  return terms.every((term) => content.includes(term));
}
