# CPATS — Campus Procurement Automation & Tracking System

> **Executive Summary:** CPATS is an enterprise procurement governance platform engineered for DMC College Foundation, Inc. to replace fragmented paper requisitions with an automated, auditable seven-stage workflow. Built on Next.js 16, React 19, Prisma ORM, and MariaDB, the system enforces multi-department role-based access control, cryptographic audit logging, and immutable financial oversight across institutional acquisitions.



---

## Overview & Architectural Deep Dive

### Core Business Problem & Purpose

Higher educational institutions manage complex, multi-signatory procurement lifecycles spanning academic departments, fiscal controllers, executive administration, purchasing officers, asset custodians, and internal auditors. Unstructured paper routing frequently produces unrecorded expenditures, unauthorized item substitutions, delayed fiscal clearances, and missing delivery verification records.

CPATS digitalizes and governs this lifecycle through a deterministic, role-partitioned pipeline:

1. **Requisition Initiation:** Academic and operational departments submit itemized Purchase Requests (PRs) bounded strictly to their authenticated department boundary.
2. **Fiscal Evaluation:** The Business Office validates budgetary availability, necessity, and fund allocation codes.
3. **Executive Governance:** The Office of the Vice President for Administration executes authoritative review and uploads compliance documentation.
4. **PO Generation & Asset Tagging:** The Purchasing and Procurement Office registers purchase orders, tracks vendor fulfillment, and generates unique cryptographic QR tokens for physical asset routing.
5. **Financial Modality Clearance:** The Business Office clears payment dispatch under structured `CASH_CHECK` disbursement or `CREDIT_TERMS` settlement.
6. **Cargo Intake & Asset Inspection:** The Property and Asset Management Unit (PAMU) inspects hardware cargo, attaches photographic intake proof alongside vendor invoice manifests, and evaluates asset condition (`Good` or `Damaged`).
7. **COA-Compliant Audit & Archival:** The Internal Audit Office accesses an immutable chronological transaction ledger for institutional accounting compliance.

### Technical Challenges & Engineering Trade-offs

* **The Challenge:** Enforcing strict, multi-tenant department scoping and non-repudiable state transitions across seven decoupled operational roles without race conditions, stale form overwrites, or horizontal privilege escalation.
* **The Solution:** The backend integrates database-level atomic isolation via `prisma.$transaction` with strict status pre-condition checks (`previousState === expectedState`), accompanied by server-enforced authenticated session claims (`x-user-department-id`) that unconditionally override client-supplied parameters in request queues. Every committed decision triggers an append-only `AuditLog` entry, which atomically drives a decoupled notification and email outbox processor.
* **The Trade-off:** Choosing transactional status pre-condition assertions and relational foreign-key cascades over an external message bus (e.g., Kafka or RabbitMQ) minimizes architectural overhead and eliminates eventual consistency lag during critical fund approvals, accepting tighter database connection coupling during concurrent institutional approvals.

---

## Tech Stack & Architecture Matrix

| Layer | Technology | Primary Package / Driver | Architectural Role |
| --- | --- | --- | --- |
| **Frontend Framework** | Next.js 16 & React 19 | `next@16.2.10`, `react@19.2.4` | App Router server and client components, SSR dispatching, and dynamic layout composition |
| **Styling & Design System** | Tailwind CSS v4 & Lucide | `@tailwindcss/postcss@^4`, `lucide-react` | Institutional tokenized styling, responsive viewports (360px–1440px+), and accessible SVG iconography |
| **Validation Layer** | Zod | `zod@^4.4.3` | Schema validation across all API route handlers, complex refined rules, and payload verification |
| **Backend & Routing** | Next.js API Routes | Node.js Runtime, `next/server` | Route handlers, stateless Edge/Node crypto authentication proxy, and role enforcement |
| **Database & ORM** | MariaDB / MySQL with Prisma | `@prisma/client@^7.8.0`, `@prisma/adapter-mariadb` | 3NF relational schema modeling, declarative migrations, and transactional isolation |
| **Security & Cryptography** | Web Crypto & Node Crypto | Native `node:crypto`, `scryptSync` | Scrypt password derivation (N=16384), HMAC SHA-256 session tokens, and timing-safe equality checks |
| **Outbox & Communications** | Nodemailer | `nodemailer@^10.0.10` | Transactional email outbox worker, verified email preference binding, and institutional SMTP relay |

---

## Key Features & Engineering Capabilities

* **Strict Multi-Role Access Control (RBAC):** Seven distinct institutional roles (`Requesting_Office`, `Business_Office`, `Admin_Office`, `Purchasing_Office`, `Receiving_Custodian`, `Global_Auditor`, `System_Administrator`) guarded by server-side middleware and route-level authorization matrices.
→ **Impact:** Eliminates horizontal data leakage and guarantees that requesting offices access only requisitions originating within their verified organizational boundary.
* **Non-Repudiable Append-Only Audit Ledger:** Relational logging that captures every state transition, executing actor, timestamp, and signed compliance remarks alongside parent requisition IDs.
→ **Impact:** Delivers full compliance visibility for the Commission on Audit (COA) with complete historical reconstruction of every procurement decision.
* **Resilient Asynchronous Notification Outbox:** Decoupled event hooks dispatching in-app alerts and queuing SMTP notifications via an `EmailOutbox` table with exponential backoff retry scheduling.
→ **Impact:** Guarantees that third-party mail server latency or transient network outages never interrupt or roll back critical database transactions.
* **Recoverable Notification Lifecycle & Trash Retention:** Multi-tier inbox management featuring folder segregation (`Inbox`, `Archive`, `Trash`), read/unread bulk toggles, and scheduled purge policies (7 to 60 days).
→ **Impact:** Provides staff with customizable notification retention without altering authoritative procurement records or cluttering active operational views.
* **Purchasing Tracking & Excel-Sanitized Reporting:** Dynamic requisition tracking paired with Philippine Time (PHT) calendar-bounded monthly CSV generation that protects against formula injection vulnerabilities (`protectSpreadsheetCell`).
→ **Impact:** Eliminates spreadsheet injection vectors (`=`, `+`, `-`, `@`) while delivering instant month-by-month reconciliation data for accounting staff.
* **Stateless Cryptographic Token Delivery & Session Invalidation:** Expiring single-use activation and reset tokens stored exclusively as SHA-256 hashes, linked with incremental user `sessionVersion` tracking.
→ **Impact:** Prevents replay attacks and invalidates all existing active sessions immediately upon password modification or account suspension.

---

## Environment Configuration

| Variable | Description | Required | Default / Example |
| --- | --- | --- | --- |
| `DATABASE_URL` | Primary database connection string for Prisma ORM | Yes | `mysql://root:password@127.0.0.1:3306/cpats_db` |
| `DATABASE_HOST` | Database server hostname for MariaDB adapter | No | `127.0.0.1` |
| `DATABASE_PORT` | Database server network port | No | `3306` |
| `DATABASE_USER` | Database authentication username | No | `root` |
| `DATABASE_PASSWORD` | Database authentication password | No | `""` |
| `DATABASE_NAME` | Target database catalog name | No | `cpats_db` |
| `SESSION_SECRET` | Secret key for HMAC SHA-256 session cookie signing ($\ge 32$ chars) | Yes | `replace-with-long-cryptographically-secure-random-secret-key` |
| `APP_BASE_URL` | Canonical base URL for account activation and reset links | Yes | `http://localhost:3000` |
| `EMAIL_DELIVERY_MODE` | Outbox dispatch mode (`log`, `smtp`, `off`) | No | `log` |
| `CPATS_ACCOUNT_DELIVERY_MODE` | Staff account activation delivery mode (`log`, `smtp`) | No | `log` |
| `EMAIL_VERIFICATION_SECRET` | Salt string for notification email verification tokens | No | Fallback to `SESSION_SECRET` |
| `SMTP_HOST` | Outgoing SMTP server hostname | If `smtp` | `smtp.gmail.com` |
| `SMTP_PORT` | Outgoing SMTP server port | If `smtp` | `587` |
| `SMTP_SECURE` | Enforce explicit TLS connection (`true` / `false`) | If `smtp` | `false` |
| `SMTP_USER` | SMTP authenticated account username | If `smtp` | `procurement@dmc.edu.ph` |
| `SMTP_PASSWORD` | SMTP account authentication password / App Password | If `smtp` | `your-smtp-app-password` |
| `SMTP_FROM` | Formatted email sender address | If `smtp` | `"CPATS Procurement" <procurement@dmc.edu.ph>` |

---

## Getting Started & Local Setup

### Prerequisites

* **Runtime Environment:** Node.js `>= 20.x`
* **Database Engine:** MariaDB `>= 10.5` or MySQL `>= 8.0`
* **Package Manager:** `npm` (bundled with Node.js) or `pnpm`

### Installation & Execution

1. **Clone the Repository:**

```bash
git clone https://github.com/JamesIan-Bayonas/cpats-system.git
cd cpats-system

```

2. **Install Dependencies:**

```bash
npm install

```

3. **Configure Environment Variables:**
Create the development environment file:

```bash
cp .env.example .env

```

Ensure `.env.seed.local` is populated with initial demonstration secrets if executing the seed script:

```bash
cat << 'EOF' > .env.seed.local
CPATS_SEED_REQUESTER_PASSWORD="DevelopmentPasswordRequester123!"
CPATS_SEED_FINANCE_PASSWORD="DevelopmentPasswordFinance123!"
CPATS_SEED_ADMIN_PASSWORD="DevelopmentPasswordAdmin123!"
CPATS_SEED_PURCHASING_PASSWORD="DevelopmentPasswordPurchasing123!"
CPATS_SEED_CUSTODIAN_PASSWORD="DevelopmentPasswordCustodian123!"
CPATS_SEED_AUDITOR_PASSWORD="DevelopmentPasswordAuditor123!"
CPATS_SEED_SYSTEM_ADMIN_EMAIL="system.admin@cpats.example"
CPATS_SEED_SYSTEM_ADMIN_PASSWORD="DevelopmentPasswordSysAdmin123!"
EOF

```

4. **Run Database Migrations & Seed Institutional Offices:**

```bash
npx prisma migrate deploy
npx prisma generate
npx tsx ./prisma/seed.ts

```

5. **Start the Application:**

```bash
npm run dev

```

The application will be accessible at `http://localhost:3000`.

---

## Verification & Testing

```bash
# Execute static analysis and ESLint code standards
npm run lint

# Validate full TypeScript static type safety
npx tsc --noEmit

# Execute production build to verify compilation integrity
npm run build

```

The repository includes integration test suites exercising the core domain lifecycles:

* `src/__tests__/rbac.test.ts`: Role-based access control assertion tests.
* `src/__tests__/schema.test.ts`: End-to-end multi-role procurement state machine integration tests.
* `src/__tests__/workflow.test.ts`: Feedback visibility and audit log feedback verification.
* `src/tests/credit_po.test.ts`: Cash vs. Credit / Charge Terms branching logic.
* `src/tests/receiving.test.ts`: Cargo intake, inspection assertions, and invoice binding.

---

## Security & Operational Readiness

### Authentication & Authorization

* **Session Tokens:** Stateless, cryptographically signed cookies using Web Crypto HMAC SHA-256 (`src/shared/session.ts`) storing authenticated identity, role, and department IDs.
* **Password Security:** Multi-parameter Scrypt derivation (`N=16384`, `r=8`, `p=1`, `keyLength=64`) generating cryptographically salted hashes. Verification uses constant-time comparison (`timingSafeEqual`) to prevent side-channel timing attacks.
* **Session Revocation:** Incremental `sessionVersion` tracking invalidates all active sessions upon password change or account status updates.
* **Zero-Trust Boundary Enforcement:** The server-side request queue explicitly validates caller roles and enforces user-bound department IDs, preventing authenticated clients from querying records of other departments.

### Data Protection & Sanitization

* **Strict Input Validation:** All API inputs are validated at runtime through Zod schemas before hitting business logic.
* **SQL Injection Prevention:** Built entirely on parameterized queries orchestrated via Prisma ORM and the MariaDB native adapter.
* **Spreadsheet Formula Injection Defense:** CSV exports escape leading arithmetic and macro trigger characters (`=`, `+`, `-`, `@`) to protect consumer spreadsheet environments.
* **Safe Attachment Routing:** Uploaded compliance attachments and receiving manifests are written with generated timestamps to prevent path collisions and directory traversal.

---

## License

This project is licensed under the MIT License. See the LICENSE file for full details.