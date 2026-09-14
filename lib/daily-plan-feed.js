const HEADER_MAP = {
  'date': 'date',
  'season': 'season',
  'week': 'week',
  'day': 'day',
  'calendar / event anchor': 'eventAnchor',
  'session title': 'title',
  'session type': 'sessionType',
  'location': 'location',
  'coach decision': 'coachDecision',
  'today’s message': 'todayMessage',
  "today's message": 'todayMessage',
  'novice plan': 'novicePlan',
  'varsity plan': 'varsityPlan',
  'workout': 'workout',
  'land fallback': 'landFallback',
  'technical focus': 'technicalFocus',
  'coaching cues': 'coachingCues',
  'success criteria': 'successCriteria',
  'intensity': 'intensity',
  'coach notes': 'coachNotes',
  'review status': 'reviewStatus',
  'source': 'source',
};

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
      continue;
    }

    if (char === '"') quoted = true;
    else if (char === ',') {
      row.push(cell);
      cell = '';
    } else if (char === '\n') {
      row.push(cell.replace(/\r$/, ''));
      rows.push(row);
      row = [];
      cell = '';
    } else cell += char;
  }

  if (cell.length || row.length) {
    row.push(cell.replace(/\r$/, ''));
    rows.push(row);
  }
  return rows;
}

function normalizeHeader(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function rowsToSessions(rows) {
  if (!rows.length) return [];
  const headers = rows[0].map(normalizeHeader);
  const keys = headers.map(header => HEADER_MAP[header] || null);

  return rows.slice(1).map(values => {
    const raw = {};
    keys.forEach((key, index) => {
      if (key) raw[key] = String(values[index] ?? '').trim();
    });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw.date || '') || !raw.title) return null;

    return {
      date: raw.date,
      season: raw.season || '',
      week: raw.week || '',
      day: raw.day || '',
      block: raw.eventAnchor || '',
      title: raw.title,
      sessionType: raw.sessionType || 'land',
      location: raw.location || '',
      practiceStatus: /not a practice/i.test(raw.coachDecision || '') ? 'canceled' : 'forecast',
      intent: raw.todayMessage || raw.technicalFocus || '',
      workout: raw.workout || '',
      land: raw.landFallback || '',
      cue: raw.coachingCues || '',
      coachNotes: raw.coachNotes || '',
      reviewStatus: raw.reviewStatus || '',
      source: raw.source || '',
      custom: {
        todayMessage: raw.todayMessage || '',
        novicePlan: raw.novicePlan || '',
        varsityPlan: raw.varsityPlan || '',
        landFallback: raw.landFallback || '',
        technicalFocus: raw.technicalFocus || '',
        coachingCues: raw.coachingCues || '',
        successCriteria: raw.successCriteria || '',
        intensity: raw.intensity || '',
      },
    };
  }).filter(Boolean).sort((a, b) => a.date.localeCompare(b.date));
}

async function fetchDailyPlan(feedUrl) {
  if (!/^https:\/\//i.test(feedUrl || '')) throw new Error('Daily Plan feed URL is not configured');
  const response = await fetch(feedUrl, {
    headers: { 'user-agent': 'sbu-crew-coach/1.0' },
    redirect: 'follow',
  });
  if (!response.ok) throw new Error(`Daily Plan feed returned ${response.status}`);
  const text = await response.text();
  const sessions = rowsToSessions(parseCsv(text));
  if (!sessions.length) throw new Error('Daily Plan feed contained no valid sessions');
  return sessions;
}

module.exports = { fetchDailyPlan, parseCsv, rowsToSessions };
