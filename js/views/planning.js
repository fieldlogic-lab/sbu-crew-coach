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

export function renderPlanView({ plans, esc, sourceMeta, sourceLink }) {
  const sessions = plans.length
    ? plans.map(session =>
      '<details class="section"><summary><b>' + esc(session[0]) + ' · ' + esc(session[1]) + '</b></summary>'
      + '<p>' + esc(session[2]) + '</p><small>' + esc(session[3]) + '</small></details>',
    ).join('')
    : '<p class="small">No reviewed planning snapshot is available in the dashboard yet. The Drive workbook is still available from the source link above.</p>';

  return '<section class="card"><div class="ey">DAILY TRAINING PLAN</div><div class="title">Plan</div>'
    + '<p>Drive is the editing surface; the dashboard only renders a reviewed private snapshot.</p>'
    + sourceMeta('dailyTrainingPlan') + sourceLink('dailyTrainingPlan', 'Open Daily Training Plan') + '</section>'
    + '<section class="card">' + sessions + '</section>';
}
