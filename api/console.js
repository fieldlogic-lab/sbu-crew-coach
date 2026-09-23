const { put, get } = require('@vercel/blob');

function json(res, status, body, headers = {}) {
  res.statusCode = status;
  Object.entries({
    'content-type': 'application/json',
    'cache-control': 'no-store',
    'access-control-allow-origin': 'https://www.rtpny.com',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'content-type',
    ...headers,
  }).forEach(([key, value]) => res.setHeader(key, value));
  res.end(JSON.stringify(body));
}

async function readBlob(pathname) {
  const result = await get(pathname, { access: 'private' });
  if (!result || !result.stream) return null;
  return new Response(result.stream).json();
}

async function writeBlob(pathname, data) {
  await put(pathname, JSON.stringify(data), {
    access: 'private',
    addRandomSuffix: false,
    allowOverwrite: true,
  });
}

async function parseBody(req) {
  if (req.body) return req.body;
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', chunk => { raw += chunk; });
    req.on('end', () => {
      try {
        resolve(JSON.parse(raw || '{}'));
      } catch (error) {
        reject(error);
      }
    });
  });
}

function allSessions(data) {
  return Object.values(data.seasons || {})
    .flatMap(season => season?.sessions || [])
    .sort((left, right) => String(left.date).localeCompare(String(right.date)));
}

function updateSession(session, values = {}) {
  session.custom = { ...(session.custom || {}) };
  if (Object.hasOwn(values, 'workout')) session.workout = values.workout;
  if (Object.hasOwn(values, 'todayMessage')) session.custom.todayMessage = values.todayMessage;
  if (Object.hasOwn(values, 'technicalFocus')) session.custom.technicalFocus = values.technicalFocus;
  if (Object.hasOwn(values, 'coachingCues')) {
    session.custom.coachingCues = values.coachingCues;
    session.cue = values.coachingCues;
  }
  if (Object.hasOwn(values, 'coachNotes')) session.custom.coachNotes = values.coachNotes;
  return session;
}

function updateSessionList(sessions, date, values) {
  let found = false;
  const next = (sessions || []).map(session => {
    if (session.date !== date) return session;
    found = true;
    return updateSession({ ...session }, values);
  });
  return { sessions: next, found };
}

function safeAthleteSession(session, full) {
  if (!session) return null;
  const base = {
    date: session.date,
    title: session.title,
    block: session.block,
    intent: session.intent,
    sessionType: session.sessionType || 'land',
    releaseTimes: session.releaseTimes || { water: '05:00', land: '06:01' },
    practiceStatus: session.practiceStatus || 'forecast',
  };
  return full && session.practiceStatus !== 'canceled'
    ? Object.assign(base, { workout: session.workout, cue: session.cue, land: session.land })
    : base;
}

function tvSession(session) {
  if (!session) return null;
  return {
    date: session.date,
    title: session.title || "Practice",
    workout: session.workout || "",
    cue: session.cue || "",
    sessionType: session.sessionType || "land",
    practiceStatus: session.practiceStatus || "forecast",
  };
}

function tvPayload(data) {
  const sessions = allSessions(data);
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const tomorrowDate = new Date(date + "T12:00:00Z");
  tomorrowDate.setUTCDate(tomorrowDate.getUTCDate() + 1);
  const tomorrowKey = tomorrowDate.toISOString().slice(0, 10);
  const today = sessions.find(item => item.date === date) || null;
  const tomorrow = sessions.find(item => item.date === tomorrowKey) || null;
  return {
    date,
    today: tvSession(today),
    tomorrow: tvSession(tomorrow),
  };
}

function athletePayload(data) {
  const sessions = allSessions(data);
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date()).filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
  const today = {
    date: parts.year + '-' + parts.month + '-' + parts.day,
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
  };
  const session = sessions.find(item => item.date === today.date) || null;
  const next = sessions.find(item => item.date > today.date) || null;
  const releaseMode = item => item?.practiceStatus === 'water' || item?.practiceStatus === 'land'
    ? item.practiceStatus
    : item?.sessionType === 'water' ? 'water' : 'land';
  const released = item => {
    if (!item || item.date !== today.date) return false;
    const mode = releaseMode(item);
    const time = item?.releaseTimes?.[mode] || (mode === 'water' ? '05:00' : '06:01');
    const [hour, minute] = time.split(':').map(Number);
    return today.minutes >= hour * 60 + minute;
  };
  return {
    date: today.date,
    coachPreview: false,
    session: safeAthleteSession(session, released(session)),
    nextSession: safeAthleteSession(next, false),
  };
}

module.exports = async (req, res) => {
  try {
    if (req.method === 'OPTIONS') return json(res, 204, {});
    if (req.method === 'GET') {
      const view = new URL(req.url, 'https://localhost').searchParams.get('view');
      if (view === 'published') {
        const data = await readBlob('coach-content/published.json');
        return data ? json(res, 200, { content: data.content, controls: data.controls || {} }) : json(res, 404, { error: 'not published' });
      }
      if (view === 'athlete') {
        const data = await readBlob('coach-content/published.json');
        return data ? json(res, 200, athletePayload(data)) : json(res, 404, { error: 'not published' });
      }
      if (view === 'tv') {
        const data = await readBlob('coach-content/published.json');
        return data ? json(res, 200, tvPayload(data), { 'access-control-allow-origin': '*' }) : json(res, 404, { error: 'not published' });
      }
      const data = await readBlob('coach-content/draft.json');
      if (data) return json(res, 200, data);
      return json(res, 200, { plan: null, content: null, history: [] });
    }

    const body = await parseBody(req);
    if (body.action === 'login') return json(res, 200, { ok: true });

    if (body.action === 'draft' || body.action === 'publish') {
      const now = new Date().toISOString();
      const data = {
        plan: body.plan,
        seasons: body.seasons || { [body.plan?.season || 'Fall 2026']: body.plan },
        content: body.content,
        controls: body.controls || {},
        teamOps: body.teamOps || {},
        history: [
          { label: body.action === 'publish' ? 'Published season' : 'Saved draft', at: now, kind: body.action },
          ...(body.history || []),
        ].slice(0, 20),
      };
      await writeBlob(`coach-content/${body.action === 'publish' ? 'published' : 'draft'}.json`, data);
      return json(res, 200, data);
    }

    if (body.action === 'update-session') {
      const data = await readBlob('coach-content/draft.json');
      if (!data) return json(res, 404, { error: 'draft not found' });
      const date = String(body.date || '');
      const values = body.values || {};

      data.teamOps = data.teamOps || {};
      data.teamOps.trainingPlan = data.teamOps.trainingPlan || { sessions: [] };
      const updatedTraining = updateSessionList(data.teamOps.trainingPlan.sessions, date, values);
      data.teamOps.trainingPlan.sessions = updatedTraining.sessions;

      if (data.plan?.sessions?.length) {
        const updatedPlan = updateSessionList(data.plan.sessions, date, values);
        data.plan.sessions = updatedPlan.sessions;
      }
      for (const season of Object.values(data.seasons || {})) {
        if (season?.sessions?.length) {
          const updatedSeason = updateSessionList(season.sessions, date, values);
          season.sessions = updatedSeason.sessions;
        }
      }

      if (!updatedTraining.found) return json(res, 404, { error: 'session not found' });

      data.teamOps.sources = data.teamOps.sources || {};
      data.teamOps.sources.dailyTrainingPlan = {
        ...(data.teamOps.sources.dailyTrainingPlan || {}),
        kind: 'dailyTrainingPlan',
        title: data.teamOps.sources.dailyTrainingPlan?.title || 'Daily Training Plan',
        status: 'connected',
        lastReadAt: new Date().toISOString(),
      };
      data.history = [
        { label: 'Updated Daily Plan session', at: new Date().toISOString(), kind: 'update-session', date },
        ...(data.history || []),
      ].slice(0, 20);

      await writeBlob('coach-content/draft.json', data);
      return json(res, 200, data);
    }

    return json(res, 400, { error: 'unknown action' });
  } catch (error) {
    return json(res, 500, { error: 'console unavailable' });
  }
};
