const crypto = require('node:crypto');

const WINDOW_SECONDS = 15 * 60;
const MAX_ATTEMPTS = 5;
const SCRIPT = [
  "local n = redis.call('INCR', KEYS[1])",
  "if n == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end",
  'return n',
].join('\n');

function clientAddress(req) {
  // Vercel supplies x-forwarded-for; use only its first address as the client.
  const forwarded = req.headers?.['x-forwarded-for'];
  return String(forwarded || req.headers?.['x-real-ip'] || 'unknown').split(',')[0].trim().slice(0, 128);
}

function counterKey(username, req, secret) {
  const identity = `${String(username).trim().toLowerCase()}\n${clientAddress(req)}`;
  const digest = crypto.createHmac('sha256', secret).update(identity).digest('hex');
  return `sbu-crew-coach:login:${digest}`;
}

function createLoginRateLimiter({ env = process.env, fetchImpl = globalThis.fetch } = {}) {
  function configuration() {
    const url = env.LOGIN_RATE_LIMIT_REST_URL || '';
    const token = env.LOGIN_RATE_LIMIT_REST_TOKEN || '';
    const secret = env.COACH_SESSION_SECRET || '';
    if (!url || !token || Buffer.byteLength(secret, 'utf8') < 32) return null;
    let parsed;
    try { parsed = new URL(url); } catch { return null; }
    if (parsed.protocol !== 'https:') return null;
    return { url: parsed.toString().replace(/\/$/, ''), token, secret };
  }

  async function command(config, parts) {
    const response = await fetchImpl(config.url, {
      method: 'POST',
      headers: { authorization: `Bearer ${config.token}`, 'content-type': 'application/json' },
      body: JSON.stringify(parts),
    });
    if (!response.ok) throw new Error(`login limiter storage returned ${response.status}`);
    const payload = await response.json();
    if (payload?.error || !Object.hasOwn(payload || {}, 'result')) throw new Error('login limiter storage returned an invalid response');
    return payload.result;
  }

  return {
    configured: () => Boolean(configuration()),
    async consume(username, req) {
      const config = configuration();
      if (!config) throw new Error('distributed login limiter is not configured');
      const keys = [counterKey('__ip__', req, config.secret), counterKey(username, req, config.secret)];
      const counts = [];
      for (const key of keys) counts.push(Number(await command(config, ['EVAL', SCRIPT, '1', key, String(WINDOW_SECONDS)])));
      return { allowed: counts.every(count => Number.isFinite(count) && count <= MAX_ATTEMPTS), remaining: Math.max(0, MAX_ATTEMPTS - Math.max(...counts)) };
    },
    async reset(username, req) {
      const config = configuration();
      if (!config) throw new Error('distributed login limiter is not configured');
      await command(config, ['DEL', counterKey('__ip__', req, config.secret)]);
      await command(config, ['DEL', counterKey(username, req, config.secret)]);
    },
  };
}

const defaultLimiter = createLoginRateLimiter();
module.exports = { WINDOW_SECONDS, MAX_ATTEMPTS, createLoginRateLimiter, consume: (...args) => defaultLimiter.consume(...args), reset: (...args) => defaultLimiter.reset(...args) };
