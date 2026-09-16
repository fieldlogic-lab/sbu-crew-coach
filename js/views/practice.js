/**
 * Today and Tomorrow screen renderers.
 *
 * This module formats an already-reviewed session. It cannot fetch, publish,
 * release, or alter practice information.
 */
export function renderSessionCard(session, helpers) {
  const { esc, escAttr, planField, sourceReady, sourceLink } = helpers;
  if (!session) {
    return '<section class="card"><div class="ey">NO SESSION DATA</div><div class="title">Training plan not available.</div><p>Connect the Daily Training Plan source or publish sessions from the coach console.</p></section>';
  }

  const message = planField(session, 'todayMessage', session[3]);
  const cues = planField(session, 'coachingCues', session[6]?.cue);
  const focus = planField(session, 'technicalFocus', session[3]);
  const coachNotes = planField(session, 'coachNotes');

  return '<section class="card session-card" data-session-date="' + escAttr(session[0]) + '"><div class="ey">' + esc(session[0]) + '</div><div class="title">' + esc(session[1])
    + '</div><span class="pill">' + esc(session[4] || 'land').toUpperCase() + '</span>'
    + (sourceReady('dailyTrainingPlan') ? '<div class="inline-source">' + sourceLink('dailyTrainingPlan', 'Open Daily Training Plan') + '</div>' : '')
    + '<div class="section editable-field"><h3>TODAY’S MESSAGE</h3><textarea class="note" data-session-field="todayMessage" placeholder="What should the athletes know today?">' + esc(message) + '</textarea></div>'
    + '<div class="section editable-field"><h3>TODAY’S WORKOUT</h3><textarea class="note large" data-session-field="workout" placeholder="Main workout for today">' + esc(session[2] || '') + '</textarea></div>'
    + '<div class="section editable-field"><h3>FOCUS</h3><textarea class="note" data-session-field="technicalFocus" placeholder="Technical or training focus">' + esc(focus) + '</textarea></div>'
    + '<div class="section editable-field"><h3>CUES</h3><textarea class="note" data-session-field="coachingCues" placeholder="Short coach cues">' + esc(cues) + '</textarea></div>'
    + '<div class="section editable-field"><h3>COACH NOTES</h3><textarea class="note" data-session-field="coachNotes" placeholder="Carry-forward coach notes">' + esc(coachNotes) + '</textarea></div>'
    + '<button class="save" data-save-session="' + escAttr(session[0]) + '">Save Daily Plan edits</button><span class="save-status small" data-save-status="' + escAttr(session[0]) + '"></span></section>';
}

export function renderNoPractice({ next, esc }) {
  return '<section class="card"><div class="ey">NO ORGANIZED PRACTICE</div><div class="title">No scheduled workout today.</div><p>'
    + (next ? 'Next scheduled: ' + esc(next[0]) + ' · ' + esc(next[1]) + '.' : 'Check the annual schedule or coach notice for the next session.')
    + '</p></section>';
}
