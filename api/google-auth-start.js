const crypto = require('crypto');
const { redirectUri } = require('./lib/google-attendance');

function stateFor(secret, nonce) {
  return `${nonce}.${crypto.createHmac('sha256', secret).update(nonce).digest('hex')}`;
}

module.exports = async (req, res) => {
  try {
    const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
    const secret = process.env.GOOGLE_OAUTH_STATE_SECRET;
    if (!clientId || !secret) {
      res.statusCode = 500;
      return res.end('Google OAuth is not configured.');
    }

    const nonce = crypto.randomBytes(24).toString('hex');
    const state = stateFor(secret, nonce);
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri(req),
      response_type: 'code',
      scope: 'https://www.googleapis.com/auth/spreadsheets.readonly',
      access_type: 'offline',
      prompt: 'consent',
      include_granted_scopes: 'true',
      state,
      login_hint: 'tmassi@rtpny.com',
    });

    res.statusCode = 302;
    res.setHeader('location', `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
    res.setHeader('cache-control', 'no-store');
    res.end();
  } catch {
    res.statusCode = 500;
    res.end('Unable to start Google authorization.');
  }
};
