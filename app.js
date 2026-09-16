import { APP, DEFAULT_TEAM_OPS, RESOURCE_FALLBACKS } from '/js/config.js';
import { getLiveConditions } from '/js/weather.js';
import { athletesFrom, attendanceWarningFor, eligibilityFor, mergeTeamOps, scheduledPracticeDates as sourcePracticeDates, teamSummaryFor } from '/js/team-ops.js';
import { renderLineupsView, renderTeamStatus, renderTeamView } from '/js/views/team.js';
import { renderNoPractice, renderSessionCard } from '/js/views/practice.js';
import { renderPlanView, renderSeasonView } from '/js/views/planning.js';

async function boot(){
  const access=await fetch('/api/console',{credentials:'same-origin'});
  window.__coachData=access.ok?await access.json():{};
}

boot().then(()=>{
const PUBLIC=APP.publicSite;
const MANIFEST=PUBLIC+'/content.json';
const central=window.__coachData||{};
const fallback=RESOURCE_FALLBACKS;
const defaultTeamOps=DEFAULT_TEAM_OPS;
let teamOps=mergeTeamOps(defaultTeamOps,central.teamOps||{});
let plans=[];
let selectedSeason=APP.defaultSeason;
let seasonPlans={};
let manifest={resources:fallback.map(x=>({title:x[0],summary:x[1],path:'#'+x[2]}))};
let active='today';
let weatherRequest=0;

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
function scheduledPracticeDates(){ return sourcePracticeDates(teamOps, plans) }
function eligibility(athlete){ return eligibilityFor(athlete, teamOps) }
function attendanceWarning(athlete){ return attendanceWarningFor(athlete, teamOps, plans, nyDate()) }
function athletes(){ return athletesFrom(teamOps) }
function teamSummary(){ return teamSummaryFor(teamOps, plans, nyDate()) }
function teamStatusCard(){ return renderTeamStatus(teamSummary()) }
function card(session){
  return renderSessionCard(session, { esc, escAttr, planField, sourceReady, sourceLink, notes });
}
function renderTeam(){
  return renderTeamView({
    athletes: athletes(),
    eligibilityFor: eligibility,
    attendanceWarningFor: attendanceWarning,
    esc,
    sourceMeta,
    sourceLink,
    teamStatus: teamStatusCard(),
  });
}
function renderLineups(){
  return renderLineupsView({ drafts: teamOps.lineups?.drafts || [], esc });
}
function renderSeason(){
  return renderSeasonView({
    arc: teamOps.seasonArc?.seasons || [],
    selectedSeason,
    plans,
    esc,
    sourceMeta,
    sourceLink,
  });
}
function renderPlan(){
  return renderPlanView({ plans, esc, sourceMeta, sourceLink });
}
function renderResources(){
  return '<section class="card"><div class="ey">TEAM SOURCES</div><div class="title">Resources</div><p>Configured source shortcuts plus curated public guidance.</p>'+['attendance','semesterSchedule','dailyTrainingPlan','seasonTrainingArc'].map(k=>'<div class="resource source-resource"><strong>'+esc(teamOps.sources?.[k]?.title||k)+'</strong><span>'+esc(teamOps.sources?.[k]?.status==='connected'?'Configured':'Not configured')+'</span>'+sourceLink(k,'Open')+'</div>').join('')+manifest.resources.map(x=>'<a class="resource" href="'+escAttr(resourceHref(x))+'" target="_blank" rel="noopener"><i>↗</i><strong>'+esc(x.title)+'</strong><span>'+esc(x.summary)+'</span></a>').join('')+'</section>';
}
function render(v=active){
  active=v;
  const seasonPicker=(v==='season'||v==='plan')&&Object.keys(seasonPlans).length?'<div class="section"><label for="season-choice"><h3>SEASON</h3></label><select id="season-choice" class="season-choice">'+Object.keys(seasonPlans).map(k=>'<option>'+esc(k)+'</option>').join('')+'</select></div>':'';
  const today=current(),next=nextScheduled(),i=today?plans.findIndex(x=>x[0]===today[0]):-1,p=v==='tomorrow'?plans[i>=0?Math.min(i+1,plans.length-1):0]:today;
  const emptyToday=renderNoPractice({ next, esc });
  const h=v==='today'&&!p?emptyToday+teamStatusCard():v==='today'?card(p)+teamStatusCard():v==='tomorrow'?card(p):v==='team'?renderTeam():v==='lineups'?renderLineups():v==='season'?renderSeason():v==='plan'?renderPlan():renderResources();
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
async function weather(v, request) {
  try {
    const conditions = await getLiveConditions();
    if (request !== weatherRequest || active !== v) return;

    const marine = conditions.marine?.periods?.length
      ? '<div class="marine-forecast"><div class="marine-head"><span>' + esc(conditions.marine.eyebrow) + '</span><a href="' + escAttr(conditions.marine.sourceHref) + '" target="_blank" rel="noopener">NOAA ↗</a></div><div class="marine-periods">'
        + conditions.marine.periods.map(period => '<div class="marine-period"><strong>' + esc(period.name) + '</strong><span>' + esc(period.text) + '</span></div>').join('')
        + '</div></div>'
      : '';

    const card = document.createElement('section');
    card.className = 'card weather';
    card.innerHTML = '<div class="ey">' + esc(conditions.eyebrow) + '</div>'
      + '<div class="status">' + esc(conditions.status) + '</div>'
      + '<div class="metrics">' + conditions.metrics.map(metric =>
        '<div class="metric"><b>' + esc(metric.value) + '</b><span>' + esc(metric.label) + '</span></div>'
      ).join('') + '</div>'
      + marine
      + '<p class="small">' + esc(conditions.disclaimer) + '</p>'
      + '<a class="source-link" href="' + escAttr(conditions.sourceHref) + '" target="_blank" rel="noopener">'
      + esc(conditions.sourceLabel) + '</a>';
    document.getElementById('view').prepend(card);
  } catch {
    // No card is safer than a stale or invented weather condition.
  }
}
document.querySelectorAll('nav button').forEach(b=>b.onclick=()=>render(b.dataset.v));
document.querySelector('.edit').onclick=()=>{render('today');document.querySelector('.note')?.focus()};
render();
fetch(MANIFEST).then(r=>r.json()).then(x=>{if(x.resources?.length){manifest=x;render(active)}}).catch(()=>{});
if('serviceWorker' in navigator)navigator.serviceWorker.register('/sw.js');
});
