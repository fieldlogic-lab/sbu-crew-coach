# Assignment 004 — Staging and final release preparation

Date: 2026-10-15. PR: [#12](https://github.com/fieldlogic-lab/sbu-crew-coach/pull/12). Reviewed starting revision: `91e0f533e430e37ab79a25bbf56f633545e44444`.

**Release verdict: BLOCKED.** This change adds application-side distributed login throttling and tests. A private, isolated hosted staging environment is not established, so no hosted service or physical-device acceptance tests were run. No production deployment, merge, live record access, or account-resource change was performed.

## Authentication throttling

`api/lib/login-rate-limit.js` uses an HTTPS Redis REST service. An atomic Redis Lua `INCR`/`EXPIRE` operation is shared across Vercel instances; no process memory is used for enforcement. It tracks a per-client bucket plus a per-client/username bucket using HMAC-derived keys, so usernames and IP addresses are not stored as Redis key text. The limit is five login attempts per 15-minute window. A correct login clears both buckets. Requests beyond the limit receive `429` with `Retry-After`; absent or unavailable limiter configuration returns `503` before checking credentials, so the application does not silently fall back to an ineffective local limiter. A successful login still issues the existing scoped, secure session cookie.

Required Vercel settings for **each isolated application environment**:

- `LOGIN_RATE_LIMIT_REST_URL` — HTTPS endpoint for that environment's dedicated Redis/Upstash database.
- `LOGIN_RATE_LIMIT_REST_TOKEN` — write credential scoped to that database only.
- Existing `COACH_SESSION_SECRET` — at least 32 bytes; also keys non-reversible limiter bucket names.

Do not reuse production Redis credentials or database. Provisioning the Redis database and token requires Executive Owner approval. The chosen fixed window can allow a short burst across a window boundary; it does not permanently lock the coach account. Hosted provider behavior, latency, availability, and configured Vercel forwarding headers remain to be verified.

Automated synthetic validation: `npm test` passed **42/42 tests**, including limit enforcement across usernames sharing an IP bucket, expiry recovery, successful-login reset, fail-closed storage/configuration behavior, route-level `429`/`503`, and the existing coach/Blob/PWA regression suite. Tests use a mock shared Redis REST endpoint; they do not prove a hosted Redis deployment.

## Staging infrastructure status

Read-only Vercel metadata confirms `sbu-crew-coach-test` exists in team `team_IZEdIWVohYJ3I4Ujyj5WTavr`, has SSO protection enabled, and has the verified domain `sbu-crew-coach-test.vercel.app`. Its only recorded deployment is a READY deployment from 2026-08-31, labeled production within that project. The project has no environment variables, and its deployment has no PR #12 revision metadata. The project response did not establish repository linkage or a Blob binding. The project's team/account ownership is visible; ownership and store/resource isolation beyond that metadata were not independently verified.

The project is a candidate, not a usable staging target yet. No preview/staging URL is verified, and `sbu-crew-coach-test.vercel.app` must not be treated as the assignment's staging URL until the current SHA is deployed and SSO, data bindings, and integrations are confirmed. The production project PR preview remains unsafe for data tests because prior read-only review found its preview and production deployments share Blob configuration. The hosted smoke test continues to reject all non-loopback hosts.

### Executive Owner actions needed before deployment

1. Confirm `sbu-crew-coach-test` is the approved project and authorize its use for acceptance testing. In Vercel project settings, confirm its Git repository is `fieldlogic-lab/sbu-crew-coach`, attach the reviewed PR #12 head SHA `91e0f533e430e37ab79a25bbf56f633545e44444`, and confirm the resulting deployment is in that project. No deploy was issued because the inspected project is unconfigured and not linked to the reviewed revision.
2. Approve creation/use of a dedicated private Vercel Blob store for this staging project. Confirm its store ID differs from production and that only staging has its read/write token. Seed synthetic records only after the identity check.
3. Approve a dedicated Redis/Upstash database and scoped REST token for staging. Set the variables listed above only in the test project.
4. Provision independent synthetic coach username/password/session secret, `ATTENDANCE_SYNC_TOKEN`, and `CRON_SECRET`. Keep OAuth credentials separate. Do not copy production OAuth tokens, Blob tokens, coach secrets, athlete data, or attendance records.
5. Create a synthetic Google Sheet with synthetic row names and dates, plus an independent Google Cloud OAuth client with read-only Sheets scope and only the test project's callback URL. Store any refresh token only in the test Blob store. Verify the spreadsheet ID and credentials before enabling the staging cron; otherwise leave scheduled integrations disabled. The current `vercel.json` schedules attendance refresh at `07:00 UTC` for a production-target deployment, so confirm the test deployment can only reach its synthetic Sheet before allowing that schedule to run.

These are account/resource/credential actions and were not performed. After approval and provisioning, the exact test-project environment variable names can be filled from `docs/ATTENDANCE_OAUTH.md` plus the new limiter variables. Do not copy values from production.

## Hosted tests and isolation evidence

| Requested validation | Status |
|---|---|
| Hosted coach login / logout | **Not run** — staging has no authentication or limiter configuration. |
| Private Blob read/write and separation from production | **Not run** — no test Blob binding or store identity was available to verify. |
| Concurrent update / conflict handling on hosted Blob | **Not run** — local synthetic CAS coverage remains; hosted Blob semantics are unverified. |
| Athlete publication and error recovery | **Not run hosted** — local synthetic publication and partial-failure tests remain passing. |
| Google Sheets attendance sync | **Not run** — no independent OAuth client or synthetic sheet is configured. |
| Staging cron isolation | **Not verified** — `vercel.json` declares the refresh schedule, but test project's revision and isolated environment are not established. Do not enable staging refresh until the synthetic destination is verified. |
| Staging vs production isolation | **Not established** — existing production preview must not be used; a distinct private store, credentials, and integration destination still need proof. |

Once approved resources exist, record non-secret evidence: project ID, deployment ID and SHA, test and production Blob store IDs (not tokens), environment scopes (names and scope only), Google test project/sheet identifiers, cron target, and SSO check. Then run hosted acceptance only against the confirmed staging hostname using synthetic data and the approved staging credentials.

## Physical-device acceptance checklist

Physical Android and iPhone devices were not available in this run. Device validation remains **incomplete**. On each device, use the verified staging URL and synthetic coach account:

1. Open coach sign-in; confirm layout at portrait and landscape sizes and sign in/out.
2. Install the PWA (Android Chrome: install prompt/menu; iPhone Safari: Share → Add to Home Screen); open the installed app.
3. Load the athlete page and coach dashboard online; save a synthetic daily-plan edit and confirm it persists after reload.
4. Go offline, relaunch the installed app, and confirm the cached shell loads without showing stale private API data as current.
5. Reconnect; confirm the network state recovers, current content refreshes, and a failed unsaved coach edit has a clear recovery path.
6. Publish a synthetic workout; verify it appears anonymously on the athlete page after the configured release time.
7. Deploy a harmless staging-only asset/app revision; confirm the installed app updates and reloads without losing the authenticated coach workflow.
8. Record device model, OS/browser version, staging deployment SHA, pass/fail, and screenshots without real athlete information.

## Planning workflow finding

The intended source-of-truth model documented in `docs/DAILY_PLAN_SYNC.md` is that the Google Drive Planning Workbook is authoritative for the **Daily Plan**, while the app serves a manually promoted private cached snapshot in `teamOps.trainingPlan`. Season-console changes live in `plan`/`seasons` and the season arc; they do not automatically overwrite the workbook-derived daily snapshot. A daily session edit updates linked app session views, while changing the season plan does not replace the Daily Plan cache. This separation predates PR #12 and may be intentional. It can look inconsistent when a coach expects one edit surface to drive both. No source mapping or merge behavior was changed; Executive Owner confirmation is needed before changing ownership or synchronization.

## Security and QA assessment

The new code removes the known process-local-throttling risk by requiring an external atomic shared counter. Synthetic suite: **PASS, 42/42**. The implementation and test cases in this assignment did not receive a separate independent security/QA agent review during this run. Outstanding security gates are provisioning and verifying the distributed store, hosted fail-closed/recovery behavior, independent review of the new throttling policy, store/credential separation, and review of cron/OAuth isolation. Existing signed sessions remain stateless until expiry or signing-secret rotation, as recorded in Assignment 003.

**Recommendation:** do not release to production. Approve and configure isolated staging resources, deploy the reviewed PR SHA only to the test project, complete hosted synthetic-service tests and physical-device checks, and obtain an independent security/QA review before Executive Owner acceptance and any later production decision. Do not merge or deploy to production as part of this assignment.
