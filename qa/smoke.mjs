import assert from 'node:assert/strict';

const requiredAttestations = [
  'TEST_ENVIRONMENT=isolated',
  'TEST_DATA_STORE_ISOLATED=true',
  'TEST_INTEGRATIONS_ISOLATED=true',
];
for (const setting of requiredAttestations) {
  const [name, expected] = setting.split('=');
  if (process.env[name] !== expected) {
    throw new Error(`Refusing integration checks: set ${setting} only after verifying the target resources.`);
  }
}

if (process.env.VERCEL_ENV === 'production') {
  throw new Error('Refusing integration checks in a production Vercel environment.');
}

const forbiddenCredentialNames = [
  'VERCEL_TOKEN', 'BLOB_READ_WRITE_TOKEN', 'GOOGLE_OAUTH_CLIENT_SECRET',
  'ATTENDANCE_SYNC_TOKEN', 'CRON_SECRET', 'COACH_USERNAME', 'COACH_PASSWORD',
  'COACH_SESSION_SECRET',
];
const presentCredentials = forbiddenCredentialNames.filter(name => process.env[name]);
if (presentCredentials.length) {
  throw new Error(`Refusing integration checks with application or deployment credentials present: ${presentCredentials.join(', ')}`);
}

function target(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Refusing integration checks: ${name} must be explicitly configured.`);
  const url = new URL(value);
  const productionHosts = new Set(['crew.rtpny.com', 'sbu-crew-coach.vercel.app', 'www.rtpny.com']);
  if (productionHosts.has(url.hostname.toLowerCase())) {
    throw new Error(`Refusing integration checks against a production host: ${url.hostname}`);
  }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error(`${name} must use HTTP or HTTPS.`);
  return url.origin;
}

const base = target('TEST_BASE_URL');
const publicBase = target('TEST_PUBLIC_BASE_URL');

async function get(url) {
  const response = await fetch(url, { redirect: 'manual' });
  return { response, text: await response.text() };
}

for (const [url, label] of [
  [`${base}/athlete.html`, 'athlete app shell'],
  [`${base}/`, 'coach app shell'],
  [`${publicBase}/`, 'configured public-site shell'],
]) {
  const { response } = await get(url);
  assert.equal(response.status, 200, `${label} should return 200`);
  console.log(`PASS ${label}`);
}

const athlete = await get(`${base}/api/console?view=athlete`);
assert.equal(athlete.response.status, 200, 'approved public athlete feed should be accessible anonymously');
const athleteData = JSON.parse(athlete.text);
assert.ok(athleteData.date, 'athlete feed should include a local date');
assert.ok('session' in athleteData, 'athlete feed should include an exact-date session state');
console.log('PASS public athlete feed contract');

const privateRead = await get(`${base}/api/console`);
assert.ok([401, 403].includes(privateRead.response.status), 'anonymous coach record read must be denied');
console.log('PASS anonymous coach record denied');

for (const action of ['draft', 'publish', 'update-session']) {
  const response = await fetch(`${base}/api/console`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action, date: '2099-01-01', values: {}, plan: {}, seasons: {}, content: {} }),
    redirect: 'manual',
  });
  assert.ok([401, 403].includes(response.status), `anonymous ${action} must be denied`);
  console.log(`PASS anonymous ${action} denied`);
}

for (const path of ['/training-plan.json', '/spring-plan.json']) {
  const { response } = await get(`${base}${path}`);
  assert.equal(response.status, 404, `${path} should not be publicly reachable`);
  console.log(`PASS private schedule boundary ${path}`);
}

console.log('Isolated integration checks passed.');
