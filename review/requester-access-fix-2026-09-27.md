# Requesting Office queue access correction

**Date:** 27 September 2026  
**Scope:** G01 in `proposal-workflow-gap-assessment-2026-09-26.md` only.

## Requested outcome

A signed-in Requesting Office user may retrieve requests and their audit history for that user's own department only, regardless of a `departmentId` supplied in the queue request body.

## Change made

In `src/app/api/pr/queue/route.ts`, `POST /api/pr/queue` now rejects a Requesting Office request with HTTP 403 when its supplied, nonempty `departmentId` differs from the authenticated user's department. For an accepted Requesting Office request, the query uses the authenticated department ID. Omitting the field, sending an empty value, or sending the user's own ID continues to load that user's department queue.

The endpoint's existing Global Auditor role override can still select a department when requesting the Requesting Office queue. Business, Admin, Purchasing, and Receiving queue selection is unchanged. The Track Requests caller still sends the signed-in user's department ID, so its normal load path and its `returnId` and `declineId` actions remain in place.

## Boundary review

- Changed: server-side department authorization and selection for the Requesting Office branch of the existing queue endpoint.
- Unchanged: request creation; Business and Admin decisions; PO, finance, and receiving transitions; notification routing; audit history records; correction and declined-template endpoints; queue response shape; client layouts and actions.
- No database migration, status change, new endpoint, or change to stored records was needed.

## Verification

- `npx tsc --noEmit`: passed.
- `npx eslint src/app/api/pr/queue/route.ts`: passed.
- `git diff --check -- src/app/api/pr/queue/route.ts`: passed.
- A focused route-level request using Requesting Office identity headers and a different valid department ID returned HTTP 403 with a rejection payload. This exercised the guard without reading or writing the database; it did not exercise the deployed session middleware.
- `npm run build`: passed with a temporary build-only `SESSION_SECRET` and network access for the existing Google Fonts dependency. No environment file was edited. The build reported the existing Next.js middleware convention warning.
- Static caller and route review confirmed the Track Requests page sends the authenticated user's department ID, the correction and declined-template links remain present, and the other queue branches were not edited.

No live cross-department retrieval attempt or database-backed endpoint test was performed. The repository has Jest-style test files but no installed Jest runner or test script; production behavior still needs confirmation in an authenticated deployment environment.
