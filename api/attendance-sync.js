const { updateDraft } = require('./lib/draft-store');
const { authorizedAttendanceRequest } = require('./lib/attendance-auth');

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json');
  res.setHeader('cache-control', 'no-store');
  res.end(JSON.stringify(body));
}

async function parseBody(req) {
  if (req.body) return req.body;
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', chunk => { raw += chunk; });
    req.on('end', () => {
      try {
        resolve(JSON.parse(raw || '{}'));
      } catch (error) {
        reject(error);
      }
    });
  });
}

const dateKey = key => {
  const raw = String(key || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const match = raw.match(/^(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?$/);
  if (!match) return '';
  const year = match[3] ? Number(match[3]) : 2026;
  const fullYear = year < 100 ? 2000 + year : year;
  return fullYear + '-' + String(match[1]).padStart(2, '0') + '-' + String(match[2]).padStart(2, '0');
};

const present = value => {
  const text = String(value ?? '').trim().toLowerCase();
  return ['1', 'y', 'yes', 'x', 'present', 'attended', 'true', 'p'].includes(text);
};

const complete = value => {
  if (value === true || value === false) return value;
  const text = String(value ?? '').trim().toLowerCase();
  if (!text) return undefined;
  if (['complete', 'yes', 'y', 'true', 'done', 'submitted', 'cleared'].includes(text)) return true;
  if (['missing', 'no', 'n', 'false', 'incomplete'].includes(text)) return false;
  return undefined;
};

function normalizeRows(rows) {
  const practiceDates = new Set();
  const athletes = rows.map(row => {
    const attendedDates = Object.entries(row)
      .map(([key, value]) => [dateKey(key), value])
      .filter(([date, value]) => date && present(value))
      .map(([date]) => {
        practiceDates.add(date);
        return date;
      })
      .sort();
    Object.keys(row).map(dateKey).filter(Boolean).forEach(date => practiceDates.add(date));
    return {
      name: row.name || row.Name || row.athlete || row.Athlete || row['Athlete Name'] || row['Student'] || 'Unnamed athlete',
      level: row.level || row.Level || row.squad || row.Squad || row.group || row.Group || '',
      role: row.role || row.Role || row.side || row.Side || row.preference || row.Preference || '',
      attendedDates,
      totalPracticesAttended: attendedDates.length,
      lastAttendedPractice: attendedDates.at(-1) || '',
      formsStatus: complete(row.formsStatus ?? row.Forms ?? row['Forms Status'] ?? row['Required Forms']),
      safetyStatus: complete(row.safetyStatus ?? row.Safety ?? row['Safety Status'] ?? row['Safety Test']),
      available: complete(row.available ?? row.Available) !== false,
    };
  }).filter(athlete => athlete.name && athlete.name !== 'Unnamed athlete');

  return { athletes, practiceDates: [...practiceDates].sort() };
}

function normalizePayload(payload) {
  if (Array.isArray(payload.athletes)) {
    return {
      athletes: payload.athletes,
      practiceDates: Array.isArray(payload.practiceDates) ? payload.practiceDates : [],
    };
  }
  if (Array.isArray(payload.rows)) return normalizeRows(payload.rows);
  return { athletes: [], practiceDates: [] };
}

module.exports = async (req, res) => {
  try {
    if (req.method !== 'POST') return send(res, 405, { error: 'method not allowed' });
    if (!authorizedAttendanceRequest(req)) {
      return send(res, 401, { error: 'sync unauthorized' });
    }

    const payload = await parseBody(req);
    const { athletes, practiceDates } = normalizePayload(payload);
    if (!athletes.length) return send(res, 400, { error: 'no attendance rows' });

    const now = new Date().toISOString();
    const data = await updateDraft(data => {
      data.teamOps = data.teamOps || {};
      data.teamOps.attendance = { ...(data.teamOps.attendance || {}), athletes, practiceDates };
      data.teamOps.sources = data.teamOps.sources || {};
      data.teamOps.sources.attendance = {
        ...(data.teamOps.sources.attendance || {}),
        kind: 'attendance',
        title: payload.title || data.teamOps.sources.attendance?.title || 'Attendance',
        href: payload.href || data.teamOps.sources.attendance?.href || '',
        status: 'connected',
        lastReadAt: now,
        sheet: payload.sheet || data.teamOps.sources.attendance?.sheet || '',
      };
      data.history = [
        { label: 'Synced attendance source', at: now, kind: 'attendance-sync' },
        ...(data.history || []),
      ].slice(0, 20);
      return data;
    });
    if (!data) return send(res, 404, { error: 'draft not found' });
    return send(res, 200, { ok: true, syncedAthletes: athletes.length, practiceDates: practiceDates.length });
  } catch (error) {
    if (error?.statusCode === 412) return send(res, 412, { error: 'draft conflict', code: 'DRAFT_CONFLICT' });
    return send(res, 500, { error: 'attendance sync failed' });
  }
};
