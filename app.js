async function boot(){
  const gate=document.getElementById('access-gate');
  const view=document.getElementById('view');
  const nav=document.querySelector('nav');
  const access=await fetch('/api/console',{credentials:'same-origin'});
  if(!access.ok){
    gate.hidden=false;
    document.getElementById('access-form').onsubmit=async e=>{
      e.preventDefault();
      const code=new FormData(e.target).get('code');
      const r=await fetch('/api/console',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({action:'login',code})});
      if(r.ok)location.reload();
      else document.getElementById('access-error').textContent='That code was not accepted.';
    };
    return;
  }
  gate.hidden=true;
  view.hidden=false;
  nav.hidden=false;
  window.__coachData=await access.json();
}

boot().then(()=>{
const PUBLIC='https://www.rtpny.com';
const MANIFEST=PUBLIC+'/content.json';
const central=window.__coachData||{};
const fallback=[['New Rower & Athlete Guide','First days, preparation, commands, expectations','athletes'],['Coaching Resources','Sequence, posture, recovery, connection, benchmarks','coaching'],['Regatta Hub','Race-day, travel, equipment, and family logistics','regattas'],['Parent Guide','What to expect, costs, forms, and support','parents'],['Safety & Equipment','Team movement, commands, fleet care, and readiness','safety'],['About the Program','Recruiting, alumni, leadership, and support','about']];
const defaultTeamOps={
  sources:{attendance:{title:'Attendance',kind:'attendance'},semesterSchedule:{title:'Semester Schedule',kind:'semesterSchedule'},dailyTrainingPlan:{title:'Daily Training Plan',kind:'dailyTrainingPlan'},seasonTrainingArc:{title:'Annual / Season Training Arc',kind:'seasonTrainingArc'}},
  eligibilityRules:{novicePracticeMinimum:11,attendanceWarningMisses:2,attendanceCriticalMisses:3,formsRequired:true,safetyRequired:true},
  attendance:{athletes:[],practiceDates:[]},
  trainingPlan:{sessions:[]},
  seasonArc:{seasons:[]},
  lineups:{drafts:[]}
};
let teamOps=mergeTeamOps(defaultTeamOps,central.teamOps||{});
let plans=[];
let selectedSeason='Fall 2026';
let seasonPlans={};
let manifest={resources:fallback.map(x=>({title:x[0],summary:x[1],path:'#'+x[2]}))};
let active='today';
let weatherRequest=0;

function mergeTeamOps(base,next){
  return {...base,...next,sources:{...base.sources,...(next.sources||{})},eligibilityRules:{...base.eligibilityRules,...(next.eligibilityRules||{})},attendance:{...base.attendance,...(next.attendance||{})},trainingPlan:{...base.trainingPlan,...(next.trainingPlan||{})},seasonArc:{...base.seasonArc,...(next.seasonArc||{})},lineups:{...base.lineups,...(next.lineups||{})}};
}
function normalize(items){return (items||[]).map(s=>[s.date,s.title,(s.workout||'')+' '+(s.land||''),s.intent,s.sessionType||'land',s.releaseTimes||{water:'05:00',land:'06:01'},s])}
function hydratePlans(){
  // The phone dashboard renders only a trusted cached snapshot from the private
  // planning source. Repository-era sessions are intentionally not used as live
  // training data: the Drive workbook is the editing source of truth.
  const driveSessions=normalize(teamOps.trainingPlan?.sessions);
  if(driveSessions.length){
    plans=driveSessions;
    seasonPlans[selectedSeason]=driveSessions;
    return;
  }
  plans=[];
  seasonPlans={};
}
hydratePlans();

function nyDate(){return new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York'}).format(new Date())}
function current(){const d=nyDate();return plans.find(x=>x[0]===d)||null}
function nextScheduled(){const d=nyDate();return plans.find(x=>x[0]>d)||null}
function esc(v){return String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
function escAttr(v){return esc(v).replace(/"/g,'&quot;')}
function noteKey(date){return 'sbu-crew-coach-note-'+date}
function notes(date){return localStorage.getItem(noteKey(date))||''}
function resourceHref(x){return x.href||(x.path&&/^https?:/i.test(x.path)?x.path:PUBLIC+'/'+String(x.path||'').replace(/^\//,''))}
function formatDate(v){if(!v)return 'Unknown';const d=new Date(v+'T12:00:00');return Number.isNaN(d.getTime())?String(v):d.toLocaleDateString(undefined,{month:'short',day:'numeric'})}
function formatDateTime(v){const d=new Date(v);return Number.isNaN(d.getTime())?String(v):d.toLocaleString()}
function known(v){return v===true?'Complete':v===false?'Missing':'Unknown'}
function planField(session,key,legacy=''){return session?.[6]?.custom?.[key]||session?.[6]?.[key]||legacy||''}
function sourceReady(key){const s=teamOps.sources?.[key];return s&&s.status==='connected'&&s.href}
function sourceLink(key,label='Open source'){const s=teamOps.sources?.[key]||{};return s.href?'<a class="source-link" href="'+escAttr(s.href)+'" target="_blank" rel="noopener">'+label+'</a>':'<span class="small">Source not configured yet.</span>'}
function sourceMeta(key){const s=teamOps.sources?.[key]||{};return '<div class="source-meta"><span class="pill '+(s.status==='connected'?'good':'')+'">'+(s.status==='connected'?'Connected':'Not connected')+'</span>'+(s.lastReadAt?'<span class="small">Last read '+esc(formatDateTime(s.lastReadAt))+'</span>':'')+'</div>'}
function scheduledPracticeDates(){const dates=(teamOps.attendance?.practiceDates||[]).filter(Boolean).sort();return dates.length?dates:plans.map(x=>x[0]).filter(Boolean).sort()}
function normalizeAthlete(raw){
  const levelText=String(raw.level||raw.squad||raw.group||'').toLowerCase();
  const attendedDates=(raw.attendedDates||raw.practiceDates||[]).filter(Boolean).sort();
  return {...raw,name:raw.name||raw.athleteName||raw.athlete||'Unnamed athlete',level:levelText.includes('novice')?'novice':levelText.includes('varsity')?'varsity':'unknown',role:raw.role||raw.side||raw.preference||'unknown',totalPracticesAttended:Number(raw.totalPracticesAttended??raw.totalPractices??raw.attendanceCount??attendedDates.length)||0,lastAttendedPractice:raw.lastAttendedPractice||raw.lastAttendedDate||attendedDates.at(-1)||'',attendedDates,formsStatus:raw.formsStatus,safetyStatus:raw.safetyStatus,available:raw.available!==false};
}
function missedConsecutive(athlete){
  const dates=scheduledPracticeDates().filter(d=>d<=nyDate());
  if(!dates.length||!athlete.attendedDates?.length)return {count:0,confidence:'unknown'};
  const attended=new Set(athlete.attendedDates);
  let count=0;
  for(let i=dates.length-1;i>=0;i--){if(attended.has(dates[i]))break;count++}
  return {count,confidence:'scheduled'};
}
function eligibility(athlete){
  const rules=teamOps.eligibilityRules||defaultTeamOps.eligibilityRules;
  const blockers=[];
  if(athlete.formsStatus===false&&rules.formsRequired)blockers.push('forms');
  if(athlete.safetyStatus===false&&rules.safetyRequired)blockers.push('safety');
  if(athlete.level==='novice'&&athlete.totalPracticesAttended<Number(rules.novicePracticeMinimum||11))blockers.push('attendance');
  if(athlete.formsStatus==null||athlete.safetyStatus==null)blockers.push('review');
  if(blockers.includes('forms'))return {status:'Not eligible - forms',tone:'bad',blockers};
  if(blockers.includes('safety'))return {status:'Not eligible - safety',tone:'bad',blockers};
  if(blockers.includes('attendance'))return {status:'Not eligible - attendance',tone:'warn',blockers};
  if(blockers.includes('review'))return {status:'Needs review',tone:'review',blockers};
  return {status:'Eligible',tone:'good',blockers};
}
function attendanceWarning(athlete){
  const rules=teamOps.eligibilityRules||defaultTeamOps.eligibilityRules;
  const missed=missedConsecutive(athlete);
  if(missed.confidence==='unknown')return {level:'unknown',label:'Pattern unknown',missed:0};
  if(missed.count>=Number(rules.attendanceCriticalMisses||3))return {level:'critical',label:missed.count+' missed practices',missed:missed.count};
  if(missed.count>=Number(rules.attendanceWarningMisses||2))return {level:'warning',label:missed.count+' missed practices',missed:missed.count};
  return {level:'ok',label:'Current',missed:missed.count};
}
function athletes(){return (teamOps.attendance?.athletes||[]).map(normalizeAthlete)}
function teamSummary(){
  const list=athletes(),rules=teamOps.eligibilityRules||defaultTeamOps.eligibilityRules;
  return {active:list.length,concerns:list.filter(a=>['warning','critical'].includes(attendanceWarning(a).level)).length,eligibilityIssues:list.filter(a=>['bad','warn'].includes(eligibility(a).tone)).length,near:list.filter(a=>a.level==='novice'&&a.totalPracticesAttended<rules.novicePracticeMinimum&&a.totalPracticesAttended>=rules.novicePracticeMinimum-2).length};
}
function teamStatusCard(){
  const s=teamSummary();
  return '<section class="card team-status"><div class="ey">TEAM STATUS</div><div class="mini-grid"><div><b>'+s.active+'</b><span>Athletes tracked</span></div><div class="'+(s.concerns?'flag':'')+'"><b>'+s.concerns+'</b><span>Attendance concerns</span></div><div class="'+(s.eligibilityIssues?'flag':'')+'"><b>'+s.eligibilityIssues+'</b><span>Eligibility issues</span></div><div><b>'+s.near+'</b><span>Novices close</span></div></div><button class="secondary" data-jump="team">Review team</button></section>';
}
function card(p){
  if(!p)return '<section class="card"><div class="ey">NO SESSION DATA</div><div class="title">Training plan not available.</div><p>Connect the Daily Training Plan source or publish sessions from the coach console.</p></section>';
  const message=planField(p,'todayMessage',p[3]),novice=planField(p,'novicePlan'),varsity=planField(p,'varsityPlan'),fallbackPlan=planField(p,'landFallback',p[6]?.land),cues=planField(p,'coachingCues',p[6]?.cue);
  return '<section class="card"><div class="ey">'+esc(p[0])+'</div><div class="title">'+esc(p[1])+'</div><span class="pill">'+esc(p[4]||'land').toUpperCase()+'</span>'+(sourceReady('dailyTrainingPlan')?'<div class="inline-source">'+sourceLink('dailyTrainingPlan','Open Daily Training Plan')+'</div>':'')+'<div class="section"><h3>TODAY’S MESSAGE</h3><p>'+esc(message||'No message entered yet.')+'</p></div><div class="section split"><div><h3>NOVICE PLAN</h3><p>'+esc(novice||'Not specified.')+'</p></div><div><h3>VARSITY PLAN</h3><p>'+esc(varsity||'Not specified.')+'</p></div></div><div class="section"><h3>WORKOUT</h3><p>'+esc(p[2]||'Not specified.')+'</p></div><div class="section"><h3>LAND FALLBACK</h3><p>'+esc(fallbackPlan||'Not specified.')+'</p></div><div class="section"><h3>TECHNICAL FOCUS</h3><p>'+esc(planField(p,'technicalFocus',p[3])||'Not specified.')+'</p></div><div class="section"><h3>COACHING CUES</h3><p>'+esc(cues||'Not specified.')+'</p></div><div class="section split"><div><h3>SUCCESS</h3><p>'+esc(planField(p,'successCriteria')||'Not specified.')+'</p></div><div><h3>INTENSITY</h3><p>'+esc(planField(p,'intensity')||'Not specified.')+'</p></div></div><div class="section"><h3>COACH NOTES</h3><textarea class="note" id="notes-'+escAttr(p[0])+'" placeholder="Capture the adjustment you want to carry forward…">'+esc(notes(p[0]))+'</textarea><button class="save" id="save-'+escAttr(p[0])+'">Save note</button></div></section>';
}
function renderTeam(){
  const sorted=[...athletes()].sort((a,b)=>{const rank={critical:0,warning:1,unknown:2,ok:3};return rank[attendanceWarning(a).level]-rank[attendanceWarning(b).level]||eligibility(a).tone.localeCompare(eligibility(b).tone)||a.name.localeCompare(b.name)});
  return '<section class="card"><div class="ey">TEAM OPS</div><div class="title">Team</div><p>Attendance and eligibility are normalized from the configured source. Unknown fields stay visible so the app never invents roster facts.</p>'+sourceMeta('attendance')+sourceLink('attendance','Open Attendance')+'</section>'+teamStatusCard()+'<section class="card"><div class="ey">EXCEPTIONS FIRST</div><div class="athlete-list">'+(sorted.length?sorted.map(a=>{const e=eligibility(a),w=attendanceWarning(a);return '<article class="athlete '+w.level+'"><div><strong>'+esc(a.name)+'</strong><span>'+esc(a.level==='unknown'?'level unknown':a.level)+' · '+esc(a.role==='unknown'?'role unknown':a.role)+'</span></div><div class="athlete-meta"><span class="pill '+e.tone+'">'+esc(e.status)+'</span><span class="pill '+w.level+'">'+esc(w.label)+'</span></div><dl><div><dt>Practices</dt><dd>'+esc(a.totalPracticesAttended)+'</dd></div><div><dt>Last seen</dt><dd>'+esc(formatDate(a.lastAttendedPractice))+'</dd></div><div><dt>Forms</dt><dd>'+esc(known(a.formsStatus))+'</dd></div><div><dt>Safety</dt><dd>'+esc(known(a.safetyStatus))+'</dd></div></dl></article>'}).join(''):'<p class="small">No athletes are cached yet. Configure the Attendance source in the console, then import or sync source rows when available.</p>')+'</div></section>';
}
function renderLineups(){
  const drafts=teamOps.lineups?.drafts||[],seats=['Cox','8','7','6','5','4','3','2','Bow'],draft=drafts[0]||{name:'New 8+ draft',boatClass:'8+',seats:{}};
  return '<section class="card"><div class="ey">LINEUPS</div><div class="title">Lineup drafts</div><p>Foundation only: the app can structure boat classes, seats, eligibility warnings, availability, preferences, and notes while the coach makes the decisions.</p></section><section class="card"><div class="lineup-head"><div><h3>'+esc(draft.name)+'</h3><span class="pill">'+esc(draft.boatClass||'8+')+'</span></div><button class="secondary" disabled>Save draft enabled in console</button></div><div class="seat-grid">'+seats.map(seat=>{const value=draft.seats?.[seat];return '<div class="seat"><span>'+esc(seat)+'</span><strong>'+(value?esc(value):'Open')+'</strong></div>'}).join('')+'</div><div class="section"><h3>ATHLETE PICKER FOUNDATION</h3><p class="small">Next step: tap or drag athletes into these slots with eligible/ineligible and available/unavailable warnings from Team Ops.</p></div></section>';
}
function renderSeason(){
  const arc=teamOps.seasonArc?.seasons||[];
  const snapshot=plans.length?plans.map(x=>'<section class="card"><div class="ey">'+esc(x[0])+'</div><div class="title" style="font-size:20px">'+esc(x[1])+'</div><p class="small">'+esc(x[3])+'</p></section>').join(''):'<section class="card"><div class="ey">WAITING FOR PLAN SNAPSHOT</div><div class="title">No daily plan is synced yet.</div><p>Open the private planning workbook to edit. The dashboard will use a reviewed snapshot after the source connection is enabled.</p>'+sourceLink('dailyTrainingPlan','Open Planning Workbook')+'</section>';
  return '<section class="card"><div class="ey">SEASON ARC</div><div class="title">'+esc(selectedSeason)+'</div><p>Season/annual planning stays in Drive with year-specific copies and historical coach notes.</p>'+sourceMeta('seasonTrainingArc')+sourceLink('seasonTrainingArc','Open Season Arc')+'</section>'+(arc.length?arc.map(x=>'<section class="card"><div class="ey">'+esc(x.year||x.season||'Season')+'</div><div class="title" style="font-size:20px">'+esc(x.title||'Training arc')+'</div><p>'+esc(x.summary||'No summary entered.')+'</p></section>').join(''):snapshot);
}
function renderPlan(){
  const sessions=plans.length?plans.map(x=>'<details class="section"><summary><b>'+esc(x[0])+' · '+esc(x[1])+'</b></summary><p>'+esc(x[2])+'</p><small>'+esc(x[3])+'</small></details>').join(''):'<p class="small">No reviewed planning snapshot is available in the dashboard yet. The Drive workbook is still available from the source link above.</p>';
  return '<section class="card"><div class="ey">DAILY TRAINING PLAN</div><div class="title">Plan</div><p>Drive is the editing surface; the dashboard only renders a reviewed private snapshot.</p>'+sourceMeta('dailyTrainingPlan')+sourceLink('dailyTrainingPlan','Open Daily Training Plan')+'</section><section class="card">'+sessions+'</section>';
}
function renderResources(){
  return '<section class="card"><div class="ey">TEAM SOURCES</div><div class="title">Resources</div><p>Configured source shortcuts plus curated public guidance.</p>'+['attendance','semesterSchedule','dailyTrainingPlan','seasonTrainingArc'].map(k=>'<div class="resource source-resource"><strong>'+esc(teamOps.sources?.[k]?.title||k)+'</strong><span>'+esc(teamOps.sources?.[k]?.status==='connected'?'Configured':'Not configured')+'</span>'+sourceLink(k,'Open')+'</div>').join('')+manifest.resources.map(x=>'<a class="resource" href="'+escAttr(resourceHref(x))+'" target="_blank" rel="noopener"><i>↗</i><strong>'+esc(x.title)+'</strong><span>'+esc(x.summary)+'</span></a>').join('')+'</section>';
}
function render(v=active){
  active=v;
  const seasonPicker=(v==='season'||v==='plan')&&Object.keys(seasonPlans).length?'<div class="section"><label for="season-choice"><h3>SEASON</h3></label><select id="season-choice" class="season-choice">'+Object.keys(seasonPlans).map(k=>'<option>'+esc(k)+'</option>').join('')+'</select></div>':'';
  const today=current(),next=nextScheduled(),i=today?plans.findIndex(x=>x[0]===today[0]):-1,p=v==='tomorrow'?plans[i>=0?Math.min(i+1,plans.length-1):0]:today;
  const emptyToday='<section class="card"><div class="ey">NO ORGANIZED PRACTICE</div><div class="title">No scheduled workout today.</div><p>'+(next?'Next scheduled: '+esc(next[0])+' · '+esc(next[1])+'.':'Check the annual schedule or coach notice for the next session.')+'</p></section>';
  const h=v==='today'&&!p?teamStatusCard()+emptyToday:v==='today'?teamStatusCard()+card(p):v==='tomorrow'?card(p):v==='team'?renderTeam():v==='lineups'?renderLineups():v==='season'?renderSeason():v==='plan'?renderPlan():renderResources();
  document.getElementById('view').innerHTML=seasonPicker+h;
  const seasonChoice=document.getElementById('season-choice');
  if(seasonChoice){seasonChoice.value=selectedSeason;seasonChoice.onchange=()=>{selectedSeason=seasonChoice.value;plans=seasonPlans[selectedSeason]||plans;render(active)}}
  document.querySelectorAll('nav button').forEach(b=>{const isActive=b.dataset.v===v;b.classList.toggle('active',isActive);b.setAttribute('aria-pressed',String(isActive))});
  document.querySelectorAll('[data-jump]').forEach(b=>b.onclick=()=>render(b.dataset.jump));
  const s=document.getElementById('save-'+(p&&p[0]));
  if(s)s.onclick=()=>{localStorage.setItem(noteKey(p[0]),document.getElementById('notes-'+p[0]).value);s.textContent='Saved';setTimeout(()=>s.textContent='Save note',1200)};
  weatherRequest++;
  document.querySelectorAll('#view .weather').forEach(e=>e.remove());
  if(v==='today'||v==='tomorrow')weather(v,weatherRequest);
}
async function weather(v,request){
  try{
    const q=(await fetch('https://api.open-meteo.com/v1/forecast?latitude=40.9465&longitude=-73.0693&current=temperature_2m,wind_speed_10m,wind_gusts_10m,wind_direction_10m&wind_speed_unit=kn&temperature_unit=fahrenheit&timezone=America%2FNew_York').then(r=>r.json())).current;
    if(request!==weatherRequest||active!==v)return;
    const d=['N','NE','E','SE','S','SW','W','NW'][Math.round(q.wind_direction_10m/45)%8],e=document.createElement('section');
    document.querySelectorAll('#view .weather').forEach(x=>x.remove());
    e.className='card weather';
    e.innerHTML='<div class="ey">PORT JEFFERSON HARBOR · '+(v==='today'?'TODAY':'TOMORROW')+'</div><div class="status">FORECAST ONLY</div><div class="metrics"><div class="metric"><b>'+Math.round(q.wind_speed_10m)+' kt</b><span>WIND</span></div><div class="metric"><b>'+Math.round(q.wind_gusts_10m)+' kt</b><span>GUST</span></div><div class="metric"><b>'+Math.round(q.temperature_2m)+'°</b><span>AIR</span></div><div class="metric"><b>'+d+'</b><span>DIRECTION</span></div></div>';
    document.getElementById('view').prepend(e);
  }catch(e){}
}
document.querySelectorAll('nav button').forEach(b=>b.onclick=()=>render(b.dataset.v));
document.querySelector('.edit').onclick=()=>{render('today');document.querySelector('.note')?.focus()};
render();
fetch(MANIFEST).then(r=>r.json()).then(x=>{if(x.resources?.length){manifest=x;render(active)}}).catch(()=>{});
if('serviceWorker' in navigator)navigator.serviceWorker.register('/sw.js');
});
