# Safe editing guide

This app is intentionally organized so that a small request should change one small area.

## The edit map

| If the request is about… | Change this file | Do not change |
| --- | --- | --- |
| A label, default season, source label, or public resource wording | `js/config.js` | `app.js`, API, storage |
| Live conditions source, units, timestamps, fallback behavior | `js/weather.js` | training, team, login, navigation |
| Attendance normalization, eligibility, practice-count and absence rules | `js/team-ops.js` | screens, login, Drive source URLs | 
| Team and lineup layout/copy | `js/views/team.js` | eligibility rules, source syncing |
| A screen’s layout or wording | the matching renderer block in `app.js` | API, source adapters |
| Coach login, protected session, record read/write | `api/console.js` | client screens unless the API contract changes |
| Console editing fields | `console.js` / `console.html` | public app unless a new saved field is needed |
| Daily workouts, calendar events, coaching notes, source links | the private Drive workbook or protected Coach Console | repository code |

## Non-negotiable rules

1. Never put private Drive links, athlete names, attendance, credentials, or session data in Git.
2. Do not change more than one feature boundary in a normal edit.
3. Preserve the API response shape unless the change is explicitly an API change.
4. Use small focused pull requests: one intent, one feature area, one verification note.
5. Add a module before adding a second unrelated responsibility to an existing file.
6. The phone app is a dashboard. The Drive workbook and E-Board sheets remain the editable systems of record.

## Current module boundaries

```
app.js                 controller and page composition
js/config.js           safe display configuration and defaults
js/weather.js          external live-conditions adapter
js/team-ops.js         attendance, eligibility, and exception domain
js/views/team.js       Team and Lineups screen renderers
js/views/practice.js   Today and Tomorrow screen renderers
js/views/planning.js   Season and Plan screen renderers
api/console.js         protected record, auth, and persistence
console.js             protected editing-console interface
```

## Next extraction order

1. `js/session-plan.js` — reviewed planning-snapshot normalization
2. `js/dom.js` — escaping, links, local coach notes
3. `js/views/resources.js` — Resources screen renderer
4. `js/app-controller.js` — route selection and event binding

Each extraction must preserve visible behavior and be deployed separately. That makes a regression easy to locate and reverse.
