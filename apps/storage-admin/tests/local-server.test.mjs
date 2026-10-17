import test from 'node:test';
import assert from 'node:assert/strict';
import { createAppServer } from '../../patient-web/server.mjs';

test('remote mode serves local admin assets only from the public allowlist', async t => {
  const server = createAppServer({ backendUrl: 'https://example.invalid' });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  for (const path of ['/storage-admin', '/storage-admin/', '/storage-admin/app.mjs', '/storage-admin/styles.css']) {
    const response = await fetch(base + path);
    assert.equal(response.status, 200, path);
    assert.equal(response.headers.get('cache-control'), 'no-store');
  }
  for (const path of ['/storage-admin/.env', '/storage-admin/README.md', '/storage-admin/tests/local-server.test.mjs']) {
    assert.equal((await fetch(base + path)).status, 404, path);
  }
});
