Use the installed frontend-ui-engineering skill. Read AGENTS.md and
STATUS.md.

PASS 3: QA REVIEW. Do not edit files. Review the page you polished
(and its diff) as an independent reviewer.

1. Compare to the original screenshot and the Pass 1 findings. For each
   finding: Fixed / Partly / Not fixed / Regressed, with evidence.
2. Score each criterion 0 (fails), 1 (acceptable), 2 (good), with evidence:
   - First-glance clarity (what staff see first, next action obvious)
   - Primary action (dominant, outcome clear before click)
   - Hierarchy and redundancy (each fact once, IDs not dominant)
   - Status semantics (color and icon match meaning)
   - Feedback states (empty, no match, loading, error, success)
   - Responsive at 360 × 800, 768 × 1024, 1366 × 768, 1440 × 900
   - Keyboard focus, visible focus ring, logical order
   - Contrast and tap targets (minimum 44 px on mobile)
   - Overflow, clipping, sticky overlap, nested scroll
   - Consistency with other CPATS pages and tokens
3. Workflow parity: confirm from the diff that handlers, availability
   conditions, validation, payloads, filters, and counts are unchanged.
4. Defect list: ID | severity (blocker / major / minor) | viewport | state |
   steps | observed | suggested fix.
5. Verdict: Ship / Fix first. Anything scoring 0 or any blocker means
   Fix first.
Then stop.