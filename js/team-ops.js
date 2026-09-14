import { DEFAULT_TEAM_OPS } from '/js/config.js';

/**
 * Team Operations domain.
 *
 * Owns attendance normalization, eligibility, and exception flags. It receives
 * source data as arguments and never fetches, renders DOM, or makes lineup
 * decisions. Missing source facts remain unknown.
 */
export function mergeTeamOps(base, next = {}) {
  return {
    ...base,
    ...next,
    sources: { ...base.sources, ...(next.sources || {}) },
    eligibilityRules: { ...base.eligibilityRules, ...(next.eligibilityRules || {}) },
    attendance: { ...base.attendance, ...(next.attendance || {}) },
    trainingPlan: { ...base.trainingPlan, ...(next.trainingPlan || {}) },
    seasonArc: { ...base.seasonArc, ...(next.seasonArc || {}) },
    lineups: { ...base.lineups, ...(next.lineups || {}) },
  };
}

export function normalizeAthlete(raw) {
  const levelText = String(raw.level || raw.squad || raw.group || '').toLowerCase();
  const attendedDates = (raw.attendedDates || raw.practiceDates || []).filter(Boolean).sort();
  return {
    ...raw,
    name: raw.name || raw.athleteName || raw.athlete || 'Unnamed athlete',
    level: levelText.includes('novice') ? 'novice' : levelText.includes('varsity') ? 'varsity' : 'unknown',
    role: raw.role || raw.side || raw.preference || 'unknown',
    totalPracticesAttended: Number(raw.totalPracticesAttended ?? raw.totalPractices ?? raw.attendanceCount ?? attendedDates.length) || 0,
    lastAttendedPractice: raw.lastAttendedPractice || raw.lastAttendedDate || attendedDates.at(-1) || '',
    attendedDates,
    formsStatus: raw.formsStatus,
    safetyStatus: raw.safetyStatus,
    available: raw.available !== false,
  };
}

export function athletesFrom(teamOps) {
  return (teamOps.attendance?.athletes || []).map(normalizeAthlete);
}

export function scheduledPracticeDates(teamOps, plans) {
  const dates = (teamOps.attendance?.practiceDates || []).filter(Boolean).sort();
  return dates.length ? dates : plans.map(session => session[0]).filter(Boolean).sort();
}

export function eligibilityFor(athlete, teamOps) {
  const rules = teamOps.eligibilityRules || DEFAULT_TEAM_OPS.eligibilityRules;
  const blockers = [];
  if (athlete.formsStatus === false && rules.formsRequired) blockers.push('forms');
  if (athlete.safetyStatus === false && rules.safetyRequired) blockers.push('safety');
  if (athlete.level === 'novice' && athlete.totalPracticesAttended < Number(rules.novicePracticeMinimum || 11)) blockers.push('attendance');
  if (athlete.formsStatus == null || athlete.safetyStatus == null) blockers.push('review');
  if (blockers.includes('forms')) return { status: 'Not eligible - forms', tone: 'bad', blockers };
  if (blockers.includes('safety')) return { status: 'Not eligible - safety', tone: 'bad', blockers };
  if (blockers.includes('attendance')) return { status: 'Not eligible - attendance', tone: 'warn', blockers };
  if (blockers.includes('review')) return { status: 'Needs review', tone: 'review', blockers };
  return { status: 'Eligible', tone: 'good', blockers };
}

export function attendanceWarningFor(athlete, teamOps, plans, today) {
  const rules = teamOps.eligibilityRules || DEFAULT_TEAM_OPS.eligibilityRules;
  const dates = scheduledPracticeDates(teamOps, plans).filter(date => date <= today);
  if (!dates.length || !athlete.attendedDates?.length) return { level: 'unknown', label: 'Pattern unknown', missed: 0 };

  const attended = new Set(athlete.attendedDates);
  let missed = 0;
  for (let index = dates.length - 1; index >= 0; index -= 1) {
    if (attended.has(dates[index])) break;
    missed += 1;
  }
  if (missed >= Number(rules.attendanceCriticalMisses || 3)) return { level: 'critical', label: missed + ' missed practices', missed };
  if (missed >= Number(rules.attendanceWarningMisses || 2)) return { level: 'warning', label: missed + ' missed practices', missed };
  return { level: 'ok', label: 'Current', missed };
}

export function teamSummaryFor(teamOps, plans, today) {
  const athletes = athletesFrom(teamOps);
  const rules = teamOps.eligibilityRules || DEFAULT_TEAM_OPS.eligibilityRules;
  return {
    active: athletes.length,
    concerns: athletes.filter(athlete => ['warning', 'critical'].includes(attendanceWarningFor(athlete, teamOps, plans, today).level)).length,
    eligibilityIssues: athletes.filter(athlete => ['bad', 'warn'].includes(eligibilityFor(athlete, teamOps).tone)).length,
    near: athletes.filter(athlete =>
      athlete.level === 'novice'
      && athlete.totalPracticesAttended < rules.novicePracticeMinimum
      && athlete.totalPracticesAttended >= rules.novicePracticeMinimum - 2,
    ).length,
  };
}
