Use the installed frontend-ui-engineering skill. Read
.agents/skills/frontend-ui-engineering/SKILL.md, AGENTS.md,
FEATURE_IMPLEMENTATION.md, and STATUS.md.

PASS 1: AUDIT ONLY. DO NOT EDIT ANY FILES. Stop after the OUTPUT section.

STEP 0: READ THE SCREENSHOT
The attached screenshot is my starting point for the page to polish.
Before anything else, tell me:
- Which page this is (use the URL bar, breadcrumb, heading, and nav) and
  which route and components render it. If unsure, ask me.
- Which office/role is using it and which state it shows (empty, selected,
  populated, error, loading).
- Page type: list/table, master-detail workspace, form, dashboard/report,
  or other.
- What to ignore: browser chrome, taskbar, and framework dev overlays
  (such as the Next.js "N" badge).
The screenshot is a hint, not proof. Confirm everything in the running app
(localhost:3000) or in source.

SCOPE: PRESENTATION ONLY
Limit changes to visual hierarchy, layout, spacing, typography, responsive
behavior, accessible presentation, and the wording or placement of feedback
for existing actions. Reuse existing CPATS tokens and components; add no
new colors or fonts. Preserve data, filtering logic, counts, validation,
statuses, permissions, API payloads, notifications, audit records, and
handoffs between offices. Treat backend routes, schemas, and other pages as
read-only. Record any workflow bug separately and keep going.

DESIGN CRITIQUE (answer before proposing changes)
1. Who uses this page, and what is their single most likely next task?
2. What should be visually dominant, and what should recede?
3. Which information is repeated, and which is decoration versus
   decision-relevant?
4. What would staff see first, what can they do next, and what tells them
   the action worked?

PRINCIPLES (apply those that fit this page)
General:
- Lead with human-meaningful identifiers (item, office, PO number), never
  raw database IDs. Shorten or move IDs to a copy action; don't remove them.
- Status color and icon must match meaning: needs action, waiting,
  complete, blocked. Never use a completion style on an unfinished state.
- State each fact once per view. Merge redundant counts, labels, and IDs.
- Relative time with exact time on hover; emphasize time only when it
  signals a problem.
- One clearly dominant primary action. The label or nearby text must say
  what it will do before it is clicked. Secondary actions stay quiet.
- The work area should be visible above the fold on 1366 × 768.
- No sticky element may cover content. Avoid nested scroll areas unless
  necessary.
- Truncated text needs a tooltip or a wrap rule.
- Every state needs feedback: empty, no match, loading, error, success.
Master-detail: the selected item must be obvious, and the detail pane's
first screen should hold the facts needed to decide.
Lists/tables: the row is the click target; mobile becomes stacked cards.
Forms: next required field is easy to reach; errors sit next to the field;
the submit button shows its consequence.

WALKTHROUGH
Exercise every control and state visible in the screenshot, plus those
found in source. Test selection, search with no match then clear, filters,
sort/pagination, and each action's available/disabled state.
Viewports: 360 × 800, 768 × 1024, 1366 × 768, 1440 × 900. Include a long
item or office name. Check tap targets, keyboard focus order, clipped
content, sticky overlap, nested scroll, and unintended horizontal scroll.
SAFETY: do not click actions that write records or advance the pipeline
unless on isolated test data. Otherwise verify those actions through source
and say so.

OUTPUT
1. Screenshot reading (Step 0 answers)
2. Scope note
3. Findings table: ID | viewport | state | action | observed result
4. Design critique answers
5. Proposed change list; each change cites the finding it resolves, plus
   any change you recommend NOT making
6. Workflow issues, listed separately
Then stop and wait for approval.