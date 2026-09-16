const { put, get } = require('@vercel/blob');

const TOKEN_BLOB = 'coach-content/google-oauth.json';
const DRAFT_BLOB = 'coach-content/draft.json';

async function readBlob(pathname) {
  const result = await get(pathname, { access: 'private' });
  if (!result || !result.stream) return null;
  return new Response(result.stream).json();
}

async function writeBlob(pathname, data) {
  await put(pathname, JSON.stringify(data), {
    access: 'private',
    addRandomSuffix: false,
    allowOverwrite: true,
  });
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`missing ${name}`);
  return value;
}

function redirectUri(req) {
  if (process.env.GOOGLE_OAUTH_REDIRECT_URI) return process.env.GOOGLE_OAUTH_REDIRECT_URI;
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const proto = req.headers['x-forwarded-proto'] || 'https';
  return `${proto}://${host}/api/google-auth-callback`;
}

async function exchangeCode(req, code) {
  const body = new URLSearchParams({
    code,
    client_id: requiredEnv('GOOGLE_OAUTH_CLIENT_ID'),
    client_secret: requiredEnv('GOOGLE_OAUTH_CLIENT_SECRET'),
    redirect_uri: redirectUri(req),
    grant_type: 'authorization_code',
  });
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!response.ok) throw new Error(`oauth exchange failed ${response.status}`);
  return response.json();
}

async function accessTokenFromStoredRefreshToken() {
  const stored = await readBlob(TOKEN_BLOB);
  if (!stored?.refreshToken) throw new Error('google account not connected');
  const body = new URLSearchParams({
    refresh_token: stored.refreshToken,
    client_id: requiredEnv('GOOGLE_OAUTH_CLIENT_ID'),
    client_secret: requiredEnv('GOOGLE_OAUTH_CLIENT_SECRET'),
    grant_type: 'refresh_token',
  });
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!response.ok) throw new Error(`token refresh failed ${response.status}`);
  const token = await response.json();
  return token.access_token;
}

function attendanceDate(header) {
  const match = String(header || '').trim().match(/^(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?$/);
  if (!match) return '';
  const rawYear = match[3] ? Number(match[3]) : 2026;
  const year = rawYear < 100 ? 2000 + rawYear : rawYear;
  return `${year}-${String(match[1]).padStart(2, '0')}-${String(match[2]).padStart(2, '0')}`;
}

function isPresent(value) {
  const text = String(value ?? '').trim().toLowerCase();
  return ['1', 'y', 'yes', 'x', 'present', 'attended', 'true', 'p'].includes(text);
}

function isTrue(value) {
  if (value === true) return true;
  return ['true', '1', 'yes', 'y', 'complete', 'done', 'submitted', 'cleared'].includes(String(value ?? '').trim().toLowerCase());
}

function normalizeSheet(values) {
  if (!Array.isArray(values) || values.length < 2) return { athletes: [], practiceDates: [] };
  const headers = values[0].map(value => String(value || '').trim());
  const index = Object.fromEntries(headers.map((header, i) => [header.toLowerCase(), i]));
  const dateColumns = headers.map((header, i) => ({ i, date: attendanceDate(header) })).filter(item => item.date);
  const practiceDates = dateColumns.map(item => item.date).sort();
  const at = (row, name) => row[index[name.toLowerCase()]];
  const requiredForms = ['athlete\'s contract', 'general form', 'w9', 'usrowing enroll'];
  const safetyFields = ['lens', 'usrowing vid'];
  const athletes = values.slice(1).map(row => {
    const name = at(row, 'rowers');
    if (!name) return null;
    const attendedDates = dateColumns.filter(item => isPresent(row[item.i])).map(item => item.date).sort();
    const formValues = requiredForms.map(field => at(row, field)).filter(value => value !== undefined && value !== '');
    const safetyValues = safetyFields.map(field => at(row, field)).filter(value => value !== undefined && value !== '');
    return {
      name: String(name).trim(),
      email: String(at(row, 'email') || '').trim(),
      class: String(at(row, 'class') || '').trim(),
      sex: String(at(row, 'sex') || '').trim(),
      totalPracticesAttended: Number(at(row, 'total')) || attendedDates.length,
      attendedDates,
      lastAttendedPractice: attendedDates.at(-1) || '',
      formsStatus: formValues.length ? formValues.every(isTrue) : undefined,
      safetyStatus: safetyValues.length ? safetyValues.every(isTrue) : undefined,
      available: true,
    };
  }).filter(Boolean);
  return { athletes, practiceDates };
}

async function fetchAttendanceSheet() {
  const spreadsheetId = requiredEnv('ATTENDANCE_SPREADSHEET_ID');
  const sheetName = process.env.ATTENDANCE_SHEET_NAME || 'Fall 26';
  const range = `'${sheetName.replace(/'/g, "''")}'!A1:DZ1200`;
  const token = await accessTokenFromStoredRefreshToken();
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}?majorDimension=ROWS`;
  const response = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
  if (!response.ok) throw new Error(`sheet read failed ${response.status}`);
  const payload = await response.json();
  return { ...normalizeSheet(payload.values || []), sheetName };
}

async function refreshAttendance() {
  const current = await readBlob(DRAFT_BLOB);
  if (!current) throw new Error('draft not found');
  const { athletes, practiceDates, sheetName } = await fetchAttendanceSheet();
  if (!athletes.length) throw new Error('attendance sheet returned no athletes');
  const now = new Date().toISOString();
  current.teamOps = current.teamOps || {};
  current.teamOps.attendance = {
    ...(current.teamOps.attendance || {}),
    athletes,
    practiceDates,
  };
  current.teamOps.sources = current.teamOps.sources || {};
  current.teamOps.sources.attendance = {
    ...(current.teamOps.sources.attendance || {}),
    kind: 'attendance',
    title: '26-27 Attendance',
    status: 'connected',
    lastReadAt: now,
    sheet: sheetName,
  };
  current.history = [
    { label: 'Refreshed attendance from Google Sheets', at: now, kind: 'attendance-refresh' },
    ...(current.history || []),
  ].slice(0, 20);
  await writeBlob(DRAFT_BLOB, current);
  return { athletes: athletes.length, practiceDates: practiceDates.length, lastReadAt: now, sheetName };
}

module.exports = {
  TOKEN_BLOB,
  readBlob,
  writeBlob,
  redirectUri,
  exchangeCode,
  refreshAttendance,
};
