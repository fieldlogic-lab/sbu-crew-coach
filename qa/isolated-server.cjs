// Loopback-only synthetic UI fixture. Never load .env, real Blob, or Google.
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');

async function main() {
  await import('./test-env-guard.mjs');
  process.env.COACH_USERNAME = 'synthetic-coach';
  process.env.COACH_PASSWORD = 'synthetic-coach-password';
  process.env.COACH_SESSION_SECRET = 'synthetic-local-session-secret-more-than-32-bytes';
  process.env.ATTENDANCE_SYNC_TOKEN = 'synthetic-attendance-token';
  process.env.LOGIN_RATE_LIMIT_REST_URL = 'https://redis.synthetic.test';
  process.env.LOGIN_RATE_LIMIT_REST_TOKEN = 'synthetic-redis-token';
  const counters = new Map();
  global.fetch = async (url, request) => {
    if (url !== process.env.LOGIN_RATE_LIMIT_REST_URL) throw new Error('External requests disabled in the local fixture');
    const [op, ...parts] = JSON.parse(request.body);
    if (op === 'DEL') {
      parts.forEach(key => counters.delete(key));
      return { ok: true, json: async () => ({ result: 1 }) };
    }
    if (op !== 'EVAL') throw new Error('Unexpected synthetic Redis command');
    const keys = parts.slice(2, 2 + Number(parts[1]));
    return { ok: true, json: async () => ({ result: keys.map(key => {
      const count = (counters.get(key) || 0) + 1;
      counters.set(key, count);
      return count;
    }) }) };
  };

  const records = new Map();
  let version = 0;
  const store = require('../api/lib/draft-store');
  const memory = store.createDraftStore({
    getBlob: async pathname => {
      const record = records.get(pathname);
      return record ? { stream: new Response(record.text).body, blob: { etag: record.etag } } : null;
    },
    putBlob: async (pathname, text, options) => {
      const current = records.get(pathname);
      if (current ? (!options.allowOverwrite || options.ifMatch !== current.etag) : Boolean(options.ifMatch)) {
        throw Object.assign(new Error('synthetic precondition failed'), { statusCode: 412 });
      }
      const etag = `"synthetic-${++version}"`;
      records.set(pathname, { text, etag });
      return { etag };
    },
  });
  Object.assign(store, memory);
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());
  const session = {
    date: today, title: 'Synthetic technique practice', workout: 'Synthetic steady rowing, 3 × 10 minutes',
    intent: 'Synthetic test plan — no real athlete data', cue: 'Relax the shoulders', sessionType: 'land',
    practiceStatus: 'land', releaseTimes: { water: '00:00', land: '00:00' }, custom: {},
  };
  const adjacent = offset => {
    const date = new Date(today + 'T12:00:00Z');
    date.setUTCDate(date.getUTCDate() + offset);
    return { ...session, date: date.toISOString().slice(0, 10), title: offset < 0 ? 'Synthetic past practice' : 'Synthetic tomorrow practice' };
  };
  // Deliberately unsorted, with a past session: Tomorrow must use its date.
  const sessions = [adjacent(1), adjacent(-1), session];
  const plan = { season: 'Fall 2026', phases: [], sessions };
  const draft = {
    plan, seasons: { 'Fall 2026': plan }, content: { resources: [] }, controls: {}, history: [],
    teamOps: {
      sources: { dailyTrainingPlan: { kind: 'dailyTrainingPlan', title: 'Synthetic plan', status: 'connected' } },
      trainingPlan: { sessions }, attendance: { athletes: [{ name: 'Synthetic Athlete A', level: 'novice', attendance: { [today]: 'present' } }], practiceDates: [today] },
      lineups: { drafts: [] }, seasonArc: { seasons: [] },
    },
  };
  await memory.writeDraft(draft, { ifNoneMatch: '*' });
  await memory.writeBlob('coach-content/published.json', draft, { ifNoneMatch: '*' });
  const consoleRoute = require('../api/console');
  const attendanceRoute = require('../api/attendance-sync');
  const root = path.resolve(__dirname, '..');
  const mime = { '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript', '.json': 'application/json' };
  const server = http.createServer(async (req, res) => {
    try {
      // Protect the fixture against cross-origin browser requests and DNS rebinding.
      if (!['127.0.0.1:4173', 'localhost:4173'].includes(req.headers.host) ||
          (req.headers.origin && !['http://127.0.0.1:4173', 'http://localhost:4173'].includes(req.headers.origin))) {
        res.writeHead(403); return res.end('Loopback fixture only');
      }
      const pathname = new URL(req.url, 'http://127.0.0.1:4173').pathname;
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Content-Security-Policy', "default-src 'self'; connect-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; object-src 'none'; frame-src 'none'");
      if (pathname === '/api/console') return await consoleRoute(req, res);
      if (pathname === '/api/attendance-sync') return await attendanceRoute(req, res);
      if (pathname === '/__fixture/advance' && req.method === 'POST') {
        await memory.updateDraft(data => { data.teamOps.attendance.testMarker = 'synthetic concurrent sync'; return data; });
        res.setHeader('Content-Type', 'application/json'); return res.end('{"synthetic":true}');
      }
      if (pathname === '/__fixture/status') {
        res.setHeader('Content-Type', 'application/json');
        return res.end(JSON.stringify({ synthetic: true, storage: 'process memory only', externalRequests: 'denied', date: today }));
      }
      if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405); return res.end(); }
      const relative = pathname === '/' ? 'index.html' : decodeURIComponent(pathname).slice(1);
      const allowed = /^(?:index|athlete|console)\.html$|^(?:app|console)\.css$|^(?:app|athlete|console|sw)\.js$|^manifest\.json$|^js\/[a-zA-Z0-9/_-]+\.js$/;
      if (!allowed.test(relative) || relative.includes('..')) { res.writeHead(404); return res.end(); }
      const data = await fs.readFile(path.join(root, relative));
      res.setHeader('Content-Type', mime[path.extname(relative)]);
      res.end(req.method === 'HEAD' ? undefined : data);
    } catch (error) {
      res.writeHead(error.code === 'ENOENT' ? 404 : 500); res.end('Local fixture request failed');
    }
  });
  server.listen(4173, '127.0.0.1', () => console.log('Synthetic fixture: http://127.0.0.1:4173 — in-memory records, external requests blocked'));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
