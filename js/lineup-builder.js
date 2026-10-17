const CLASSES = { '8+': ['Cox','8','7','6','5','4','3','2','Bow'], '4+': ['Cox','4','3','2','Bow'], '4-': ['4','3','2','Bow'], '4x': ['4','3','2','Bow'], '2-': ['2','Bow'], '2x': ['2','Bow'], '1x': ['Bow'] };
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function createLineupBuilder({ getData, getEtag, onSaved, today }) {
  const working = new Map();
  let date = today(), host, busy = false, message = '', selected = null;
  const roster = () => {
    const rows = getData().teamOps?.attendance?.athletes || [];
    const counts = new Map();
    return rows.map((a, index) => {
      const name = String(a.name || '').trim();
      const occurrence = (counts.get(name) || 0) + 1; counts.set(name, occurrence);
      return { id: a.id || `legacy:${index}:${name}`, name, occurrence };
    }).map(a => ({ ...a, label: counts.get(a.name) > 1 ? `${a.name} (${a.occurrence})` : a.name }));
  };
  function current() {
    if (!working.has(date)) working.set(date, { lineup: structuredClone(getData().teamOps?.lineups?.daily?.[date] || { date, status: 'draft', boats: [] }), dirty: false });
    return working.get(date);
  }
  function changed() { current().dirty = true; current().lineup.status = 'draft'; message = 'Unsaved changes'; }
  const boat = () => ({ id: crypto.randomUUID(), boatClass: '8+', seats: {} });
  function draw() {
    if (!host?.isConnected) return;
    const entry = current(), lineup = entry.lineup, rows = roster();
    const assigned = new Set(lineup.boats.flatMap(b => Object.values(b.seats)).filter(Boolean));
    const dates = Object.keys(getData().teamOps?.lineups?.daily || {}).sort().reverse();
    host.innerHTML = `<section class="card lineup-builder"><div class="ey">DAILY LINEUPS</div><div class="title">Lineups</div>
      <label>Practice date<input id="lineup-date" type="date" value="${esc(date)}"></label>
      <p>${esc(lineup.status === 'approved' && !entry.dirty ? 'Approved' : entry.dirty ? 'Draft · unsaved' : 'Draft')} · ${assigned.size} assigned · ${rows.filter(a => !assigned.has(a.id)).length} unassigned</p>
      <p id="lineup-message" role="status" aria-live="polite">${esc(message)}</p>
      <div class="lineup-actions"><button id="lineup-add">Add boat</button><button id="lineup-save" ${!lineup.boats.length ? 'disabled' : ''}>Save draft</button><button id="lineup-approve" ${!lineup.boats.length ? 'disabled' : ''}>Approve lineup</button></div>
      <label>Copy saved lineup from<select id="lineup-copy-date"><option value="">Choose date</option>${dates.filter(d => d !== date).map(d => `<option>${esc(d)}</option>`).join('')}</select></label><button id="lineup-copy">Copy into this date</button>
      <button id="lineup-reopen">Reopen saved lineup</button><button id="lineup-recovery">Download unsaved lineup</button>
      <p class="small">To move or swap, tap “Move / swap” at one seat, then tap it at the destination. Editing an approved lineup makes a new draft.</p>
      ${lineup.boats.map((b, index) => `<article class="lineup-boat"><h3>Boat ${index + 1}</h3><label>Boat class<select data-class="${index}">${Object.keys(CLASSES).map(c => `<option ${c === b.boatClass ? 'selected' : ''}>${c}</option>`).join('')}</select></label><button data-remove="${index}">Remove boat ${index + 1}</button>
        ${(CLASSES[b.boatClass] || []).map(seat => {
          const id = b.seats[seat] || '';
          return `<div class="lineup-seat"><label>Boat ${index + 1} · ${esc(seat)}<select data-boat="${index}" data-seat="${seat}"><option value="">Unassigned</option>${id && !rows.some(a => a.id === id) ? `<option selected value="${esc(id)}">Roster changed — reassign</option>` : ''}${rows.map(a => `<option value="${esc(a.id)}" ${a.id === id ? 'selected' : ''} ${assigned.has(a.id) && a.id !== id ? 'disabled' : ''}>${esc(a.label)}${assigned.has(a.id) && a.id !== id ? ' · assigned' : ''}</option>`).join('')}</select></label><button data-move="${index}" data-seat="${seat}" aria-pressed="${selected?.index === index && selected?.seat === seat}">Move / swap · ${esc(seat)}</button></div>`;
        }).join('')}</article>`).join('')}
      <h3>Unassigned athletes</h3><p>${rows.filter(a => !assigned.has(a.id)).map(a => esc(a.label)).join(', ') || (rows.length ? 'All athletes assigned.' : 'No attendance roster is cached. Reconnect or refresh the existing attendance source in the Coach Console.')}</p></section>`;
    host.querySelectorAll('button,input,select').forEach(el => { if (busy) el.disabled = true; });
    host.querySelector('#lineup-date').onchange = event => { if (!event.target.value) return draw(); date = event.target.value; selected = null; message = ''; draw(); };
    host.querySelector('#lineup-add').onclick = () => { lineup.boats.push(boat()); changed(); draw(); };
    host.querySelectorAll('[data-class]').forEach(el => el.onchange = () => {
      const b = lineup.boats[Number(el.dataset.class)], seats = CLASSES[el.value];
      if (Object.entries(b.seats).some(([seat, id]) => id && !seats.includes(seat)) && !confirm('Changing class will unassign athletes in removed seats. Continue?')) return draw();
      b.boatClass = el.value; b.seats = Object.fromEntries(Object.entries(b.seats).filter(([s]) => seats.includes(s))); selected = null; changed(); draw();
    });
    host.querySelectorAll('[data-remove]').forEach(el => el.onclick = () => { if (confirm('Remove this boat and unassign its athletes?')) { lineup.boats.splice(Number(el.dataset.remove),1); selected = null; changed(); draw(); } });
    host.querySelectorAll('select[data-seat]').forEach(el => el.onchange = () => {
      const index = Number(el.dataset.boat), seat = el.dataset.seat;
      if (el.value && lineup.boats.some((b,i) => Object.entries(b.seats).some(([s,id]) => id === el.value && (i !== index || s !== seat)))) { message = 'That athlete is already assigned. Use Move / swap.'; return draw(); }
      lineup.boats[index].seats[seat] = el.value; changed(); draw();
    });
    host.querySelectorAll('[data-move]').forEach(el => el.onclick = () => {
      const destination = { index: Number(el.dataset.move), seat: el.dataset.seat };
      if (!selected) { selected = destination; message = 'Select the destination seat with Move / swap.'; }
      else { const a = lineup.boats[selected.index], b = lineup.boats[destination.index]; const id = a.seats[selected.seat] || ''; a.seats[selected.seat] = b.seats[destination.seat] || ''; b.seats[destination.seat] = id; selected = null; changed(); }
      draw();
    });
    host.querySelector('#lineup-copy').onclick = () => {
      const source = host.querySelector('#lineup-copy-date').value;
      if (!source) { message = 'Choose a saved date to copy.'; return draw(); }
      if (entry.dirty && !confirm('Replace the unsaved lineup for this date?')) return;
      entry.lineup = structuredClone(getData().teamOps.lineups.daily[source]); entry.lineup.date = date;
      entry.lineup.boats.forEach(b => { b.id = crypto.randomUUID(); }); selected = null; changed(); draw();
    };
    host.querySelector('#lineup-reopen').onclick = async () => {
      if (entry.dirty && !confirm('Discard unsaved changes and reopen the latest saved lineup? Download a recovery copy first if needed.')) return;
      busy = true; draw();
      try { const response = await fetch('/api/console', { credentials: 'same-origin' }); if (!response.ok) throw Error('Could not reopen. Check your connection and Coach sign-in.'); const data = await response.json(); onSaved(data,response.headers.get('etag')); working.delete(date); selected = null; message = 'Latest saved lineup loaded.'; }
      catch(error) { message = error.message; }
      finally { busy = false; draw(); }
    };
    host.querySelector('#lineup-recovery').onclick = () => {
      const link = document.createElement('a'), url = URL.createObjectURL(new Blob([JSON.stringify(lineup,null,2)], { type: 'application/json' })); link.href = url; link.download = `lineup-${date}-recovery.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url),1000);
    };
    host.querySelector('#lineup-save').onclick = () => save('draft');
    host.querySelector('#lineup-approve').onclick = () => save('approved');
  }
  async function save(status) {
    if (busy) return;
    const entry = current(), payload = structuredClone(entry.lineup); payload.status = status;
    if (status === 'approved' && payload.boats.some(b => CLASSES[b.boatClass].some(s => !b.seats[s]))) { message = 'Fill every seat before approval.'; return draw(); }
    busy = true; message = 'Saving…'; draw();
    try {
      const response = await fetch('/api/console', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json', 'if-match': getEtag() }, body: JSON.stringify({ action: 'save-lineup', lineup: payload }) });
      const data = await response.json();
      if (!response.ok) throw Error(response.status === 412 ? 'Save conflict. Your edits remain here. Download them, then reopen the latest saved lineup.' : response.status === 401 ? 'Sign in as Coach again to save. Download your edits first.' : data.error || 'Save failed. Your edits remain here; retry or download them.');
      onSaved(data, response.headers.get('etag'));
      entry.lineup = structuredClone(data.teamOps.lineups.daily[date]); entry.dirty = false; message = entry.lineup.status === 'approved' ? 'Approved and saved.' : 'Draft saved.';
    } catch (error) { message = error.message || 'Save failed. Your edits remain here.'; }
    finally { busy = false; draw(); }
  }
  window.addEventListener('beforeunload', event => { if ([...working.values()].some(e => e.dirty)) { event.preventDefault(); event.returnValue = ''; } });
  return { mount(element) { host = element; draw(); } };
}
