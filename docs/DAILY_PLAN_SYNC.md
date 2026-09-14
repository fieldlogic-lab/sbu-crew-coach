# Daily Plan Sync

## Source of truth

The Google Drive **SBU Crew Coach Planning Workbook** remains the editable source of truth for the Daily Plan.

The production Coach app reads a private cached snapshot from Vercel Blob. It does **not** read the Google Sheet on every page load.

## Why sync is manual

Manual promotion keeps the public repository free of private Google Drive identifiers and avoids giving the production app broad Google Drive credentials. It also creates a deliberate release point so in-progress spreadsheet edits do not immediately change the phone app.

## Promotion workflow

1. Edit and review the `Daily Plan` tab in Google Drive.
2. Read the current Daily Plan rows from Drive.
3. Normalize those rows to the Coach app session schema.
4. Replace `teamOps.trainingPlan.sessions` in the private `coach-content/draft.json` Vercel Blob snapshot.
5. Update `teamOps.sources.dailyTrainingPlan.lastReadAt` and connection status.
6. Verify Today, Tomorrow, and Plan views against the source workbook.
7. Do not commit Daily Plan rows, private Drive URLs/IDs, roster data, or student information to GitHub.

## Operating convention

When the coach says **push the Daily Plan**, **sync the Daily Plan**, or equivalent, treat that as approval to promote the current reviewed Drive Daily Plan into the private Coach app snapshot.

The Google Sheet remains the durable editing layer. The private Vercel snapshot is the app-serving layer.
