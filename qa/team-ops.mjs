import assert from 'node:assert/strict';
import fs from 'node:fs';

const index=fs.readFileSync('index.html','utf8');
const app=fs.readFileSync('app.js','utf8');
const consoleJs=fs.readFileSync('console.js','utf8');
const api=fs.readFileSync('api/console.js','utf8');
const attendanceApi=fs.readFileSync('api/attendance-sync.js','utf8');
const config=fs.readFileSync('js/config.js','utf8');
const teamView=fs.readFileSync('js/views/team.js','utf8');
const weather=fs.readFileSync('js/weather.js','utf8');
const practice=fs.readFileSync('js/views/practice.js','utf8');
const planning=fs.readFileSync('js/views/planning.js','utf8');

for(const target of ['today','tomorrow','team','lineups','season','plan','resources']){
  assert.match(index,new RegExp(`data-v="${target}"`),`navigation should include ${target}`);
}

for(const key of ['attendance','semesterSchedule','dailyTrainingPlan','seasonTrainingArc']){
  assert.match(app,new RegExp(key),`app should know ${key} source slot`);
  assert.match(consoleJs,new RegExp(key),`console should configure ${key} source slot`);
}

assert.match(config,/novicePracticeMinimum:\s*11/,'default novice eligibility should require 11 practices');
assert.match(config,/attendanceWarningMisses:\s*2/,'attendance warning should default to 2 missed practices');
assert.match(config,/attendanceCriticalMisses:\s*3/,'attendance critical flag should default to 3 missed practices');
assert.match(teamView,/Cox',\s*'8',\s*'7',\s*'6',\s*'5',\s*'4',\s*'3',\s*'2',\s*'Bow/,'8+ lineup seat order should be present');
assert.match(api,/teamOps:\s*body\.teamOps\s*\|\|\s*\{\}/,'coach API should preserve private Team Ops data');
assert.match(api,/action === 'update-session'/,'coach API should support narrow Daily Plan session edits');
assert.match(api,/content:\s*data\.content,\s*controls:\s*data\.controls\s*\|\|\s*\{\}/,'published public view should remain filtered');
assert.match(attendanceApi,/ATTENDANCE_SYNC_TOKEN/,'attendance sync should require the private sync token');
assert.match(attendanceApi,/normalizeRows/,'attendance sync should normalize student sheet rows');
assert.match(weather,/WIND_LIMITS/,'weather should use rowing wind thresholds');
assert.match(weather,/tone:\s*'favorable'/,'weather should expose favorable status color');
assert.match(weather,/tone:\s*'poor'/,'weather should expose poor status color');
assert.doesNotMatch(practice,/NOVICE PLAN/,'Today card should not render a separate novice plan');
assert.doesNotMatch(practice,/VARSITY PLAN/,'Today card should not render a separate varsity plan');
assert.doesNotMatch(practice,/LAND FALLBACK/,'Today card should not render a separate land fallback');
assert.match(practice,/data-session-field="workout"/,'Today card should edit the shared workout field');
assert.match(planning,/data-session-field="workout"/,'Plans view should edit the shared workout field');

console.log('PASS Team Ops static contract');
