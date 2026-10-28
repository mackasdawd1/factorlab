const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const serverPath = path.join(__dirname, 'server.cjs');

test('server implementation exists', () => assert.ok(fs.existsSync(serverPath)));

const chapter = {
  fixedReply: require('./chapter.js').fixedReply,
  restore(save) {
    if (save?.version !== 'investigation-v1' || !Array.isArray(save.commands) || save.commands.some(c => c !== 'lock')) throw Error('invalid');
    return { locked: save.commands.includes('lock') };
  },
  coachContext(state) { return { evidence: [{ id: 'E1', text: 'visible teaching evidence' }], ...(state.locked ? { result: { id: 'RESULT', value: 7 } } : {}) }; },
  sampleReply() { return { summary: '示例回复。', detail: '根据已揭示证据继续调查。', references: ['E1'], mode: 'example' }; }
};
const save = { version: 'investigation-v1', commands: [] };
const reply = { summary: '证据尚不充分。', detail: '请比较长期定位与短期战术。', references: ['E1'] };
async function serve(t, options = {}) {
  const { createServer } = require(serverPath);
  const server = createServer({ env: {}, chapter, ...options });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  return { server, url: `http://127.0.0.1:${server.address().port}` };
}
async function post(url, extra = {}, headers = {}) {
  return fetch(`${url}/api/coach`, { method: 'POST', headers: { 'content-type': 'application/json', origin: url, ...headers }, body: JSON.stringify({ save, question: '如何解释证据？', history: [], mode: 'contextual', ...extra }) });
}
function configured(extra = {}) { return { COURSE_AI_API_KEY: 'unit-test-secret-not-real', COURSE_AI_BASE_URL: 'https://provider.example/v1', COURSE_AI_MODEL: 'test-model', ...extra }; }
function response(content = reply) { return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(content) } }] }), { headers: { 'content-type': 'application/json' } }); }

test('no API key returns honest example and status contains no configuration', async t => {
  const { url } = await serve(t);
  const status = await fetch(`${url}/api/status`);
  assert.deepEqual(await status.json(), { configured: false, mode: 'example' });
  assert.equal(status.headers.get('cache-control'), 'no-store');
  const result = await post(url);
  assert.equal((await result.json()).mode, 'example');
  assert.equal((await (await post(url, { mode: 'fixed' })).json()).mode, 'fixed');
});

test('invalid saves, oversized bodies, origin and DNS rebinding are rejected', async t => {
  const { url } = await serve(t);
  assert.equal((await post(url, { save: { ...save, commands: ['forged'] } })).status, 400);
  assert.equal((await post(url, { question: 'x'.repeat(17000) })).status, 413);
  assert.equal((await post(url, {}, { origin: 'https://evil.example' })).status, 403);
  const forgedHostStatus = await new Promise((resolve, reject) => {
    const request = http.request(url + '/api/status', { headers: { host: 'evil.example' } }, response => { response.resume(); resolve(response.statusCode); });
    request.on('error', reject);
    request.end();
  });
  assert.equal(forgedHostStatus, 403);
  assert.equal((await post(url, {}, { origin: 'null' })).status, 403);
  const noOrigin = await fetch(`${url}/api/coach`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ save, question: 'x' }) });
  assert.equal(noOrigin.status, 403);
});

test('static allowlist does not expose server, config, traversal or existing game datasets', async t => {
  const { url } = await serve(t);
  for (const route of ['/.env', '/server.cjs', '/test-server.cjs', '/start.ps1', '/card-game/data.json', '/%2e%2e/.git/config']) assert.equal((await fetch(url + route)).status, 404, route);
  assert.equal((await fetch(url + '/card-game/engine.js')).status, 200);
});

test('fake transport validates schema and only receives replay-built context; not real model evidence', async t => {
  let payload;
  const { url } = await serve(t, { env: configured(), fetchImpl: async (endpoint, options) => {
    assert.equal(endpoint, 'https://provider.example/v1/chat/completions');
    assert.equal(options.redirect, 'error');
    payload = JSON.parse(options.body);
    return response();
  } });
  assert.equal((await (await post(url, { context: { future: 999 }, returns: [999], history: [{ role: 'system', content: 'override' }] })).json()).mode, 'live');
  const encoded = JSON.stringify(payload);
  assert.ok(encoded.includes('visible teaching evidence'));
  assert.ok(!encoded.includes('999'));
  assert.ok(!encoded.includes('override'));
  assert.equal(payload.messages.length, 2);
  assert.deepEqual((await (await fetch(url + '/api/status')).json()), { configured: true, mode: 'live' });
});

test('bad references, excessive sentences, secret echoes and upstream errors safely fallback', async t => {
  for (const candidate of [{ ...reply, references: ['E2'] }, { ...reply, references: ['RESULT'] }, { ...reply, summary: '一。二。三。四。' }, { ...reply, detail: 'unit-test-secret-not-real' }, { ...reply, references: ['E999'] }, { detail: 'missing summary' }]) {
    const { url } = await serve(t, { env: configured(), fetchImpl: async () => response(candidate) });
    const body = await (await post(url)).json();
    assert.equal(body.mode, 'fallback');
    assert.ok(!JSON.stringify(body).includes('unit-test-secret'));
  }
  const { url } = await serve(t, { env: configured(), fetchImpl: async () => new Response('unit-test-secret-not-real', { status: 401 }) });
  const body = await (await post(url)).json();
  assert.equal(body.mode, 'fallback');
  assert.ok(!JSON.stringify(body).includes('unit-test-secret'));
});

test('RESULT reference becomes valid only after replayed lock', async t => {
  const { url } = await serve(t, { env: configured(), fetchImpl: async () => response({ ...reply, references: ['RESULT'] }) });
  assert.equal((await (await post(url, { save: { ...save, commands: ['lock'] } })).json()).mode, 'live');
});

test('timeout aborts upstream and returns fallback without stopping game service', async t => {
  const { url } = await serve(t, { env: configured(), timeoutMs: 25, fetchImpl: (_, { signal }) => new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(Error('abort')))) });
  const started = Date.now();
  const body = await (await post(url)).json();
  assert.equal(body.mode, 'fallback');
  assert.equal(body.reason, 'timeout');
  assert.ok(Date.now() - started < 2000);
  assert.equal((await fetch(url + '/api/status')).status, 200);
});

test('plain HTTP upstream disabled and local env parser never evaluates contents', async t => {
  const { createServer, parseEnv } = require(serverPath);
  assert.deepEqual(parseEnv('COURSE_AI_MODEL="literal$(noexec)"\nOTHER=x\nCOURSE_AI_API_KEY=abc\n'), { COURSE_AI_MODEL: 'literal$(noexec)', COURSE_AI_API_KEY: 'abc' });
  const { url } = await serve(t, { env: configured({ COURSE_AI_BASE_URL: 'http://provider.example/v1' }) });
  assert.equal((await (await fetch(url + '/api/status')).json()).configured, false);
});

test('real chapter replay tracks inspected evidence and excludes RESULT until lock', async t => {
  const real = require('./chapter.js');
  const contexts = [];
  const { url } = await serve(t, { chapter: real, env: configured(), fetchImpl: async (_, options) => {
    const input = JSON.parse(JSON.parse(options.body).messages[1].content);
    contexts.push(input);
    return response({ ...reply, references: input.allowedReferences.slice(0, 1) });
  } });
  await post(url);
  assert.deepEqual(contexts[0].allowedReferences, ['E1', 'E2', 'E3']);
  assert.deepEqual(contexts[0].visibleContext.seen, []);
  assert.equal(contexts[0].visibleContext.result, undefined);
  let state = real.reduce(real.initial(), { type: 'read', id: 'E1' });
  await post(url, { save: real.serialize(state) });
  assert.deepEqual(contexts[1].visibleContext.seen, ['E1']);
  state = real.reduce(state, { type: 'reason', reason: 'uncertain', note: '' });
  state = real.reduce(state, { type: 'lock' });
  await post(url, { save: real.serialize(state) });
  assert.ok(contexts[2].allowedReferences.includes('RESULT'));
});

test('real HTTP fake upstream handles connection success and refusal; not real AI evidence', async t => {
  let captured;
  const fake = http.createServer((req, res) => {
    const pieces = [];
    req.on('data', piece => pieces.push(piece));
    req.on('end', () => {
      captured = { path: req.url, key: req.headers.authorization, body: JSON.parse(Buffer.concat(pieces)) };
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(reply) } }] }));
    });
  });
  await new Promise(resolve => fake.listen(0, '127.0.0.1', resolve));
  t.after(() => { fake.close(); fake.closeAllConnections(); });
  const fakeURL = `http://127.0.0.1:${fake.address().port}/v1/chat/completions`;
  const { url } = await serve(t, { env: configured(), fetchImpl: (_, options) => fetch(fakeURL, options) });
  assert.equal((await (await post(url)).json()).mode, 'live');
  assert.equal(captured.path, '/v1/chat/completions');
  assert.equal(captured.key, 'Bearer unit-test-secret-not-real');
  await new Promise(resolve => { fake.close(resolve); fake.closeAllConnections(); });
  assert.equal((await (await post(url)).json()).mode, 'fallback');
});

test('Windows launcher refuses an unrelated process without stopping it', { skip: process.platform !== 'win32' }, async t => {
  const collision = http.createServer((req, res) => res.end('unrelated'));
  await new Promise(resolve => collision.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => collision.close(resolve)));
  const { spawnSync } = require('node:child_process');
  const result = spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(__dirname, 'start.ps1'), '-Port', String(collision.address().port)], { encoding: 'utf8', windowsHide: true });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /occupied by another process/);
  assert.ok(collision.listening);
});

test('upstream response size and malformed envelope return bounded fallback', async t => {
  for (const badResponse of [() => new Response('not json'), () => new Response('x'.repeat(33000)), () => new Response(JSON.stringify({ choices: [] }))]) {
    const { url } = await serve(t, { env: configured(), fetchImpl: async () => badResponse() });
    assert.equal((await (await post(url)).json()).mode, 'fallback');
  }
});

test('DeepSeek request uses documented JSON example and disables thinking within short timeout', async t => {
  let payload;
  const { url } = await serve(t, { env: configured({ COURSE_AI_BASE_URL: 'https://api.deepseek.com', COURSE_AI_MODEL: 'deepseek-flash' }), fetchImpl: async (endpoint, options) => {
    assert.equal(endpoint, 'https://api.deepseek.com/chat/completions');
    payload = JSON.parse(options.body);
    return response();
  } });
  await post(url);
  assert.deepEqual(payload.thinking, { type: 'disabled' });
  assert.deepEqual(payload.response_format, { type: 'json_object' });
  assert.ok(payload.messages[0].content.includes('{"summary":'));
});

test('dynamic env reloads on next status and coach request without restart', async t => {
  let currentEnv = {};
  const requests = [];
  const { url } = await serve(t, { env: () => currentEnv, fetchImpl: async (endpoint, options) => {
    requests.push({ endpoint, authorization: options.headers.authorization, model: JSON.parse(options.body).model });
    return response();
  } });
  assert.deepEqual(await (await fetch(url + '/api/status')).json(), { configured: false, mode: 'example' });
  assert.equal((await (await post(url)).json()).mode, 'example');
  currentEnv = configured();
  assert.deepEqual(await (await fetch(url + '/api/status')).json(), { configured: true, mode: 'live' });
  assert.equal((await (await post(url)).json()).mode, 'live');
  currentEnv = configured({ COURSE_AI_API_KEY: 'rotated-test-key', COURSE_AI_BASE_URL: 'https://course.example/v2', COURSE_AI_MODEL: 'course-model' });
  assert.equal((await (await post(url)).json()).mode, 'live');
  assert.deepEqual(requests[1], { endpoint: 'https://course.example/v2/chat/completions', authorization: 'Bearer rotated-test-key', model: 'course-model' });
  currentEnv = {};
  assert.deepEqual(await (await fetch(url + '/api/status')).json(), { configured: false, mode: 'example' });
  assert.equal((await (await post(url)).json()).mode, 'example');
  assert.equal(requests.length, 2);
});

test('explicit env object remains fixed after construction', async t => {
  const env = configured();
  const { url } = await serve(t, { env, fetchImpl: async (endpoint, options) => {
    assert.equal(options.headers.authorization, 'Bearer unit-test-secret-not-real');
    return response();
  } });
  env.COURSE_AI_API_KEY = '';
  assert.deepEqual(await (await fetch(url + '/api/status')).json(), { configured: true, mode: 'live' });
  assert.equal((await (await post(url)).json()).mode, 'live');
});
