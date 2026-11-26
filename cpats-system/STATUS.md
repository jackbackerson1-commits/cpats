# CPATS System — UI/UX Polish Status

## Current project direction

The CPATS procurement pipeline is **functional and is the source of truth**. Current and future work may improve the user experience and add supporting features around that pipeline. A specific pipeline rule may change only when the current request explicitly authorizes that change; every other rule remains protected.

For additive features requested by Ma'am Grace or other project proponents, also read [`FEATURE_IMPLEMENTATION.md`](./FEATURE_IMPLEMENTATION.md). It defines the safe feature-development boundary around the fixed pipeline.

## Implemented additive features

- RR/MR preparation with manual/PO-prefilled web drafts, revision history, school-layout Excel export and revision-linked signed-copy uploads. This does not verify signatures or change Receiving closure; see [the feature note](tasks/rr-mr-preparation.md).
- Opt-in provisional online cash purchasing: exact-revision BO/Admin review, check release, order evidence, amount-change safeguards, and audit/notification context. This temporary rule is awaiting BO confirmation; see [the workflow note](tasks/provisional-online-purchases.md).
- Purchasing Office monthly transaction reports with CSV export
- Purchasing Office order tracking from PO preparation through receiving
- Responsive behavior checked at phone, tablet, and desktop widths
- Seeded institutional role accounts with independently hashed passwords
- In-app workflow notifications for Requesting, Business, Admin, Purchasing, Receiving, and Audit roles
- Notification actions that open the referenced request or event, with contextual controls in the bell preview and full Notifications page
- Read-only Admin and Business Office decision history, including records that have moved beyond each office's active review queue
- Inbox row actions for archive, trash, and read/unread; bulk actions appear only for selected notifications, with archived items accessible in an Archive tab
- Recoverable notification trash with 1-week, 2-week, or 2-month retention and explicit permanent deletion
- Optional verified external email delivery, backed by a durable email outbox
- Returned requisition correction and resubmission with saved inputs, evaluator feedback, ownership checks, and preserved audit history
- Returned-request correction mode can be discarded from the form or the New Request navigation tab to restore a clean request template
- Declined requests can seed a new requisition with their saved inputs and decision note; refreshing a populated request form restores the blank New Request page

## Notification behavior and next UI pass

- The bell preview and the full Notifications page have different action sets. The bell preview should not offer a shortcut back to the workspace the user is already viewing.
- A notification link should open its specific request and, when supported, the specific audit event. An office's past decision remains in read-only history after the request leaves its active queue; the decision and current status are displayed separately.
- Inbox notifications support pointer hover, keyboard focus, and touch access to row actions. The row action icon represents what clicking it will do: a closed envelope means **Mark as unread** and an open envelope means **Mark as read**. The unread indicator shows the current state. Selection reveals the applicable bulk actions and clearing selection hides them.
- Archive keeps a notification available for reference; Trash has a separate recoverable retention schedule. Notification actions must not change the purchase request or audit record.
- The matching row-action and bulk-selection UX in **Trash** is a later requested pass. Do not describe it as implemented until completed and verified.
- The archive migration (`20260926120000_notification_archive`) was applied to the local database. Other installations must apply repository migrations before using the archive feature.

## Notification email deployment

Local development uses `EMAIL_DELIVERY_MODE=log`, which displays verification and workflow messages in the server log without sending mail externally. For a deployed installation, configure:

- `EMAIL_DELIVERY_MODE=smtp`
- `EMAIL_VERIFICATION_SECRET` with a long random value
- `APP_BASE_URL` with the public HTTPS address of CPATS
- `SMTP_HOST`, `SMTP_PORT`, and `SMTP_SECURE`
- `SMTP_USER` and `SMTP_PASSWORD` (for Gmail, use a dedicated sender account with an app password rather than a personal Gmail password)
- `SMTP_FROM` with the institutional sender name and address

Each staff member links only the address where they want alerts delivered. CPATS never asks for or stores that person's Gmail password.

## Non-negotiable: preserve the procurement pipeline

Do **not** modify the procurement workflow, its order, or its business rules unless the user explicitly requests a pipeline change in the current task.

This includes preserving the existing progression between offices, including (but not limited to):

- Requesting Office
- Business Office
- Administrator / approval stages
- Purchase Order preparation and release
- Finance, purchasing, receiving, tracking, and audit stages

Do not change status names, allowed transitions, eligibility checks, routing, role permissions, approval requirements, or the server-side authority that enforces them.

## Safe scope for current work

Prioritize improvements such as:

- Responsive layouts for desktop and mobile
- Clearer error, success, empty, loading, and stale-record feedback
- Accessible dialogs, previews, tooltips, and confirmation surfaces
- Attachment and image-preview experiences
- Consistent spacing, typography, colors, buttons, cards, and navigation
- Replacing raw emojis or generic icons with accessible local inline SVG icons
- Rendering and scrolling performance improvements that do not alter business behavior

## Guardrails for implementation

When polishing a page:

1. Keep procurement API contracts, role checks, status values, and transition logic unchanged. Supporting notification or read-only history endpoints, validation, and Prisma fields may be added under the isolated, additive rules in `FEATURE_IMPLEMENTATION.md`.
2. Treat server responses as authoritative. UI feedback may explain a rejected action, but must not bypass or recreate server-side workflow decisions.
3. Prefer local, isolated presentation-state changes (for example, modal visibility, preview state, and visual components).
4. Preserve existing functional behavior unless a user explicitly asks to change it.
5. Validate UI changes with TypeScript and a production build when practical.

## Icon standard

For cosmetic icon updates, use local or imported SVG functional components rather than raw emoji or generic demonstration icons:

- `viewBox=\"0 0 24 24\"`
- `fill=\"none\"`
- `stroke=\"currentColor\"`
- `strokeWidth=\"1.8\"` or `\"2\"`
- `className=\"size-4 shrink-0\"` (or `size-3.5` where appropriate)
- `aria-hidden=\"true\"`
- Wrap an icon and its visible text with `inline-flex items-center gap-1.5`.

## Instructions for future agents

Before editing, read this file and [`FEATURE_IMPLEMENTATION.md`](./FEATURE_IMPLEMENTATION.md). If the current request explicitly authorizes a specific procurement-pipeline change, keep the implementation within that change's necessary scope and preserve every other pipeline. If it does not, obtain direction before changing business logic.
