/**
 * Low-risk app copy and configuration.
 *
 * Edit wording, source labels, or display defaults here. Do not put private
 * links, roster information, credentials, or daily sessions in repository code.
 */
export const APP = {
  publicSite: 'https://www.rtpny.com',
  timezone: 'America/New_York',
  defaultSeason: 'Fall 2026',
  harbor: { latitude: 40.9465, longitude: -73.0693, name: 'Port Jefferson Harbor' },
};

export const SOURCE_LABELS = {
  attendance: 'Attendance',
  semesterSchedule: 'Semester Schedule',
  dailyTrainingPlan: 'Daily Training Plan',
  seasonTrainingArc: 'Annual / Season Training Arc',
};

export const SOURCE_KINDS = Object.keys(SOURCE_LABELS);

export const DEFAULT_TEAM_OPS = {
  sources: Object.fromEntries(SOURCE_KINDS.map(kind => [kind, { title: SOURCE_LABELS[kind], kind }])),
  eligibilityRules: {
    novicePracticeMinimum: 11,
    attendanceWarningMisses: 2,
    attendanceCriticalMisses: 3,
    formsRequired: true,
    safetyRequired: true,
  },
  attendance: { athletes: [], practiceDates: [] },
  trainingPlan: { sessions: [] },
  seasonArc: { seasons: [] },
  lineups: { drafts: [] },
};

export const RESOURCE_FALLBACKS = [
  ['New Rower & Athlete Guide', 'First days, preparation, commands, expectations', 'athletes'],
  ['Coaching Resources', 'Sequence, posture, recovery, connection, benchmarks', 'coaching'],
  ['Regatta Hub', 'Race-day, travel, equipment, and family logistics', 'regattas'],
  ['Parent Guide', 'What to expect, costs, forms, and support', 'parents'],
  ['Safety & Equipment', 'Team movement, commands, fleet care, and readiness', 'safety'],
  ['About the Program', 'Recruiting, alumni, leadership, and support', 'about'],
];
