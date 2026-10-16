import test from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { createAppServer } from '../apps/patient-web/server.mjs';

// Only the public application may be served, never the repository's input data.
test('patient routes, PWA assets and private-file boundaries', async t => {
  const server = createAppServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const root = await fetch(base, { redirect: 'manual' });
  assert.equal(root.status, 302);
  assert.equal(root.headers.get('location'), '/pacient');
  for (const path of ['/pacient', '/pacient/', '/pacient?historie=1', '/pacient?pin=12345678']) {
    const response = await fetch(base + path);
    assert.equal(response.status, 200);
    assert.match(await response.text(), /lang="cs"/);
  }
  const regimens = await (await fetch(base + '/regimens.json')).json();
  assert.ok(regimens.length > 1000 && regimens.every(name => typeof name === 'string'));
  assert.ok(regimens.includes('A-CMF'));
  assert.ok(!regimens.some(name => /bevacizumab-[a-z]{4}\)/.test(name)), 'biosimilar copies are excluded');
  const manifest = await (await fetch(base + '/manifest.webmanifest')).json();
  assert.equal(manifest.start_url, '/pacient');
  assert.equal(manifest.display, 'standalone');
  for (const icon of manifest.icons) {
    const response = await fetch(base + icon.src);
    assert.equal(response.status, 200);
    assert.ok((await response.arrayBuffer()).byteLength > 100);
  }
  assert.equal((await fetch(base + '/sw.js')).status, 200);
  for (const path of ['/.env', '/.git/config', '/data/sukl/medications.json', '/assets/private.jpg', '/__proto__']) {
    assert.equal((await fetch(base + path)).status, 404);
  }
  assert.equal((await fetch(base + '/pacient', { method: 'POST', body: 'not-an-api' })).status, 405);
  const malformedStatus = await new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port: server.address().port, path: 'http://[' }, response => {
      response.resume();
      resolve(response.statusCode);
    });
    req.on('error', reject);
    req.end();
  });
  assert.equal(malformedStatus, 400);
});
