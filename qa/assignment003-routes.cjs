const test = require('node:test');
const assert = require('node:assert/strict');

process.env.COACH_USERNAME = 'synthetic-coach';
process.env.COACH_PASSWORD = 'synthetic-coach-password';
process.env.COACH_SESSION_SECRET = 'synthetic-signing-secret-with-more-than-thirty-two-bytes';
process.env.ATTENDANCE_SYNC_TOKEN = 'synthetic-attendance-token';

const store = require('../api/lib/draft-store');
const googleAttendancePath = require.resolve('../api/lib/google-attendance');
let draft;
let draftVersion;
let published;
let publishedVersion;
let failNextPublishWrite = false;
let afterNextDraftWrite;
const operations = [];

const clone = value => value == null ? value : structuredClone(value);
const nextTag = (prefix, version) => `"${prefix}-v${version}"`;
function conflict() {
  return Object.assign(new Error('precondition failed'), { statusCode: 412, code: 'DRAFT_CONFLICT' });
}
function currentRecord(pathname) {
  if (pathname.endsWith('draft.json')) return draft ? { data: clone(draft), etag: nextTag('draft', draftVersion) } : null;
  if (pathname.endsWith('published.json')) return published ? { data: clone(published), etag: nextTag('published', publishedVersion) } : null;
  return null;
}

store.readDraft = async () => currentRecord('draft.json');
store.readBlob = async pathname => {
  if (pathname.endsWith('published.json')) operations.push('read-published');
  return currentRecord(pathname);
};
store.writeDraft = async (data, options = {}) => {
  operations.push('write-draft');
  const current = currentRecord('draft.json');
  if (current) {
    if (options.etag !== current.etag) throw conflict();
  } else if (!options.ifNoneMatch && options.ifNoneMatch !== '*') {
    throw conflict();
  }
  draft = clone(data);
  draftVersion = (draftVersion || 0) + 1;
  if (afterNextDraftWrite) {
    const change = afterNextDraftWrite;
    afterNextDraftWrite = null;
    change();
  }
  return { etag: nextTag('draft', draftVersion) };
};
store.writeBlob = async (pathname, data, options = {}) => {
  if (pathname.endsWith('published.json')) {
    if (failNextPublishWrite) {
      failNextPublishWrite = false;
      throw Object.assign(new Error('synthetic Blob service unavailable'), { statusCode: 503 });
    }
    const current = currentRecord(pathname);
    if (current && current.etag !== options.etag) throw conflict();
    if (!current && options.ifNoneMatch !== '*') throw conflict();
    published = clone(data);
    publishedVersion = (publishedVersion || 0) + 1;
    return { etag: nextTag('published', publishedVersion) };
  }
  throw new Error(`unexpected blob write: ${pathname}`);
};
store.updateDraft = async mutate => {
  const current = currentRecord('draft.json');
  if (!current) return null;
  const data = mutate(clone(current.data));
  await store.writeDraft(data, { etag: current.etag });
  return clone(draft);
};

const consoleHandler = require('../api/console');
const attendanceHandler = require('../api/attendance-sync');
let refreshResult = { athletes: 1, practiceDates: 1, lastReadAt: 'synthetic-time' };
require.cache[googleAttendancePath] = {
  id: googleAttendancePath, filename: googleAttendancePath, loaded: true,
  exports: { refreshAttendance: async () => refreshResult },
};
const refreshHandler = require('../api/attendance-refresh');

function response() {
  return {
    headers: {},
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
    end(body = '') { this.body = body; },
  };
}
async function invoke(handler, method, url, body, headers = {}) {
  const res = response();
  await handler({ method, url, body, headers }, res);
  return { ...res, json: res.body ? JSON.parse(res.body) : null };
}
async function login() {
  const result = await invoke(consoleHandler, 'POST', '/api/console', {
    action: 'login', username: process.env.COACH_USERNAME, password: process.env.COACH_PASSWORD,
  });
  assert.equal(result.statusCode, 200);
  return result.headers['set-cookie'].split(';')[0];
}
function initialDraft() {
  return {
    plan: { season: 'Fall 2026', sessions: [{ date: '2099-01-01', title: 'Erg test', workout: 'Plan workout' }] },
    seasons: { 'Fall 2026': { sessions: [{ date: '2099-01-01', title: 'Erg test', workout: 'Plan workout' }] } },
    content: { resources: [] }, controls: { siteName: 'SBU Crew' },
    teamOps: {
      trainingPlan: { sessions: [{ date: '2099-01-01', title: 'Erg test', workout: 'Plan workout', custom: { coachNotes: 'private note' } }] },
      attendance: { athletes: [{ name: 'Synthetic Rower', attendedDates: [] }], practiceDates: [] },
      sources: { dailyTrainingPlan: { status: 'connected' }, attendance: { status: 'connected' } },
      lineups: { drafts: [{ name: 'Synthetic lineup' }] },
    },
    history: [],
  };
}

test.beforeEach(() => {
  draft = initialDraft(); draftVersion = 1;
  published = initialDraft(); publishedVersion = 1;
  failNextPublishWrite = false; afterNextDraftWrite = null; operations.length = 0;
});

test('coach startup is denied anonymously and authenticated startup returns draft plus validator', async () => {
  const anon = await invoke(consoleHandler, 'GET', '/api/console');
  assert.equal(anon.statusCode, 401);
  const cookie = await login();
  const loaded = await invoke(consoleHandler, 'GET', '/api/console', undefined, { cookie });
  assert.equal(loaded.statusCode, 200);
  assert.equal(loaded.headers.etag, '"draft-v1"');
  assert.equal(loaded.json.teamOps.attendance.athletes[0].name, 'Synthetic Rower');
});

test('login rejects bad credentials and logout clears the scoped secure session cookie', async () => {
  const bad = await invoke(consoleHandler, 'POST', '/api/console', { action: 'login', username: process.env.COACH_USERNAME, password: 'incorrect-password' });
  assert.equal(bad.statusCode, 401);
  const cookie = await login();
  const loggedOut = await invoke(consoleHandler, 'POST', '/api/console', { action: 'logout' }, { cookie });
  assert.equal(loggedOut.statusCode, 200);
  assert.match(loggedOut.headers['set-cookie'], /Max-Age=0/);
  assert.match(loggedOut.headers['set-cookie'], /HttpOnly; Secure; SameSite=Strict/);
});

test('daily session edits update linked views while stale and unknown sessions are rejected', async () => {
  const cookie = await login();
  const stale = await invoke(consoleHandler, 'POST', '/api/console', {
    action: 'update-session', date: '2099-01-01', values: { workout: 'stale edit' },
  }, { cookie, 'if-match': '"old-tag"' });
  assert.equal(stale.statusCode, 412);
  const saved = await invoke(consoleHandler, 'POST', '/api/console', {
    action: 'update-session', date: '2099-01-01', values: { workout: 'new workout', coachingCues: 'Long and relaxed' },
  }, { cookie, 'if-match': '"draft-v1"' });
  assert.equal(saved.statusCode, 200);
  assert.equal(saved.json.teamOps.trainingPlan.sessions[0].workout, 'new workout');
  assert.equal(saved.json.teamOps.trainingPlan.sessions[0].custom.coachCues, undefined);
  assert.equal(saved.json.teamOps.trainingPlan.sessions[0].custom.coachingCues, 'Long and relaxed');
  assert.equal(saved.json.plan.sessions[0].workout, 'new workout');
  assert.equal(saved.json.teamOps.trainingPlan.sessions[0].custom.coachNotes, 'private note');
  const absent = await invoke(consoleHandler, 'POST', '/api/console', {
    action: 'update-session', date: '2099-01-02', values: { workout: 'not found' },
  }, { cookie, 'if-match': saved.headers.etag });
  assert.equal(absent.statusCode, 404);
});

test('attendance sync requires its header credential and preserves unrelated coach state', async () => {
  const body = { rows: [{ Name: 'Synthetic Rower', '1/2/2026': 'Present' }], title: 'Synthetic attendance' };
  const unauthorized = await invoke(attendanceHandler, 'POST', '/api/attendance-sync?token=synthetic-attendance-token', body);
  assert.equal(unauthorized.statusCode, 401);
  const coachCookie = await login();
  const coachOnly = await invoke(attendanceHandler, 'POST', '/api/attendance-sync', body, { cookie: coachCookie });
  assert.equal(coachOnly.statusCode, 401);
  const synced = await invoke(attendanceHandler, 'POST', '/api/attendance-sync', body, {
    'x-attendance-sync-token': process.env.ATTENDANCE_SYNC_TOKEN,
  });
  assert.equal(synced.statusCode, 200);
  assert.equal(draft.teamOps.attendance.athletes[0].name, 'Synthetic Rower');
  assert.deepEqual(draft.teamOps.attendance.practiceDates, ['2026-01-02']);
  assert.equal(draft.teamOps.trainingPlan.sessions[0].custom.coachNotes, 'private note');
  assert.equal(draft.teamOps.lineups.drafts[0].name, 'Synthetic lineup');
  assert.ok(draft.teamOps.sources.attendance.lastReadAt);
});

test('scheduled attendance refresh requires the cron bearer token and uses the isolated refresh stub', async () => {
  process.env.CRON_SECRET = 'synthetic-cron-secret';
  const denied = await invoke(refreshHandler, 'GET', '/api/attendance-refresh');
  assert.equal(denied.statusCode, 401);
  const allowed = await invoke(refreshHandler, 'GET', '/api/attendance-refresh', undefined, {
    authorization: 'Bearer synthetic-cron-secret',
  });
  assert.equal(allowed.statusCode, 200);
  assert.equal(allowed.json.athletes, 1);
  assert.equal(allowed.json.practiceDates, 1);
  delete process.env.CRON_SECRET;
});

test('authorized publication updates both draft and published snapshots', async () => {
  const cookie = await login();
  const body = {
    action: 'publish', plan: { season: 'Fall 2026', sessions: [] }, seasons: {},
    content: { resources: [{ title: 'Synthetic public resource' }] }, controls: { siteName: 'Published test' },
    teamOps: draft.teamOps,
  };
  const result = await invoke(consoleHandler, 'POST', '/api/console', body, { cookie, 'if-match': '"draft-v1"' });
  assert.equal(result.statusCode, 200);
  assert.equal(draft.content.resources[0].title, 'Synthetic public resource');
  assert.equal(published.content.resources[0].title, 'Synthetic public resource');
  const publicView = await invoke(consoleHandler, 'GET', '/api/console?view=published');
  assert.equal(publicView.statusCode, 200);
  assert.deepEqual(publicView.json.content, published.content);
});

test('non-conflict published Blob failure reports unknown publication and saved draft ETag', async () => {
  const cookie = await login(); failNextPublishWrite = true;
  const result = await invoke(consoleHandler, 'POST', '/api/console', {
    action: 'publish', plan: { season: 'Fall 2026', sessions: [] }, seasons: {},
    content: { resources: [{ title: 'Saved but publication unknown' }] }, controls: {}, teamOps: draft.teamOps,
  }, { cookie, 'if-match': '"draft-v1"' });
  assert.equal(result.statusCode, 503);
  assert.equal(result.json.code, 'PUBLISH_FAILED');
  assert.equal(result.json.draftSaved, true);
  assert.equal(result.json.publicationStatus, 'unknown');
  assert.equal(result.headers.etag, '"draft-v2"');
  assert.equal(draft.content.resources[0].title, 'Saved but publication unknown');
  assert.notEqual(published.content.resources?.[0]?.title, 'Saved but publication unknown');
});

test('published Blob CAS conflict explicitly reports draft-saved partial success', async () => {
  const cookie = await login();
  // Use the current record ETag in the route's prior read, then supersede it
  // immediately before its conditional write.
  afterNextDraftWrite = () => {
    published = { ...published, controls: { siteName: 'newer publication' } };
    publishedVersion += 1;
  };
  const result = await invoke(consoleHandler, 'POST', '/api/console', {
    action: 'publish', plan: { season: 'Fall 2026', sessions: [] }, seasons: {},
    content: { resources: [{ title: 'Saved but not published' }] }, controls: {}, teamOps: draft.teamOps,
  }, { cookie, 'if-match': '"draft-v1"' });
  assert.equal(result.statusCode, 412);
  assert.equal(result.json.code, 'PUBLISH_CONFLICT');
  assert.equal(result.json.draftSaved, true);
  assert.equal(draft.content.resources[0].title, 'Saved but not published');
  assert.equal(published.controls.siteName, 'newer publication');
  assert.notEqual(published.content.resources?.[0]?.title, 'Saved but not published');
  assert.ok(operations.indexOf('read-published') < operations.indexOf('write-draft'), 'publication ETag must be captured before draft write');
});

test('full write returns matching data and ETag when attendance commits just after coach save', async () => {
  const cookie = await login();
  afterNextDraftWrite = () => {
    draft.teamOps.attendance.athletes.push({ name: 'Concurrent synthetic rower' });
    draftVersion += 1;
  };
  const result = await invoke(consoleHandler, 'POST', '/api/console', {
    action: 'draft', plan: draft.plan, seasons: draft.seasons, content: draft.content,
    controls: draft.controls, teamOps: draft.teamOps, history: [],
  }, { cookie, 'if-match': '"draft-v1"' });
  assert.equal(result.statusCode, 200);
  assert.equal(result.headers.etag, '"draft-v3"');
  assert.ok(result.json.teamOps.attendance.athletes.some(row => row.name === 'Concurrent synthetic rower'));
});
