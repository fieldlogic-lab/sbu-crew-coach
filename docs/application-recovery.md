# SBU Crew Coach recovery — 2026-10-17

**Production readiness: BLOCKED.** The code works with isolated synthetic records, but an actual coach still cannot use production until its authentication configuration is corrected and hosted acceptance passes. No merge, production deployment, production credential change, live Blob write, or data migration was performed.

## Diagnosis

| Version | Evidence | Finding |
| --- | --- | --- |
| Last pre-security production | `f568606b6ef9241e20ff60f430ae51586792e502`, deployment `dpl_EjSxg1TaNs9ByGs2X9i3VBsFqGdr` | Historical functional baseline reported by owner. Its unauthenticated private API is unsafe to restore. Not retested with live writes. |
| main / merged PR #12 | `c25f97cfd63df83a22b295059824c9dd69f1808e`, production `dpl_FZWzy5hcb6ukRTSmxyNyMkC58Qqj` | Signed coach sessions are required. Production still has legacy `CONSOLE_CODE` / `CONSOLE_SESSION_SECRET`, but none of `COACH_USERNAME`, `COACH_PASSWORD`, `COACH_SESSION_SECRET`. |
| Draft PR #13 | `341b18c3fc1397fb598433752f356f2b87fc8f89`, test Preview `dpl_EBDX5MJZMiVtfhQXMHvLzQSgQ1mr` | Contains distributed limiter and corrected `configured()` export. Test project has Preview coach variables and independent Blob binding. Not deployed to production. |

Read-only production probe: `GET https://crew.rtpny.com/api/console` returned **503** with `{"error":"coach authentication is not configured"}`. Request correlation: `cle1::iad1::ltp6x-1792200045985-fecc3208d924`. This is the immediate production regression: PR #12 changed the authentication contract without the matching production configuration. Previously the dashboard tolerated a failed private read; it now correctly refuses to show private state without access.

Routing/static probes: `/`, `/app.js`, `/console.html`, `/athlete.html`, and `/athlete.js` return 200 with correct content types. `/console` returns 404; the application's actual link is `/console.html`. The configured legacy `/stony-brook-crew/(.*)` rewrite serves the root HTML, including for nested asset-like paths; current HTML uses absolute root assets so the dashboard does not depend on those paths. No routing change is required for the current entry points.

Anonymous published athlete and TV APIs return 200. This confirms availability and response shape, not correctness of the live practice contents. No private athlete records were retrieved for this investigation.

Vercel project inspection confirms Production and Preview deployment identities above; READY is a build status only. The isolated test Preview redirects unauthenticated requests to Vercel SSO. No existing authenticated CLI or test coach credentials are available in this workspace. No protection setting or bypass link was created. Hosted post-fix login remains untested.

Runtime error inspection: a 1-day query was rejected by Hobby retention; corrected 30-minute production error query returned no matching logs. This is a limited observation, not evidence of a healthy application. The explicit 503 response establishes the failure even without runtime exceptions.

Two additional source defects affect the requested workflows:

- Tomorrow used array position, repeating Today at the last record or selecting the first historical record when Today was absent. It also assumed ordered sessions.
- A late public resources response redrew whichever screen was active, discarding typed daily-plan edits before save. This predates PR #12 but directly impairs recovery's save criterion.

## Exact changes

1. Reuse PR #13's existing limiter implementation and route coverage, including the actual `configured()` delegate export. Missing configuration and Redis failures remain closed (503), invalid credentials return 401 or 429, and a valid login clears counters before issuing the signed cookie. No new authentication architecture or legacy credential fallback.
2. Sort the in-memory daily snapshot by date. Tomorrow selects the next New York calendar date, including month/year boundaries, rather than array position. An absent tomorrow displays an explicit no-practice state.
3. Refresh Resources only when its screen is active; a late resources response cannot redraw a daily editor.
4. Extend the memory-only fixture and credential guard; add repeatable Chromium workflow coverage. Storage paths, Google adapters, draft/publication projections, CAS behavior, and source ownership remain unchanged.

The known limiter defect is absent from the tested recovery version: `qa/console-auth.test.cjs` imports the real module, asserts `configured` is a function, and replaces Redis transport rather than that export. Main itself has no limiter module; the defect belonged to an earlier PR #13 revision.

## Tests actually run

Environment: Node 24.19.0, Playwright with system Chromium; synthetic identities, memory-only Blob adapter, synthetic Redis transport. External requests in the browser test are aborted except the intercepted synthetic resources response. The loopback fixture never loads `.env` or real service credentials.

| Check | Result / limits |
| --- | --- |
| `npm run qa:local` | PASS Team Ops contract and all 9 test files. |
| Run each of those 9 files directly with Node | PASS **50 assertions/subtests reported by the test runner**, zero failures. Includes login, limiter reset/expiry/failure, session expiry/tampering, private read denial, edits, CAS conflicts, attendance, publication and partial-publication recovery, PWA network-only APIs, and athlete/weather failures. Direct runs were used because this environment's parent test reporter collapses results to file counts. |
| `node qa/recovery-browser.cjs` | PASS actual Chromium UI: anonymous redirect; wrong/correct login; dashboard loads despite blocked weather; delayed resources preserve typed text; daily edit/save/refresh; Tomorrow with unsorted historical records; absent Tomorrow; Team/attendance; Season and Plan; conflict preserves edits and produces correct recovery download; console draft save/publication; anonymous athlete receives saved workout; private read denied; logout clears cookie; refresh requires login; no uncaught browser exceptions. |
| `node qa/assignment003-http.cjs` | PASS loopback assets, athlete publication access, anonymous private denial, synthetic attendance synchronization. |
| Production HTTP probes | PASS static assets and published athlete/TV endpoint availability. FAIL private startup: expected configuration 503 described above. No production login or writes attempted. |
| Hosted coach login/save/refresh/publication, real Redis Lua and Blob integration | BLOCKED: SSO-protected test Preview and unavailable test login credentials/authenticated CLI. Local adapters do not establish hosted service compatibility. |
| Google workbook integration | BLOCKED: independent synthetic OAuth credentials/workbook unavailable. Existing Google code and production references preserved. |
| Physical-device installed PWA | NOT RUN. Automated worker tests pass; no physical device claim. |

Reproduce with `npm ci`, `npm run qa:local`, then start `node qa/isolated-server.cjs` in one terminal. In another, run `node qa/assignment003-http.cjs` and `node qa/recovery-browser.cjs`. The browser script requires Playwright available to Node and Chromium at `/usr/bin/chromium` (or `CHROMIUM_PATH`). Restart the fixture between browser runs to reset memory-only records. No hosted URL override exists.

## Smallest safe configuration correction — approval required before production action

In the production environment of Vercel project `sbu-crew-coach` (`prj_Mz5h8lnUQ6zyF8HrMVzQOxLF7NB9`), the Executive Owner or authorized operator must provision:

- `COACH_USERNAME`: intended coach identity.
- `COACH_PASSWORD`: a unique password, at least 16 characters.
- `COACH_SESSION_SECRET`: an independent signing secret, at least 32 UTF-8 bytes.
- For this recovery version, `LOGIN_RATE_LIMIT_REST_URL` and `LOGIN_RATE_LIMIT_REST_TOKEN`, or the supported `LOGIN_RATE_LIMIT_KV_REST_API_URL` and `LOGIN_RATE_LIMIT_KV_REST_API_TOKEN`: an HTTPS shared Redis REST endpoint and writable token. Production currently has neither pair. Preserve existing Blob and Google bindings.

Do not reinterpret `CONSOLE_CODE` as a new coach password, expose secrets to browser code, or copy test credentials into production. Environment changes require a new deployment to take effect. This report authorizes neither configuration changes nor deployment.

Before any release, test the exact recovery commit in the separate `sbu-crew-coach-test` project with normal authenticated SSO access, independent synthetic credentials, and its independent Blob/Redis stores. Production's Blob binding is `store_pwc9OhW8vfzF3n1y`; the test project's binding is `store_xeLwYP3quzmmSSUy`. The main project's Preview shares production's Blob binding, so do not perform write tests there. Confirm the effective bindings of each tested deployment, not just current project settings.

Required hosted acceptance: login/logout/session refresh; read/edit/save/refresh a synthetic daily workout; second-client conflict and recovery; draft publication and anonymous athlete view; fail-closed limiter behavior and recovery; synthetic Google integration when credentials exist. Record exact SHA, request status/correlation, and service results. An actual coach's successful open/edit/save acceptance remains outstanding. Obtain Executive Owner approval before merge or production deployment.

## Rollback

Before release, close this recovery PR or discard its branch; production is unchanged. After an approved release, an operator may revert this PR's commit(s) and release the reverted commit only with Executive Owner approval. Reverting to current main will restore the known configuration requirement and remove the carried limiter; it is not a functional or release-approved fallback. Do not roll back to `f568606` or another pre-authentication release: that restores insecure private API access. Prefer a forward correction of configuration while retaining authentication. Never restore an old draft/published Blob snapshot as a code rollback; there is no data migration to reverse. Preserve all existing storage and Google references, and verify login/read/edit/save after any approved rollback or forward fix.
