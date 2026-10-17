# SBU Crew Coach recovery — 2026-10-17

## Root cause and scope

Production coach startup returned `503 {"error":"coach authentication is not configured"}` after PR #12. The merge requires `COACH_USERNAME`, `COACH_PASSWORD`, and `COACH_SESSION_SECRET`, but production retained only the legacy `CONSOLE_CODE` / `CONSOLE_SESSION_SECRET` settings. HTML, JavaScript, and public athlete endpoints loaded correctly.

The owner subsequently approved production configuration changes and deployment, and directed that working coach workflows take priority over additional security work. The final recovery retains main's existing password authentication and signed, secure session cookies. It does **not** include PR #13's new distributed login limiter or require Redis. Private API access, conditional writes, existing Blob paths, Google adapters, and source ownership remain unchanged.

## Version and deployment evidence

| Version | Finding |
| --- | --- |
| Pre-security `f568606b6ef9241e20ff60f430ae51586792e502`, production `dpl_EjSxg1TaNs9ByGs2X9i3VBsFqGdr` | Historical functional baseline reported by owner. Its unauthenticated private API is unsafe to restore. No live writes tested. |
| main / PR #12 `c25f97cfd63df83a22b295059824c9dd69f1808e`, production `dpl_FZWzy5hcb6ukRTSmxyNyMkC58Qqj` | Immediate failure is missing matching coach configuration. Probe correlation: `cle1::iad1::ltp6x-1792200045985-fecc3208d924`. |
| Draft PR #13 `341b18c3fc1397fb598433752f356f2b87fc8f89`, test Preview `dpl_EBDX5MJZMiVtfhQXMHvLzQSgQ1mr` | Contains corrected `loginRateLimit.configured()` export. Confirmed by source comparison and earlier 50-test run with real-module route coverage. That optional limiter is deferred entirely in the final recovery, so there is no caller/export mismatch or Redis dependency in the released path. |

`/`, `/app.js`, `/console.html`, `/athlete.html`, and `/athlete.js` returned 200 with appropriate types. `/console` returns 404; application links correctly use `/console.html`. The legacy `/stony-brook-crew/(.*)` rewrite returns root HTML; current HTML uses absolute root asset paths. No routing correction is needed for the current entry points. Anonymous published athlete and TV APIs returned 200; this establishes availability, not correctness of live practice contents.

Vercel READY was treated only as build completion. A 1-day runtime error query exceeded Hobby retention; corrected 30-minute query returned no matching production error logs. The explicit 503 establishes the failure regardless of logs.

## Corrective changes

1. Configure the three missing Production coach variables with a new coach identity/password and independent signing secret. Keep Blob and Google bindings untouched. No legacy code reinterpretation or fallback to anonymous private access.
2. Sort the displayed daily snapshot by date; Tomorrow selects the next New York calendar date rather than array position. Missing Tomorrow displays an explicit no-practice state instead of a historical or repeated workout.
3. A late resources response refreshes only Resources. It cannot redraw a daily editor and discard typed edits.
4. Extend the memory-only fixture and add repeatable Chromium workflow coverage. No feature additions or data migration.

## Verification

Final code tests use synthetic identities, memory-only Blob storage, and blocked external requests. Node 24.19.0 and system Chromium through Playwright.

| Check | Result and limits |
| --- | --- |
| `npm run qa:local` | PASS Team Ops contract and all 8 test files. |
| Run each test file directly with Node | PASS **37 tests/subtests**, zero failures. Covers signed sessions and expiry/tampering, private read denial, edits, stale-write conflicts, attendance, publication and partial-publication recovery, PWA network-only APIs, and athlete/weather failures. Direct runs expose individual counts in this execution environment. |
| `node qa/recovery-browser.cjs` | Actual Chromium UI covers anonymous redirect; wrong/correct login; dashboard under weather failure; late resources preserve typed edits; daily edit/save/refresh; date-based and absent Tomorrow; Team/attendance; Season and Plan; conflict preserves edits and produces valid recovery download; console save/publication; anonymous athlete receives saved workout; private read denied; logout clears session and refresh requires login. Latest run recorded in deployment handoff. |
| `node qa/assignment003-http.cjs` | Loopback asset delivery, anonymous athlete/private boundaries, and synthetic attendance synchronization. Latest run recorded in deployment handoff. |
| Production | Pre-fix configuration 503 confirmed. Final authenticated read/browser checks are recorded in deployment handoff. No live Blob write test or migration is authorized by configuration/deployment approval. |
| Google integration | Independent synthetic OAuth/workbook unavailable; code and production references preserved. |
| Physical installed PWA | Not tested on a physical device; automated worker tests pass. |

Reproduce with `npm ci`, `npm run qa:local`, and `node qa/isolated-server.cjs` in one terminal. In another run `node qa/recovery-browser.cjs` and `node qa/assignment003-http.cjs`. Playwright must be available to Node; Chromium defaults to `/usr/bin/chromium` or `CHROMIUM_PATH`. Restart the fixture to reset records. There is no hosted target override.

## Production release and remaining limits

Executive Owner approval was received in this conversation for production configuration and deployment of the recovery. Only the missing coach settings are added: username, unique password of at least 16 characters, and independent signing secret of at least 32 bytes. New credentials remain outside the repository and are supplied separately to the owner. The new variables take effect on the new deployment.

Preserve the production Blob binding `store_pwc9OhW8vfzF3n1y` and all existing Google settings. Main-project Preview shares the live Blob binding and must not be used for write tests. The separate test project has binding `store_xeLwYP3quzmmSSUy`, but its Preview is SSO-protected and no authenticated test login is available here.

Production readiness is determined by actual post-release login and dashboard/API checks, reported in the deployment handoff. Synthetic save/refresh/conflict/publication tests establish the application flow locally; they do not establish real hosted Blob write or Google OAuth compatibility. Final owner acceptance is opening the app and saving a real intended practice edit. Do not fabricate or alter a live practice for a test.

## Rollback

For UI regression after release, revert the recovery's frontend changes while retaining the now-correct coach environment settings and authentication. Do not roll back to the pre-authentication release or restore anonymous private API access. No Blob snapshot restoration or migration is part of rollback. Newly configured coach variables may remain in place when returning to PR #12 code; do not delete signing secrets without accounting for invalidated sessions. Verify login/read and owner-approved practice editing after any rollback. Keep all storage and Google references intact.
