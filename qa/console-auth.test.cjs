const test = require('node:test');
const assert = require('node:assert/strict');

process.env.COACH_USERNAME = 'synthetic-coach';
process.env.COACH_PASSWORD = 'synthetic-password';
process.env.COACH_SESSION_SECRET = 'synthetic-session-secret-with-at-least-thirty-two-bytes';

const store = require('../api/lib/draft-store');
const limiter = require('../api/lib/login-rate-limit');
let rateLimited = false;
let limiterUnavailable = false;
limiter.configured = () => !limiterUnavailable;
limiter.consume = async () => ({ allowed: !rateLimited, remaining: rateLimited ? 0 : 4 });
limiter.reset = async () => {};
let draft = { plan: { season: 'Synthetic', sessions: [] }, seasons: {}, content: { resources: [] }, teamOps: { trainingPlan: { sessions: [{ date: '2099-01-01', workout: 'old' }] } }, history: [] };
let etag = '"draft-v1"';
let afterDraftWrite;
store.readDraft = async () => ({ data: structuredClone(draft), etag });
store.writeDraft = async (next, opts) => {
  if (opts.etag !== etag) throw Object.assign(new Error('conflict'), { statusCode: 412, code: 'DRAFT_CONFLICT' });
  draft = structuredClone(next); etag = '"draft-v2"';
  if (afterDraftWrite) afterDraftWrite();
  return { etag };
};
store.readBlob = async path => path.endsWith('published.json')
  ? { data: structuredClone(draft), etag: '"published-v1"' }
  : { data: structuredClone(draft), etag };
store.writeBlob = async () => ({ etag: '"published-v2"' });
store.updateDraft = async mutate => { draft = mutate(structuredClone(draft)); etag = '"draft-updated"'; return structuredClone(draft); };

const handler = require('../api/console');
function invoke(method, url, body, headers = {}) {
  const res = {
    headers: {},
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
    end(value) { this.body = value; },
  };
  return Promise.resolve(handler({ method, url, body, headers }, res)).then(() => ({ ...res, json: JSON.parse(res.body || '{}') }));
}

test('anonymous private draft reads and writes are denied while athlete reads stay public', async () => {
  assert.equal((await invoke('GET', '/api/console')).statusCode, 401);
  assert.equal((await invoke('POST', '/api/console', { action: 'draft' })).statusCode, 401);
  assert.equal((await invoke('POST', '/api/console', { action: 'publish' })).statusCode, 401);
  assert.equal((await invoke('POST', '/api/console', { action: 'update-session', date: '2099-01-01', values: { workout: 'hostile' } })).statusCode, 401);
  const athlete = await invoke('GET', '/api/console?view=athlete');
  assert.equal(athlete.statusCode, 200);
  assert.equal(athlete.json.coachPreview, false);
});

test('coach login sets signed cookie; authorized draft access works; attendance credential cannot use coach route', async () => {
  rateLimited = false;
  limiterUnavailable = false;
  const badLogin = await invoke('POST', '/api/console', { action: 'login', username: 'synthetic-coach', password: 'wrong-password' });
  assert.equal(badLogin.statusCode, 401);
  const login = await invoke('POST', '/api/console', { action: 'login', username: 'synthetic-coach', password: 'synthetic-password' });
  assert.equal(login.statusCode, 200);
  const cookie = login.headers['set-cookie'].split(';')[0];
  assert.match(login.headers['set-cookie'], /HttpOnly; Secure; SameSite=Strict/);
  const read = await invoke('GET', '/api/console', undefined, { cookie });
  assert.equal(read.statusCode, 200);
  assert.equal(read.headers.etag, etag);
  const service = await invoke('GET', '/api/console', undefined, { cookie, 'x-attendance-sync-token': 'synthetic-token' });
  assert.equal(service.statusCode, 401);
});

test('login route rejects throttled attempts and fails closed if shared limiter is unavailable', async () => {
  rateLimited = true;
  const blocked = await invoke('POST', '/api/console', { action: 'login', username: 'synthetic-coach', password: 'synthetic-password' });
  assert.equal(blocked.statusCode, 429);
  assert.equal(blocked.headers['retry-after'], String(limiter.WINDOW_SECONDS));
  rateLimited = false;
  limiterUnavailable = true;
  const unavailable = await invoke('POST', '/api/console', { action: 'login', username: 'synthetic-coach', password: 'synthetic-password' });
  assert.equal(unavailable.statusCode, 503);
  limiterUnavailable = false;
});

test('authorized session updates reject stale edits and accept the current ETag', async () => {
  const login = await invoke('POST', '/api/console', { action: 'login', username: 'synthetic-coach', password: 'synthetic-password' });
  const cookie = login.headers['set-cookie'].split(';')[0];
  const body = { action: 'update-session', date: '2099-01-01', values: { workout: 'synthetic updated' } };
  const stale = await invoke('POST', '/api/console', body, { cookie, 'if-match': '"stale"' });
  assert.equal(stale.statusCode, 412);
  const saved = await invoke('POST', '/api/console', body, { cookie, 'if-match': etag });
  assert.equal(saved.statusCode, 200);
  assert.equal(draft.teamOps.trainingPlan.sessions[0].workout, 'synthetic updated');
});

test('authorized full writes require a matching draft validator', async () => {
  const login = await invoke('POST', '/api/console', { action: 'login', username: 'synthetic-coach', password: 'synthetic-password' });
  const cookie = login.headers['set-cookie'].split(';')[0];
  const body = { action: 'draft', plan: draft.plan, seasons: {}, content: {}, controls: {}, teamOps: {}, history: [] };
  const stale = await invoke('POST', '/api/console', body, { cookie, 'if-match': '"stale"' });
  assert.equal(stale.statusCode, 412);
  assert.equal(stale.json.code, 'DRAFT_CONFLICT');
  const saved = await invoke('POST', '/api/console', body, { cookie, 'if-match': etag });
  assert.equal(saved.statusCode, 200);
  assert.equal(saved.headers.etag, etag);
});

test('write response returns data from the same latest version as its ETag', async () => {
  const login = await invoke('POST', '/api/console', { action: 'login', username: 'synthetic-coach', password: 'synthetic-password' });
  const cookie = login.headers['set-cookie'].split(';')[0];
  afterDraftWrite = () => {
    // Simulate an attendance update landing before the route's post-write read.
    draft.concurrentMarker = 'concurrent attendance sync';
    etag = '"draft-v3-concurrent"';
  };
  try {
    const saved = await invoke('POST', '/api/console', { action: 'draft', plan: draft.plan, seasons: {}, content: {}, controls: {}, teamOps: draft.teamOps, history: [] }, { cookie, 'if-match': etag });
    assert.equal(saved.statusCode, 200);
    assert.equal(saved.headers.etag, etag);
    assert.equal(saved.json.concurrentMarker, 'concurrent attendance sync');
  } finally {
    afterDraftWrite = undefined;
  }
});
