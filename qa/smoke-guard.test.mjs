import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const smokePath = fileURLToPath(new URL('./smoke.mjs', import.meta.url));

function rejectsWithoutNetwork(env, pattern) {
  assert.throws(
    () => execFileSync(process.execPath, [smokePath], { env, stdio: 'pipe' }),
    error => {
      assert.match(error.stderr.toString(), pattern);
      return true;
    },
  );
}

test('isolated smoke checks fail closed when target classification is missing', () => {
  rejectsWithoutNetwork({}, /TEST_ENVIRONMENT=isolated/);
});

test('isolated smoke checks reject the production app host', () => {
  rejectsWithoutNetwork({
    TEST_ENVIRONMENT: 'isolated',
    TEST_DATA_STORE_ISOLATED: 'true',
    TEST_INTEGRATIONS_ISOLATED: 'true',
    TEST_BASE_URL: 'https://crew.rtpny.com',
    TEST_PUBLIC_BASE_URL: 'https://example.invalid',
  }, /production host/);
});

test('isolated smoke checks reject production Vercel credentials', () => {
  rejectsWithoutNetwork({
    TEST_ENVIRONMENT: 'isolated',
    TEST_DATA_STORE_ISOLATED: 'true',
    TEST_INTEGRATIONS_ISOLATED: 'true',
    TEST_BASE_URL: 'https://test.example.invalid',
    TEST_PUBLIC_BASE_URL: 'https://test.example.invalid',
    BLOB_READ_WRITE_TOKEN: 'synthetic-test-marker',
  }, /application or deployment credentials present/);
});

test('isolation attestations cannot enable an unverified hosted alias', () => {
  rejectsWithoutNetwork({
    TEST_ENVIRONMENT: 'isolated',
    TEST_DATA_STORE_ISOLATED: 'true',
    TEST_INTEGRATIONS_ISOLATED: 'true',
    TEST_BASE_URL: 'https://unverified-preview.example.invalid',
    TEST_PUBLIC_BASE_URL: 'https://unverified-preview.example.invalid',
  }, /no hosted target has verified isolation/);
});
