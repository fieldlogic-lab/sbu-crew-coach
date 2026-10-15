# Assignment 002 — Security Remediation Record

**Target:** `fieldlogic-lab/sbu-crew-coach`, baseline `f568606b6ef9241e20ff60f430ae51586792e502` (2026-10-06).  
**Disposition:** prepared for pull request review. No merge, deploy, production secret change, or live-data operation was performed.

## Executive summary

The requested controls are implemented for coach API authorization, safe athlete rendering, conditional Blob updates, attendance service authentication, and local/isolated QA separation. A QA review identified a response-body/ETag race; the response now returns the body read with the returned ETag, and a regression test injects a concurrent attendance change. The phone-first root app now redirects unauthenticated coaches to the login page. Failed session saves offer a recovery JSON download.

Local validation is not production approval. Production release remains blocked on configuring secrets, verified isolated staging, browser/mobile and real Blob concurrency checks, login rate limiting, and confirming branch protection. No Assignment 001 report was present in the supplied materials or repository, so unrelated earlier findings cannot be enumerated reliably.

## Remediation register

| Finding | Change | Evidence / status |
|---|---|---|
| Private coach record and writes exposed | Signed, expiring coach session; login/logout; protected default reads, draft, publish, and session writes; attendance token cannot authorize coach routes | `api/lib/coach-auth.js`, `api/console.js`, `qa/coach-auth.test.cjs`, `qa/console-auth.test.cjs` |
| Stored athlete text could execute as HTML | Athlete rendering uses DOM text nodes / `textContent` for untrusted values | `js/athlete-render.js`, `athlete.js`, `qa/athlete-render.test.mjs` |
| Concurrent writes could lose unrelated data | Private Blob reads bypass cache; conditional ETag writes; attendance uses bounded retry against latest data; console writes require validators; response body and ETag are read from the same latest version | `api/lib/draft-store.js`, `api/attendance-sync.js`, `api/import-attendance-36f2c8cb.js`, `qa/draft-store.mjs`, `qa/console-auth.test.cjs` |
| Attendance credentials accepted in URL / confused with coach access | Dedicated `ATTENDANCE_SYNC_TOKEN` header; cron retains separate `CRON_SECRET`; Google scope remains read-only | `api/lib/attendance-auth.js`, `api/lib/google-attendance.js`, `qa/attendance-auth.mjs` |
| Smoke check could touch production | `qa:isolated` is separate from local tests, requires explicit isolation attestations, rejects known prod hosts and credentials; CI never invokes network smoke checks | `qa/smoke.mjs`, `qa/smoke-guard.test.mjs`, `.github/workflows/qa.yml`. This is not proof that an arbitrary alias or backing store is isolated; do not run until independently verified. |
| Dependencies / repeatable CI | Exact `@vercel/blob` 2.6.1 and lockfile; pinned GitHub Actions; read-only repository permission | `package.json`, `package-lock.json`, `.github/workflows/qa.yml` |

## Evidence and validation

- Baseline static team-operations check passed before changes.
- `npm ci --ignore-scripts --no-audit --no-fund` completed successfully.
- `npm audit --omit=dev --audit-level=high`: zero vulnerabilities reported.
- Synthetic local tests cover authentication boundaries, hostile markup rendering, smoke guards, and mocked Blob conflict/retry behavior. These do not establish hosted Blob behavior.
- Reviewers ran `npm test`, `npm run qa:local`, and `git diff --check`; the QA review's body/ETag race has since been fixed and a regression test added. Re-run before PR creation and record final results.
- `qa:isolated` was not run: no independently verified isolated deployment, Blob store, or integration credentials were provided. No production/live athlete endpoint was queried.
- Vercel Blob API behavior was checked against [official Blob documentation](https://vercel.com/docs/vercel-blob) and the [consistent reads announcement](https://vercel.com/changelog/vercel-blob-now-supports-consistent-reads-on-private-storage).

## Deployment readiness and required configuration

**Not ready for production.** Before staging, the service owner must configure and verify:

- `COACH_USERNAME`
- `COACH_PASSWORD` (minimum 16 characters; use a unique high-entropy value)
- `COACH_SESSION_SECRET` (minimum 32 UTF-8 bytes; independently generated)
- `ATTENDANCE_SYNC_TOKEN` (independent from coach and cron credentials)
- Existing private Vercel Blob credentials, read-only Google Sheets OAuth configuration, and `CRON_SECRET` for the existing scheduled job.

No values are included in this repository or were changed. Confirm private Blob access, Google read-only scope, scheduled job identity, and the coach's approved account owner before deployment. Configure platform edge/WAF throttling for login before production; the application has no durable login rate limit or lockout. Verify protected branch settings in GitHub; they were not accessible in this review.

The smoke script's attestations are operator claims. For a future run, verify target hostname, deployment environment, Blob store identity, and integration identities independently. Use only a dedicated staging deployment with synthetic data; an unrecognized production alias or preview wired to production resources could evade the current hostname denylist.

## Rollback and recovery

1. Stop rollout and disable the new deployment if authentication, publication, or sync behavior fails. Do not run the old unauthenticated code against production records.
2. Preserve the current deployment and private Blob versions/ETags; export a protected backup of draft and published records before any rollback write.
3. Revert the code through a reviewed commit, then retain the coach session and attendance protections through an equivalent hotfix. Rotate affected credentials if exposure is suspected.
4. For a `DRAFT_CONFLICT`, reload the latest draft and manually reconcile the downloaded recovery JSON; never force-write a stale full snapshot. If draft save succeeded but publish conflicted, publish the saved draft after reviewing its ETag and contents.
5. Restore Blob data only from a verified pre-change backup after comparing timestamps and preserving newer attendance/session changes. The planning workbook remains the attendance/planning source of truth.

## Deferred findings and limitations

- Login throttling/lockout is absent; configure edge rate limiting before production and consider durable account-aware throttling.
- Assignment 001's complete finding list/report was not supplied or found in the repository. The four concerns named in Assignment 002 are recorded above; no additional deferred findings are invented. Attach the earlier report and reconcile it before declaring the full prior audit closed.
- Network save recovery is an explicit JSON download, not durable automatic local storage; the page warns that unsaved edits remain in memory.
- Real Vercel Blob CAS behavior, authorized publication and partial-publication paths, mobile/browser sign-in flow, and staging integrations require isolated staging validation.
- Branch protection was not verified.

## Agent Force activity report

The Agent Force framework was inspected. Its configured runtime/project registry contains SurveyOS but no SBU Crew Coach project registration or task, so the prescribed framework lifecycle could not be truthfully reported as executed. Work was coordinated manually with native Codex tasks: one implemented coach API/authentication, one implemented Blob concurrency/sync, one performed independent security review, and one performed independent QA. Their reviews are reflected above; the QA race was corrected. This is a documented runtime limitation, not a claim of successful Agent Force task creation or execution.

## Pull request review gate

Review this branch and the evidence above before merge. Merge, production deployment, credential provisioning, and execution against live records are outside this assignment's authorized stop point.
