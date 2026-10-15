const crypto = require('node:crypto');

const WINDOW_SECONDS = 15 * 60;
const MAX_ATTEMPTS = 5;
const MAX_ACCOUNT_ATTEMPTS = 20;
const SCRIPT = [
  'local counts = {}',
  'for i = 1, #KEYS do',
  "  local n = redis.call('INCR', KEYS[i])",
  "  if n == 1 then redis.call('EXPIRE', KEYS[i], ARGV[1]) end",
  '  counts[i] = n',
  'end',
  'return counts',
].join('\n');

function clientAddress(req) {
  // Vercel supplies x-forwarded-for; use only its first address as the client.
  const forwarded = req.headers?.['x-forwarded-for'];
  return String(forwarded || req.headers?.['x-real-ip'] || 'unknown').split(',')[0].trim().slice(0, 128);
}

function digestKey(identity, secret) {
  const digest = crypto.createHmac('sha256', secret).update(identity).digest('hex');
  return `sbu-crew-coach:login:${digest}`;
}

function counterKeys(username, req, secret) {
  const normalized = String(username).trim().toLowerCase();
  const address = clientAddress(req);
  return [
    digestKey(`ip\n${address}`, secret),
    digestKey(`ip-user\n${normalized}\n${address}`, secret),
    digestKey(`account\n${normalized}`, secret),
  ];
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
      const keys = counterKeys(username, req, config.secret);
      const result = await command(config, ['EVAL', SCRIPT, String(keys.length), ...keys, String(WINDOW_SECONDS)]);
      if (!Array.isArray(result) || result.length !== keys.length) throw new Error('login limiter storage returned an invalid counter result');
      const counts = result.map(Number);
      if (counts.some(count => !Number.isFinite(count))) throw new Error('login limiter storage returned an invalid counter value');
      return {
        allowed: counts[0] <= MAX_ATTEMPTS && counts[1] <= MAX_ATTEMPTS && counts[2] <= MAX_ACCOUNT_ATTEMPTS,
        remaining: Math.max(0, Math.min(MAX_ATTEMPTS - counts[0], MAX_ATTEMPTS - counts[1], MAX_ACCOUNT_ATTEMPTS - counts[2])),
      };
    },
    async reset(username, req) {
      const config = configuration();
      if (!config) throw new Error('distributed login limiter is not configured');
      await command(config, ['DEL', ...counterKeys(username, req, config.secret)]);
    },
  };
}

const defaultLimiter = createLoginRateLimiter();
module.exports = {
  WINDOW_SECONDS,
  MAX_ATTEMPTS,
  MAX_ACCOUNT_ATTEMPTS,
  createLoginRateLimiter,
  consume: (...args) => defaultLimiter.consume(...args),
  reset: (...args) => defaultLimiter.reset(...args),
};

