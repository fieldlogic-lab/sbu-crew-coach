import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const sync = require('../api/attendance-sync.js');
const importer = require('../api/import-attendance-36f2c8cb.js');

function responseRecorder() {
  return {
    headers: {},
    setHeader(name, value) { this.headers[name] = value; },
    end(body) { this.body = JSON.parse(body); },
  };
}

test('attendance sync rejects query-string token authorization', async () => {
  const previous = process.env.ATTENDANCE_SYNC_TOKEN;
  process.env.ATTENDANCE_SYNC_TOKEN = 'secret';
  try {
    const res = responseRecorder();
    await sync({ method: 'POST', url: '/api/attendance-sync?token=secret', headers: {} }, res);
    assert.equal(res.statusCode, 401);
  } finally {
    if (previous === undefined) delete process.env.ATTENDANCE_SYNC_TOKEN;
    else process.env.ATTENDANCE_SYNC_TOKEN = previous;
  }
});

test('attendance import requires the scoped token header before payload parsing', async () => {
  const previous = process.env.ATTENDANCE_SYNC_TOKEN;
  process.env.ATTENDANCE_SYNC_TOKEN = 'secret';
  try {
    const res = responseRecorder();
    await importer({ method: 'GET', url: '/api/import?token=secret&payload=invalid', headers: {} }, res);
    assert.equal(res.statusCode, 401);
  } finally {
    if (previous === undefined) delete process.env.ATTENDANCE_SYNC_TOKEN;
    else process.env.ATTENDANCE_SYNC_TOKEN = previous;
  }
});
