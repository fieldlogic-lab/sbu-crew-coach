const { readDraft, writeDraft, readBlob, writeBlob } = require('./lib/draft-store');
const {
  getCoachConfig, safeEqual, createSessionToken, sessionCookie, clearSessionCookie,
  isCoachRequest, hasServiceCredential,
} = require('./lib/coach-auth');
const loginRateLimit = require('./lib/login-rate-limit');

function json(res, status, body, headers = {}) {
  res.statusCode = status;
  Object.entries({
    'content-type': 'application/json',
    'cache-control': 'no-store',
    'access-control-allow-origin': 'https://www.rtpny.com',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'content-type,if-match,if-none-match',
    'access-control-expose-headers': 'etag',
    ...headers,
  }).forEach(([key, value]) => res.setHeader(key, value));
  res.end(JSON.stringify(body));
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
        const result = await readBlob('coach-content/published.json');
        const data = result?.data;
        return data ? json(res, 200, { content: data.content, controls: data.controls || {} }) : json(res, 404, { error: 'not published' });
      }
      if (view === 'athlete') {
        const result = await readBlob('coach-content/published.json');
        const data = result?.data;
        return data ? json(res, 200, athletePayload(data)) : json(res, 404, { error: 'not published' });
      }
      if (view === 'tv') {
        const result = await readBlob('coach-content/published.json');
        const data = result?.data;
        return data ? json(res, 200, tvPayload(data), { 'access-control-allow-origin': '*' }) : json(res, 404, { error: 'not published' });
      }
      const coachConfig = getCoachConfig();
      if (!coachConfig.configured) return json(res, 503, { error: 'coach authentication is not configured' });
      if (hasServiceCredential(req) || !isCoachRequest(req, coachConfig)) return json(res, 401, { error: 'coach authentication required' });
      const result = await readDraft();
      const data = result?.data;
      if (data) return json(res, 200, data, { etag: result.etag });
      return json(res, 200, { plan: null, content: null, history: [] });
    }

    const body = await parseBody(req);
    if (body.action === 'login') {
      const config = getCoachConfig();
      if (!config.configured) return json(res, 503, { error: 'coach authentication is not configured' });
      if (!loginRateLimit.configured()) return json(res, 503, { error: 'distributed login protection is not configured' });
      if (hasServiceCredential(req)) return json(res, 401, { error: 'invalid coach credentials' });
      let attempt;
      try {
        attempt = await loginRateLimit.consume(body.username || '', req);
      } catch {
        return json(res, 503, { error: 'login protection is temporarily unavailable' });
      }
      if (!attempt.allowed) return json(res, 429, { error: 'too many login attempts; try again later' }, { 'retry-after': String(loginRateLimit.WINDOW_SECONDS) });
      if (!safeEqual(body.username || '', config.username) || !safeEqual(body.password || '', config.password)) {
        return json(res, 401, { error: 'invalid coach credentials' });
      }
      try {
        await loginRateLimit.reset(body.username || '', req);
      } catch {
        return json(res, 503, { error: 'login protection is temporarily unavailable' });
      }
      return json(res, 200, { ok: true }, { 'set-cookie': sessionCookie(createSessionToken(config.username, config.secret)) });
    }
    if (body.action === 'logout') {
      return json(res, 200, { ok: true }, { 'set-cookie': clearSessionCookie() });
    }
    const coachConfig = getCoachConfig();
    if (!coachConfig.configured) return json(res, 503, { error: 'coach authentication is not configured' });
    if (hasServiceCredential(req) || !isCoachRequest(req, coachConfig)) return json(res, 401, { error: 'coach authentication required' });

    if (body.action === 'draft' || body.action === 'publish') {
      const draftResult = await readDraft();
      const expected = draftResult?.etag;
      const supplied = req.headers?.['if-match'];
      const createRequested = !draftResult && req.headers?.['if-none-match'] === '*';
      if ((expected && supplied !== expected) || (!expected && !createRequested)) {
        return json(res, 412, { error: 'draft conflict', code: 'DRAFT_CONFLICT' });
      }
      const now = new Date().toISOString();
      const data = {
        ...(draftResult?.data || {}),
        plan: body.plan,
        seasons: body.seasons || { [body.plan?.season || 'Fall 2026']: body.plan },
        content: body.content,
        controls: body.controls || {},
        teamOps: body.teamOps || {},
        history: [
          { label: body.action === 'publish' ? 'Published season' : 'Saved draft', at: now, kind: body.action },
          ...(draftResult?.data?.history || []),
        ].slice(0, 20),
      };
      if (body.action === 'publish') {
        // Capture the publication version before saving the draft. Reading it
        // afterward could let an older request overwrite a newer publication.
        const published = await readBlob('coach-content/published.json');
        const savedDraft = await writeDraft(data, expected ? { etag: expected } : { ifNoneMatch: '*' });
        try {
          await writeBlob('coach-content/published.json', data, published?.etag ? { etag: published.etag } : { ifNoneMatch: '*' });
        } catch (error) {
          if (error?.code === 'DRAFT_CONFLICT' || error?.statusCode === 412) {
            return json(res, 412, {
              error: 'Draft was saved, but publication did not complete because the published version changed.',
              code: 'PUBLISH_CONFLICT',
              draftSaved: true,
            }, savedDraft?.etag ? { etag: savedDraft.etag } : {});
          }
          return json(res, 503, {
            error: 'Draft was saved, but publication could not be confirmed. Check the athlete view before retrying.',
            code: 'PUBLISH_FAILED',
            draftSaved: true,
            publicationStatus: 'unknown',
          }, savedDraft?.etag ? { etag: savedDraft.etag } : {});
        }
      } else {
        await writeDraft(data, expected ? { etag: expected } : { ifNoneMatch: '*' });
      }
      const updated = await readDraft();
      // The body and validator must describe the same Blob version. A sync
      // write may land after our save and before this read.
      return json(res, 200, updated?.data || data, updated?.etag ? { etag: updated.etag } : {});
    }

    if (body.action === 'update-session') {
      const current = await readDraft();
      const data = current?.data;
      if (!data) return json(res, 404, { error: 'draft not found' });
      if (!current.etag || req.headers?.['if-match'] !== current.etag) {
        return json(res, 412, { error: 'draft conflict', code: 'DRAFT_CONFLICT' });
      }
      const date = String(body.date || '');
      const values = body.values || {};
      if (!(data.teamOps?.trainingPlan?.sessions || []).some(item => item.date === date)) return json(res, 404, { error: 'session not found' });
      data.teamOps = data.teamOps || {};
      data.teamOps.trainingPlan = data.teamOps.trainingPlan || { sessions: [] };
      data.teamOps.trainingPlan.sessions = updateSessionList(data.teamOps.trainingPlan.sessions, date, values).sessions;
      if (data.plan?.sessions?.length) data.plan.sessions = updateSessionList(data.plan.sessions, date, values).sessions;
      for (const season of Object.values(data.seasons || {})) {
        if (season?.sessions?.length) season.sessions = updateSessionList(season.sessions, date, values).sessions;
      }
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
      await writeDraft(data, { etag: current.etag });
      const latest = await readDraft();
      return json(res, 200, latest?.data || data, latest?.etag ? { etag: latest.etag } : {});
    }

    return json(res, 400, { error: 'unknown action' });
  } catch (error) {
    if (error?.code === 'DRAFT_CONFLICT' || error?.statusCode === 412) {
      return json(res, 412, { error: 'draft conflict', code: 'DRAFT_CONFLICT' });
    }
    return json(res, 500, { error: 'console unavailable' });
  }
};
