const { put, get } = require('@vercel/blob');
const crypto = require('crypto');
const zlib = require('zlib');

const EXPECTED_SHA256 = '9835a125493f50a96fe9a28baf17314bb93294bf54d6753c5788f0030105b8f7';

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

    const compressed = Buffer.from(encoded, 'base64url');
    const payload = JSON.parse(zlib.gunzipSync(compressed).toString('utf8'));
    const incoming = Array.isArray(payload.sessions) ? payload.sessions : [];

    const data = await readBlob('coach-content/draft.json');
    if (!data) return send(res, 404, { error: 'draft not found' });

    data.teamOps = data.teamOps || {};
    data.teamOps.trainingPlan = { sessions: incoming };
    data.teamOps.sources = data.teamOps.sources || {};
    data.teamOps.sources.dailyTrainingPlan = {
      ...(data.teamOps.sources.dailyTrainingPlan || {}),
      kind: 'dailyTrainingPlan',
      title: payload.title || 'Daily Training Plan',
      href: payload.href || '',
      status: 'connected',
      lastReadAt: new Date().toISOString(),
    };

    await put('coach-content/draft.json', JSON.stringify(data), {
      access: 'private',
      addRandomSuffix: false,
      allowOverwrite: true,
    });

    return send(res, 200, { ok: true, imported: incoming.length });
  } catch {
    return send(res, 500, { error: 'import failed' });
  }
};
