# Assignment 003 — Staging validation and release readiness

Date: 2026-10-15. PR: [#12](https://github.com/fieldlogic-lab/sbu-crew-coach/pull/12). Starting revision: `a103bef214fb2036c859db401856cd2bd3ccc07d`.

**Release verdict: BLOCKED.** Local synthetic validation passed. The available Vercel preview is not isolated, and login throttling is absent. This work does not establish production readiness or authorize merge/deployment.

## Athlete page investigation

The reported unstyled local file is explained by root-relative assets resolving outside the repository when opened through `file://`. The API also requires an HTTP server. The original controller had a separate genuine failure mode: it waited for weather alongside the schedule, so a stalled weather request could leave the page on LOADING indefinitely.

Assets now use relative paths, and a local file displays a useful website-required message without requesting records. Over HTTP the renderer loads before the controller. Schedule rendering proceeds independently of weather, with a five-second weather timeout and an eight-second schedule timeout. Failed schedule requests show a retry action and retry automatically. Missing measurements display unknown values, not zero wind/temperature.

The existing CSS, card structure, SBU header, colors, spacing, and responsive layout are retained. No changes were made to `app.css`, `console.css`, or `sw.js` in Assignment 003. Browser inspection at desktop and 390 × 844 viewport sizes confirmed the styled athlete dashboard; this is responsive-browser evidence, not a physical-device certification.

## Independently verified staging gate

Read-only Vercel project, deployment, and environment metadata were inspected. Secret values were not decrypted or printed. No hosted application URL, Blob record, or live athlete feed was requested.

| Candidate | Observed configuration | Decision |
|---|---|---|
| `sbu-crew-coach` PR preview | The same `BLOB_READ_WRITE_TOKEN` environment entry and store binding target both **production and preview**; `BLOB_STORE_ID` confirms the same store. No branch-specific isolation was present in the returned configuration. | **Unsafe for staging tests.** Existing automatic preview is not evidence of isolation. |
| `sbu-crew-coach-test` | Environment metadata returns zero variables. Its existing deployment is labeled `production` within that project and has no PR commit metadata. Separate Blob records, credentials and integrations cannot be verified. | **Not configured for this validation.** Its name alone does not establish safety. |

`qa/smoke.mjs` now refuses every hosted origin, even when isolation flags are set. Only loopback targets are allowed until a reviewed, resource-specific isolation record justifies expanding the gate. This prevents an unlisted production alias from bypassing the previous denylist.

Required before hosted testing:

1. A dedicated nonproduction deployment pinned to the reviewed PR revision.
2. A separate **private Blob store** with synthetic draft/published records and no copied athlete/OAuth records. Verify its store identity and token binding differ from production.
3. Nonproduction `COACH_USERNAME`, `COACH_PASSWORD` (16+ characters), `COACH_SESSION_SECRET` (32+ bytes), and `ATTENDANCE_SYNC_TOKEN`; independently verify environment scopes. The inspected projects did not contain these new auth settings.
4. A separate test spreadsheet with synthetic rows and nonproduction Google OAuth client/state credentials, read-only scope and verified redirect URI. Test refresh tokens must live only in the isolated store. Use a separate `CRON_SECRET`, with scheduled runs disabled until the target is approved.
5. An enforced login rate limit/backoff control, tested for repeated failures and legitimate sign-in. **Missing throttling remains an explicit release blocker.** No process-local limiter is claimed to protect distributed Vercel instances.

## Validation evidence

All application interactions below used `qa/isolated-server.cjs`: loopback-only listener, Host/Origin checks, synthetic credentials, process-memory records, actual API handlers backed by an injected in-memory Blob adapter, no `.env` loading, outbound server fetch disabled, and browser CSP blocking external requests. The fixture contains no real athlete data or Google integration. It is not a substitute for hosted SDK/integration validation.

| Check | Result and scope |
|---|---|
| Stylesheets, scripts and order over HTTP | **PASS**: HTML, CSS, renderer and controller returned 200 with correct MIME types; script order checked; actual browser startup rendered the dashboard. |
| Anonymous athlete access / private coach denial | **PASS**: local HTTP athlete API returned synthetic published session without a cookie; private API returned 401. Anonymous athlete UI worked after coach logout. |
| Coach login/logout and startup | **PASS** in browser: root redirected to login; synthetic login opened console/dashboard; logout returned to sign-in and protected root again. Startup failures have a retryable error card. |
| Daily plan edit | **PASS** in browser: save persisted, then reload retained the edit. Inputs are disabled during a pending save; canonical returned state is rendered. |
| Repeated console saves | **PASS** in browser: first save, second edit/save, and reload retained the second value. Re-rendering after save fixes listeners previously bound to replaced objects. |
| Attendance synchronization | **PASS locally**: actual attendance route accepted the dedicated synthetic header token, updated one synthetic athlete, and preserved the daily edit. Google OAuth/Sheets and scheduled hosted execution remain **BLOCKED**. |
| Publication | **PASS locally**: console Publish followed by logout and anonymous athlete viewing displayed the edited workout. Synthetic tests cover normal publication, concurrent publication conflicts and storage errors after draft save. |
| Conflicts and recovery | **PASS in browser**: attendance update between load/save caused 412; unsaved fields remained; downloaded recovery JSON contained the exact unsaved workout; reloading preserved the successful earlier edit and attendance. |
| Weather | **PASS locally**: blocked external weather did not prevent athlete plan rendering. Synthetic tests verify current/tomorrow metrics, missing measurements, hanging weather, and finite schedule failure. Real weather services were not contacted. |
| Unsafe rendering | **PASS**: hostile markup remains text; browser bootstrap is tested without CommonJS to cover the actual script entry path. |
| Mobile / PWA | **PARTIAL**: 390px responsive athlete view inspected; service-worker API exclusion, network-first assets/offline shell fallback and manifest pass VM/static tests. Physical iOS/Android installation, offline/resume and update behavior remain **BLOCKED** pending isolated-device testing. |
| Full synthetic suite | **PASS**: `npm run qa:local` includes Team Ops contract and **37/37 tests**. New route/PWA tests are wired into CI's `npm test`. |

Screenshots use synthetic data only: [athlete mobile](evidence/assignment-003/athlete-mobile.png), [published workout after logout](evidence/assignment-003/athlete-published-mobile.png), [coach conflict](evidence/assignment-003/coach-conflict.png).

## Corrections made during validation

- Athlete asset resolution, actual browser entry point, independent weather loading, timeout/error/retry state, and unknown weather measurements.
- Publication captures the published ETag **before** saving the draft, preventing an older request from adopting a newer publication's validator and overwriting it. Non-conflict publication failures now return `PUBLISH_FAILED`, `draftSaved: true`, and unknown publication status; the UI exposes recovery and instructs checking the athlete view before retrying.
- Coach startup reports errors instead of leaving a blank dashboard. Successful saves use canonical server state and rebind editors; editing controls are disabled while requests are pending.
- Logout failure no longer claims success; dirty-state logout asks before discarding edits. Recovery download URLs remain valid long enough for browser consumption.

## Independent review and remaining risks

Engineering implemented and checked the athlete flow. Independent Security reviewed authorization, publication ordering, concurrency, rendering and PWA boundaries. Independent QA added route/PWA tests and identified publication and editor-state issues addressed above. A final separate review of the completed changes found no additional actionable issue in those paths and ran the 37-test suite successfully. The final routine review used a lower-cost model at the Executive Owner's request.

Coordination used native subagents. The Agent Force framework's SBU project/task lifecycle was not executed; this report does not claim runtime certification. The Assignment 001 finding inventory remains unavailable and must be reconciled separately.

Hosted Blob CAS semantics, Google integration, enforced throttling, and installed-device PWA workflows are still unverified. Signed session cookies are stateless: logout clears the browser cookie, but a stolen copy remains valid until expiry or signing-secret rotation. No production data, credentials or deployment settings were changed. The PR remains unmerged; an automatic preview build after pushing the branch is not an approved test target.

An existing source-ownership distinction was visible in the fixture: editing the season in the console changes `plan`/`seasons`, while the daily dashboard reads `teamOps.trainingPlan`. These records are saved separately in the pre-PR baseline too. Daily dashboard edits update linked session views, but season-console edits do not automatically replace the workbook-derived daily snapshot. Confirm this workflow with the owner during isolated staging; this task did not change that mapping.

## Reproduce local checks and approval gate

Run `npm run qa:local` with application credentials absent. For local browser checks, start `node qa/isolated-server.cjs`, open `http://127.0.0.1:4173`, and use the synthetic fixture credentials documented in that file. In a separate terminal, `node qa/assignment003-http.cjs` checks only that fixed loopback fixture. Stop the server afterward; all synthetic records disappear with the process. Never substitute a deployed URL.

Executive Owner release approval should wait for the missing configuration, verified isolated hosted checks, rate-limit evidence, and physical-device validation. Use the Assignment 002 rollback procedure, preserving operational records and never restoring the unauthenticated baseline directly to production.
