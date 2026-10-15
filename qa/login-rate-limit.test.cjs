const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createLoginRateLimiter,
  MAX_ATTEMPTS,
  MAX_ACCOUNT_ATTEMPTS,
  WINDOW_SECONDS,
} = require('../api/lib/login-rate-limit');

function fixture(overrides = {}) {
  const records = new Map();
  let now = 1_800_000_000_000;
  const env = {
    LOGIN_RATE_LIMIT_REST_URL: 'https://redis.example.test',
    LOGIN_RATE_LIMIT_REST_TOKEN: 'synthetic-redis-token',
    COACH_SESSION_SECRET: 'synthetic-session-secret-with-at-least-thirty-two-bytes',
  };
  const fetchImpl = overrides.fetchImpl || (async (_url, request) => {
    const parts = JSON.parse(request.body);
    if (parts[0] === 'DEL') {
      const deleted = parts.slice(1).filter(key => records.delete(key)).length;
      return { ok: true, json: async () => ({ result: deleted }) };
    }
    const [operation, script, keyCount, ...args] = parts;
    assert.equal(operation, 'EVAL');
    assert.match(script, /redis\.call\('INCR'/);
    const keys = args.slice(0, Number(keyCount));
    const ttl = Number(args[keys.length]);
    const counts = keys.map(key => {
      let record = records.get(key);
      if (!record || record.expiresAt <= now) {
        record = { count: 0, expiresAt: now + ttl * 1000 };
        records.set(key, record);
      }
      record.count += 1;
      return record.count;
    });
    return { ok: true, json: async () => ({ result: counts }) };
  });
  const limiter = createLoginRateLimiter({ env, fetchImpl });
  const request = address => ({ headers: { 'x-forwarded-for': `${address}, 10.0.0.1` } });
  return { limiter, request, records, advance: ms => { now += ms; } };
}

test('shared IP counters enforce an attempt limit across usernames at one client address', async () => {
  const { limiter, request } = fixture();
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    assert.equal((await limiter.consume('coach', request('203.0.113.8'))).allowed, true);
  }
  assert.equal((await limiter.consume('other-name', request('203.0.113.8'))).allowed, false);
});

test('account counter enforces a conservative limit across many client addresses', async () => {
  const { limiter, request } = fixture();
  for (let attempt = 1; attempt <= MAX_ACCOUNT_ATTEMPTS; attempt += 1) {
    assert.equal((await limiter.consume('coach', request(`203.0.113.${attempt}`))).allowed, true);
  }
  assert.equal((await limiter.consume('coach', request('203.0.113.250'))).allowed, false);
});

test('shared counters recover when their fixed window expires', async () => {
  const { limiter, request, advance } = fixture();
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) await limiter.consume('coach', request('203.0.113.8'));
  assert.equal((await limiter.consume('coach', request('203.0.113.8'))).allowed, false);
  advance(WINDOW_SECONDS * 1000 + 1);
  assert.equal((await limiter.consume('coach', request('203.0.113.8'))).allowed, true);
});

test('successful authentication reset clears IP, IP-user, and account counters', async () => {
  const { limiter, request } = fixture();
  const client = request('203.0.113.8');
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) await limiter.consume('coach', client);
  await limiter.reset('coach', client);
  assert.equal((await limiter.consume('coach', client)).allowed, true);
});

test('limiter requires an HTTPS shared service and a keyed identity secret', async () => {
  const { limiter } = fixture();
  assert.equal(limiter.configured(), true);
  const unconfigured = createLoginRateLimiter({ env: { LOGIN_RATE_LIMIT_REST_URL: 'http://redis.example.test' } });
  assert.equal(unconfigured.configured(), false);
  await assert.rejects(unconfigured.consume('coach', { headers: {} }), /not configured/);
});

test('limiter accepts Vercel Upstash-prefixed REST credentials', async () => {
  const limiter = createLoginRateLimiter({
    env: {
      LOGIN_RATE_LIMIT_KV_REST_API_URL: 'https://redis.example.test',
      LOGIN_RATE_LIMIT_KV_REST_API_TOKEN: 'synthetic-redis-token',
      COACH_SESSION_SECRET: 'synthetic-session-secret-with-at-least-thirty-two-bytes',
    },
    fetchImpl: async (_url, request) => {
      assert.equal(JSON.parse(request.body)[0], 'EVAL');
      return { ok: true, json: async () => ({ result: [1, 1, 1] }) };
    },
  });
  assert.equal(limiter.configured(), true);
  assert.equal((await limiter.consume('coach', { headers: {} })).allowed, true);
});

test('Redis transport, HTTP, and malformed responses reject closed', async t => {
  const failureCases = [
    ['network rejection', async () => { throw new Error('network failure'); }],
    ['HTTP error', async () => ({ ok: false, status: 503 })],
    ['provider error', async () => ({ ok: true, json: async () => ({ error: 'unavailable' }) })],
    ['invalid payload', async () => ({ ok: true, json: async () => ({ result: null }) })],
    ['invalid counter result', async () => ({ ok: true, json: async () => ({ result: 1 }) })],
  ];
  for (const [name, fetchImpl] of failureCases) {
    await t.test(name, async () => {
      const { limiter, request } = fixture({ fetchImpl });
      await assert.rejects(limiter.consume('coach', request('203.0.113.8')));
    });
  }
});

