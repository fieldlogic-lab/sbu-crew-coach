(function exposeRenderer(root, createRenderer) {
  const renderAthleteView = createRenderer();
  if (typeof module === 'object' && module.exports) {
    module.exports = renderAthleteView;
  } else {
    root.renderAthleteView = renderAthleteView;
  }
})(globalThis, function createRenderer() {
  function element(document, parent, tag, className, text) {
    const child = document.createElement(tag);
    if (className) child.className = className;
    if (text !== undefined && text !== null) child.textContent = String(text);
    parent.append(child);
    return child;
  }

  function metric(document, parent, value, label) {
    const item = element(document, parent, 'div', 'metric');
    element(document, item, 'b', '', value);
    element(document, item, 'span', '', label);
  }

  function rounded(value, suffix = '') {
    const number = Number(value);
    return Number.isFinite(number) ? `${Math.round(number)}${suffix}` : '—';
  }

  function direction(value) {
    const number = Number(value);
    return Number.isFinite(number)
      ? ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(number / 45) % 8]
      : '—';
  }

  function renderAthleteView(view, schedule, weather) {
    const document = view.ownerDocument;
    const data = schedule || {};
    const session = data.session || null;
    const next = data.nextSession || null;
    const coachPreview = Boolean(data.coachPreview);
    const status = session?.practiceStatus || 'forecast';
    const decision = status === 'canceled' ? 'PRACTICE CANCELED'
      : status === 'water' ? 'COACH: WATER'
        : status === 'land' ? 'COACH: LAND' : 'FORECAST ONLY';
    const mode = status === 'water' || status === 'land'
      ? status : session?.sessionType === 'water' ? 'water' : 'land';
    const releaseTime = session?.releaseTimes?.[mode] || (mode === 'water' ? '05:00' : '06:01');
    const localTime = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(new Date());
    const visible = Boolean(session)
      && status !== 'canceled'
      && (coachPreview || localTime >= releaseTime);
    const today = data.date || new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/New_York',
    }).format(new Date());
    const current = weather?.current;
    const daily = weather?.daily;

    view.replaceChildren();

    const currentCard = element(document, view, 'section', 'card weather');
    element(document, currentCard, 'div', 'ey', `PORT JEFFERSON HARBOR · ${today}`);
    element(document, currentCard, 'div', 'status', current ? decision : 'CONDITIONS UNAVAILABLE');
    const currentMetrics = element(document, currentCard, 'div', 'metrics');
    if (current) {
      metric(document, currentMetrics, rounded(current.wind_speed_10m, ' kt'), 'WIND');
      metric(document, currentMetrics, rounded(current.wind_gusts_10m, ' kt'), 'GUST');
      metric(document, currentMetrics, rounded(current.temperature_2m, '°'), 'AIR');
      metric(document, currentMetrics, direction(current.wind_direction_10m), 'DIRECTION');
    } else {
      metric(document, currentMetrics, '—', 'NO DATA');
    }
    element(document, currentCard, 'p', 'small', 'Forecast information only. The coach’s water/land/cancellation decision controls practice.');

    const tomorrowCard = element(document, view, 'section', 'card');
    element(document, tomorrowCard, 'div', 'ey', 'TOMORROW · PORT JEFFERSON HARBOR');
    element(document, tomorrowCard, 'div', 'title', 'Forecast');
    const tomorrowMetrics = element(document, tomorrowCard, 'div', 'metrics');
    metric(document, tomorrowMetrics,
      daily ? `${rounded(daily.temperature_2m_min?.[1], '°')}–${rounded(daily.temperature_2m_max?.[1], '°')}` : '—', 'AIR');
    metric(document, tomorrowMetrics,
      daily ? `${rounded(daily.wind_speed_10m_max?.[1])} kt / ${rounded(daily.wind_gusts_10m_max?.[1])} kt` : '—', 'WIND / GUST');

    const practiceCard = element(document, view, 'section', 'card');
    element(document, practiceCard, 'div', 'ey', `${coachPreview ? 'COACH PREVIEW · ' : 'DAILY RELEASE · '}${session ? mode.toUpperCase() : 'NO WORKOUT'}`);
    const canceled = status === 'canceled';
    element(document, practiceCard, 'div', 'title', canceled ? 'Practice canceled'
      : visible ? session.title : session ? `Workout opens at ${releaseTime} AM` : 'No organized workout today');
    element(document, practiceCard, 'p', '', visible ? session.intent : session
      ? 'The plan will appear automatically at the scheduled release time. Check conditions first and follow coach direction.' : '');

    if (visible) {
      const workout = element(document, practiceCard, 'div', 'section');
      element(document, workout, 'h3', '', 'WORKOUT');
      element(document, workout, 'p', '', session.workout);
      element(document, workout, 'h3', '', 'COACH CUE');
      element(document, workout, 'p', '', session.cue);
    }

    if (canceled) {
      element(document, practiceCard, 'p', '', 'Practice has been canceled for today. Follow the latest coach or team message.');
    } else if (!session) {
      element(document, practiceCard, 'p', '', next
        ? `No organized workout is scheduled today. The next scheduled session is ${next.date} · ${next.title}.`
        : 'No organized workout is scheduled today.');
    }
    element(document, practiceCard, 'p', 'small', 'Water workouts go live at 5:00 AM Eastern. Land workouts go live at 6:01 AM Eastern.');
  }

  return renderAthleteView;
});
