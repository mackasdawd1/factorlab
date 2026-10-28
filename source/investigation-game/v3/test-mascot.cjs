'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
let mascot = {};
try { mascot = require('./mascot.js'); } catch (error) { if (error.code !== 'MODULE_NOT_FOUND') throw error; }

function clock() {
  let time = 0, sequence = 0;
  const tasks = new Map();
  return {
    now: () => time,
    setTimeout(fn, delay) { const id = ++sequence; tasks.set(id, { at: time + delay, fn }); return id; },
    clearTimeout(id) { tasks.delete(id); },
    tick(ms) {
      const end = time + ms;
      for (let count = 0; count < 1000; count++) {
        const next = [...tasks].filter(([, task]) => task.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!next) { time = end; return; }
        tasks.delete(next[0]); time = next[1].at; next[1].fn();
      }
      throw Error('Unbounded timer loop');
    },
    count: () => tasks.size
  };
}
function setup(options = {}) {
  assert.equal(typeof mascot.createController, 'function', 'a testable mascot controller must be exported');
  const time = clock(), changes = [];
  const controller = mascot.createController({ ...time, context: 'login', random: () => 0, onChange: value => changes.push(value), ...options });
  return { controller, time, changes };
}

test('login idle waits 12–20 seconds and starts a fresh interval after the action ends', () => {
  const { controller: c, time } = setup();
  time.tick(11999); assert.equal(c.getState().state, 'static');
  time.tick(1); assert.equal(c.getState().state, 'idle');
  c.finish(c.getState().token); time.tick(11999); assert.equal(c.getState().state, 'static');
  time.tick(1); assert.equal(c.getState().state, 'idle');
  const slow = setup({ random: () => 1 });
  slow.time.tick(19999); assert.equal(slow.controller.getState().state, 'static');
  slow.time.tick(1); assert.equal(slow.controller.getState().state, 'idle');
  const quiet = setup({ context: 'coach' }); quiet.time.tick(60000);
  assert.equal(quiet.controller.getState().state, 'static'); assert.equal(quiet.time.count(), 0);
});

test('editing interrupts every action, consumes suppressed events and restarts the whole idle wait', () => {
  const { controller: c, time } = setup();
  c.emit('welcome', { id: 'open' }); assert.equal(c.getState().state, 'welcome');
  c.setEditing(true); assert.equal(c.getState().state, 'static'); assert.equal(time.count(), 0);
  assert.equal(c.emit('milestone', { id: 'chapter-1' }), false);
  assert.equal(c.emit('caution', { id: 'risk-1' }), false);
  time.tick(100000); assert.equal(c.getState().state, 'static');
  c.setEditing(false); assert.equal(c.emit('milestone', { id: 'chapter-1' }), false);
  time.tick(11999); assert.equal(c.getState().state, 'static');
  time.tick(1); assert.equal(c.getState().state, 'idle');
});

for (const [method, blocked, restored] of [['setVisible', false, true], ['setEnabled', false, true], ['setReducedMotion', true, false]]) {
  test(`${method} cancels playback and timers without replaying hidden decoration`, () => {
    const { controller: c, time } = setup();
    c.emit('growth', { id: 'settlement' }); c[method](blocked);
    assert.equal(c.getState().state, 'static'); assert.equal(time.count(), 0);
    assert.equal(c.emit('success', { id: 'save' }), false);
    c[method](restored); assert.equal(c.emit('success', { id: 'save' }), false);
    time.tick(11999); assert.equal(c.getState().state, 'static');
    time.tick(1); assert.equal(c.getState().state, 'idle');
  });
}

test('priority preempts lower actions, upgrades one settlement to milestone and never queues celebrations', () => {
  const { controller: c } = setup({ context: 'workspace' });
  c.emit('growth', { id: 'round-1' });
  assert.equal(c.emit('milestone', { id: 'round-1' }), true);
  assert.equal(c.getState().state, 'milestone');
  assert.equal(c.emit('growth', { id: 'round-1' }), false);
  assert.equal(c.emit('success', { id: 'save' }), false);
  c.emit('caution', { id: 'risk' }); assert.equal(c.getState().state, 'caution');
  assert.equal(c.getState().video, null);
  c.finish(c.getState().token); assert.equal(c.getState().state, 'static');
  assert.equal(c.emit('success', { id: 'save' }), false);
});

test('thinking follows the effective request id, not video completion or a stale request callback', () => {
  const { controller: c, time } = setup({ context: 'coach' });
  assert.equal(c.emit('thinking'), false);
  c.setBusy('A', true); assert.equal(c.getState().state, 'thinking');
  c.finish(c.getState().token); assert.equal(c.getState().busyRequestId, 'A');
  time.tick(699); assert.equal(c.getState().state, 'static');
  time.tick(1); assert.equal(c.getState().state, 'thinking');
  c.setBusy('B', true); const token = c.getState().token;
  assert.equal(c.setBusy('A', false), false);
  assert.equal(c.emit('success', { id: 'reply-A', requestId: 'A' }), false);
  assert.equal(c.getState().token, token); assert.equal(c.getState().busyRequestId, 'B');
  c.setBusy('B', false); assert.equal(c.getState().state, 'static');
  time.tick(10000); assert.equal(c.getState().state, 'static');
  assert.equal(c.emit('success', { id: 'reply-B', requestId: 'B' }), true);
  assert.equal(c.setBusy('A', true), false);
});

test('an active request can resume after editing but suppressed success cannot be replayed', () => {
  const { controller: c, time } = setup({ context: 'coach' });
  c.setBusy(1, true); c.setEditing(true); time.tick(10000);
  assert.equal(c.getState().state, 'static'); assert.equal(time.count(), 0);
  c.setEditing(false); time.tick(700); assert.equal(c.getState().state, 'thinking');
  c.setEditing(true); c.setBusy(1, false); c.emit('success', { id: 'reply', requestId: 1 });
  c.setEditing(false); time.tick(60000); assert.equal(c.getState().state, 'static');
  assert.equal(c.emit('success', { id: 'reply', requestId: 1 }), false);
});

test('repeated welcome clicks respect cooldown and cannot restart the playing video', () => {
  const { controller: c, time } = setup({ context: 'workspace' });
  assert.equal(c.emit('welcome'), true); const token = c.getState().token;
  assert.equal(c.emit('welcome'), false); assert.equal(c.getState().token, token);
  c.finish(token); time.tick(4999); assert.equal(c.emit('welcome'), false);
  time.tick(1); assert.equal(c.emit('welcome'), true);
});

test('an interrupted video ended or play rejection cannot finish or poison its replacement', () => {
  const { controller: c } = setup({ context: 'coach' });
  c.emit('welcome'); const old = c.getState().token;
  c.emit('caution', { id: 'risk' }); const current = c.getState().token;
  assert.equal(c.finish(old), false); assert.equal(c.fail(old), false);
  assert.equal(c.getState().token, current); assert.equal(c.getState().state, 'caution');
});

test('video failure settles on the poster, cancels all timers and does not retry requests', () => {
  const { controller: c, time } = setup();
  c.setBusy('request', true); c.fail(c.getState().token);
  assert.equal(c.getState().state, 'static'); assert.equal(c.getState().failed, true);
  assert.equal(time.count(), 0); assert.equal(c.getState().busyRequestId, 'request');
  c.setEditing(true); c.setEditing(false); c.setBusy('request', false);
  assert.equal(c.emit('success', { id: 'success' }), false);
  time.tick(100000); assert.equal(time.count(), 0);
});

test('a stalled media watchdog falls back permanently without claiming the request completed', () => {
  const { controller: c, time } = setup({ context: 'coach' });
  c.setBusy('network', true); time.tick(5000);
  assert.equal(c.getState().state, 'static'); assert.equal(c.getState().busyRequestId, 'network');
  assert.equal(c.getState().failed, true);
  time.tick(60000); assert.equal(c.getState().state, 'static'); assert.equal(time.count(), 0);
});

test('destroy is idempotent and prevents pending timers or callbacks from causing future changes', () => {
  const { controller: c, time, changes } = setup();
  c.emit('welcome'); const token = c.getState().token; c.destroy(); const count = changes.length;
  c.destroy(); c.finish(token); c.fail(token); c.setVisible(true); c.setBusy('late', true); c.emit('success');
  time.tick(100000); assert.equal(time.count(), 0); assert.equal(changes.length, count);
  assert.equal(c.getState().destroyed, true);
});

function surface(playImpl = () => Promise.resolve()) {
  const time = clock();
  class Target {
    constructor() { this.listeners = new Map(); }
    addEventListener(name, fn) { if (!this.listeners.has(name)) this.listeners.set(name, new Set()); this.listeners.get(name).add(fn); }
    removeEventListener(name, fn) { this.listeners.get(name)?.delete(fn); }
    dispatch(name, properties = {}) { for (const fn of [...(this.listeners.get(name) || [])]) fn({ target: this, ...properties }); }
    listenerCount() { return [...this.listeners.values()].reduce((n, set) => n + set.size, 0); }
  }
  class Element extends Target {
    constructor(tag, doc) {
      super(); this.tagName = tag.toUpperCase(); this.ownerDocument = doc; this.children = []; this.dataset = {}; this.attrs = new Map(); this.hidden = false;
      const names = new Set(); this.classList = { add: name => names.add(name), remove: name => names.delete(name), toggle(name, force) { if (force) names.add(name); else names.delete(name); }, contains: name => names.has(name) };
      this.style = {}; this.paused = true; this.loads = 0;
    }
    setAttribute(name, value) { this.attrs.set(name, String(value)); }
    getAttribute(name) { return this.attrs.get(name) ?? null; }
    removeAttribute(name) { this.attrs.delete(name); if (name === 'src') this.src = ''; }
    append(...nodes) { for (const node of nodes) { node.parentElement = this; this.children.push(node); } }
    replaceChildren(...nodes) { this.children = []; this.append(...nodes); }
    contains(node) { return node === this || this.children.some(child => child.contains(node)); }
    closest(selector) { if (selector === 'dialog') return this.tagName === 'DIALOG' ? this : this.parentElement?.closest(selector); return this.matches(selector) ? this : this.parentElement?.closest(selector); }
    matches() { return ['INPUT', 'TEXTAREA', 'SELECT'].includes(this.tagName); }
    pause() { this.paused = true; }
    play() { this.paused = false; return playImpl(this); }
    load() { this.loads++; }
    getAnimations() { return []; }
  }
  const doc = new Target(), view = new Target(), media = new Target();
  doc.hidden = false; doc.baseURI = 'http://127.0.0.1:8881/v3/'; doc.defaultView = view;
  doc.createElement = tag => new Element(tag, doc);
  media.matches = false; view.matchMedia = () => media;
  view.setTimeout = time.setTimeout; view.clearTimeout = time.clearTimeout; view.performance = { now: time.now };
  const scope = doc.createElement('div'), host = doc.createElement('div'), input = doc.createElement('input');
  Object.defineProperty(input, 'value', { get() { throw Error('mascot must never read input content'); } });
  scope.append(host, input); doc.activeElement = null;
  function find(tag) { const visit = node => node.tagName === tag.toUpperCase() ? node : node.children.map(visit).find(Boolean); return visit(host); }
  return { time, doc, view, media, scope, host, input, find };
}

test('DOM focus and IME keep the mascot static without reading credentials, including blur before compositionend', async () => {
  assert.equal(typeof mascot.mount, 'function');
  const s = surface(), c = mascot.mount(s.host, { context: 'login', focusRoot: s.scope });
  c.emit('welcome'); s.doc.activeElement = s.input; s.scope.dispatch('focusin', { target: s.input });
  assert.equal(c.getState().editing, true); assert.equal(c.getState().state, 'static');
  s.scope.dispatch('compositionstart', { target: s.input });
  s.doc.activeElement = null; s.scope.dispatch('focusout', { target: s.input, relatedTarget: null }); await Promise.resolve();
  s.time.tick(30000); assert.equal(c.getState().editing, true);
  s.scope.dispatch('compositionend', { target: s.input });
  assert.equal(c.getState().editing, false); s.time.tick(11999); assert.equal(c.getState().state, 'static');
  c.destroy(); assert.equal(s.time.count(), 0);
});

test('language switches preserve the live video node, token and request rather than replaying an action', () => {
  assert.equal(typeof mascot.mount, 'function');
  const s = surface(), c = mascot.mount(s.host, { context: 'coach', language: 'zh-CN', focusRoot: s.scope });
  c.setBusy('request', true); const video = s.find('video'), token = c.getState().token, loads = video.loads;
  c.setLanguage('en');
  assert.equal(s.find('video'), video); assert.equal(video.loads, loads); assert.equal(c.getState().token, token);
  assert.equal(c.getState().busyRequestId, 'request'); assert.match(s.find('button').getAttribute('aria-label'), /greet/i);
  assert.equal(video.muted, true); assert.equal(video.playsInline, true); assert.equal(video.loop, false);
  c.destroy();
});

test('a late play rejection is ignored while current media failure selects the poster', async () => {
  assert.equal(typeof mascot.mount, 'function');
  const rejected = [], s = surface(() => new Promise((resolve, reject) => rejected.push(reject)));
  const c = mascot.mount(s.host, { context: 'workspace', focusRoot: s.scope });
  c.emit('welcome'); c.emit('milestone', { id: 'chapter' });
  rejected[0](Error('aborted previous media')); await Promise.resolve(); await Promise.resolve();
  assert.equal(c.getState().state, 'milestone'); assert.equal(c.getState().failed, false);
  rejected[1](Error('autoplay denied')); await Promise.resolve(); await Promise.resolve();
  assert.equal(c.getState().failed, true); assert.equal(s.find('video').hidden, true); assert.equal(s.find('img').hidden, false);
  c.destroy();
});

test('document visibility, reduced motion and destroy remove playback and every installed listener', () => {
  assert.equal(typeof mascot.mount, 'function');
  const s = surface(), c = mascot.mount(s.host, { context: 'login', focusRoot: s.scope });
  c.emit('welcome'); s.doc.hidden = true; s.doc.dispatch('visibilitychange');
  assert.equal(c.getState().state, 'static'); assert.equal(s.find('video').paused, true); assert.equal(s.time.count(), 0);
  s.doc.hidden = false; s.doc.dispatch('visibilitychange');
  s.media.matches = true; s.media.dispatch('change'); assert.equal(s.time.count(), 0);
  const nodes = [s.doc, s.view, s.media, s.scope, s.find('button'), s.find('video')];
  c.destroy(); assert.equal(s.time.count(), 0); assert.equal(s.host.children.length, 0);
  assert.equal(nodes.reduce((n, node) => n + node.listenerCount(), 0), 0);
  s.doc.dispatch('visibilitychange'); s.media.dispatch('change'); s.time.tick(100000); assert.equal(s.host.children.length, 0);
});

test('mount synchronizes existing focus and initial hidden or reduced state before a welcome can play', () => {
  for (const restriction of ['focus', 'document', 'visible', 'reduced']) {
    let plays = 0;
    const s = surface(() => { plays++; return Promise.resolve(); });
    if (restriction === 'focus') s.doc.activeElement = s.input;
    if (restriction === 'document') s.doc.hidden = true;
    if (restriction === 'reduced') s.media.matches = true;
    const c = mascot.mount(s.host, { context: 'login', focusRoot: s.scope, visible: restriction !== 'visible' });
    assert.equal(c.emit('welcome', { id: 'initial' }), false);
    assert.equal(plays, 0); assert.equal(s.time.count(), 0); assert.equal(c.getState().state, 'static');
    c.destroy();
  }
});

test('input focus cancels container decoration even when the video is already static', () => {
  const s = surface(), c = mascot.mount(s.host, { context: 'login', focusRoot: s.scope });
  let cancelled = 0; s.host.getAnimations = () => [{ cancel() { cancelled++; } }];
  s.doc.activeElement = s.input; s.scope.dispatch('focusin', { target: s.input });
  assert.ok(cancelled > 0); assert.equal(c.getState().editing, true);
  c.destroy();
});

test('a previously installed ended callback cannot stop a newer action or restart after destroy', () => {
  const s = surface(), c = mascot.mount(s.host, { context: 'coach', focusRoot: s.scope });
  c.emit('welcome'); const oldEnded = [...s.find('video').listeners.get('ended')][0];
  c.emit('milestone', { id: 'chapter' }); oldEnded();
  assert.equal(c.getState().state, 'milestone');
  c.destroy(); oldEnded(); assert.equal(s.time.count(), 0); assert.equal(s.host.children.length, 0);
});
