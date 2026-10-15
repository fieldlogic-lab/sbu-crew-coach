import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { createDraftStore, DraftConflictError } = require('../api/lib/draft-store.js');

function memoryStore(initial) {
  let record = initial ? { text: JSON.stringify(initial), etag: 'v1' } : null;
  let interruptNextWrite = false;
  const getBlob = async () => record && {
    stream: new Response(record.text).body,
    blob: { etag: record.etag },
  };
  const putBlob = async (_pathname, text, options) => {
    if (options.allowOverwrite === false && record) throw Object.assign(new Error('exists'), { status: 412 });
    if (options.ifMatch !== record?.etag) throw Object.assign(new Error('stale'), { status: 412 });
    if (interruptNextWrite) {
      interruptNextWrite = false;
      record = { text: JSON.stringify({ ...JSON.parse(record.text), coachOnly: 'concurrent save' }), etag: 'v2' };
      throw Object.assign(new Error('concurrent write'), { status: 412 });
    }
    record = { text, etag: `v${record ? Number(record.etag.slice(1)) + 1 : 1}` };
  };
  return {
    store: createDraftStore({ getBlob, putBlob }),
    interrupt() { interruptNextWrite = true; },
    current: () => JSON.parse(record.text),
  };
}

test('stale full-record write is rejected', async () => {
  const { store } = memoryStore({ coachOnly: 'old' });
  const snapshot = await store.readDraft();
  await store.writeDraft({ coachOnly: 'new' }, { etag: snapshot.etag });
  await assert.rejects(store.writeDraft({ coachOnly: 'stale overwrite' }, { etag: snapshot.etag }), DraftConflictError);
});

test('narrow update retries from latest record and preserves concurrent fields', async () => {
  const memory = memoryStore({ attendance: { athletes: [] }, coachOnly: 'original' });
  memory.interrupt();
  await memory.store.updateDraft(data => {
    data.attendance.athletes.push('Rower');
    return data;
  });
  assert.deepEqual(memory.current(), {
    attendance: { athletes: ['Rower'] },
    coachOnly: 'concurrent save',
  });
});

test('conditional create only creates an absent record', async () => {
  const memory = memoryStore();
  await memory.store.writeDraft({ initialized: true }, { ifNoneMatch: '*' });
  await assert.rejects(memory.store.writeDraft({ initialized: false }, { ifNoneMatch: '*' }), DraftConflictError);
});
