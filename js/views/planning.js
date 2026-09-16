/**
 * Season and planning screen renderers.
 *
 * This module presents a reviewed plan snapshot and source status. It does not
 * create workouts, decide the arc, or communicate with Drive.
 */
export function renderSeasonView({ arc, selectedSeason, plans, esc, sourceMeta, sourceLink }) {
  const snapshot = plans.length
    ? plans.map(session =>
      '<section class="card"><div class="ey">' + esc(session[0]) + '</div><div class="title" style="font-size:20px">'
      + esc(session[1]) + '</div><p class="small">' + esc(session[3]) + '</p></section>',
    ).join('')
    : '<section class="card"><div class="ey">WAITING FOR PLAN SNAPSHOT</div><div class="title">No daily plan is synced yet.</div>'
      + '<p>Open the private planning workbook to edit. The dashboard will use a reviewed snapshot after the source connection is enabled.</p>'
      + sourceLink('dailyTrainingPlan', 'Open Planning Workbook') + '</section>';

  const arcCards = arc.length
    ? arc.map(item =>
      '<section class="card"><div class="ey">' + esc(item.year || item.season || 'Season') + '</div>'
      + '<div class="title" style="font-size:20px">' + esc(item.title || 'Training arc') + '</div>'
      + '<p>' + esc(item.summary || 'No summary entered.') + '</p></section>',
    ).join('')
    : snapshot;

  return '<section class="card"><div class="ey">SEASON ARC</div><div class="title">' + esc(selectedSeason) + '</div>'
    + '<p>Season/annual planning stays in Drive with year-specific copies and historical coach notes.</p>'
    + sourceMeta('seasonTrainingArc') + sourceLink('seasonTrainingArc', 'Open Season Arc') + '</section>'
    + arcCards;
}

function field(session, key, fallback = '') {
  return session?.[6]?.custom?.[key] || session?.[6]?.[key] || fallback || '';
}

export function renderPlanView({ plans, esc, escAttr, sourceMeta, sourceLink }) {
  const sessions = plans.length
    ? plans.map(session =>
      '<details class="section"><summary><b>' + esc(session[0]) + ' · ' + esc(session[1]) + '</b></summary>'
      + '<div class="plan-editor" data-session-date="' + escAttr(session[0]) + '">'
      + '<label>Today’s Message<textarea class="note" data-session-field="todayMessage">' + esc(field(session, 'todayMessage', session[3])) + '</textarea></label>'
      + '<label>Workout<textarea class="note large" data-session-field="workout">' + esc(session[2]) + '</textarea></label>'
      + '<label>Focus<textarea class="note" data-session-field="technicalFocus">' + esc(field(session, 'technicalFocus', session[3])) + '</textarea></label>'
      + '<label>Cues<textarea class="note" data-session-field="coachingCues">' + esc(field(session, 'coachingCues', session[6]?.cue)) + '</textarea></label>'
      + '<label>Coach Notes<textarea class="note" data-session-field="coachNotes">' + esc(field(session, 'coachNotes')) + '</textarea></label>'
      + '<button class="save" data-save-session="' + escAttr(session[0]) + '">Save Daily Plan edits</button><span class="save-status small" data-save-status="' + escAttr(session[0]) + '"></span>'
      + '</div></details>',
    ).join('')
    : '<p class="small">No reviewed planning snapshot is available in the dashboard yet. The Drive workbook is still available from the source link above.</p>';

  return '<section class="card"><div class="ey">DAILY TRAINING PLAN</div><div class="title">Plan</div>'
    + '<p>Daily Plan edits here and on Today use the same saved training-plan session.</p>'
    + sourceMeta('dailyTrainingPlan') + sourceLink('dailyTrainingPlan', 'Open Daily Training Plan') + '</section>'
    + '<section class="card">' + sessions + '</section>';
}
