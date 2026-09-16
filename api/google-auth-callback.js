const crypto = require('crypto');
const { TOKEN_BLOB, exchangeCode, writeBlob, refreshAttendance } = require('./lib/google-attendance');

function validState(state, secret) {
  const [nonce, signature] = String(state || '').split('.');
  if (!nonce || !signature) return false;
  const expected = crypto.createHmac('sha256', secret).update(nonce).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

module.exports = async (req, res) => {
  try {
    const url = new URL(req.url, 'https://localhost');
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const secret = process.env.GOOGLE_OAUTH_STATE_SECRET;
    if (!secret || !code || !validState(state, secret)) {
      res.statusCode = 400;
      return res.end('Google authorization could not be verified.');
    }

    const token = await exchangeCode(req, code);
    if (!token.refresh_token) {
      res.statusCode = 400;
      return res.end('Google did not return offline access. Reconnect and approve access again.');
    }

    await writeBlob(TOKEN_BLOB, {
      refreshToken: token.refresh_token,
      scope: token.scope || 'https://www.googleapis.com/auth/spreadsheets.readonly',
      connectedAt: new Date().toISOString(),
      accountHint: 'tmassi@rtpny.com',
    });

    const result = await refreshAttendance();
    res.statusCode = 200;
    res.setHeader('content-type', 'text/html; charset=utf-8');
    res.setHeader('cache-control', 'no-store');
    res.end(`<!doctype html><meta name="viewport" content="width=device-width"><title>Attendance connected</title><body style="font-family:system-ui;padding:32px;max-width:600px;margin:auto"><h1>Attendance connected</h1><p>Google authorization succeeded and the first attendance refresh completed.</p><p><strong>${result.athletes}</strong> athletes loaded from <strong>${result.sheetName}</strong>.</p><p>You can close this page and return to the Coach app.</p></body>`);
  } catch (error) {
    res.statusCode = 500;
    res.setHeader('cache-control', 'no-store');
    res.end(`Attendance connection failed: ${error.message}`);
  }
};
