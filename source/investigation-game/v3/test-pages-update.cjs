const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const sourcePath = path.join(__dirname, 'pages-update.js');
const current = '0123456789abcdef';
const next = 'fedcba9876543210';

class Target {
  constructor() { this.listeners = new Map(); }
  addEventListener(type, fn) { const list = this.listeners.get(type) || []; list.push(fn); this.listeners.set(type, list); }
  removeEventListener(type, fn) { this.listeners.set(type, (this.listeners.get(type) || []).filter(value => value !== fn)); }
  dispatchEvent(event) { for (const fn of [...(this.listeners.get(event.type) || [])]) fn(event); }
}
class Element extends Target {
  constructor(tag) { super(); this.tagName = tag.toUpperCase(); this.children = []; this.attributes = {}; this.hidden = false; this.disabled = false; this.textContent = ''; }
  setAttribute(key, value) { this.attributes[key] = String(value); }
  getAttribute(key) { return this.attributes[key] ?? null; }
  append(...nodes) { this.children.push(...nodes); }
  appendChild(node) { this.append(node); return node; }
  click() { if (!this.disabled) this.dispatchEvent({type:'click'}); }
}
function harness({meta = current, visibility = 'visible', response = {id:next}, save = 'success'} = {}) {
  let now = 0, sequence = 0;
  const timers = new Map(), requests = [], navigations = [];
  const document = new Target();
  document.visibilityState = visibility;
  document.documentElement = {lang:'zh-CN'};
  document.body = new Element('body');
  const metadata = meta === null ? null : {content:meta, getAttribute:() => meta};
  document.querySelector = selector => selector === 'meta[name="factorlab-version"]' ? metadata : null;
  document.createElement = tag => new Element(tag);
  document.getElementById = id => {
    const find = element => element.id === id ? element : element.children?.map(find).find(Boolean);
    return find(document.body) || null;
  };
  const saveButton = new Element('button'); saveButton.id = 'save-now'; document.body.append(saveButton);
  const exportButton = new Element('button'); exportButton.id = 'export-save'; document.body.append(exportButton);
  const ui = {lang:'zh-CN', writable:true, profileId:null};
  const saves = [], exports = [];
  saveButton.addEventListener('click', () => {
    if (save === 'missing-handler') return;
    saves.push(now);
    if (save === 'throw') throw Error('save failed');
    if (save === 'blocked') ui.writable = false;
    document.dispatchEvent({type:'factorlab:save', detail:{profileId:ui.profileId, day:0}});
  });
  exportButton.addEventListener('click', () => exports.push(now));
  const window = new Target();
  const location = {href:'https://example.test/project/v3/?demo=1&build=old#research', origin:'https://example.test', assign:value => navigations.push(value)};
  const sandbox = {window, document, location, URL, AbortController, console, Date:class extends Date { static now() { return now; } },
    setTimeout: (fn, delay) => { const id = ++sequence; timers.set(id, {fn, at:now + delay}); return id; },
    clearTimeout: id => timers.delete(id),
    fetch: async (url, options) => {
      requests.push({url:String(url), options});
      if (typeof response === 'function') return response(url, options);
      return {ok:true, url:String(url), json:async () => response};
    }
  };
  Object.assign(window, sandbox, {FactorLabApp:{getUI:() => ({...ui})}});
  vm.runInNewContext(fs.existsSync(sourcePath) ? fs.readFileSync(sourcePath, 'utf8') : '', sandbox, {filename:sourcePath});
  const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
  async function tick(ms) {
    const end = now + ms;
    while (true) {
      const item = [...timers].filter(([, value]) => value.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!item) break;
      now = item[1].at; timers.delete(item[0]); item[1].fn(); await flush();
    }
    now = end; await flush();
  }
  return {document, window, requests, navigations, ui, saves, exports, timers, tick, flush,
    node: id => document.getElementById(id),
    focus: () => window.dispatchEvent({type:'focus'}),
    visibility: value => { document.visibilityState = value; document.dispatchEvent({type:'visibilitychange'}); }
  };
}

test('Pages update waits twenty seconds, checks no-store same-origin and never auto-navigates', async () => {
  const h = harness();
  h.focus(); await h.tick(19999); assert.equal(h.requests.length, 0);
  await h.tick(1); assert.equal(h.requests.length, 1);
  assert.equal(h.requests[0].url, 'https://example.test/project/v3/version.json');
  assert.equal(h.requests[0].options.cache, 'no-store');
  assert.equal(h.requests[0].options.mode, 'same-origin');
  assert.equal(h.requests[0].options.redirect, 'error');
  assert.match(h.node('pages-update-message').textContent, /新版本/);
  assert.equal(h.node('pages-update').getAttribute('role'), 'status');
  assert.equal(h.navigations.length, 0);
  h.document.dispatchEvent({type:'input'}); h.document.dispatchEvent({type:'keydown'});
  await h.tick(59999); assert.equal(h.requests.length, 1);
  await h.tick(1); assert.equal(h.requests.length, 2);
});

test('missing or invalid build metadata creates neither timers nor network work', async () => {
  for (const meta of [null, '', 'bad', '../version', 'f'.repeat(65)]) {
    const h = harness({meta}); h.focus(); await h.tick(200000);
    assert.equal(h.requests.length, 0); assert.equal(h.timers.size, 0); assert.equal(h.node('pages-update'), null);
  }
});

test('hidden pages stop polling and focus checks are throttled without accumulating timers', async () => {
  const h = harness(); await h.tick(20000);
  h.focus(); h.focus(); await h.tick(14999); assert.equal(h.requests.length, 1);
  await h.tick(1); assert.equal(h.requests.length, 2);
  h.visibility('hidden'); await h.tick(600000); assert.equal(h.requests.length, 2);
  assert.equal(h.timers.size, 0);
  h.visibility('visible'); await h.tick(0); assert.equal(h.requests.length, 3);
  for (let i = 0; i < 20; i++) h.focus();
  await h.tick(15000); assert.equal(h.requests.length, 4);
  assert.equal(h.timers.size, 1);
});

test('hidden-at-start pages never fetch until shown', async () => {
  const h = harness({visibility:'hidden'}); await h.tick(90000);
  assert.equal(h.requests.length, 0);
  h.visibility('visible'); await h.tick(0); assert.equal(h.requests.length, 1);
});

test('invalid remote versions, matching versions, network failures and non-OK responses stay silent', async () => {
  for (const response of [{id:current}, {id:current.toUpperCase()}, {id:'../attack'}, {id:'a'.repeat(11)}, {id:'a'.repeat(65)}, {version:next}, null, () => { throw Error('offline'); }, async () => ({ok:false})]) {
    const h = harness({response}); await h.tick(20000);
    assert.equal(h.node('pages-update'), null); assert.equal(h.navigations.length, 0);
    await h.tick(60000); assert.equal(h.requests.length, 2);
  }
});

test('a stuck request times out at five seconds and cannot cause overlapping polls', async () => {
  let aborted = 0;
  const h = harness({response:(_url, options) => new Promise((resolve, reject) => options.signal.addEventListener('abort', () => { aborted++; reject(Error('aborted')); }))});
  await h.tick(20000); h.focus(); await h.tick(4999);
  assert.equal(h.requests.length, 1); assert.equal(aborted, 0);
  await h.tick(1); assert.equal(aborted, 1); assert.equal(h.node('pages-update'), null);
  await h.tick(60000); assert.equal(h.requests.length, 2);
});

test('hiding aborts an active check and ignores its late response', async () => {
  let finish;
  const h = harness({response:url => new Promise(resolve => { finish = () => resolve({ok:true, url:String(url), json:async () => ({id:next})}); })});
  await h.tick(20000); h.visibility('hidden');
  assert.equal(h.requests[0].options.signal.aborted, true);
  finish(); await h.flush();
  assert.equal(h.node('pages-update'), null); assert.equal(h.timers.size, 0);
});

test('manual update requires a fresh successful save and retains query and hash', async () => {
  const h = harness(); await h.tick(20000);
  h.node('pages-update-apply').click();
  assert.equal(h.saves.length, 1); assert.equal(h.navigations.length, 1);
  assert.equal(h.navigations[0], 'https://example.test/project/v3/?demo=1&build=fedcba9876543210#research');
  h.node('pages-update-apply').click(); assert.equal(h.saves.length, 1);
});

test('failed or unacknowledged saves never reuse stale writable and offer export', async () => {
  for (const save of ['blocked', 'missing-handler', 'throw']) {
    const h = harness({save}); await h.tick(20000);
    assert.equal(h.ui.writable, true);
    h.node('pages-update-apply').click();
    assert.equal(h.navigations.length, 0);
    assert.match(h.node('pages-update-message').textContent, /导出/);
    assert.equal(h.node('pages-update-export').hidden, false);
    h.node('pages-update-export').click(); assert.equal(h.exports.length, 1);
  }
});

test('language changes localize the persistent notice without triggering a fetch', async () => {
  const h = harness(); await h.tick(20000);
  h.ui.lang = 'en'; h.document.dispatchEvent({type:'factorlab:render'});
  assert.match(h.node('pages-update-message').textContent, /new version/i);
  assert.match(h.node('pages-update-apply').textContent, /save.*update/i);
  assert.equal(h.requests.length, 1);
});

test('pagehide suspends work and pageshow resumes after a back-forward cache restore', async () => {
  const h = harness(); await h.tick(20000);
  h.window.dispatchEvent({type:'pagehide'}); await h.tick(120000);
  assert.equal(h.requests.length, 1);
  h.window.dispatchEvent({type:'pageshow', persisted:true}); await h.tick(0);
  assert.equal(h.requests.length, 2);
  h.window.dispatchEvent({type:'pagehide'}); h.visibility('hidden');
  h.window.dispatchEvent({type:'pageshow', persisted:true}); await h.tick(120000);
  assert.equal(h.requests.length, 2);
});

test('Later hides the current version until another version becomes available', async () => {
  let version = next;
  const h = harness({response:async url => ({ok:true,url:String(url),json:async () => ({id:version})})});
  await h.tick(20000);
  assert.ok(h.node('pages-update-later'));
  h.node('pages-update-later').click(); assert.equal(h.node('pages-update').hidden,true);
  await h.tick(60000); assert.equal(h.node('pages-update').hidden,true);
  version = '1111111122222222';
  await h.tick(60000); assert.equal(h.node('pages-update').hidden,false);
  assert.equal(h.navigations.length,0);
});

test('real app saves the current draft before navigation and keeps blocked drafts exportable at 390px', async () => {
  const root = path.resolve(__dirname, '../..');
  process.env.PLAYWRIGHT_BROWSERS_PATH = path.join(root, '.local/redesign-20261013/runtime/browsers');
  const {chromium} = require(path.join(root, '.local/redesign-20261013/runtime/web/node_modules/playwright'));
  const {createServer} = require('../server.cjs');
  const server = createServer({env:{}});
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({headless:true});
  try {
    for (const blocked of [false, true]) {
      const page = await browser.newPage({viewport:{width:390,height:844}, reducedMotion:'reduce'});
      await page.route('**/pages-update.js', route => route.fulfill({contentType:'text/javascript', body:fs.readFileSync(sourcePath,'utf8')}));
      await page.route('**/pages-update.css', route => route.fulfill({contentType:'text/css', body:fs.readFileSync(path.join(__dirname,'pages-update.css'),'utf8')}));
      await page.route('**/version.json', route => route.fulfill({json:{schema:1,id:next}}));
      await page.goto(`http://127.0.0.1:${server.address().port}/v3/?demo=1#/research`);
      await page.waitForFunction(() => window.FactorLabApp);
      await page.clock.install();
      await page.evaluate(({current, blocked}) => {
        const meta = document.createElement('meta'); meta.name = 'factorlab-version'; meta.content = current; document.head.append(meta);
        window.__saveCount = 0;
        document.addEventListener('factorlab:save', () => window.__saveCount++);
        window.FactorLabApp.loadEnvelope({...FactorLabApp.getEnvelope(), note:'Draft that must survive the update'});
        const language = document.getElementById('language');
        language.value = 'en'; language.dispatchEvent(new Event('change'));
        if (blocked) Storage.prototype.setItem = function() { throw new DOMException('Quota full', 'QuotaExceededError'); };
      }, {current,blocked});
      await page.addStyleTag({url:'/v3/pages-update.css'});
      await page.addScriptTag({url:'/v3/pages-update.js'});
      await page.clock.runFor(20000);
      await page.waitForSelector('#pages-update-apply');
      const beforeUrl = page.url();
      const beforeSaveCount = await page.evaluate(() => window.__saveCount);
      assert.equal(await page.locator('#pages-update-apply').innerText(), 'Save and update');
      const dimensions = await page.locator('#pages-update').evaluate(element => {
        const rect = element.getBoundingClientRect();
        return {left:rect.left,right:rect.right,width:innerWidth,scroll:document.documentElement.scrollWidth};
      });
      assert.ok(dimensions.left >= 0 && dimensions.right <= dimensions.width);
      assert.ok(dimensions.scroll <= dimensions.width);
      await page.locator('#pages-update-apply').focus();
      assert.notEqual(await page.locator('#pages-update-apply').evaluate(element => getComputedStyle(element).outlineStyle), 'none');
      if (!blocked) {
        await Promise.all([
          page.waitForURL(url => url.searchParams.get('build') === next),
          page.locator('#pages-update-apply').click()
        ]);
        await page.waitForFunction(() => window.FactorLabApp);
        const result = await page.evaluate(() => ({note:FactorLabApp.getEnvelope().note, stored:JSON.parse(localStorage.getItem('factorlab-simulation-ui-v3')).note}));
        assert.deepEqual(result, {note:'Draft that must survive the update', stored:'Draft that must survive the update'});
        const url = new URL(page.url()); assert.equal(url.searchParams.get('demo'),'1'); assert.equal(url.hash,'#/research');
      } else {
        await page.locator('#pages-update-apply').click();
        assert.equal(page.url(), beforeUrl);
        assert.equal(await page.evaluate(() => FactorLabApp.getUI().writable), false);
        assert.equal(await page.evaluate(() => window.__saveCount), beforeSaveCount + 1);
        assert.match(await page.locator('#pages-update-message').innerText(), /Export/);
        const result = await page.evaluate(async () => {
          let blob;
          URL.createObjectURL = value => { blob = value; return 'blob:update-test'; };
          HTMLAnchorElement.prototype.click = function() {};
          document.getElementById('pages-update-export').click();
          return JSON.parse(await blob.text());
        });
        assert.equal(result.note,'Draft that must survive the update');
      }
      await page.close();
    }
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
});
