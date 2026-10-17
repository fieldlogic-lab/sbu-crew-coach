const { lineupRoster } = require('./roster');
const CLASSES = { '8+': ['Cox','8','7','6','5','4','3','2','Bow'], '4+': ['Cox','4','3','2','Bow'], '4-': ['4','3','2','Bow'], '4x': ['4','3','2','Bow'], '2-': ['2','Bow'], '2x': ['2','Bow'], '1x': ['Bow'] };
function validateDailyLineup(input, athletes) {
  const invalid = message => { const error = new Error(message); error.statusCode = 400; throw error; };
  if (!input || !/^\d{4}-\d{2}-\d{2}$/.test(input.date) || !Number.isFinite(Date.parse(input.date)) || new Date(input.date).toISOString().slice(0,10) !== input.date) invalid('Choose a valid practice date.');
  if (!['draft','approved'].includes(input.status)) invalid('Invalid lineup status.');
  if (!Array.isArray(input.boats) || !input.boats.length || input.boats.length > 30) invalid('Create between 1 and 30 boats.');
  const roster = new Set(lineupRoster(athletes).map(a => a.id)), assigned = new Set(), boatIds = new Set();
  const boats = input.boats.map(boat => {
    if (!boat || typeof boat.id !== 'string' || boat.id.length > 100 || !boat.id || boatIds.has(boat.id)) invalid('Invalid boat identifier.');
    boatIds.add(boat.id);
    if (!Object.hasOwn(CLASSES, boat.boatClass)) invalid('Choose a supported boat class.');
    const seats = {};
    if (Object.keys(boat.seats || {}).some(seat => !CLASSES[boat.boatClass].includes(seat))) invalid('Invalid seat for boat class.');
    for (const seat of CLASSES[boat.boatClass]) {
      const id = boat.seats?.[seat] || '';
      if (id && !roster.has(id)) invalid('An assigned athlete is no longer in the roster. Reassign that seat.');
      if (id && assigned.has(id)) invalid('An athlete cannot occupy two seats.');
      if (id) assigned.add(id);
      if (!id && input.status === 'approved') invalid('Fill every seat before approval.');
      seats[seat] = id;
    }
    return { id: boat.id, boatClass: boat.boatClass, seats };
  });
  return { date: input.date, status: input.status, boats, updatedAt: new Date().toISOString() };
}
module.exports = { CLASSES, validateDailyLineup };
