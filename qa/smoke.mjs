import assert from 'node:assert/strict';

const base='https://crew.rtpny.com';
const publicBase='https://www.rtpny.com';

async function get(url){
  const response=await fetch(url,{redirect:'manual'});
  return {response,text:await response.text()};
}

const checks=[
  [`${publicBase}/`,'public homepage'],
  [`${publicBase}/regattas.html`,'regatta hub'],
  [`${publicBase}/regatta-nys-2026.html`,'regatta event page'],
  [`${base}/athlete.html`,'athlete app'],
  [`${base}/`,'coach app shell'],
];

for(const [url,label] of checks){
  const {response}=await get(url);
  assert.equal(response.status,200,`${label} should return 200`);
  console.log(`PASS ${label}`);
}

const athlete=await get(`${base}/api/console?view=athlete`);
assert.equal(athlete.response.status,200,'athlete feed should be public');
const athleteData=JSON.parse(athlete.text);
assert.ok(athleteData.date,'athlete feed should include a local date');
assert.ok('session' in athleteData,'athlete feed should include an exact-date session state');
console.log('PASS athlete feed contract');

for(const path of ['/training-plan.json','/spring-plan.json']){
  const {response}=await get(base+path);
  assert.equal(response.status,404,`${path} should not be publicly reachable`);
  console.log(`PASS private schedule boundary ${path}`);
}

const unauth=await get(`${base}/api/console?qa=unauthenticated`);
assert.equal(unauth.response.status,401,'coach API should reject unauthenticated reads');
console.log('PASS coach API authentication boundary');

console.log('All smoke checks passed.');
