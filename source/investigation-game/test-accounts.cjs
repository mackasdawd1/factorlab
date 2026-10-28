const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const simulation = require('./v2/simulation.js');
let createAccountService;
try { ({ createAccountService } = require('./accounts.cjs')); }
catch (error) { if (error.code !== 'MODULE_NOT_FOUND') throw error; }

const directory = path.resolve(__dirname, '../.local/reuse-20261016/account-tests');
fs.mkdirSync(directory, { recursive: true });
const password = 'Research-only-2026!';
const envelope = () => ({ version: 'factorlab-ui-v3', game: simulation.serialize(simulation.initial()), draft: [.2, .2, .15, .15, .15, .15], factorPrefs: [25, 25, 25, 25], reason: 'evidence', note: '订单与盈利需要分别检验', forecast: 'flat', reflection: '保留长期锚，检验短期判断。' });

async function fixture(t) {
  assert.equal(typeof createAccountService, 'function', 'A real local account service is required');
  const dbPath = path.join(directory, randomUUID() + '.sqlite');
  let clock = 1800000000000;
  let service = createAccountService({ dbPath, simulation, now: () => clock });
  const server = http.createServer(async (req, res) => {
    try {
      if (!await service.handle(req, res, new URL(req.url, 'http://localhost'))) {
        res.writeHead(404, { 'content-type': 'application/json' }); res.end('{"error":"not_found"}');
      }
    } catch { res.writeHead(500); res.end('{"error":"test_handler_error"}'); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port, origin = 'http://127.0.0.1:' + port;
  t.after(async () => { await new Promise(resolve => server.close(resolve)); service.close(); });
  function api(method, route, body, user, overrides = {}) {
    const headers = { host: '127.0.0.1:' + port, origin, 'content-type': 'application/json', ...(user ? { cookie: user.cookie, 'x-csrf-token': user.csrfToken } : {}), ...overrides };
    for (const key of Object.keys(headers)) if (headers[key] === undefined) delete headers[key];
    return new Promise((resolve, reject) => {
      const req = http.request({ hostname: '127.0.0.1', port, method, path: route, headers }, res => {
        const chunks = [];
        res.on('data', chunk => chunks.push(chunk));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString();
          let value; try { value = JSON.parse(text); } catch { value = { raw: text }; }
          resolve({ status: res.statusCode, body: value, headers: res.headers });
        });
      });
      req.on('error', reject);
      req.end(body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body));
    });
  }
  async function register(username = 'Researcher_1') {
    const result = await api('POST', '/api/register', { username, password });
    assert.equal(result.status, 201);
    return { ...result.body, cookie: result.headers['set-cookie'][0].split(';')[0], result };
  }
  return { api, register, dbPath, advance: milliseconds => { clock += milliseconds; }, restart: () => { service.close(); service = createAccountService({ dbPath, simulation, now: () => clock }); } };
}

test('anonymous session exposes no identity and unrelated paths fall through', async t => {
  const f = await fixture(t);
  const result = await f.api('GET', '/api/session');
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, { enabled: true, user: null, csrfToken: null });
  assert.equal(result.headers['cache-control'], 'no-store');
  assert.equal((await f.api('GET', '/unrelated')).status, 404);
  assert.equal((await f.api('GET', '/api/saves')).status, 401);
});

test('registration validates credentials and sets a browser-only strict session cookie', async t => {
  const f = await fixture(t);
  for (const data of [{ username: 'ab', password }, { username: "x' OR 1=1--", password }, { username: 'valid_name', password: 'short' }, { username: 'valid_name', password: 'x'.repeat(129) }]) assert.equal((await f.api('POST', '/api/register', data)).status, 400);
  const user = await f.register();
  assert.equal(user.user.username, 'Researcher_1');
  assert.equal(typeof user.user.id, 'string');
  assert.match(user.result.headers['set-cookie'][0], /HttpOnly/);
  assert.match(user.result.headers['set-cookie'][0], /SameSite=Strict/);
  assert.match(user.result.headers['set-cookie'][0], /Path=\//);
  assert.ok(user.csrfToken.length >= 32);
  assert.deepEqual((await f.api('GET', '/api/session', undefined, user)).body.user, user.user);
  assert.equal((await f.api('POST', '/api/register', { username: 'researcher_1', password })).status, 409);
});

test('passwords are salted and session cookies are not stored as database credentials', async t => {
  const f = await fixture(t), one = await f.register('one_user'), two = await f.register('two_user');
  const db = new DatabaseSync(f.dbPath, { readOnly: true });
  try {
    const rows = db.prepare('SELECT password_hash, salt FROM users ORDER BY username').all();
    assert.equal(rows.length, 2);
    assert.ok(rows[0].password_hash !== rows[1].password_hash);
    assert.ok(rows[0].salt !== rows[1].salt);
    const sessions = db.prepare('SELECT token_hash FROM sessions').all();
    assert.equal(sessions.length, 2);
    const stored = JSON.stringify({ rows, sessions });
    assert.ok(!stored.includes(password));
    assert.ok(!stored.includes(one.cookie.split('=')[1]));
    assert.ok(!stored.includes(two.cookie.split('=')[1]));
  } finally { db.close(); }
});

test('login uses generic credential errors and rotates an existing browser session', async t => {
  const f = await fixture(t), user = await f.register();
  const wrong = await f.api('POST', '/api/login', { username: 'Researcher_1', password: 'wrong-password' });
  const missing = await f.api('POST', '/api/login', { username: 'missing_user', password: 'wrong-password' });
  assert.equal(wrong.status, 401); assert.equal(missing.status, 401); assert.deepEqual(wrong.body, missing.body);
  const login = await f.api('POST', '/api/login', { username: 'researcher_1', password }, user);
  assert.equal(login.status, 200);
  const cookie = login.headers['set-cookie'][0].split(';')[0];
  assert.ok(cookie !== user.cookie);
  assert.equal((await f.api('GET', '/api/session', undefined, user)).body.user, null);
  assert.equal((await f.api('GET', '/api/session', undefined, { cookie })).body.user.id, user.user.id);
});

test('saved envelopes replay the simulation and retain learning notes without trusting uploaded NAV', async t => {
  const f = await fixture(t), user = await f.register(), item = envelope();
  item.game.nav = 999999999; item.unknown = { hidden: 'must not persist' };
  item.game.commands.push({ type: 'read', id: 'E1' }, { type: 'lock', weights: item.draft, factorWeights: [.25, .25, .25, .25], reason: 'evidence', forecast: 'flat' }, { type: 'advance', days: 1 });
  const created = await f.api('POST', '/api/saves', { name: "研究 '); DROP TABLE users; --", envelope: item }, user);
  assert.equal(created.status, 201);
  assert.equal(created.body.save.revision, 1); assert.equal(created.body.save.day, 1); assert.equal(created.body.save.round, 1);
  const loaded = await f.api('GET', '/api/saves/' + created.body.save.id, undefined, user);
  assert.equal(loaded.status, 200); assert.equal(loaded.body.save.envelope.note, item.note); assert.equal(loaded.body.save.envelope.reflection, item.reflection);
  assert.equal(loaded.body.save.envelope.game.nav, undefined); assert.equal(loaded.body.save.envelope.unknown, undefined);
  assert.ok(simulation.restore(loaded.body.save.envelope.game).nav < 200000);
  const listed = await f.api('GET', '/api/saves', undefined, user);
  assert.equal(listed.body.saves.length, 1); assert.equal(listed.body.saves[0].name, created.body.save.name);
  assert.equal(listed.body.saves[0].envelope, undefined);
  assert.equal((await f.api('POST', '/api/login', { username: 'Researcher_1', password })).status, 200);
});

test('another user cannot read or overwrite a save, including through SQL-like IDs', async t => {
  const f = await fixture(t), owner = await f.register('owner_user'), other = await f.register('other_user');
  const saved = await f.api('POST', '/api/saves', { name: 'owner', envelope: envelope() }, owner), route = '/api/saves/' + saved.body.save.id;
  assert.deepEqual((await f.api('GET', '/api/saves', undefined, other)).body, { saves: [] });
  assert.equal((await f.api('GET', route, undefined, other)).status, 404);
  assert.equal((await f.api('PUT', route, { name: 'attack', envelope: envelope(), revision: 1 }, other)).status, 404);
  assert.equal((await f.api('GET', '/api/saves/1%27%20OR%201=1--', undefined, owner)).status, 404);
  assert.equal((await f.api('GET', route, undefined, owner)).body.save.name, 'owner');
});

test('stale browser tabs cannot read another account with its cookie and an old CSRF token', async t => {
  const f = await fixture(t), first = await f.register('first_user'), second = await f.register('second_user');
  const saved = await f.api('POST', '/api/saves', { name: 'second-private', envelope: envelope() }, second);
  const stale = { cookie: second.cookie, csrfToken: first.csrfToken };
  assert.equal((await f.api('GET', '/api/saves', undefined, stale)).status, 403);
  assert.equal((await f.api('GET', '/api/saves/' + saved.body.save.id, undefined, stale)).status, 403);
  assert.equal((await f.api('GET', '/api/session', undefined, stale)).body.user.id, second.user.id);
  assert.equal((await f.api('GET', '/api/saves', undefined, second)).status, 200);
  assert.equal((await f.api('GET', '/api/saves', undefined, { cookie: second.cookie })).status, 200);
});

test('malformed game state or oversized learning text is rejected before persistence', async t => {
  const f = await fixture(t), user = await f.register();
  const mutations = [x => { x.game.commands = [{ type: 'advance', days: 1 }]; }, x => { x.game.seed = -1; }, x => { x.note = 'x'.repeat(181); }, x => { x.reflection = 'x'.repeat(601); }, x => { x.draft = [.9, 0, 0, 0, 0, .1]; }, x => { x.factorPrefs = [0, 0, 0, 0]; }, x => { x.forecast = 'guaranteed'; }, x => { x.reason = 'buy_now'; }];
  for (const mutate of mutations) { const item = envelope(); mutate(item); assert.equal((await f.api('POST', '/api/saves', { name: 'invalid', envelope: item }, user)).status, 400); }
  assert.equal((await f.api('POST', '/api/saves', { name: ' ', envelope: envelope() }, user)).status, 400);
  assert.deepEqual((await f.api('GET', '/api/saves', undefined, user)).body.saves, []);
});

test('write endpoints require the precise local origin, JSON, and per-session CSRF', async t => {
  const f = await fixture(t), user = await f.register(), body = { name: 'protected', envelope: envelope() };
  for (const headers of [{ origin: undefined }, { origin: 'https://attacker.example' }, { origin: 'null' }, { 'content-type': 'text/plain' }, { 'x-csrf-token': undefined }, { 'x-csrf-token': 'not-the-token' }]) assert.equal((await f.api('POST', '/api/saves', body, user, headers)).status, 403);
  assert.equal((await f.api('GET', '/api/session', undefined, user, { host: 'attacker.example' })).status, 403);
  assert.equal((await f.api('GET', '/api/session', undefined, user, { origin: 'https://attacker.example' })).status, 403);
  assert.equal((await f.api('POST', '/api/register', { username: 'forbidden_user', password }, undefined, { origin: undefined })).status, 403);
  assert.equal((await f.api('POST', '/api/login', { username: 'Researcher_1', password }, undefined, { 'content-type': 'text/plain' })).status, 403);
  assert.equal((await f.api('POST', '/api/saves', body, user)).status, 201);
});

test('concurrent saves perform compare-and-swap and keep the winner when stale writes arrive', async t => {
  const f = await fixture(t), user = await f.register();
  const initial = await f.api('POST', '/api/saves', { name: 'initial', envelope: envelope() }, user), route = '/api/saves/' + initial.body.save.id;
  const results = await Promise.all(['tab-one', 'tab-two'].map(name => f.api('PUT', route, { name, envelope: envelope(), revision: 1 }, user)));
  assert.deepEqual(results.map(result => result.status).sort(), [200, 409]);
  const winner = results.find(result => result.status === 200).body.save;
  assert.equal(winner.revision, 2);
  assert.equal((await f.api('PUT', route, { name: 'stale', envelope: envelope(), revision: 1 }, user)).status, 409);
  assert.equal((await f.api('GET', route, undefined, user)).body.save.name, winner.name);
});

test('slot and body bounds preserve previous saves and reject malformed JSON', async t => {
  const f = await fixture(t), user = await f.register();
  for (let i = 0; i < 12; i++) assert.equal((await f.api('POST', '/api/saves', { name: 'slot-' + i, envelope: envelope() }, user)).status, 201);
  assert.equal((await f.api('POST', '/api/saves', { name: 'overflow', envelope: envelope() }, user)).status, 409);
  assert.equal((await f.api('POST', '/api/saves', '{"envelope":"' + 'x'.repeat(510000) + '"}', user)).status, 413);
  assert.equal((await f.api('POST', '/api/saves', '{broken', user)).status, 400);
  assert.equal((await f.api('GET', '/api/saves', undefined, user)).body.saves.length, 12);
});

test('reopening SQLite preserves identity, session and saved learning progress', async t => {
  const f = await fixture(t), user = await f.register(), item = envelope();
  const initial = await f.api('POST', '/api/saves', { name: 'persistent', envelope: item }, user);
  f.restart();
  assert.equal((await f.api('GET', '/api/session', undefined, user)).body.user.id, user.user.id);
  const loaded = await f.api('GET', '/api/saves/' + initial.body.save.id, undefined, user);
  assert.equal(loaded.status, 200); assert.deepEqual(loaded.body.save.envelope, item);
});

test('logout invalidates the cookie server-side and sessions expire after one day', async t => {
  const f = await fixture(t), user = await f.register();
  assert.equal((await f.api('POST', '/api/logout', {}, user, { 'x-csrf-token': 'wrong' })).status, 403);
  const out = await f.api('POST', '/api/logout', {}, user);
  assert.equal(out.status, 200); assert.equal(out.body.user, null); assert.match(out.headers['set-cookie'][0], /Max-Age=0/);
  assert.equal((await f.api('GET', '/api/saves', undefined, user)).status, 401);
  const login = await f.api('POST', '/api/login', { username: 'Researcher_1', password });
  const again = { cookie: login.headers['set-cookie'][0].split(';')[0], csrfToken: login.body.csrfToken };
  f.advance(86400000);
  assert.equal((await f.api('GET', '/api/session', undefined, again)).body.user, null);
  assert.equal((await f.api('GET', '/api/saves', undefined, again)).status, 401);
});

test('authentication rate limits recover after their window and bound concurrent hashing', async t => {
  const f = await fixture(t);
  const attempts = await Promise.all(Array.from({ length: 6 }, (_, i) => f.api('POST', '/api/login', { username: 'missing_' + i, password })));
  assert.ok(attempts.some(result => result.status === 429));
  assert.equal(attempts.filter(result => result.status === 401).length, 2);
  for (let i = 0; i < 6; i++) await f.api('POST', '/api/login', { username: 'not_registered', password });
  const limited = await f.api('POST', '/api/login', { username: 'not_registered', password });
  assert.equal(limited.status, 429); assert.ok(Number(limited.headers['retry-after']) > 0);
  f.advance(300001);
  assert.equal((await f.api('POST', '/api/login', { username: 'not_registered', password })).status, 401);
});
