# Assignment 004 — Staging and final release preparation

Date: 2026-10-15. PR: [#12](https://github.com/fieldlogic-lab/sbu-crew-coach/pull/12). Reviewed starting revision: `91e0f533e430e37ab79a25bbf56f633545e44444`.

**Release verdict: BLOCKED.** The application change adds distributed login throttling, and an isolated test project now has its own private Blob store and a READY Preview deployment. Hosted application workflows remain blocked on independent Redis, coach credentials, and a synthetic Google integration. No production deployment, merge, or production data access was performed.

## Authentication throttling

`api/lib/login-rate-limit.js` uses an HTTPS Redis REST service. An atomic Redis Lua `INCR`/`EXPIRE` operation is shared across Vercel instances; no process memory is used for enforcement. It tracks a per-client bucket plus a per-client/username bucket using HMAC-derived keys, so usernames and IP addresses are not stored as Redis key text. The limit is five login attempts per 15-minute window. A correct login clears both buckets. Requests beyond the limit receive `429` with `Retry-After`; absent or unavailable limiter configuration returns `503` before checking credentials, so the application does not silently fall back to an ineffective local limiter. A successful login still issues the existing scoped, secure session cookie.

Required Vercel settings for **each isolated application environment**:

- `LOGIN_RATE_LIMIT_REST_URL` — HTTPS endpoint for that environment's dedicated Redis/Upstash database.
- `LOGIN_RATE_LIMIT_REST_TOKEN` — write credential scoped to that database only.
- Existing `COACH_SESSION_SECRET` — at least 32 bytes; also keys non-reversible limiter bucket names.

Do not reuse production Redis credentials or database. Provisioning the Redis database and token requires Executive Owner approval. The chosen fixed window can allow a short burst across a window boundary; it does not permanently lock the coach account. Hosted provider behavior, latency, availability, and configured Vercel forwarding headers remain to be verified.

Automated synthetic validation: `npm test` passed **42/42 tests**, including limit enforcement across usernames sharing an IP bucket, expiry recovery, successful-login reset, fail-closed storage/configuration behavior, route-level `429`/`503`, and the existing coach/Blob/PWA regression suite. Tests use a mock shared Redis REST endpoint; they do not prove a hosted Redis deployment.

## Staging infrastructure status

Vercel project metadata confirms `sbu-crew-coach-test` belongs to team `team_IZEdIWVohYJ3I4Ujyj5WTavr`, has SSO protection enabled, and has the domain `sbu-crew-coach-test.vercel.app`. The draft PR #13 head `14d02700e51b0a9a82f7aa4f80b8048e92bd858f` was deployed directly to this project as Preview deployment `dpl_2PGT8NQYtTG9m9D59doiws6T2DFR`, READY in region `iad1`. The verified preview URL is `https://sbu-crew-coach-test-365nmnp2h-timothyadammassi-6420.vercel.app` (SSO protected). The test project remains unlinked to Git; the deployment was created from the exact GitHub repository, branch, and SHA using Vercel's Git-source deployment API.

A new private Blob store, `sbu-crew-coach-test-blob`, was created in `iad1` and connected to the test project only. Its store ID is `store_xeLwYP3quzmmSSUy`. Read-only environment metadata identifies production's store as `store_pwc9OhW8vfzF3n1y`; the IDs differ. The new store connection creates Blob variables in the test project's Production and Preview scopes only. The production project's Blob connection still references its own store. Store usage was zero at inspection. The Preview deployment is a separate Vercel project deployment and carries only that test project’s Preview environment. Thus Blob isolation is verified; hosted application-level read/write behavior is not yet tested.

The test project's environment currently contains only the three Blob connection variables in Production and Preview. It has no coach login, session, rate-limit, OAuth, sheet, service-token, or cron credentials. The deployment target is Preview (`target: null`), so the Vercel cron schedule is not active for this deployment. No live records or external integrations were accessed. The production project's PR preview remains unsafe for data tests because its Preview and Production scopes share production Blob configuration. The hosted smoke test continues to reject non-loopback hosts.

### Executive Owner actions needed before application acceptance

1. Acknowledge the created test-only Blob store and use its private token only within `sbu-crew-coach-test`. Do not copy the token into another project.
2. Provision a dedicated free-tier Redis/Upstash database and REST token for the test project. The integration setup is awaiting approval to accept Vercel Marketplace and Upstash terms and share Vercel account metadata with Upstash. Set `LOGIN_RATE_LIMIT_REST_URL` and `LOGIN_RATE_LIMIT_REST_TOKEN` in the test project only.
3. Enter an independent synthetic coach username/password and session secret directly into the test project's environment. `COACH_SESSION_SECRET` must be at least 32 bytes; `COACH_PASSWORD` must be at least 16 characters. Add independent `ATTENDANCE_SYNC_TOKEN` and `CRON_SECRET` only after integration isolation is ready. Never copy production OAuth tokens, Blob tokens, coach secrets, athlete data, or attendance records.
4. Create a synthetic Google Sheet with synthetic row names and dates, plus an independent Google Cloud OAuth client with read-only Sheets scope and only the test project's callback URL. Store any refresh token only in the test Blob store. Verify the spreadsheet ID and credentials before enabling a staging cron. `vercel.json` schedules attendance refresh at `07:00 UTC` for production-target deployments; leave the cron unconfigured until its synthetic destination is confirmed.

The Blob store and Preview deployment are established. Remaining account/resource/credential actions are independent Redis setup, independent coach credentials, and a synthetic Google integration. The Upstash marketplace step is waiting on separate acceptance of its terms and account-data sharing. Do not copy values from production.

## Hosted tests and isolation evidence

| Requested validation | Status |
|---|---|
| Hosted coach login / logout | **Blocked** — protected dashboard request returned the expected `503` because staging coach credentials are not configured; successful login/throttling recovery awaits independent credentials and Redis. |
| Private Blob read/write and separation from production | **Isolation verified; read/write test not run** — unique private test store is bound to the test project. Its athlete read endpoint returned expected `404` on an empty store. SDK write/read and CAS tests await coach auth setup. |
| Concurrent update / conflict handling on hosted Blob | **Not run** — local synthetic CAS coverage remains; hosted Blob semantics are unverified. |
| Athlete publication and error recovery | **Not run hosted** — the synthetic athlete endpoint correctly reports no publication on the empty test store; hosted publication/recovery awaits coach auth setup. Local synthetic publication and partial-failure tests remain passing. |
| Google Sheets attendance sync | **Not run** — no independent OAuth client or synthetic sheet is configured. |
| Staging cron isolation | **Verified inactive for current deployment** — it is Preview-targeted, and Vercel Cron runs only for production-target deployments. Keep it that way until synthetic integration setup is verified. |
| Staging vs production isolation | **Blob boundary verified** — test and production Blob store IDs differ; the test project's environment list contains only its own Blob connection variables. Independent app, Redis, OAuth, and sheet credentials remain unconfigured. |

Before hosted acceptance, record non-secret evidence: project ID, deployment ID and SHA, test and production Blob store IDs (not tokens), environment variable names and scopes, Google test project/sheet identifiers, cron target, and SSO check. Run hosted acceptance only against the confirmed staging hostname using synthetic data and staging credentials.

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

