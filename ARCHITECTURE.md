# Coach App structure

- index.html — installable app shell and primary navigation
- app.css — mobile-first app styling
- app.js — view rendering, weather, notes, and resource gateway
- training-plan.json — approved Fall 2026 coaching plan
- manifest.json / sw.js — installability and offline shell
- content.json is fetched from the public site as the shared resource manifest

## Team Ops architecture

- Team Sources live in the authenticated coach record, not in repository code.
- Supported source slots: Attendance, Semester Schedule, Daily Training Plan, Annual / Season Training Arc.
- Source records store a friendly title, private link, connection status, and last-read timestamp.
- Attendance is normalized into a coach-facing athlete model with known fields only. Missing values render as unknown.
- Eligibility rules are configurable in the console. The default novice water requirement is 11 attended practices, with forms and safety blockers.
- Attendance concerns are derived from configured practice dates when available, falling back to published practice dates.
- Daily Training Plan fields can overlay the legacy session model through session custom fields, allowing future Drive write-back without changing the Today/Tomorrow render contract.
- Lineups are app-owned coach operational data. Drafts support boat class, Cox/8/7/6/5/4/3/2/Bow seats, status, and coach notes.

Privacy boundary:

- Do not commit Drive file IDs, Drive URLs, roster names, attendance rows, forms/safety records, contact data, credentials, or secrets.
- Private source configuration and any source-derived cache must remain in the protected coach record or secure runtime configuration.
- Public API views must continue to return only filtered public content or athlete-safe practice release data.


