const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { randomUUID } = require('node:crypto');
const { createAccountService } = require('../accounts.cjs');
const { createServer } = require('../server.cjs');
const simulation = require('../v2/simulation.js');

const testRoot = path.resolve(__dirname, '../../.local/cloud-20261020/tests');
const directory = () => path.join(testRoot, randomUUID());
const envelope = () => ({
  version: 'factorlab-ui-v3', game: simulation.serialize(simulation.initial()),
  draft: [.2, .2, .15, .15, .15, .15], factorPrefs: [25, 25, 25, 25],
  reason: 'evidence', note: 'Orders require evidence.', forecast: 'flat', reflection: ''
});
async function listen(t, dataRoot) {
  const server = createServer({ env: {}, accounts: { dataRoot, dbPath: path.join(dataRoot, 'factorlab.sqlite') } });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  t.after(() => new Promise(resolve => server.close(resolve)));
  const port = server.address().port;
  function api(method, route, body, user, overrides = {}) {
    return new Promise((resolve, reject) => {
      const req = http.request({
        hostname: '127.0.0.1', port, method, path: route,
        headers: { origin: `http://127.0.0.1:${port}`, 'content-type': 'application/json',
          ...(user ? { cookie: user.cookie, 'x-csrf-token': user.csrfToken } : {}), ...overrides }
      }, res => {
        const chunks = [];
        res.on('data', chunk => chunks.push(chunk));
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString();
          let data; try { data = JSON.parse(raw); } catch { data = raw; }
          resolve({ status: res.statusCode, data, headers: res.headers });
        });
      });
      req.on('error', reject);
      req.end(body === undefined ? undefined : JSON.stringify(body));
    });
  }
  return { server, api };
}

test('explicit data root persists accounts and saves independently of the release directory', async t => {
  const dataRoot = directory(), first = await listen(t, dataRoot);
  const registration = await first.api('POST', '/api/register', { username: 'cloud_test', password: 'Cloud-test-only-2026!' });
  assert.equal(registration.status, 201);
  const user = { ...registration.data, cookie: registration.headers['set-cookie'][0].split(';')[0] };
  const saved = await first.api('POST', '/api/saves', { name: 'Durable research', envelope: envelope() }, user);
  assert.equal(saved.status, 201);
  assert.ok(fs.existsSync(path.join(dataRoot, 'factorlab.sqlite')));
  await new Promise(resolve => first.server.close(resolve));
  const restarted = await listen(t, dataRoot);
  const login = await restarted.api('POST', '/api/login', { username: 'cloud_test', password: 'Cloud-test-only-2026!' });
  assert.equal(login.status, 200);
  const relogged = { ...login.data, cookie: login.headers['set-cookie'][0].split(';')[0] };
  const loaded = await restarted.api('GET', '/api/saves/' + saved.data.save.id, undefined, relogged);
  assert.equal(loaded.status, 200);
  assert.equal(loaded.data.save.name, 'Durable research');
  assert.deepEqual(loaded.data.save.envelope, saved.data.save.envelope);
  assert.equal((await restarted.api('PUT', '/api/saves/' + saved.data.save.id,
    { name: 'Stale update', envelope: envelope(), revision: 999 }, relogged)).status, 409);
});

test('default storage boundary remains restricted and explicit roots cannot permit parent traversal', () => {
  const dataRoot = directory(), dbPath = path.join(dataRoot, 'factorlab.sqlite');
  assert.throws(() => createAccountService({ dbPath }), /must stay inside/);
  assert.throws(() => createAccountService({ dataRoot, dbPath: path.join(dataRoot, '../escape.sqlite') }), /must stay inside/);
  assert.throws(() => createAccountService({ dataRoot: 'relative', dbPath }), /absolute.*root/i);
  assert.throws(() => createAccountService({ dataRoot: path.parse(dataRoot).root, dbPath }), /root directory/i);
});

test('server deployment retains Host, Origin, CSRF and private-file protection', async t => {
  const f = await listen(t, directory());
  assert.equal((await f.api('GET', '/api/session', undefined, null, { host: '192.0.2.1' })).status, 403);
  assert.equal((await f.api('GET', '/api/session', undefined, null, { origin: 'https://wrong.example' })).status, 403);
  for (const route of ['/.env', '/accounts.cjs', '/deploy/start.cjs', '/factorlab.sqlite', '/../.local/reuse-20261016/data/factorlab.sqlite']) {
    assert.equal((await f.api('GET', route)).status, 404);
  }
  const registration = await f.api('POST', '/api/register', { username: 'boundary_test', password: 'Cloud-test-only-2026!' });
  assert.equal(registration.status, 201);
  const cookie = registration.headers['set-cookie'][0].split(';')[0];
  assert.equal((await f.api('POST', '/api/saves', { name: 'Rejected', envelope: envelope() },
    { cookie, csrfToken: '0'.repeat(64) })).status, 403);
  assert.equal((await f.api('GET', '/v3/')).status, 200);
  assert.equal((await f.api('GET', '/api/status')).data.configured, false);
});

test('deployment configuration requires durable absolute storage and an unprivileged port', () => {
  const { configuration } = require('./start.cjs');
  const dataRoot = directory();
  assert.deepEqual(configuration({ FACTORLAB_DATA_DIR: dataRoot }), {
    dataRoot, dbPath: path.join(dataRoot, 'factorlab.sqlite'), port: 18991
  });
  for (const value of ['0', '80', '65536', '18991oops', '1.5', '']) {
    assert.throws(() => configuration({ FACTORLAB_DATA_DIR: dataRoot, FACTORLAB_PORT: value }), /port/i);
  }
  for (const value of ['', 'relative', path.parse(dataRoot).root, path.resolve(__dirname, '..')]) {
    assert.throws(() => configuration({ FACTORLAB_DATA_DIR: value }), /data|root/i);
  }
});

test('deployment starter binds only loopback and creates storage outside the release', async t => {
  const { start } = require('./start.cjs');
  const probe = http.createServer();
  await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  const dataRoot = directory();
  const server = await start({ FACTORLAB_DATA_DIR: dataRoot, FACTORLAB_PORT: String(port) });
  t.after(() => new Promise(resolve => server.close(resolve)));
  assert.equal(server.address().address, '127.0.0.1');
  assert.ok(fs.existsSync(path.join(dataRoot, 'factorlab.sqlite')));
});
