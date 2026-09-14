# Coach App structure

- `index.html` — installable app shell and primary navigation
- `app.css` — mobile-first app styling
- `app.js` — view rendering, weather, notes, and source-aware dashboard
- `training-plan.json` — legacy reference only; never treated as current practice data
- `manifest.json` / `sw.js` — installability and offline shell
- `content.json` is fetched from the public site as the shared resource manifest

## Operating model

The Coach App is a phone-first dashboard, not the system of record. It brings together team-owned sources into a focused Today, Tomorrow, Team, Lineups, Season, Plan, and Resources view.

- The private Google planning workbook is the editing source of truth for the coaching year (Fall 2026 through Summer 2027).
- Its Daily Plan has every date, including weekends. Mon–Thu land sessions can use ergs; Friday land sessions use track/stairs; weekend entries have no erg/water prescription.
- The calendar follows the provided 2026–27 team schedule. The verified fall event anchors include Nov. 6 loading, Nov. 7 Frostbite, and Nov. 8 Braxton.
- Seasonal framing is Fall, Winter, Spring, and Summer. The training arc is staged weekly around the semester calendar, not treated as a generic quarterly prescription.
- The coach reviews and approves any plan snapshot before it appears as live dashboard practice content. Repository-era sessions never substitute for the current source.

## Team Ops architecture

- Team Sources live in the authenticated coach record, not in repository code.
- Supported source slots: Attendance, Semester Schedule, Daily Training Plan, Annual / Season Training Arc.
- Source records store a friendly title, private link, connection status, and last-read timestamp.
- At the start of each semester, set the four source slots once, mark the active sources connected, and record the effective date. This avoids Drive folder hunting and makes the active source explicit.
- Attendance is normalized into a coach-facing athlete model with known fields only. Missing values render as unknown.
- Eligibility rules are configurable in the console. The default novice water requirement is 11 attended practices, with forms and safety blockers.
- Attendance concerns are derived from configured practice dates when available, falling back to published practice dates.
- Daily Training Plan fields overlay the legacy session model through session custom fields, allowing secure Drive read/sync without changing the Today/Tomorrow render contract.
- Lineups are app-owned coach operational data. Drafts support boat class, Cox/8/7/6/5/4/3/2/Bow seats, status, and coach notes. Final lineup decisions stay with the coach.

## Secure Drive connection

A native private Google Sheet must be read through a server-side Google API credential or authorized OAuth connection. Do not make a planning Sheet public, use a published CSV, or place its link in client code merely to obtain sync.

The deployment needs a secure runtime connector that:

1. reads the active Daily Plan and Season Arc source;
2. validates and normalizes known fields into the protected coach record;
3. preserves source timestamps and reports sync status;
4. leaves unrecognized or missing values as unknown; and
5. never returns private source data from public endpoints.

Until that connector is enabled, the app may show an “awaiting reviewed snapshot” state and a protected source shortcut. This is intentional: it prevents stale or invented sessions from being presented as current coaching instructions.

## Privacy boundary

- Do not commit Drive file IDs, Drive URLs, roster names, attendance rows, forms/safety records, contact data, credentials, or secrets.
- Private source configuration and any source-derived cache must remain in the protected coach record or secure runtime configuration.
- Public API views must continue to return only filtered public content or athlete-safe practice release data.
