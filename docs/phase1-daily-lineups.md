# Phase 1: Connected roster and daily lineups

Review scope: one mobile daily lineup feature, based on main commit
37d169618df44dbe16bcf1cdc3d6fd4da696abbc. No merge, deployment, source workbook
write, or production-data operation is part of this change.

## Coach workflow

Open Lineups, choose a practice date, add boats, choose each boat class, and
assign athletes by name. All athletes remain available for either rowing or
coxswain seats; no preferences, profile fields, or administrative entry is added.
Assigned names are disabled in other seat pickers. Use Move / swap at a source
and destination to exchange assignments, including moving into an empty seat.

Save draft persists all boats for that date in the private Coach record.
Revisiting that date reopens its saved lineup. Copying a saved date creates an
editable draft at the selected date. Approval requires every seat to be filled.
Editing an approved lineup returns the working copy to draft; approval itself
only updates the private daily lineup and does not publish athlete content.
Existing console-era drafts are retained unchanged.

Unsaved dates remain in page memory when navigating or changing dates. Closing
or refreshing the page prompts about unsaved work. Failed saves retain inputs;
a recovery JSON download is available. After a version conflict, download edits
before reopening the latest record. There is no automatic overwrite or merge.
Each open date retains its original record ETag, so saving another date or
refreshing the shared record cannot silently authorize stale edits.
No private roster is cached in localStorage or service-worker API responses.

## Integration audit and identity

The existing configured attendance workbook remains the source. Existing OAuth
uses spreadsheets.readonly; tokens remain in private Blob storage. Workbook IDs,
source links, credentials, and OAuth configuration are not changed. Refresh and
sync retain their existing authorization boundaries and optimistic concurrency.
Attendance and eligibility field handling and rules remain unchanged. The new
picker reads only names and internal IDs; it does not add profile inputs.

Unique names retain internal IDs across refreshes and row reordering. Existing
source-supplied IDs are retained. Before any refreshed roster is available,
legacy cached rows receive internal IDs on the first successful lineup save.
Both existing attendance import paths and the Google refresh use the same
identity reconciliation. No writeback to the workbook is needed.

Indistinguishable duplicate-name rows without source IDs cannot be reliably
matched across a sheet refresh. They receive separate IDs and numbered name
labels; on refresh their IDs change deliberately. Saved seats with retired IDs
show “Roster changed — reassign” and the server rejects saving until those seats
are cleared/reassigned. This prevents silently transferring a seat to a different
person. Unique-name renames also require reassignment. Stable source identifiers
would be needed to remove this limitation; no new administrative workflow is
introduced here.

## Protection and verification

The new save-lineup action requires the existing signed Coach session and a
matching draft ETag. It rejects stale writes, invalid dates/classes/seats, missing
roster IDs, duplicate assignments across all boats, and incomplete approvals.
It preserves training plans, attendance, legacy drafts, and other record fields.
The response pairs the latest canonical record with its matching ETag. Public
published, athlete, and TV response filters are unchanged.

Validation uses synthetic names and process-memory storage with external
requests denied. Run `npm run qa:local` and `node qa/lineups.test.cjs`.
For mobile browser checks, start `node qa/isolated-server.cjs`, then run
`python qa/lineups-browser.py` with Python Playwright and Chromium installed.
The browser script only uses http://127.0.0.1:4173 and blocks external requests.
It checks 375px and 390px viewports for multiple boats, duplicate names,
assignment prevention, swaps, save/reload, approval, copying, conflict retention,
failed-network retention, incomplete approval, page errors and overflow.
This is Chromium mobile emulation, not physical iPhone Safari verification.
Live Google and Blob authorization were not exercised; no production reads or
writes were needed. The workbook connection was audited in code only.

The feature branch phase1/daily-lineups disables automatic Git deployments via
its branch-specific git.deploymentEnabled setting in vercel.json. Other branch
settings and production deployment behavior are unchanged. Executive Owner
approval is required before merging or deploying.
