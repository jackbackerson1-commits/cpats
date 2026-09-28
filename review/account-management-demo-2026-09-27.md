# Local account-management demonstration — 2026-09-27

## What changed

- Added a separate `System_Administrator` role for staff account and department administration. The existing `Global_Auditor` remains an audit role and cannot manage accounts.
- Added a staff account page at `/dashboard/system/accounts`. A system administrator can add a department, create an individual account for a requesting or operational office, resend an activation link, send a reset link, and disable or restore access. The page works with the existing role dashboard and department-scoped requester records; it does not create separate copies of the procurement workflow for each department.
- New staff accounts start `Pending` with an unusable random password. The staff member uses a single-use, expiring activation link to set a password. Active accounts can request a single-use password reset link from the sign-in page. Reset and disable actions invalidate existing sessions.
- Account links appear in the **local development server log**. A made-up `@dmc.edu.ph` address does not receive mail and does not prove ownership of a DMC mailbox. Production account-link delivery requires explicit SMTP configuration and a real, verified mailbox.
- Added account-management event records and token records. Tokens are stored as hashes. The migration adds account fields and tables; it does not change purchase-request, purchase-order, receiving, or procurement audit statuses.
- Existing seeded office accounts are preserved on repeat seed runs. Seed no longer rotates their passwords or changes the names of existing departments.

## Local setup and access

1. Apply the additive database migration with `npx prisma migrate deploy`, then generate Prisma Client with `npx prisma generate`.
2. Run the app locally with `npm run dev` and use the existing database configuration.
3. The first local system administrator was created as `system.admin@cpats.example`. Its generated password is in the ignored `.env.seed.local` file under `CPATS_SEED_SYSTEM_ADMIN_PASSWORD`. Keep this file private. The address is a local demonstration identifier, not a real mailbox.
4. Sign in and open **Staff Accounts**. In development, find activation or reset links in the terminal running the app. The account holder sets their own password through the link.
5. Add requesting departments only after confirming their official office names and stable codes. `BSN` describes a nursing degree program, so it should not be assumed to be the department code. The existing CCS department and operational offices remain available.

The local migration and seed were applied on 2026-09-27. The seed created the first system administrator without changing existing credentials or procurement records. Do not reuse the local demonstration account or password in a deployed environment.

## Deployment decisions still required

- Confirm the official department names and codes with DMC, then add the remaining requesting departments and individual staff accounts. The account form accepts real personal staff addresses or test addresses for the local demo; it does not create Google accounts or mailboxes.
- Ask DMC IT whether to use institutional SMTP for account links and whether school single sign-on will later replace local passwords. Until then, leave production account-link delivery disabled. For SMTP, configure `CPATS_ACCOUNT_DELIVERY_MODE=smtp`, `EMAIL_DELIVERY_MODE=smtp`, `APP_BASE_URL`, and the existing `SMTP_*` settings, using a real HTTPS application URL and a DMC-approved sender.
- Verify mailbox ownership for the pre-existing hard-coded demo accounts before enabling their self-service recovery in production. They have no verified-email timestamp from this migration.
- Establish an approved identity-check process for a staff member who has lost access to their mailbox. A system administrator can disable access, but ordinary password reset requires the verified mailbox. Audit staff do not receive account-management permission.
- Replace the local demo administrator through a controlled production bootstrap and keep its credential outside the repository.

## Scope and verification

The existing Requesting Office return-correction and declined-template routes, links, forms, statuses, and Business/Admin review transitions were left in place. The prior requester department boundary fix in `/api/pr/queue` was preserved.

Verified: Prisma migration applied and is up to date; seed completed; TypeScript and targeted ESLint passed; production build passed. A local HTTP test returned 200 for system administrator sign-in and account listing, 401 for anonymous account listing, and 403 when that administrator requested a Requesting Office queue. A temporary local account passed activation, one-time-link replay rejection, password reset, old-session invalidation, and disabled sign-in checks; it was then removed. The sign-in and password-recovery screens were inspected in a narrow browser view. Existing requester credentials did not match the local seed file, so a requester-signed-in check against account administration was not performed. SMTP delivery and the account page at mobile width were not exercised end to end in this run.
