(function exposeAthleteController(root, createController) {
  const api = createController();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    api.start(root);
  }
})(globalThis, function createControllerApi() {
  const weatherUrl = 'https://api.open-meteo.com/v1/forecast?latitude=40.9465&longitude=-73.0693&current=temperature_2m,wind_speed_10m,wind_gusts_10m,wind_direction_10m&daily=temperature_2m_max,temperature_2m_min,wind_speed_10m_max,wind_gusts_10m_max,wind_direction_10m_dominant&forecast_days=2&wind_speed_unit=kn&temperature_unit=fahrenheit&timezone=America%2FNew_York';
  const scheduleUrl = '/api/console?view=athlete';

  async function timedJson(fetchImpl, url, { timeoutMs, credentials, timers, AbortControllerImpl }) {
    const controller = AbortControllerImpl ? new AbortControllerImpl() : null;
    let timeoutId;
    const timeout = new Promise((resolve, reject) => {
      timeoutId = timers.setTimeout(() => {
        controller?.abort();
        reject(new Error('request timed out'));
      }, timeoutMs);
    });
    const request = Promise.resolve().then(() => fetchImpl(url, {
      ...(credentials ? { credentials } : {}),
      ...(controller ? { signal: controller.signal } : {}),
    })).then(response => {
      if (!response?.ok) throw new Error(`request failed (${response?.status || 'no response'})`);
      return response.json();
    });
    try {
      return await Promise.race([request, timeout]);
    } finally {
      timers.clearTimeout(timeoutId);
    }
  }

  function createAthleteController({
    view,
    fetchImpl,
    render,
    renderMessage,
    protocol = 'https:',
    scheduleTimeoutMs = 8000,
    weatherTimeoutMs = 5000,
    refreshMs = 60000,
    timers = globalThis,
    AbortControllerImpl = globalThis.AbortController,
  }) {
    let timerId = null;
    let runId = 0;
    let schedulePending = false;
    let stopped = false;
    let schedule = null;
    let weather = null;

    const showUnavailable = () => renderMessage(
      view,
      'ATHLETE VIEW',
      'Practice plan unavailable',
      'We could not load today’s practice plan. Check your connection and try again. The view will also retry automatically.',
      'Try again',
      () => { void load(); },
    );

    async function load() {
      if (stopped || schedulePending) return;
      schedulePending = true;
      const thisRun = ++runId;
      schedule = null;
      weather = null;

      const weatherTask = timedJson(fetchImpl, weatherUrl, {
        timeoutMs: weatherTimeoutMs, timers, AbortControllerImpl,
      }).then(result => {
        if (stopped || thisRun !== runId) return;
        weather = result;
        if (schedule) render(view, schedule, weather);
      }).catch(() => {
        if (stopped || thisRun !== runId) return;
        weather = null;
        if (schedule) render(view, schedule, null);
      });

      try {
        const result = await timedJson(fetchImpl, scheduleUrl, {
          timeoutMs: scheduleTimeoutMs, credentials: 'same-origin', timers, AbortControllerImpl,
        });
        if (!result || typeof result !== 'object' || !Object.hasOwn(result, 'session')) {
          throw new Error('invalid schedule response');
        }
        if (!stopped && thisRun === runId) {
          schedule = result;
          render(view, schedule, weather);
        }
      } catch {
        if (!stopped && thisRun === runId) showUnavailable();
      } finally {
        if (thisRun === runId) schedulePending = false;
      }
      void weatherTask;
    }

    function start(target = globalThis) {
      view = view || target.document?.getElementById('athlete-view');
      fetchImpl = fetchImpl || target.fetch?.bind(target);
      render = render || target.renderAthleteView;
      renderMessage = renderMessage || target.renderAthleteView?.showMessage;
      if (target.location?.protocol === 'file:' || protocol === 'file:') {
        renderMessage(
          view,
          'OPEN THE LIVE SITE',
          'Athlete View needs the Crew Coach website',
          'This downloaded file can show its design, but it cannot load the live practice plan. Open Athlete View from the Crew Coach website instead.',
        );
        return () => {};
      }
      stopped = false;
      void load();
      timerId = timers.setInterval(() => { void load(); }, refreshMs);
      return stop;
    }

    function stop() {
      stopped = true;
      runId += 1;
      schedulePending = false;
      if (timerId !== null) timers.clearInterval(timerId);
      timerId = null;
    }

    return { start, load, stop };
  }

  function start(target = globalThis) {
    const renderer = target.renderAthleteView;
    const controller = createAthleteController({
      view: target.document?.getElementById('athlete-view'),
      fetchImpl: target.fetch?.bind(target),
      render: renderer,
      renderMessage: renderer?.showMessage,
      protocol: target.location?.protocol,
    });
    return controller.start(target);
  }

  return { start, createAthleteController, timedJson, scheduleUrl, weatherUrl };
});
