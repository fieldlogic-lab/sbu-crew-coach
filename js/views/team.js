/**
 * Team-facing screen renderers.
 *
 * Receives prepared data and presentation helpers from the app controller.
 * This module never reads storage, makes network calls, or changes eligibility.
 */
export function renderTeamStatus(summary) {
  return '<section class="card team-status"><div class="ey">TEAM STATUS</div><div class="mini-grid">'
    + '<div><b>' + summary.active + '</b><span>Athletes tracked</span></div>'
    + '<div class="' + (summary.concerns ? 'flag' : '') + '"><b>' + summary.concerns + '</b><span>Attendance concerns</span></div>'
    + '<div class="' + (summary.eligibilityIssues ? 'flag' : '') + '"><b>' + summary.eligibilityIssues + '</b><span>Eligibility issues</span></div>'
    + '<div><b>' + summary.near + '</b><span>Novices close</span></div>'
    + '</div><button class="secondary" data-jump="team">Review team</button></section>';
}

export function renderTeamView({ athletes, eligibilityFor, attendanceWarningFor, esc, sourceMeta, sourceLink, teamStatus }) {
  const rank = { critical: 0, warning: 1, unknown: 2, ok: 3 };
  const sorted = [...athletes].sort((left, right) =>
    rank[attendanceWarningFor(left).level] - rank[attendanceWarningFor(right).level]
    || eligibilityFor(left).tone.localeCompare(eligibilityFor(right).tone)
    || left.name.localeCompare(right.name),
  );
  const known = value => value === true ? 'Complete' : value === false ? 'Missing' : 'Unknown';
  const formatDate = value => {
    if (!value) return 'Unknown';
    const date = new Date(value + 'T12:00:00');
    return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };
  const cards = sorted.length
    ? sorted.map(athlete => {
      const eligibility = eligibilityFor(athlete);
      const warning = attendanceWarningFor(athlete);
      return '<article class="athlete ' + warning.level + '"><div><strong>' + esc(athlete.name) + '</strong><span>'
        + esc(athlete.level === 'unknown' ? 'level unknown' : athlete.level) + ' · '
        + esc(athlete.role === 'unknown' ? 'role unknown' : athlete.role) + '</span></div>'
        + '<div class="athlete-meta"><span class="pill ' + eligibility.tone + '">' + esc(eligibility.status)
        + '</span><span class="pill ' + warning.level + '">' + esc(warning.label) + '</span></div>'
        + '<dl><div><dt>Practices</dt><dd>' + esc(athlete.totalPracticesAttended) + '</dd></div>'
        + '<div><dt>Last seen</dt><dd>' + esc(formatDate(athlete.lastAttendedPractice)) + '</dd></div>'
        + '<div><dt>Forms</dt><dd>' + esc(known(athlete.formsStatus)) + '</dd></div>'
        + '<div><dt>Safety</dt><dd>' + esc(known(athlete.safetyStatus)) + '</dd></div></dl></article>';
    }).join('')
    : '<p class="small">No athletes are cached yet. Configure the Attendance source in the console, then import or sync source rows when available.</p>';

  return '<section class="card"><div class="ey">TEAM OPS</div><div class="title">Team</div>'
    + '<p>Attendance and eligibility are normalized from the configured source. Unknown fields stay visible so the app never invents roster facts.</p>'
    + sourceMeta('attendance') + sourceLink('attendance', 'Open Attendance') + '</section>'
    + teamStatus
    + '<section class="card"><div class="ey">EXCEPTIONS FIRST</div><div class="athlete-list">' + cards + '</div></section>';
}

export function renderLineupsView({ drafts, esc }) {
  const seats = ['Cox', '8', '7', '6', '5', '4', '3', '2', 'Bow'];
  const draft = drafts[0] || { name: 'New 8+ draft', boatClass: '8+', seats: {} };
  return '<section class="card"><div class="ey">LINEUPS</div><div class="title">Lineup drafts</div>'
    + '<p>Foundation only: the app can structure boat classes, seats, eligibility warnings, availability, preferences, and notes while the coach makes the decisions.</p></section>'
    + '<section class="card"><div class="lineup-head"><div><h3>' + esc(draft.name) + '</h3><span class="pill">'
    + esc(draft.boatClass || '8+') + '</span></div><button class="secondary" disabled>Save draft enabled in console</button></div>'
    + '<div class="seat-grid">' + seats.map(seat => {
      const athlete = draft.seats?.[seat];
      return '<div class="seat"><span>' + esc(seat) + '</span><strong>' + (athlete ? esc(athlete) : 'Open') + '</strong></div>';
    }).join('') + '</div><div class="section"><h3>ATHLETE PICKER FOUNDATION</h3>'
    + '<p class="small">Next step: tap or drag athletes into these slots with eligible/ineligible and available/unavailable warnings from Team Ops.</p></div></section>';
}
