// Test-only same-origin gateway. Uses the real Rust API and a disposable SQLite DB.
import { createServer, request } from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { createAppServer } from '../apps/patient-web/server.mjs';

const directory = await mkdtemp(join(tmpdir(), 'pillgaze-e2e-'));
const api = spawn(resolve(process.env.E2E_API_BINARY || '../services/transfer-api/target/debug/pillgaze-transfer-api'), [], {
  env: {
    ...process.env,
    BIND_ADDRESS: '127.0.0.1:4181',
    PILLGAZE_DB_PATH: join(directory, 'storage.sqlite3'),
    TRANSFER_HMAC_SECRET: randomBytes(32).toString('hex'),
    STORAGE_ADMIN_PASSWORD: 'local-e2e-password',
    STORAGE_ADMIN_DEBUG_VISIBILITY: 'true',
  },
  stdio: ['ignore', 'ignore', 'pipe'],
});
// Do not forward request logs or metadata into CI output.
api.stderr.resume();
let stopping = false;
const patient = createAppServer();
const gateway = createServer(async (req, res) => {
  const path = new URL(req.url, 'http://localhost').pathname;
  if (path.startsWith('/api/')) {
    const upstream = request({ hostname: '127.0.0.1', port: 4181, path: req.url.slice(4), method: req.method, headers: req.headers }, response => {
      res.writeHead(response.statusCode, response.headers);
      response.pipe(res);
    });
    upstream.on('error', () => { if (!res.headersSent) res.writeHead(502); res.end(); });
    req.pipe(upstream);
    return;
  }
  const adminFiles = {
    '/storage-admin': ['index.html', 'text/html'],
    '/storage-admin/': ['index.html', 'text/html'],
    '/storage-admin/app.mjs': ['app.mjs', 'text/javascript'],
    '/storage-admin/styles.css': ['styles.css', 'text/css'],
  };
  if (Object.hasOwn(adminFiles, path) && req.method === 'GET') {
    const [name, type] = adminFiles[path];
    const body = await readFile(new URL(`../apps/storage-admin/public/${name}`, import.meta.url));
    res.writeHead(200, { 'Content-Type': `${type}; charset=utf-8`, 'Cache-Control': 'no-store' });
    res.end(body);
    return;
  }
  patient.emit('request', req, res);
});
async function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  gateway.closeAllConnections();
  gateway.close();
  if (api.pid && api.exitCode === null && api.signalCode === null) {
    await new Promise(resolveExit => { api.once('exit', resolveExit); api.kill('SIGTERM'); });
  }
  await rm(directory, { recursive: true, force: true });
  process.exit(code);
}
process.on('SIGTERM', () => void stop());
process.on('SIGINT', () => void stop());
api.on('error', () => { console.error('Cannot start E2E API binary. Build it first.'); void stop(1); });
api.on('exit', () => { if (!stopping) { console.error('E2E API exited unexpectedly.'); void stop(1); } });
let ready = false;
for (let attempt = 0; attempt < 100 && !stopping; attempt++) {
  try { ready = (await fetch('http://127.0.0.1:4181/health/ready')).ok; } catch { /* Starting. */ }
  if (ready) break;
  await new Promise(resolveWait => setTimeout(resolveWait, 100));
}
if (!ready) await stop(1);
// Exercise pagination without consuming the public upload rate limit.
const database = new DatabaseSync(join(directory, 'storage.sqlite3'));
const insert = database.prepare('INSERT INTO blob_transfers (pin_digest, payload, created_at) VALUES (?, ?, ?)');
for (let index = 0; index < 101; index++) {
  insert.run(randomBytes(32), Buffer.from('{"synthetic":true}'), 1);
}
database.close();
gateway.listen(4180, '127.0.0.1');
