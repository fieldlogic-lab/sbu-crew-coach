import assert from 'node:assert/strict';
import fs from 'node:fs';

const index=fs.readFileSync('index.html','utf8');
const app=fs.readFileSync('app.js','utf8');
const consoleJs=fs.readFileSync('console.js','utf8');
const api=fs.readFileSync('api/console.js','utf8');

for(const target of ['today','tomorrow','team','lineups','season','plan','resources']){
  assert.match(index,new RegExp(`data-v="${target}"`),`navigation should include ${target}`);
}

for(const key of ['attendance','semesterSchedule','dailyTrainingPlan','seasonTrainingArc']){
  assert.match(app,new RegExp(key),`app should know ${key} source slot`);
  assert.match(consoleJs,new RegExp(key),`console should configure ${key} source slot`);
}

assert.match(app,/novicePracticeMinimum:11/,'default novice eligibility should require 11 practices');
assert.match(app,/attendanceWarningMisses:2/,'attendance warning should default to 2 missed practices');
assert.match(app,/attendanceCriticalMisses:3/,'attendance critical flag should default to 3 missed practices');
assert.match(app,/Cox','8','7','6','5','4','3','2','Bow/,'8+ lineup seat order should be present');
assert.match(api,/teamOps:body\.teamOps\|\|\{\}/,'coach API should preserve private Team Ops data');
assert.match(api,/return data\?json\(res,200,\{content:data\.content,controls:data\.controls\|\|\{\}\}\)/,'published public view should remain filtered');

console.log('PASS Team Ops static contract');
