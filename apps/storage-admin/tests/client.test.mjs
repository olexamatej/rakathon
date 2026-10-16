import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient, formatSize } from '../public/app.mjs';

test('login gates requests, metadata listing and deletion use authorized noncached fetch', async () => {
  const calls = [];
  const client = createClient(async (url, options) => {
    calls.push({ url, options });
    return { ok: true, status: options.method === 'DELETE' ? 204 : 200,
      json: async () => ({ items: [], hasMore: false }) };
  });
  await assert.rejects(client.request(''), /přihlaste/);
  assert.equal(calls.length, 0);
  client.login('synthetic-test-password');
  assert.deepEqual(await client.request('?offset=0'), { items: [], hasMore: false });
  assert.equal(await client.request('/ABC', 'DELETE'), null);
  assert.equal(calls[0].url, '/api/v1/admin/blobs?offset=0');
  assert.equal(calls[1].options.method, 'DELETE');
  for (const { url, options } of calls) {
    assert.ok(!url.includes('synthetic-test-password'));
    assert.equal(options.headers.Authorization, 'Bearer synthetic-test-password');
    assert.equal(options.cache, 'no-store');
    assert.equal(options.credentials, 'omit');
    assert.equal(options.redirect, 'error');
  }
  client.logout();
  await assert.rejects(client.request(''), /přihlaste/);
});

test('errors do not echo server bodies or credentials', async () => {
  for (const status of [401, 404, 429, 503]) {
    const client = createClient(async () => ({ ok: false, status }));
    client.login('synthetic-test-password');
    await assert.rejects(client.request(''), (error) => {
      assert.equal(error.status, status);
      assert.ok(!error.message.includes('synthetic-test-password'));
      return true;
    });
  }
});

test('size is the exact byte count, not approximate disk usage', () => {
  assert.equal(formatSize(0), '0 B');
  assert.equal(formatSize(42), '42 B');
});
