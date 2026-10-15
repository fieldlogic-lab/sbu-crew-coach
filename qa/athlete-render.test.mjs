import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const renderAthleteView = require('../js/athlete-render.js');
const athleteController = require('../athlete.js');

class FakeElement {
  constructor(ownerDocument) {
    this.ownerDocument = ownerDocument;
    this.children = [];
    this.className = '';
    this.textContent = '';
    this.innerHTMLWrites = [];
  }

  append(...children) {
    this.children.push(...children);
  }

  replaceChildren(...children) {
    this.children = children;
  }

  set innerHTML(value) {
    this.innerHTMLWrites.push(value);
  }
}

class FakeDocument {
  createElement() {
    return new FakeElement(this);
  }
}

function descendants(element) {
  return [element, ...element.children.flatMap(descendants)];
}

test('hostile published athlete text stays in text nodes', () => {
  const document = new FakeDocument();
  const view = new FakeElement(document);
  const hostile = '<img src=x onerror="globalThis.pwned=true"><script>globalThis.pwned=true</script>';

  renderAthleteView(view, {
    date: '2026-10-15',
    coachPreview: true,
    session: {
      practiceStatus: 'water',
      title: hostile,
      intent: hostile,
      workout: hostile,
      cue: hostile,
    },
  }, null);

  const nodes = descendants(view);
  assert.ok(nodes.some(node => node.textContent === hostile));
  assert.deepEqual(nodes.flatMap(node => node.innerHTMLWrites), []);
  assert.equal(globalThis.pwned, undefined);
});

test('athlete page uses local asset paths and loads the renderer before its controller', () => {
  const html = fs.readFileSync(new URL('../athlete.html', import.meta.url), 'utf8');
  assert.match(html, /href="\.\/app\.css"/);
  assert.ok(html.indexOf('./js/athlete-render.js') < html.indexOf('./athlete.js'));
});

test('weather fixture displays current metrics and tomorrow forecast', () => {
  const document = new FakeDocument();
  const view = new FakeElement(document);
  renderAthleteView(view, { session: null }, {
    current: { wind_speed_10m: 12, wind_gusts_10m: 18, temperature_2m: 55, wind_direction_10m: 315 },
    daily: { temperature_2m_min: [40, 44], temperature_2m_max: [60, 61], wind_speed_10m_max: [10, 11], wind_gusts_10m_max: [15, 16] },
  });
  const texts = descendants(view).map(node => node.textContent);
  for (const metric of ['12 kt', '18 kt', '55°', 'NW', '44°–61°', '11 kt / 16 kt']) assert.ok(texts.includes(metric), metric);
});

test('missing weather measurements are unknown rather than calm or zero degrees', () => {
  const document = new FakeDocument();
  const view = new FakeElement(document);
  renderAthleteView(view, { session: null }, { current: { wind_speed_10m: null, temperature_2m: null, wind_direction_10m: null } });
  const texts = descendants(view).map(node => node.textContent);
  assert.equal(texts.includes('0 kt'), false);
  assert.equal(texts.includes('0°'), false);
  assert.equal(texts.includes('N'), false);
});

test('browser bootstrap requests and renders the schedule without a CommonJS module', async () => {
  const source = fs.readFileSync(new URL('../athlete.js', import.meta.url), 'utf8');
  const requests = [];
  let rendered = false;
  const view = {};
  const context = {
    document: { getElementById: id => id === 'athlete-view' ? view : null },
    location: { protocol: 'https:' },
    fetch: async url => {
      requests.push(url);
      return {
        ok: true,
        json: async () => url === '/api/console?view=athlete'
          ? { session: null, nextSession: null }
          : {},
      };
    },
    renderAthleteView: Object.assign(() => { rendered = true; }, { showMessage() {} }),
    setInterval: () => 1,
    clearInterval() {},
    setTimeout,
    clearTimeout,
  };
  vm.runInNewContext(source, context, { filename: 'athlete.js' });
  await new Promise(resolve => setImmediate(resolve));
  assert.ok(requests.includes('/api/console?view=athlete'));
  assert.equal(rendered, true);
});

test('file URL shows a useful message without making network requests', () => {
  let requested = false;
  let message;
  const controller = athleteController.createAthleteController({
    view: {},
    fetchImpl: async () => { requested = true; },
    render() {},
    renderMessage(_view, _eyebrow, title, body) { message = `${title} ${body}`; },
    protocol: 'file:',
  });
  controller.start({ location: { protocol: 'file:' } });
  assert.equal(requested, false);
  assert.match(message, /Crew Coach website/);
});

test('weather that never resolves does not delay the schedule render', async () => {
  let renderedSchedule = false;
  const timers = {
    setTimeout,
    clearTimeout,
    setInterval: () => 1,
    clearInterval() {},
  };
  const controller = athleteController.createAthleteController({
    view: {},
    fetchImpl(url) {
      if (url === athleteController.scheduleUrl) {
        return Promise.resolve({ ok: true, json: async () => ({ session: null, nextSession: null }) });
      }
      return new Promise(() => {});
    },
    render(_view, schedule) { renderedSchedule = schedule.session === null; },
    renderMessage() {},
    timers,
    weatherTimeoutMs: 40,
  });
  await controller.load();
  assert.equal(renderedSchedule, true);
  controller.stop();
});

test('a stalled schedule request reaches a finite, useful error state', async () => {
  let errorTitle = '';
  const timers = {
    setTimeout,
    clearTimeout,
    setInterval: () => 1,
    clearInterval() {},
  };
  const controller = athleteController.createAthleteController({
    view: {},
    fetchImpl(url) {
      if (url === athleteController.scheduleUrl) return new Promise(() => {});
      return Promise.resolve({ ok: true, json: async () => ({}) });
    },
    render() {},
    renderMessage(_view, _eyebrow, title) { errorTitle = title; },
    timers,
    scheduleTimeoutMs: 15,
    weatherTimeoutMs: 15,
  });
  await controller.load();
  assert.equal(errorTitle, 'Practice plan unavailable');
  controller.stop();
});
