const { put, get } = require('@vercel/blob');
const crypto = require('crypto');
const zlib = require('zlib');

const EXPECTED_SHA256 = '36f2c8cbd0e0d48f8d94ac44c5b93f46cc632512d4d410192ae0b8457f8c6b36';

async function readBlob(pathname) {
  const result = await get(pathname, { access: 'private' });
  if (!result || !result.stream) return null;
  return new Response(result.stream).json();
}

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json');
  res.setHeader('cache-control', 'no-store');
  res.end(JSON.stringify(body));
}

module.exports = async (req, res) => {
  try {
    if (req.method !== 'GET') return send(res, 405, { error: 'method not allowed' });
    const encoded = new URL(req.url, 'https://localhost').searchParams.get('payload') || '';
    const digest = crypto.createHash('sha256').update(encoded).digest('hex');
    if (digest !== EXPECTED_SHA256) return send(res, 401, { error: 'payload rejected' });

    const pad = '='.repeat((4 - encoded.length % 4) % 4);
    const compressed = Buffer.from((encoded + pad).replace(/-/g, '+').replace(/_/g, '/'), 'base64');
    const payload = JSON.parse(zlib.gunzipSync(compressed).toString('utf8'));
    const athletes = Array.isArray(payload.athletes) ? payload.athletes : [];
    const practiceDates = Array.isArray(payload.practiceDates) ? payload.practiceDates : [];

    const data = await readBlob('coach-content/draft.json');
    if (!data) return send(res, 404, { error: 'draft not found' });

    data.teamOps = data.teamOps || {};
    data.teamOps.attendance = {
      ...(data.teamOps.attendance || {}),
      athletes,
      practiceDates,
    };
    data.teamOps.sources = data.teamOps.sources || {};
    data.teamOps.sources.attendance = {
      ...(data.teamOps.sources.attendance || {}),
      kind: 'attendance',
      title: payload.title || 'Attendance',
      href: payload.href || '',
      status: 'connected',
      lastReadAt: new Date().toISOString(),
      sheet: payload.sheet || '',
    };

    await put('coach-content/draft.json', JSON.stringify(data), {
      access: 'private',
      addRandomSuffix: false,
      allowOverwrite: true,
    });

    return send(res, 200, { ok: true, importedAthletes: athletes.length, practiceDates: practiceDates.length });
  } catch {
    return send(res, 500, { error: 'import failed' });
  }
};
