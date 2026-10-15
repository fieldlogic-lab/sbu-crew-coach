const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadWorker({ fetchImpl, cacheMatch } = {}) {
  const handlers = {};
  const operations = [];
  const worker = {
    addEventListener(type, handler) { handlers[type] = handler; },
    skipWaiting: async () => operations.push('skipWaiting'),
    clients: { claim: async () => operations.push('claim') },
  };
  const caches = {
    async keys() { return ['old-cache', 'sbu-crew-coach-v12']; },
    async delete(name) { operations.push(`delete:${name}`); },
    async open(name) {
      operations.push(`open:${name}`);
      return { async put(request) { operations.push(`put:${request.url || request}`); } };
    },
    async match(request) { operations.push(`match:${request.url || request}`); return cacheMatch || null; },
  };
  const context = {
    self: worker,
    caches,
    location: { origin: 'https://coach.test' },
    fetch: fetchImpl || (async request => ({ ok: true, url: request.url, clone() { return this; } })),
    URL,
    Promise,
  };
  const source = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');
  vm.runInNewContext(source, context, { filename: 'sw.js' });
  return { handlers, operations };
}

function fetchEvent(request) {
  const event = { request, promise: null, respondWith(promise) { this.promise = promise; } };
  return event;
}

test('PWA never caches API responses and always attempts the network', async () => {
  const { handlers, operations } = loadWorker();
  const request = { method: 'GET', url: 'https://coach.test/api/console?view=athlete' };
  const event = fetchEvent(request);
  handlers.fetch(event);
  assert.ok(event.promise, 'API fetch should be intercepted for network-only handling');
  const result = await event.promise;
  assert.equal(result.url, request.url);
  assert.equal(operations.some(operation => operation.startsWith('put:')), false);
  assert.equal(operations.some(operation => operation.startsWith('match:')), false);
});

test('PWA network-first assets refresh cache and fall back to the cached shell offline', async () => {
  const { handlers, operations } = loadWorker();
  const request = { method: 'GET', url: 'https://coach.test/console.js?v=auth1' };
  const online = fetchEvent(request);
  handlers.fetch(online);
  assert.equal((await online.promise).url, request.url);
  assert.ok(operations.some(operation => operation.startsWith('put:')));

  const offlineAsset = { offline: true };
  const offlineWorker = loadWorker({
    fetchImpl: async () => { throw new Error('offline'); },
    cacheMatch: offlineAsset,
  });
  const offline = fetchEvent(request);
  offlineWorker.handlers.fetch(offline);
  assert.equal(await offline.promise, offlineAsset);
  assert.ok(offlineWorker.operations.some(operation => operation.startsWith('match:')));
});

test('coach PWA shell registers its worker and publishes the standalone install manifest', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'manifest.json'), 'utf8'));
  assert.match(app, /serviceWorker\.register\('\/sw\.js'\)/);
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.start_url, '/');
  assert.equal(manifest.scope, '/');
});
