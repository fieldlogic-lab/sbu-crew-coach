const crypto = require('node:crypto');

const COOKIE_NAME = 'sbu_coach_session';
const SESSION_SECONDS = 8 * 60 * 60;

function getCoachConfig(env = process.env) {
  const username = env.COACH_USERNAME || '';
  const password = env.COACH_PASSWORD || '';
  const secret = env.COACH_SESSION_SECRET || '';
  return {
    username,
    password,
    secret,
    configured: Boolean(username && password.length >= 8 && Buffer.byteLength(secret, 'utf8') >= 32),
  };
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function sign(payload, secret) {
  return crypto.createHmac('sha256', secret).update(payload).digest('base64url');
}

function createSessionToken(username, secret, now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({
    sub: username,
    exp: Math.floor(now / 1000) + SESSION_SECONDS,
  })).toString('base64url');
  return `${payload}.${sign(payload, secret)}`;
}

function verifySessionToken(token, config, now = Date.now()) {
  if (!token || !config?.configured) return false;
  const parts = token.split('.');
  if (parts.length !== 2) return false;
  const [payload, signature] = parts;
  if (!safeEqual(signature, sign(payload, config.secret))) return false;
  try {
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return claims.sub === config.username && Number.isFinite(claims.exp) && claims.exp > Math.floor(now / 1000);
  } catch {
    return false;
  }
}

function readCookie(header = '', name = COOKIE_NAME) {
  for (const piece of String(header).split(';')) {
    const index = piece.indexOf('=');
    if (index < 0) continue;
    if (piece.slice(0, index).trim() === name) return piece.slice(index + 1).trim();
  }
  return '';
}

function sessionCookie(token) {
  return `${COOKIE_NAME}=${token}; Path=/api/console; Max-Age=${SESSION_SECONDS}; HttpOnly; Secure; SameSite=Strict`;
}

function clearSessionCookie() {
  return `${COOKIE_NAME}=; Path=/api/console; Max-Age=0; HttpOnly; Secure; SameSite=Strict`;
}

function isCoachRequest(req, config = getCoachConfig()) {
  if (!config.configured) return false;
  const token = readCookie(req.headers?.cookie);
  return verifySessionToken(token, config);
}

function hasServiceCredential(req) {
  const query = new URL(req.url, 'https://localhost').searchParams;
  return Boolean(req.headers?.['x-attendance-sync-token'] || req.headers?.authorization || query.has('token'));
}

module.exports = {
  COOKIE_NAME,
  SESSION_SECONDS,
  getCoachConfig,
  safeEqual,
  createSessionToken,
  verifySessionToken,
  readCookie,
  sessionCookie,
  clearSessionCookie,
  isCoachRequest,
  hasServiceCredential,
};
