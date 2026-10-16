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

function tabStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}

test('refresh restores same-tab login without extending expiry, logout clears it', async () => {
  const storage = tabStorage();
  let time = 1000;
  const fetcher = async (_, options) => {
    assert.equal(options.headers.Authorization, 'Bearer synthetic-test-password');
    return { ok: true, status: 200, json: async () => ({ items: [] }) };
  };
  const first = createClient(fetcher, storage, () => time);
  first.login('synthetic-test-password');
  time += 60000;
  const refreshed = createClient(fetcher, storage, () => time);
  assert.equal(refreshed.remaining(), 14 * 60000);
  await refreshed.request('');
  const otherTab = createClient(fetcher, tabStorage(), () => time);
  await assert.rejects(otherTab.request(''), /přihlaste/);
  refreshed.logout();
  await assert.rejects(createClient(fetcher, storage, () => time).request(''), /přihlaste/);
});

test('expired and rejected credentials are removed, including after refresh', async () => {
  const storage = tabStorage();
  let time = 1000;
  const fetcher = async () => ({ ok: false, status: 401 });
  const client = createClient(fetcher, storage, () => time);
  client.login('synthetic-test-password');
  time += 15 * 60000;
  await assert.rejects(client.request(''), /vypršelo/);
  await assert.rejects(createClient(fetcher, storage, () => time).request(''), /přihlaste/);
  client.login('synthetic-test-password');
  await assert.rejects(client.request(''), /Nesprávné/);
  await assert.rejects(createClient(fetcher, storage, () => time).request(''), /přihlaste/);
  client.login('synthetic-test-password');
  time += 15 * 60000;
  assert.equal(createClient(fetcher, storage, () => time).remaining(), 0);
});

test('invalid or unavailable session storage safely falls back to memory', async () => {
  for (const storage of [
    { getItem: () => '{invalid', removeItem() {} },
    { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); }, removeItem() { throw new Error('blocked'); } },
  ]) {
    const client = createClient(async () => ({ ok: true, status: 204 }), storage);
    await assert.rejects(client.request(''), /přihlaste/);
    client.login('synthetic-test-password');
    assert.equal(await client.request(''), null);
    client.logout();
    await assert.rejects(client.request(''), /přihlaste/);
  }
});
