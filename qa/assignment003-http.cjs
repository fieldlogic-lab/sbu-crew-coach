// Explicit local-only check. Start qa/isolated-server.cjs first.
const assert = require('node:assert/strict');
async function main() {
  await import('./test-env-guard.mjs');
  const base = 'http://127.0.0.1:4173';
  const request = (route, options = {}) => fetch(base + route, { ...options, redirect: 'error', signal: AbortSignal.timeout(5000) });
  const status = await (await request('/__fixture/status')).json();
  assert.equal(status.synthetic, true);
  assert.equal(status.storage, 'process memory only');
  for (const [route, type] of [['/athlete.html', 'text/html'], ['/app.css', 'text/css'], ['/js/athlete-render.js', 'application/javascript'], ['/athlete.js', 'application/javascript']]) {
    const response = await request(route);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), new RegExp(type));
    assert.match(response.headers.get('content-security-policy'), /connect-src 'self'/);
    const body = await response.text();
    assert.ok(body.length > 100);
    if (route === '/athlete.html') {
      const scripts = [...body.matchAll(/<script src="([^"]+)"/g)].map(match => new URL(match[1], base + route).pathname);
      assert.deepEqual(scripts, ['/js/athlete-render.js', '/athlete.js']);
    }
    console.log(`PASS HTTP asset ${route}`);
  }
  const athlete = await request('/api/console?view=athlete');
  assert.equal(athlete.status, 200);
  assert.equal((await athlete.json()).session.title, 'Synthetic technique practice');
  assert.equal((await request('/api/console')).status, 401);
  const sync = await request('/api/attendance-sync', {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-attendance-sync-token': 'synthetic-attendance-token' },
    body: JSON.stringify({ rows: [{ name: 'Synthetic Athlete A', level: 'novice', [status.date]: 'present', Forms: 'complete', Safety: 'complete' }] }),
  });
  assert.equal(sync.status, 200);
  assert.equal((await sync.json()).syncedAthletes, 1);
  console.log('PASS anonymous athlete access, private denial, and synthetic attendance synchronization over loopback HTTP');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
