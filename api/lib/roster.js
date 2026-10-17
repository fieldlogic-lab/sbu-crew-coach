const { randomUUID } = require('node:crypto');
const key = athlete => String(athlete.name || '').trim().toLocaleLowerCase('en-US');
// Without a source ID, indistinguishable duplicate rows cannot be reconciled safely.
function identifyRoster(athletes, previous = []) {
  const counts = rows => rows.reduce((map, row) => map.set(key(row), (map.get(key(row)) || 0) + 1), new Map());
  const nextCounts = counts(athletes), oldCounts = counts(previous);
  const ids = new Set();
  return athletes.map(athlete => {
    const name = key(athlete);
    const old = nextCounts.get(name) === 1 && oldCounts.get(name) === 1 ? previous.find(row => key(row) === name) : null;
    let id = String(athlete.id || old?.id || randomUUID());
    if (ids.has(id)) throw new Error('Roster contains duplicate athlete identifiers');
    ids.add(id);
    return { ...athlete, id };
  });
}
function lineupRoster(athletes = []) {
  const counts = new Map();
  return athletes.map((athlete, index) => {
    const name = String(athlete.name || '').trim();
    const occurrence = (counts.get(name) || 0) + 1; counts.set(name, occurrence);
    return { id: athlete.id || `legacy:${index}:${name}`, name, occurrence };
  });
}
module.exports = { identifyRoster, lineupRoster };
