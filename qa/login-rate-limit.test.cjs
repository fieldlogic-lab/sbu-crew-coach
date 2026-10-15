const test = require('node:test');
const assert = require('node:assert/strict');
const { createLoginRateLimiter, MAX_ATTEMPTS, WINDOW_SECONDS } = require('../api/lib/login-rate-limit');

function fixture() {
  const records = new Map();
  let now = 1_800_000_000_000;
  const env = {
    LOGIN_RATE_LIMIT_REST_URL: 'https://redis.example.test',
    LOGIN_RATE_LIMIT_REST_TOKEN: 'synthetic-redis-token',
    COACH_SESSION_SECRET: 'synthetic-session-secret-with-at-least-thirty-two-bytes',
  };
  const fetchImpl = async (_url, request) => {
    const [operation, script, _keyCount, key, ttl] = JSON.parse(request.body);
    if (operation === 'DEL') {
      const existed = records.delete(script);
      return { ok: true, json: async () => ({ result: existed ? 1 : 0 }) };
    }
    assert.equal(operation, 'EVAL');
    assert.match(script, /redis\.call\('INCR'/);
    let record = records.get(key);
    if (!record || record.expiresAt <= now) {
      record = { count: 0, expiresAt: now + Number(ttl) * 1000 };
      records.set(key, record);
    }
    record.count += 1;
    return { ok: true, json: async () => ({ result: record.count }) };
  };
  const limiter = createLoginRateLimiter({ env, fetchImpl });
  const request = { headers: { 'x-forwarded-for': '203.0.113.8, 10.0.0.1' } };
  return { limiter, request, records, advance: ms => { now += ms; } };
}

test('shared atomic counters enforce an attempt limit across usernames at one client address', async () => {
  const { limiter, request } = fixture();
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    assert.equal((await limiter.consume('coach', request)).allowed, true);
  }
  assert.equal((await limiter.consume('other-name', request)).allowed, false);
});

test('shared counter recovers when its fixed window expires', async () => {
  const { limiter, request, advance } = fixture();
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) await limiter.consume('coach', request);
  assert.equal((await limiter.consume('coach', request)).allowed, false);
  advance(WINDOW_SECONDS * 1000 + 1);
  assert.equal((await limiter.consume('coach', request)).allowed, true);
});

test('successful authentication reset clears username and address counters', async () => {
  const { limiter, request } = fixture();
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) await limiter.consume('coach', request);
  await limiter.reset('coach', request);
  assert.equal((await limiter.consume('coach', request)).allowed, true);
});

test('limiter requires an HTTPS shared service and a keyed identity secret', async () => {
  const { limiter } = fixture();
  assert.equal(limiter.configured(), true);
  const unconfigured = createLoginRateLimiter({ env: { LOGIN_RATE_LIMIT_REST_URL: 'http://redis.example.test' } });
  assert.equal(unconfigured.configured(), false);
  await assert.rejects(unconfigured.consume('coach', { headers: {} }), /not configured/);
});
