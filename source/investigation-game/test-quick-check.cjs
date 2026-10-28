const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const E = require('./v2/simulation.js');
const file = path.join(__dirname, 'quick-check.cjs');
const env = { TYPESAFE_API_KEY: 'test-typesafe-key-not-real' };
const save = E.serialize(E.initial());
const body = { save, lang: 'zh-CN', note: '订单改善不等于利润兑现，保留长期配置并观察披露。', reason: 'evidence', forecast: 'flat', draft: [.2, .2, .15, .15, .15, .15] };
const valid = () => ({ model: 'jev-1.14.0', answers: {
  evidence_fit: { type: 'choice', choice: 'supported', probabilities: { supported: .85, contradicted: .05, insufficient: .1 }, confidence: .775 },
  horizon: { type: 'choice', choice: 'mixed', probabilities: { long_term: .1, tactical: .1, mixed: .7, unclear: .1 }, confidence: .6 }
}, usage: { input_tokens: 400, output_tokens: 30 } });
const response = value => new Response(JSON.stringify(value || valid()), { headers: { 'content-type': 'application/json' } });
async function serve(t, options = {}) {
  const { createQuickCheck } = require(file);
  const adapter = createQuickCheck({ env: {}, ...options });
  const server = http.createServer(async (req, res) => { if (!await adapter.handle(req, res, req.url)) { res.writeHead(404); res.end(); } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  return `http://127.0.0.1:${server.address().port}`;
}
function request(url, options = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(url, options, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.once('error', reject);
      res.once('end', () => resolve({status:res.statusCode, json:async () => JSON.parse(Buffer.concat(chunks).toString('utf8'))}));
    });
    req.once('error', reject);
    req.end(options.body);
  });
}
const post = (url, extra = {}, headers = {}) => request(url + '/api/quick-check', { method: 'POST', headers: { origin: url, 'content-type': 'application/json', ...headers }, body: JSON.stringify({ ...body, ...extra }) });
function unfinishedPost(url, chunk, waitMs) {
  return new Promise((resolve, reject) => {
    let completed = false;
    const finish = value => { if (completed) return; completed = true; clearTimeout(timer); resolve(value); request.destroy(); };
    const request = http.request(url + '/api/quick-check', { method: 'POST', headers: { origin: url, 'content-type': 'application/json' } }, response => {
      let text = '';
      response.on('data', data => { text += data; });
      response.on('end', () => finish({ status: response.statusCode, body: JSON.parse(text) }));
    });
    const timer = setTimeout(() => finish({ status: null }), waitMs);
    request.on('error', error => { if (!completed) { clearTimeout(timer); reject(error); } });
    request.write(chunk);
  });
}

test('quick-check adapter is implemented', () => assert.ok(fs.existsSync(file)));

test('unconfigured and empty rationale return honest rules without model probabilities', async t => {
  const url = await serve(t, { fetchImpl: () => { throw Error('must not call'); } });
  assert.deepEqual(await (await request(url + '/api/quick-check/status')).json(), { configured: false, model: null });
  const result = await (await post(url)).json();
  assert.equal(result.mode, 'rule');
  assert.equal(result.reason, 'not_configured');
  assert.equal(result.checks.find(c => c.id === 'evidence_fit').value, 'unavailable');
  assert.ok(result.checks.every(c => c.probabilities === undefined && c.confidence === undefined));
  const empty = await (await post(url, { note: '' })).json();
  assert.equal(empty.reason, 'missing_note');
  assert.equal(empty.checks.find(c => c.id === 'rationale').value, 'missing');
});

test('typed request uses replay-built public evidence and never sends save, identity, prior rationale or RNG', async t => {
  let payload;
  let progressed = E.reduce(E.initial(), { type: 'lock', weights: body.draft, factorWeights: [.25, .25, .25, .25], reason: 'PRIVATE-OLD-RATIONALE', forecast: 'flat' });
  while (progressed.day < 20) progressed = E.reduce(progressed, progressed.phase === 'event' ? { type: 'resume' } : { type: 'advance', days: 1 });
  const replay = E.serialize(progressed), before = JSON.stringify(replay);
  const url = await serve(t, { env, fetchImpl: async (endpoint, options) => {
    assert.equal(endpoint, 'https://api.typesafe.ai/v1/systemone');
    assert.equal(options.redirect, 'error');
    assert.equal(options.headers.authorization, 'Bearer ' + env.TYPESAFE_API_KEY);
    payload = JSON.parse(options.body);
    return response();
  } });
  const result = await (await post(url, { save: replay })).json();
  assert.equal(result.mode, 'live');
  assert.equal(result.checks.find(c => c.id === 'horizon').needsReview, true);
  assert.equal(result.asOfDay, 20);
  assert.equal(JSON.stringify(replay), before);
  assert.deepEqual(Object.keys(payload.questions).sort(), ['evidence_fit', 'horizon']);
  assert.equal(payload.model, 'jev-1.14.0');
  const encoded = JSON.stringify(payload);
  for (const forbidden of ['"seed"', '"rng"', '"commands"', 'PRIVATE-OLD-RATIONALE', 'EVENT-DISCLOSURE', '"username"', '"password"', '"email"', env.TYPESAFE_API_KEY]) assert.ok(!encoded.includes(forbidden), forbidden);
  assert.ok(payload.state.visibleContext.evidence.length > 0);
  assert.equal(payload.state.untrustedLearner.note, body.note);
  assert.deepEqual(await (await request(url + '/api/quick-check/status')).json(), { configured: true, model: 'jev-1.14.0' });
});

test('invalid JSON schemas, unknown fields, origin, excessive data and forged saves are rejected before upstream', async t => {
  let calls = 0;
  const url = await serve(t, { env, fetchImpl: () => { calls++; return response(); } });
  for (const extra of [{ account: { email: 'private@example.com' } }, { note: 12 }, { reason: 'execute' }, { forecast: 'sure-win' }, { draft: [1, 2] }, { save: {} }, { lang: 'bad' }, { lang: false }, { reason: 0 }, { forecast: null }]) assert.equal((await post(url, extra)).status, 400);
  assert.equal((await post(url, { note: 'x'.repeat(70000) })).status, 413);
  assert.equal((await post(url, {}, { origin: 'https://evil.example' })).status, 403);
  assert.equal(calls, 0);
});

test('allocation constraints are deterministic and invalid draft is never sent to the model', async t => {
  let calls = 0;
  const url = await serve(t, { env, fetchImpl: () => { calls++; return response(); } });
  const result = await (await post(url, { draft: [.7, .05, .05, .05, .05, .1] })).json();
  assert.equal(result.mode, 'rule');
  assert.equal(result.reason, 'invalid_allocation');
  assert.equal(result.checks.find(c => c.id === 'allocation').value, 'invalid');
  assert.equal(calls, 0);
});

test('oversized unfinished uploads are rejected immediately without waiting for EOF', async t => {
  let calls = 0;
  const url = await serve(t, { env, fetchImpl: async () => { calls++; return response(); } });
  assert.deepEqual(await unfinishedPost(url, 'x'.repeat(70000), 350), { status: 413, body: { error: 'body_too_large' } });
  assert.equal(calls, 0);
  assert.equal((await post(url)).status, 200);
});

test('unfinished uploads receive a five-second request timeout', async t => {
  let calls = 0;
  const url = await serve(t, { env, fetchImpl: async () => { calls++; return response(); } });
  assert.deepEqual(await unfinishedPost(url, '{', 6200), { status: 408, body: { error: 'request_timeout' } });
  assert.equal(calls, 0);
});

test('review decisions and displayed confidence are recalculated from the verified Choice distribution', async t => {
  const flat = valid();
  flat.answers.evidence_fit.probabilities = { supported: .34, contradicted: .33, insufficient: .33 };
  flat.answers.evidence_fit.confidence = 1;
  const rounded = valid(); rounded.answers.evidence_fit.confidence = .8;
  const belowThreshold = valid();
  belowThreshold.answers.evidence_fit.probabilities = { supported: .86666, contradicted: .06667, insufficient: .06667 };
  belowThreshold.answers.evidence_fit.confidence = .8;
  for (const [candidate, expected] of [[flat, .01], [rounded, .775], [belowThreshold, .79999]]) {
    const url = await serve(t, { env, fetchImpl: async () => response(candidate) });
    const result = await (await post(url)).json();
    assert.equal(result.mode, 'live');
    const check = result.checks.find(item => item.id === 'evidence_fit');
    assert.ok(Math.abs(check.confidence - expected) < 1e-10);
    assert.equal(check.needsReview, true);
  }
});

test('malformed probabilities, unexpected labels, model text, large upstream and HTTP errors safely fallback', async t => {
  const wrongSum = valid(); wrongSum.answers.evidence_fit.probabilities.supported = .2;
  const unknown = valid(); unknown.answers.horizon.choice = 'buy';
  const hidden = valid(); hidden.answers.evidence_fit.secret = 'unexpected';
  const badConfidence = valid(); badConfidence.answers.evidence_fit.confidence = 2;
  const contradictory = valid(); contradictory.answers.evidence_fit.choice = 'contradicted';
  for (const candidate of [wrongSum, unknown, hidden, badConfidence, contradictory, { answers: {} }]) {
    const url = await serve(t, { env, fetchImpl: async () => response(candidate) });
    const result = await (await post(url)).json();
    assert.equal(result.mode, 'fallback');
    assert.equal(result.reason, 'unavailable_or_invalid');
    assert.ok(result.checks.every(c => c.probabilities === undefined));
  }
  for (const [upstream, reason] of [
    [new Response('private-provider-body', { status: 451 }), 'provider_restricted'],
    [new Response('private-provider-body', { status: 401 }), 'provider_auth'],
    [new Response('private-provider-body', { status: 403 }), 'provider_auth'],
    [new Response('private-provider-body', { status: 429 }), 'rate_limited'],
    [new Response('private-provider-body', { status: 500 }), 'unavailable_or_invalid'],
    [new Response('x'.repeat(33000)), 'unavailable_or_invalid']
  ]) {
    const url = await serve(t, { env, fetchImpl: async () => upstream });
    const result = await (await post(url)).json();
    assert.equal(result.mode, 'fallback');
    assert.equal(result.reason, reason);
    assert.ok(!JSON.stringify(result).includes('private-provider-body'));
    if (!upstream.ok) assert.equal(upstream.bodyUsed, false);
  }
});

test('timeout, bounded duplicate work, cache expiry and overload preserve rule feedback', async t => {
  const slow = await serve(t, { env, timeoutMs: 10, fetchImpl: async () => new Promise(() => {}) });
  assert.equal((await (await post(slow)).json()).reason, 'timeout');
  let calls = 0, clock = 1000;
  const url = await serve(t, { env, now: () => clock, fetchImpl: async () => { calls++; await new Promise(resolve => setTimeout(resolve, 25)); return response(); } });
  const replies = await Promise.all([post(url), post(url), post(url)]);
  assert.ok((await Promise.all(replies.map(r => r.json()))).every(r => r.mode === 'live'));
  assert.equal(calls, 1);
  await post(url); assert.equal(calls, 1);
  clock += 61000; await post(url); assert.equal(calls, 2);
  const overload = await Promise.all(['one', 'two', 'three'].map(note => post(url, { note })));
  const results = await Promise.all(overload.map(r => r.json()));
  assert.ok(results.some(r => r.reason === 'busy'));
});
