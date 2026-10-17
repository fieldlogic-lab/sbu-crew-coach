// Requires Playwright and Chromium. Run against qa/isolated-server.cjs only.
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const base = 'http://127.0.0.1:4173';
(async () => {
  await import('./test-env-guard.mjs');
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
  const context = await browser.newContext({ serviceWorkers: 'block' });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  let releaseManifest;
  const manifestReady = new Promise(resolve => { releaseManifest = resolve; });
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin === base) {
      if (!['/', '/console.html'].includes(url.pathname)) return route.continue();
      const response = await route.fetch();
      // Permit the intercepted public manifest; every external request remains mocked/aborted below.
      return route.fulfill({ response, headers: { ...response.headers(), 'content-security-policy': "default-src 'self'; connect-src 'self' https://www.rtpny.com; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; object-src 'none'; frame-src 'none'" } });
    }
    if (url.pathname.endsWith('/content.json')) {
      await manifestReady;
      return route.fulfill({ json: { resources: [{ title: 'Synthetic resource', summary: 'Test', href: 'https://example.test' }] } });
    }
    return route.abort(); // Weather and every other external service fail.
  });
  try {
    await page.goto(base);
    await page.waitForURL('**/console.html');
    await page.locator('#login-username').fill('synthetic-coach');
    await page.locator('#login-password').fill('wrong');
    await page.locator('#login-form button').click();
    await page.getByText('invalid coach credentials', { exact: true }).waitFor();
    await page.locator('#login-password').fill('synthetic-coach-password');
    await page.locator('#login-form button').click();
    await page.locator('#console').waitFor({ state: 'visible' });
    console.log('PASS browser anonymous redirect, invalid login, valid login');
    await page.goto(base);
    const workout = page.locator('[data-session-field="workout"]');
    await workout.waitFor();
    const today = await page.locator('[data-session-date]').getAttribute('data-session-date');
    await workout.fill('Synthetic recovered workout');
    const manifestResponse = page.waitForResponse(r => r.url().endsWith('/content.json'));
    releaseManifest();
    await manifestResponse;
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert.equal(await workout.inputValue(), 'Synthetic recovered workout');
    await page.locator('[data-save-session]').click();
    await page.getByText('Saved · latest plan loaded').waitFor();
    await page.reload();
    await workout.waitFor();
    assert.equal(await workout.inputValue(), 'Synthetic recovered workout');
    console.log('PASS weather failure, late resources preserve edit, daily save and refresh persistence');
    await page.locator('[data-v="tomorrow"]').click();
    assert.match(await page.locator('.session-card .title').innerText(), /tomorrow/);
    const tomorrow = await page.locator('[data-session-date]').getAttribute('data-session-date');
    assert.ok(tomorrow > today);
    await page.locator('[data-v="team"]').click();
    await page.getByText('Synthetic Athlete A', { exact: true }).waitFor();
    for (const view of ['season', 'plan']) {
      await page.locator(`[data-v="${view}"]`).click();
      assert.ok((await page.locator('#view').innerText()).includes('Synthetic technique practice'));
    }
    console.log('PASS date-based Tomorrow with unsorted past records, Team/attendance, Season and Plan');
    await page.locator('[data-v="today"]').click();
    await workout.fill('Synthetic conflict edit');
    assert.equal((await context.request.post(base + '/__fixture/advance')).status(), 200);
    await page.locator('[data-save-session]').click();
    await page.getByText('Download these edits').waitFor();
    assert.equal(await workout.inputValue(), 'Synthetic conflict edit');
    const downloadPromise = page.waitForEvent('download');
    await page.getByText('Download these edits').click();
    const download = await downloadPromise;
    const stream = await download.createReadStream();
    let recovered = ''; for await (const chunk of stream) recovered += chunk;
    assert.equal(JSON.parse(recovered).values.workout, 'Synthetic conflict edit');
    console.log('PASS stale save rejected, typed edits retained and downloadable');
    await page.reload();
    await workout.waitFor();
    assert.equal(await workout.inputValue(), 'Synthetic recovered workout');
    // Simulate absent tomorrow without modifying storage.
    await page.route('**/api/console', async route => {
      if (route.request().method() !== 'GET') return route.continue();
      const response = await route.fetch();
      const data = await response.json();
      data.teamOps.trainingPlan.sessions = data.teamOps.trainingPlan.sessions.filter(s => s.date !== tomorrow);
      await route.fulfill({ response, json: data });
    });
    await page.reload();
    await page.locator('[data-v="tomorrow"]').click();
    await page.getByText('No scheduled workout tomorrow.', { exact: true }).waitFor();
    assert.equal(await page.locator('[data-save-session]').count(), 0);
    await page.unroute('**/api/console');
    console.log('PASS absent tomorrow never repeats today or a past practice');
    await page.goto(base + '/console.html');
    await page.locator('#console').waitFor({ state: 'visible' });
    await page.locator('#save').click();
    await page.getByText('Draft saved', { exact: true }).waitFor();
    await page.locator('#publish').click();
    await page.getByText('Published', { exact: true }).waitFor();
    const anonymous = await browser.newContext({ serviceWorkers: 'block' });
    const athlete = await anonymous.request.get(base + '/api/console?view=athlete');
    assert.equal(athlete.status(), 200);
    assert.equal((await athlete.json()).session.workout, 'Synthetic recovered workout');
    assert.equal((await anonymous.request.get(base + '/api/console')).status(), 401);
    await anonymous.close();
    console.log('PASS console draft save and publish; anonymous athlete receives published workout, private record denied');
    await page.locator('#logout').click();
    await page.locator('#login-panel').waitFor({ state: 'visible' });
    assert.equal((await context.request.get(base + '/api/console')).status(), 401);
    await page.goto(base);
    await page.waitForURL('**/console.html');
    assert.deepEqual(errors, []);
    console.log('PASS logout clears browser session and refresh requires login; no uncaught browser exceptions');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
