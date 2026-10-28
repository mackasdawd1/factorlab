const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { randomBytes, randomUUID, createHash, createHmac, scrypt, timingSafeEqual } = require('node:crypto');
const { promisify } = require('node:util');

const derive = promisify(scrypt);
const COOKIE = 'factorlab_session';
const SESSION_MS = 86400000;
const HASH_OPTIONS = { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 };
const HASH_PREFIX = 'scrypt$32768$8$3$';
const fail = (status, code) => { throw Object.assign(Error(code), { status, code }); };
const isObject = value => value && typeof value === 'object' && !Array.isArray(value);
const digest = value => createHash('sha256').update(value).digest('hex');
const csrfFor = token => createHmac('sha256', token).update('factorlab-csrf-v1').digest('hex');
const loopback = address => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(address);

function send(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
  res.end(JSON.stringify(body));
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    let size = 0, ended = false;
    const chunks = [];
    const finish = (error, body) => {
      if (ended) return;
      ended = true; clearTimeout(timer);
      if (error) { chunks.length = 0; req.resume(); reject(error); } else resolve(body);
    };
    const error = (status, code) => Object.assign(Error(code), { status, code });
    const timer = setTimeout(() => finish(error(408, 'request_timeout')), 5000);
    timer.unref();
    req.on('data', chunk => {
      if (ended) return;
      size += chunk.length;
      if (size > limit) finish(error(413, 'body_too_large'));
      else chunks.push(chunk);
    });
    req.on('end', () => {
      if (ended) return;
      try { finish(null, JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch { finish(error(400, 'invalid_request')); }
    });
    req.on('error', () => finish(error(400, 'invalid_request')));
    req.on('aborted', () => finish(error(400, 'invalid_request')));
  });
}

function canonicalEnvelope(item, simulation) {
  if (!isObject(item) || !['factorlab-ui-v2', 'factorlab-ui-v3'].includes(item.version) || !isObject(item.game)) fail(400, 'invalid_save');
  if (Buffer.byteLength(JSON.stringify(item)) > 500000) fail(413, 'body_too_large');
  const validDraft = Array.isArray(item.draft) && item.draft.length === 6 && item.draft.every(value => Number.isFinite(value) && value >= 0 && value <= 1) && Math.abs(item.draft.reduce((a, b) => a + b, 0) - 1) < 1e-7 && item.draft.slice(0, 5).every(value => value <= .4 + 1e-10);
  const validFactors = Array.isArray(item.factorPrefs) && item.factorPrefs.length === 4 && item.factorPrefs.every(value => Number.isFinite(value) && value >= 0 && value <= 100) && item.factorPrefs.some(value => value > 0);
  if (!validDraft || !validFactors || !['', 'evidence', 'risk', 'anchor', 'valuation'].includes(item.reason) || !['up', 'flat', 'down'].includes(item.forecast) || typeof item.note !== 'string' || item.note.length > 180 || typeof item.reflection !== 'string' || item.reflection.length > 600) fail(400, 'invalid_save');
  let state;
  try { state = simulation.restore(item.game); }
  catch { fail(400, 'invalid_save'); }
  const envelope = { version: 'factorlab-ui-v3', game: simulation.serialize(state), draft: [...item.draft], factorPrefs: [...item.factorPrefs], reason: item.reason, note: item.note, forecast: item.forecast, reflection: item.reflection };
  const json = JSON.stringify(envelope);
  if (Buffer.byteLength(json) > 500000) fail(413, 'body_too_large');
  return { json, state };
}

function createAccountService({ dbPath, dataRoot = path.resolve(__dirname, '../.local/reuse-20261016'), simulation = require('./v2/simulation.js'), now = Date.now } = {}) {
  if (typeof dataRoot !== 'string' || !path.isAbsolute(dataRoot)) throw Error('An absolute account data root is required');
  const allowed = path.resolve(dataRoot);
  if (allowed === path.parse(allowed).root) throw Error('The account data root cannot be a filesystem root directory');
  if (typeof dbPath !== 'string' || !path.isAbsolute(dbPath)) throw Error('An absolute local account database path is required');
  const resolved = path.resolve(dbPath), relative = path.relative(allowed, resolved);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw Error('Account database must stay inside its configured data root');
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  const db = new DatabaseSync(resolved, { timeout: 3000 });
  db.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL,
      username_key TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      salt TEXT NOT NULL,
      created_at INTEGER NOT NULL
    ) STRICT;
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      expires_at INTEGER NOT NULL
    ) STRICT;
    CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
    CREATE TABLE IF NOT EXISTS saves (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      name TEXT NOT NULL,
      revision INTEGER NOT NULL CHECK (revision > 0),
      updated_at INTEGER NOT NULL,
      day INTEGER NOT NULL,
      round INTEGER NOT NULL,
      scenario TEXT NOT NULL,
      envelope TEXT NOT NULL
    ) STRICT;
    CREATE INDEX IF NOT EXISTS saves_user ON saves(user_id);
  `);
  const dummySalt = randomBytes(16).toString('hex'), dummyHash = randomBytes(64);
  const limits = new Map();
  let activeHashes = 0, closed = false;

  function transaction(work) {
    db.exec('BEGIN IMMEDIATE');
    try { const value = work(); db.exec('COMMIT'); return value; }
    catch (error) { db.exec('ROLLBACK'); throw error; }
  }
  function tokenFrom(req) {
    const cookies = String(req.headers.cookie || '').split(';').map(value => value.trim()).filter(value => value.startsWith(COOKIE + '='));
    if (cookies.length !== 1) return null;
    const token = cookies[0].slice(COOKIE.length + 1);
    return /^[a-f0-9]{64}$/.test(token) ? token : null;
  }
  function sessionFrom(req) {
    const token = tokenFrom(req);
    if (!token) return null;
    const row = db.prepare('SELECT u.id, u.username FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?').get(digest(token), now());
    return row ? { user: { id: row.id, username: row.username }, token, csrfToken: csrfFor(token) } : null;
  }
  const sessionBody = session => ({ enabled: true, user: session?.user || null, csrfToken: session?.csrfToken || null });
  function establish(req, res, user) {
    const token = randomBytes(32).toString('hex'), prior = tokenFrom(req);
    if (prior) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(digest(prior));
    db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(now());
    db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)').run(digest(token), user.id, now() + SESSION_MS);
    res.setHeader('set-cookie', `${COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=86400`);
    return { user: { id: user.id, username: user.username }, csrfToken: csrfFor(token) };
  }
  function requireCsrf(req, session) {
    if (!session) fail(401, 'authentication_required');
    const supplied = req.headers['x-csrf-token'];
    if (typeof supplied !== 'string' || !/^[a-f0-9]{64}$/.test(supplied) || !timingSafeEqual(Buffer.from(supplied, 'hex'), Buffer.from(session.csrfToken, 'hex'))) fail(403, 'forbidden');
  }
  function rateLimit(req, res) {
    const key = req.socket.remoteAddress.replace(/^::ffff:/, ''), time = now();
    let entry = limits.get(key);
    if (!entry || time >= entry.until) { entry = { attempts: 0, until: time + 300000 }; limits.set(key, entry); }
    entry.attempts++;
    if (entry.attempts > 12 || activeHashes >= 2) {
      res.setHeader('retry-after', activeHashes >= 2 && entry.attempts <= 12 ? '1' : String(Math.max(1, Math.ceil((entry.until - time) / 1000))));
      fail(429, 'rate_limited');
    }
  }
  function metadata(row) {
    return { id: row.id, name: row.name, revision: row.revision, updatedAt: new Date(row.updated_at).toISOString(), day: row.day, round: row.round, scenario: row.scenario };
  }
  const fullSave = row => ({ ...metadata(row), envelope: JSON.parse(row.envelope) });

  async function handle(req, res, url) {
    const route = typeof url === 'string' ? url.split('?')[0] : url?.pathname || req.url.split('?')[0];
    const match = /^\/api\/saves\/([^/]+)$/.exec(route);
    if (!['/api/session', '/api/register', '/api/login', '/api/logout', '/api/saves'].includes(route) && !match) return false;
    try {
      if (closed) fail(503, 'service_unavailable');
      const port = req.socket.localPort, hosts = [`127.0.0.1:${port}`, `localhost:${port}`, `[::1]:${port}`];
      if (!loopback(req.socket.remoteAddress) || !loopback(req.socket.localAddress) || !hosts.includes(req.headers.host)) fail(403, 'forbidden');
      const origin = `http://${req.headers.host}`, write = !['GET', 'HEAD'].includes(req.method);
      if ((req.headers.origin && req.headers.origin !== origin) || (write && (req.headers.origin !== origin || !/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] || '')))) fail(403, 'forbidden');
      if (req.method === 'GET' && route === '/api/session') { send(res, 200, sessionBody(sessionFrom(req))); return true; }
      if (req.method === 'POST' && ['/api/register', '/api/login'].includes(route)) {
        rateLimit(req, res);
        const body = await readBody(req, 2048);
        if (!isObject(body) || typeof body.username !== 'string' || !/^[a-zA-Z0-9_-]{3,32}$/.test(body.username) || typeof body.password !== 'string' || body.password.length < 10 || body.password.length > 128) fail(400, 'invalid_credentials');
        if (activeHashes >= 2) { res.setHeader('retry-after', '1'); fail(429, 'rate_limited'); }
        const isRegister = route === '/api/register';
        const user = db.prepare('SELECT id, username, password_hash, salt FROM users WHERE username_key = ?').get(body.username.toLowerCase());
        const salt = isRegister ? randomBytes(16).toString('hex') : user?.salt || dummySalt;
        let hash;
        activeHashes++;
        try { hash = await derive(body.password, salt, 64, HASH_OPTIONS); }
        finally { activeHashes--; }
        if (closed) fail(503, 'service_unavailable');
        if (isRegister) {
          if (user) fail(409, 'account_unavailable');
          const created = { id: randomUUID(), username: body.username };
          let session;
          try {
            session = transaction(() => {
              db.prepare('INSERT INTO users (id, username, username_key, password_hash, salt, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(created.id, created.username, created.username.toLowerCase(), HASH_PREFIX + hash.toString('hex'), salt, now());
              return establish(req, res, created);
            });
          } catch (error) {
            if (db.prepare('SELECT id FROM users WHERE username_key = ?').get(body.username.toLowerCase())) fail(409, 'account_unavailable');
            throw error;
          }
          send(res, 201, sessionBody(session));
        } else {
          const stored = user?.password_hash?.startsWith(HASH_PREFIX) ? Buffer.from(user.password_hash.slice(HASH_PREFIX.length), 'hex') : dummyHash;
          const correct = stored.length === hash.length && timingSafeEqual(stored, hash);
          if (!user || !correct) fail(401, 'invalid_credentials');
          send(res, 200, sessionBody(transaction(() => establish(req, res, user))));
        }
        return true;
      }
      const session = sessionFrom(req);
      if (!session) fail(401, 'authentication_required');
      if (write || (req.method === 'GET' && (route === '/api/saves' || match) && req.headers['x-csrf-token'] !== undefined)) requireCsrf(req, session);
      if (req.method === 'POST' && route === '/api/logout') {
        await readBody(req, 2048);
        db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(digest(session.token));
        res.setHeader('set-cookie', `${COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`);
        send(res, 200, sessionBody(null)); return true;
      }
      if (req.method === 'GET' && route === '/api/saves') {
        const rows = db.prepare('SELECT id, name, revision, updated_at, day, round, scenario FROM saves WHERE user_id = ? ORDER BY updated_at DESC, id').all(session.user.id);
        send(res, 200, { saves: rows.map(metadata) }); return true;
      }
      if (req.method === 'GET' && match) {
        const row = db.prepare('SELECT * FROM saves WHERE id = ? AND user_id = ?').get(match[1], session.user.id);
        if (!row) fail(404, 'not_found');
        send(res, 200, { save: fullSave(row) }); return true;
      }
      if ((req.method === 'POST' && route === '/api/saves') || (req.method === 'PUT' && match)) {
        if (match && !db.prepare('SELECT id FROM saves WHERE id = ? AND user_id = ?').get(match[1], session.user.id)) fail(404, 'not_found');
        const body = await readBody(req, 501024);
        if (!isObject(body) || typeof body.name !== 'string' || !body.name.trim() || body.name.trim().length > 80 || /[\u0000-\u001f\u007f]/.test(body.name)) fail(400, 'invalid_save');
        if (match && (!Number.isSafeInteger(body.revision) || body.revision < 1)) fail(400, 'invalid_revision');
        const { json, state } = canonicalEnvelope(body.envelope, simulation), id = match ? match[1] : randomUUID();
        const saved = transaction(() => {
          if (match) {
            const result = db.prepare('UPDATE saves SET name = ?, revision = revision + 1, updated_at = ?, day = ?, round = ?, scenario = ?, envelope = ? WHERE id = ? AND user_id = ? AND revision = ?').run(body.name.trim(), now(), state.day, state.round, state.scenario, json, id, session.user.id, body.revision);
            if (!result.changes) fail(409, 'save_conflict');
          } else {
            const count = db.prepare('SELECT count(*) AS count FROM saves WHERE user_id = ?').get(session.user.id).count;
            if (count >= 12) fail(409, 'save_limit');
            db.prepare('INSERT INTO saves (id, user_id, name, revision, updated_at, day, round, scenario, envelope) VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?)').run(id, session.user.id, body.name.trim(), now(), state.day, state.round, state.scenario, json);
          }
          return db.prepare('SELECT * FROM saves WHERE id = ? AND user_id = ?').get(id, session.user.id);
        });
        send(res, match ? 200 : 201, { save: fullSave(saved) }); return true;
      }
      fail(405, 'method_not_allowed');
    } catch (error) {
      req.resume();
      if (!res.headersSent && !res.destroyed) send(res, error.status || 500, { error: error.status ? error.code : 'account_service_error' });
      return true;
    }
  }
  return { handle, close() { if (!closed) { closed = true; db.close(); } } };
}

module.exports = { createAccountService };
