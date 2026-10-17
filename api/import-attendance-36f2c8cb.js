const { identifyRoster } = require('./lib/roster');
const { updateDraft } = require('./lib/draft-store');
const { authorizedAttendanceRequest } = require('./lib/attendance-auth');
const crypto = require('crypto');
const zlib = require('zlib');

const EXPECTED_SHA256 = '36f2c8cbd0e0d48f8d94ac44c5b93f46cc632512d4d410192ae0b8457f8c6b36';

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json');
  res.setHeader('cache-control', 'no-store');
  res.end(JSON.stringify(body));
}

module.exports = async (req, res) => {
  try {
    if (req.method !== 'GET') return send(res, 405, { error: 'method not allowed' });
    if (!authorizedAttendanceRequest(req)) return send(res, 401, { error: 'sync unauthorized' });
    const encoded = new URL(req.url, 'https://localhost').searchParams.get('payload') || '';
    const digest = crypto.createHash('sha256').update(encoded).digest('hex');
    if (digest !== EXPECTED_SHA256) return send(res, 401, { error: 'payload rejected' });

    const pad = '='.repeat((4 - encoded.length % 4) % 4);
    const compressed = Buffer.from((encoded + pad).replace(/-/g, '+').replace(/_/g, '/'), 'base64');
    const payload = JSON.parse(zlib.gunzipSync(compressed).toString('utf8'));
    const athletes = Array.isArray(payload.athletes) ? payload.athletes : [];
    const practiceDates = Array.isArray(payload.practiceDates) ? payload.practiceDates : [];

    const now = new Date().toISOString();
    const data = await updateDraft(data => {
      data.teamOps = data.teamOps || {};
      data.teamOps.attendance = { ...(data.teamOps.attendance || {}), athletes: identifyRoster(athletes, data.teamOps.attendance?.athletes || []), practiceDates };
      data.teamOps.sources = data.teamOps.sources || {};
      data.teamOps.sources.attendance = {
        ...(data.teamOps.sources.attendance || {}),
        kind: 'attendance',
        title: payload.title || 'Attendance',
        href: payload.href || '',
        status: 'connected',
        lastReadAt: now,
        sheet: payload.sheet || '',
      };
      return data;
    });
    if (!data) return send(res, 404, { error: 'draft not found' });

    return send(res, 200, { ok: true, importedAthletes: athletes.length, practiceDates: practiceDates.length });
  } catch (error) {
    if (error?.statusCode === 412) return send(res, 412, { error: 'draft conflict', code: 'DRAFT_CONFLICT' });
    return send(res, 500, { error: 'import failed' });
  }
};

