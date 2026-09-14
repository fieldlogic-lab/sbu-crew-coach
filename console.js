const PUBLIC='https://www.rtpny.com';
const sourceLabels={attendance:'Attendance',semesterSchedule:'Semester Schedule',dailyTrainingPlan:'Daily Training Plan',seasonTrainingArc:'Annual / Season Training Arc'};
const sourceKinds=Object.keys(sourceLabels);
const defaultTeamOps={
  sources:Object.fromEntries(sourceKinds.map(k=>[k,{kind:k,title:sourceLabels[k],href:'',status:'not_configured',lastReadAt:''}])),
  eligibilityRules:{novicePracticeMinimum:11,attendanceWarningMisses:2,attendanceCriticalMisses:3,formsRequired:true,safetyRequired:true},
  attendance:{athletes:[],practiceDates:[]},
  trainingPlan:{sessions:[]},
  seasonArc:{seasons:[]},
  lineups:{drafts:[]}
};
const state={plan:{season:'Fall 2026',phases:[],sessions:[]},seasons:{},content:{resources:[]},controls:{},teamOps:structuredClone(defaultTeamOps),history:[],dirty:false};
let authCode='';
const $=s=>document.querySelector(s);

function setStatus(t){$('#save-state').textContent=t}
function setDirty(){state.dirty=true;setStatus('Unsaved changes')}
function esc(v){return String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
function mergeTeamOps(next={}){
  return {...defaultTeamOps,...next,sources:{...defaultTeamOps.sources,...(next.sources||{})},eligibilityRules:{...defaultTeamOps.eligibilityRules,...(next.eligibilityRules||{})},attendance:{...defaultTeamOps.attendance,...(next.attendance||{})},trainingPlan:{...defaultTeamOps.trainingPlan,...(next.trainingPlan||{})},seasonArc:{...defaultTeamOps.seasonArc,...(next.seasonArc||{})},lineups:{...defaultTeamOps.lineups,...(next.lineups||{})}};
}
function bind(el,obj){
  el.querySelectorAll('[data-key]').forEach(input=>{
    const key=input.dataset.key;
    if(key==='custom')input.value=JSON.stringify(obj.custom||{},null,2);
    else input.value=obj[key]||(key==='practiceStatus'?'forecast':'');
    input.addEventListener('input',()=>{
      if(key==='custom'){try{obj.custom=JSON.parse(input.value||'{}')}catch{}}
      else obj[key]=input.value;
      setDirty();
    });
  });
}
function renderSessions(){
  const host=$('#sessions');
  host.innerHTML='';
  state.plan.sessions.forEach((s,i)=>{
    const node=$('#session-template').content.cloneNode(true),card=node.querySelector('.session-card');
    bind(card,s);
    card.querySelector('.remove').onclick=()=>{state.plan.sessions.splice(i,1);renderSessions();setDirty()};
    host.append(card);
  });
  $('#session-count').textContent=state.plan.sessions.length;
}
function renderContent(){
  const host=$('#content-records');
  host.innerHTML='';
  state.content.resources.forEach((r,i)=>{
    const card=document.createElement('article');
    card.className='content-record';
    card.innerHTML='<label>Title<input data-key="title"></label><label>Link / path<input data-key="href"></label><label>Summary<textarea data-key="summary"></textarea></label><button class="remove" type="button">Remove record</button>';
    bind(card,r);
    card.querySelector('.remove').onclick=()=>{state.content.resources.splice(i,1);renderContent();setDirty()};
    host.append(card);
  });
  $('#content-count').textContent=state.content.resources.length;
}
function renderHistory(){
  const host=$('#history');
  host.innerHTML=state.history.length?state.history.map(x=>`<div class="history-item"><span><b>${esc(x.label)}</b><br><small>${new Date(x.at).toLocaleString()}</small></span><span class="muted">${esc(x.kind)}</span></div>`).join(''):'<p class="muted">Versions appear after the first save.</p>';
}
function renderControls(){
  const host=$('#site-controls');
  const labels={siteName:'Site name',homeEyebrow:'Home eyebrow',homeHeading:'Home heading',homeDescription:'Home description',practiceCta:'Practice button',libraryCta:'Library button',parentsCta:'Parents button'};
  host.innerHTML=Object.keys(labels).map(k=>`<label>${labels[k]}<input data-control="${k}" value="${esc(state.controls[k]||'')}"></label>`).join('');
  host.querySelectorAll('[data-control]').forEach(input=>input.addEventListener('input',()=>{state.controls[input.dataset.control]=input.value;setDirty()}));
}
function renderSeasons(){
  const select=$('#season-select');
  select.innerHTML=Object.keys(state.seasons).map(k=>`<option value="${esc(k)}">${esc(k)}</option>`).join('');
  select.value=state.plan.season;
  select.onchange=()=>{state.plan=state.seasons[select.value];renderSessions();setDirty()};
}
function renderTeamSources(){
  const host=$('#team-sources');
  host.innerHTML=sourceKinds.map(k=>{
    const source={...defaultTeamOps.sources[k],...(state.teamOps.sources?.[k]||{})};
    const connected=source.status==='connected';
    return `<article class="editor-card source-card" data-source="${k}"><div class="card-top"><span class="record-label">${esc(sourceLabels[k])}</span><span class="status-pill ${connected?'connected':''}">${connected?'Connected':'Not connected'}</span></div><div class="field-grid"><label>Friendly title<input data-source-key="title" value="${esc(source.title||sourceLabels[k])}"></label><label>Source URL<input data-source-key="href" placeholder="Stored privately after save" value="${esc(source.href||'')}"></label><label>Status<select data-source-key="status"><option value="not_configured">Not connected</option><option value="connected">Connected</option><option value="needs_review">Needs review</option></select></label></div><label>Last successful read / sync<input data-source-key="lastReadAt" type="datetime-local" value="${esc(toLocalDateTime(source.lastReadAt))}"></label><div class="source-actions">${source.href?`<a href="${esc(source.href)}" target="_blank" rel="noopener">Open Source</a>`:'<span class="muted">No source URL saved yet.</span>'}</div></article>`;
  }).join('');
  host.querySelectorAll('[data-source]').forEach(card=>{
    const key=card.dataset.source;
    state.teamOps.sources[key]={...defaultTeamOps.sources[key],...(state.teamOps.sources?.[key]||{})};
    card.querySelector('[data-source-key="status"]').value=state.teamOps.sources[key].status||'not_configured';
    card.querySelectorAll('[data-source-key]').forEach(input=>input.addEventListener('input',()=>{
      const field=input.dataset.sourceKey;
      state.teamOps.sources[key][field]=field==='lastReadAt'?fromLocalDateTime(input.value):input.value;
      setDirty();
    }));
  });
  renderEligibilityRules();
  $('#attendance-json').value=JSON.stringify(state.teamOps.attendance||{athletes:[],practiceDates:[]},null,2);
  $('#attendance-json').oninput=()=>{try{state.teamOps.attendance=JSON.parse($('#attendance-json').value||'{}');setDirty()}catch{setStatus('Attendance JSON is not valid yet')}};
}
function toLocalDateTime(value){
  if(!value)return '';
  const d=new Date(value);
  if(Number.isNaN(d.getTime()))return '';
  const pad=n=>String(n).padStart(2,'0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function fromLocalDateTime(value){return value?new Date(value).toISOString():''}
function renderEligibilityRules(){
  const host=$('#eligibility-rules'),rules=state.teamOps.eligibilityRules;
  host.innerHTML=`<label>Novice practice minimum<input data-rule="novicePracticeMinimum" type="number" min="0" value="${esc(rules.novicePracticeMinimum)}"></label><label>Warning after missed practices<input data-rule="attendanceWarningMisses" type="number" min="1" value="${esc(rules.attendanceWarningMisses)}"></label><label>Strong flag after missed practices<input data-rule="attendanceCriticalMisses" type="number" min="1" value="${esc(rules.attendanceCriticalMisses)}"></label><label>Forms required<select data-rule="formsRequired"><option value="true">Required</option><option value="false">Informational</option></select></label><label>Safety required<select data-rule="safetyRequired"><option value="true">Required</option><option value="false">Informational</option></select></label>`;
  host.querySelectorAll('[data-rule]').forEach(input=>{
    const key=input.dataset.rule;
    input.value=String(rules[key]);
    input.addEventListener('input',()=>{state.teamOps.eligibilityRules[key]=input.type==='number'?Number(input.value):input.value==='true';setDirty()});
  });
}
function renderLineups(){
  const host=$('#lineup-drafts');
  const drafts=state.teamOps.lineups.drafts||[];
  host.innerHTML=drafts.length?drafts.map((draft,i)=>{
    const seats=['Cox','8','7','6','5','4','3','2','Bow'];
    return `<article class="editor-card lineup-card" data-lineup="${i}"><div class="card-top"><span class="record-label">LINEUP</span><button class="remove" type="button">Remove</button></div><div class="field-grid"><label>Name<input data-lineup-key="name" value="${esc(draft.name||'8+ draft')}"></label><label>Boat class<select data-lineup-key="boatClass"><option value="8+">8+</option><option value="4+">4+</option><option value="4x">4x</option><option value="2x">2x</option></select></label><label>Status<select data-lineup-key="status"><option value="draft">Draft</option><option value="saved">Saved</option><option value="archived">Archived</option></select></label></div><div class="seat-editor">${seats.map(seat=>`<label>${seat}<input data-seat="${seat}" value="${esc(draft.seats?.[seat]||'')}" placeholder="Athlete name or blank"></label>`).join('')}</div><label>Coach notes<textarea data-lineup-key="notes">${esc(draft.notes||'')}</textarea></label></article>`;
  }).join(''):'<p class="muted">No lineup drafts yet.</p>';
  host.querySelectorAll('[data-lineup]').forEach(card=>{
    const i=Number(card.dataset.lineup),draft=drafts[i];
    card.querySelector('.remove').onclick=()=>{drafts.splice(i,1);renderLineups();setDirty()};
    card.querySelector('[data-lineup-key="boatClass"]').value=draft.boatClass||'8+';
    card.querySelector('[data-lineup-key="status"]').value=draft.status||'draft';
    card.querySelectorAll('[data-lineup-key]').forEach(input=>input.addEventListener('input',()=>{draft[input.dataset.lineupKey]=input.value;setDirty()}));
    card.querySelectorAll('[data-seat]').forEach(input=>input.addEventListener('input',()=>{draft.seats=draft.seats||{};draft.seats[input.dataset.seat]=input.value;setDirty()}));
  });
}
function renderAll(){renderSeasons();renderSessions();renderContent();renderControls();renderHistory();renderTeamSources();renderLineups()}
const authHeaders=()=>authCode?{'x-coach-code':authCode}: {};
async function load(){
  try{
    const r=await fetch('/api/console',{credentials:'same-origin',headers:authHeaders()});
    if(r.ok){
      const d=await r.json();
      if(d.plan){
        Object.assign(state,d);
        state.teamOps=mergeTeamOps(d.teamOps);
        state.seasons=d.seasons||{[d.plan.season||'Fall 2026']:d.plan};
        state.plan=state.seasons[state.plan.season]||d.plan;
        setStatus('Connected');
        return 'connected';
      }
      const content=await fetch(PUBLIC+'/content.json').then(r=>r.json());
      state.content=content;
      state.seasons={};
      state.plan={season:'Fall 2026',phases:[],sessions:[]};
      state.teamOps=mergeTeamOps();
      setStatus('Connected · schedule not published');
      return 'connected';
    }
    if(r.status===401)return 'login';
  }catch{return 'login'}
}
function saveLocal(kind='Draft saved'){
  localStorage.setItem('coach-console-draft',JSON.stringify({plan:state.plan,content:state.content,history:state.history,teamOps:state.teamOps}));
  state.dirty=false;
  setStatus(kind);
}
async function save(publish=false){
  setStatus(publish?'Publishing…':'Saving…');
  try{
    state.seasons[state.plan.season]=state.plan;
    const r=await fetch('/api/console',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json',...authHeaders()},body:JSON.stringify({action:publish?'publish':'draft',plan:state.plan,seasons:state.seasons,content:state.content,controls:state.controls,teamOps:state.teamOps,history:state.history})});
    if(!r.ok)throw Error();
    Object.assign(state,await r.json());
    state.teamOps=mergeTeamOps(state.teamOps);
    state.dirty=false;
    setStatus(publish?'Published':'Draft saved');
    renderHistory();
  }catch{saveLocal(publish?'Saved locally — connect storage to publish':'Saved locally')}
}
$('#login-form').onsubmit=async e=>{
  e.preventDefault();
  $('#login-error').textContent='';
  const body=Object.fromEntries(new FormData(e.target));
  try{
    const r=await fetch('/api/console',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({action:'login',...body})});
    if(!r.ok)throw Error();
    authCode=body.code;
    const d=await fetch('/api/console',{credentials:'same-origin',headers:authHeaders()}).then(r=>r.ok?r.json():Promise.reject());
    if(!d.plan)throw Error();
    Object.assign(state,d);
    state.teamOps=mergeTeamOps(d.teamOps);
    state.seasons=d.seasons||{[d.plan.season||'Fall 2026']:d.plan};
    state.plan=state.seasons[state.plan.season]||d.plan;
    state.content=d.content||{resources:[]};
    state.controls=d.controls||{};
    state.history=d.history||[];
    $('#login').hidden=true;
    $('#console').hidden=false;
    setStatus('Connected');
    renderAll();
  }catch{$('#login-error').textContent='Code accepted, but the coach record could not be loaded.'}
};
document.querySelectorAll('.tab').forEach(t=>t.onclick=()=>{document.querySelectorAll('.tab').forEach(x=>x.classList.remove('active'));t.classList.add('active');document.querySelectorAll('.panel').forEach(p=>p.hidden=p.id!==t.dataset.panel)});
$('#add-session').onclick=()=>{state.plan.sessions.push({date:'',title:'New session',block:'',intent:'',workout:'',cue:'',land:'',custom:{todayMessage:'',novicePlan:'',varsityPlan:'',landFallback:'',technicalFocus:'',coachingCues:'',successCriteria:'',intensity:''}});renderSessions();setDirty()};
$('#add-content').onclick=()=>{state.content.resources.push({title:'New resource',summary:'',href:'#'});renderContent();setDirty()};
$('#add-lineup').onclick=()=>{state.teamOps.lineups.drafts=state.teamOps.lineups.drafts||[];state.teamOps.lineups.drafts.unshift({name:'New 8+ draft',boatClass:'8+',status:'draft',seats:{Cox:'',8:'',7:'',6:'',5:'',4:'',3:'',2:'',Bow:''},notes:''});renderLineups();setDirty()};
$('#save').onclick=()=>save(false);
$('#publish').onclick=()=>save(true);
(async()=>{
  const mode=await load();
  if(mode==='login'){$('#login').hidden=false;$('#console').hidden=true;setStatus('Sign in required');return}
  $('#login').hidden=true;
  $('#console').hidden=false;
  renderAll();
})().catch(()=>{$('#login').hidden=false;$('#console').hidden=true;setStatus('Sign in required')});
