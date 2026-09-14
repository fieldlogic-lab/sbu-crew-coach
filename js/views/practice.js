/**
 * Today and Tomorrow screen renderers.
 *
 * This module formats an already-reviewed session. It cannot fetch, publish,
 * release, or alter practice information.
 */
export function renderSessionCard(session, helpers) {
  const { esc, escAttr, planField, sourceReady, sourceLink, notes } = helpers;
  if (!session) {
    return '<section class="card"><div class="ey">NO SESSION DATA</div><div class="title">Training plan not available.</div><p>Connect the Daily Training Plan source or publish sessions from the coach console.</p></section>';
  }

  const message = planField(session, 'todayMessage', session[3]);
  const novice = planField(session, 'novicePlan');
  const varsity = planField(session, 'varsityPlan');
  const fallbackPlan = planField(session, 'landFallback', session[6]?.land);
  const cues = planField(session, 'coachingCues', session[6]?.cue);

  return '<section class="card"><div class="ey">' + esc(session[0]) + '</div><div class="title">' + esc(session[1])
    + '</div><span class="pill">' + esc(session[4] || 'land').toUpperCase() + '</span>'
    + (sourceReady('dailyTrainingPlan') ? '<div class="inline-source">' + sourceLink('dailyTrainingPlan', 'Open Daily Training Plan') + '</div>' : '')
    + '<div class="section"><h3>TODAY’S MESSAGE</h3><p>' + esc(message || 'No message entered yet.') + '</p></div>'
    + '<div class="section split"><div><h3>NOVICE PLAN</h3><p>' + esc(novice || 'Not specified.') + '</p></div>'
    + '<div><h3>VARSITY PLAN</h3><p>' + esc(varsity || 'Not specified.') + '</p></div></div>'
    + '<div class="section"><h3>WORKOUT</h3><p>' + esc(session[2] || 'Not specified.') + '</p></div>'
    + '<div class="section"><h3>LAND FALLBACK</h3><p>' + esc(fallbackPlan || 'Not specified.') + '</p></div>'
    + '<div class="section"><h3>TECHNICAL FOCUS</h3><p>' + esc(planField(session, 'technicalFocus', session[3]) || 'Not specified.') + '</p></div>'
    + '<div class="section"><h3>COACHING CUES</h3><p>' + esc(cues || 'Not specified.') + '</p></div>'
    + '<div class="section split"><div><h3>SUCCESS</h3><p>' + esc(planField(session, 'successCriteria') || 'Not specified.') + '</p></div>'
    + '<div><h3>INTENSITY</h3><p>' + esc(planField(session, 'intensity') || 'Not specified.') + '</p></div></div>'
    + '<div class="section"><h3>COACH NOTES</h3><textarea class="note" id="notes-' + escAttr(session[0])
    + '" placeholder="Capture the adjustment you want to carry forward…">' + esc(notes(session[0]))
    + '</textarea><button class="save" id="save-' + escAttr(session[0]) + '">Save note</button></div></section>';
}

export function renderNoPractice({ next, esc }) {
  return '<section class="card"><div class="ey">NO ORGANIZED PRACTICE</div><div class="title">No scheduled workout today.</div><p>'
    + (next ? 'Next scheduled: ' + esc(next[0]) + ' · ' + esc(next[1]) + '.' : 'Check the annual schedule or coach notice for the next session.')
    + '</p></section>';
}
