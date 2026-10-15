const test = require('node:test');
const assert = require('node:assert/strict');
const auth = require('../api/lib/coach-auth');

const env = {
  COACH_USERNAME: 'coach-test',
  COACH_PASSWORD: 'synthetic-password-only',
  COACH_SESSION_SECRET: 'synthetic-test-signing-secret-at-least-32-bytes-long',
};

test('configuration fails closed without identity, password, and a 32-byte secret', () => {
  assert.equal(auth.getCoachConfig({}).configured, false);
  assert.equal(auth.getCoachConfig({ ...env, COACH_SESSION_SECRET: 'too-short' }).configured, false);
  assert.equal(auth.getCoachConfig({ ...env, COACH_PASSWORD: 'short' }).configured, false);
  assert.equal(auth.getCoachConfig(env).configured, true);
});

test('signed cookie authenticates only the configured identity until expiry', () => {
  const config = auth.getCoachConfig(env);
  const now = 1_800_000_000_000;
  const token = auth.createSessionToken(config.username, config.secret, now);
  assert.equal(auth.verifySessionToken(token, config, now), true);
  assert.equal(auth.verifySessionToken(token, { ...config, username: 'other' }, now), false);
  assert.equal(auth.verifySessionToken(token, config, now + auth.SESSION_SECONDS * 1000 + 1), false);
  assert.equal(auth.verifySessionToken(`${token}x`, config, now), false);
});

test('cookie is HttpOnly, Secure, Strict, scoped, and service credentials are identified', () => {
  const token = auth.createSessionToken('coach-test', env.COACH_SESSION_SECRET);
  assert.match(auth.sessionCookie(token), /HttpOnly; Secure; SameSite=Strict/);
  assert.match(auth.sessionCookie(token), /Path=\/api\/console/);
  assert.equal(auth.readCookie(`other=x; ${auth.COOKIE_NAME}=${token}`), token);
  assert.equal(auth.hasServiceCredential({ url: '/api/console', headers: { 'x-attendance-sync-token': 'synthetic' } }), true);
  assert.equal(auth.hasServiceCredential({ url: '/api/console', headers: {}, }), false);
});
