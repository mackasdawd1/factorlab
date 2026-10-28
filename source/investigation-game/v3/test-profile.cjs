const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
process.env.PLAYWRIGHT_BROWSERS_PATH = path.join(root, '.local/redesign-20261013/runtime/browsers');
const {chromium} = require(path.join(root, '.local/redesign-20261013/runtime/web/node_modules/playwright'));
const {createServer} = require('../server.cjs');

test('profile switching preserves guest and account drafts and rejects invalid restores atomically', async () => {
  const server = createServer({env:{}});
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({headless:true});
  try {
    const page = await browser.newPage({reducedMotion:'reduce'});
    await page.goto(`http://127.0.0.1:${server.address().port}/v3/`);
    await page.waitForFunction(() => window.FactorLabApp);
    const result = await page.evaluate(() => {
      const app = FactorLabApp;
      const guest = {...app.getEnvelope(), note:'guest research', reflection:'guest reflection'};
      app.loadEnvelope(guest);
      app.setProfile('account-a');
      const fresh = app.getEnvelope();
      app.loadEnvelope({...fresh, note:'account A thesis'});
      app.setProfile('account-b');
      const second = app.getEnvelope();
      app.setProfile('account-a');
      const first = app.getEnvelope();
      let rejected = false;
      try { app.loadEnvelope({version:'factorlab-ui-v3', game:{invalid:true}}); } catch { rejected = true; }
      const afterBad = app.getEnvelope();
      app.setProfile(null);
      return {fresh, second, first, afterBad, rejected, guest:app.getEnvelope(), source:guest};
    });
    assert.equal(result.fresh.note, '');
    assert.equal(result.second.note, '');
    assert.equal(result.first.note, 'account A thesis');
    assert.equal(result.rejected, true);
    assert.deepEqual(result.afterBad, result.first);
    assert.deepEqual(result.guest, result.source);
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
});

for (const failure of ['SecurityError', 'QuotaExceededError']) {
  test(`profile switching retains memory-only drafts after ${failure} without overwriting disk`, async () => {
    const server = createServer({env:{}});
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const browser = await chromium.launch({headless:true});
    try {
      const page = await browser.newPage({reducedMotion:'reduce'});
      await page.goto(`http://127.0.0.1:${server.address().port}/v3/`);
      await page.waitForFunction(() => window.FactorLabApp);
      const result = await page.evaluate(failure => {
        const app = FactorLabApp, key = 'factorlab-simulation-ui-v3';
        app.loadEnvelope({...app.getEnvelope(), note:'persisted guest'});
        app.setProfile('account-a');
        app.loadEnvelope({...app.getEnvelope(), note:'persisted account'});
        app.setProfile(null);
        const before = [localStorage.getItem(key), localStorage.getItem(key+'-account-account-a')];
        Storage.prototype.setItem = function() { throw new DOMException('Storage unavailable', failure); };
        const edit = value => {
          document.getElementById('note').value = value;
          document.getElementById('note').dispatchEvent(new Event('input'));
        };
        edit('unsaved guest');
        app.setProfile('account-a');
        const accountStart = app.getEnvelope().note;
        edit('unsaved account');
        app.setProfile(null);
        const guest = {envelope:app.getEnvelope(), writable:app.getUI().writable};
        app.setProfile('account-b');
        const fresh = app.getEnvelope().note;
        app.setProfile('account-a');
        const account = {envelope:app.getEnvelope(), writable:app.getUI().writable};
        return {before, after:[localStorage.getItem(key), localStorage.getItem(key+'-account-account-a')], guest, account, accountStart, fresh};
      }, failure);
      assert.equal(result.guest.envelope.note, 'unsaved guest');
      assert.equal(result.account.envelope.note, 'unsaved account');
      assert.equal(result.guest.writable, false);
      assert.equal(result.account.writable, false);
      assert.equal(result.accountStart, 'persisted account');
      assert.equal(result.fresh, '');
      assert.deepEqual(result.after, result.before);
    } finally {
      await browser.close();
      await new Promise(resolve => server.close(resolve));
    }
  });
}

test('profile switching preserves corrupted raw exports and memory drafts when storage becomes unreadable', async () => {
  const server = createServer({env:{}});
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({headless:true});
  try {
    const page = await browser.newPage({reducedMotion:'reduce'});
    await page.goto(`http://127.0.0.1:${server.address().port}/v3/`);
    await page.waitForFunction(() => window.FactorLabApp);
    const result = await page.evaluate(async () => {
      const app = FactorLabApp, key = 'factorlab-simulation-ui-v3-account-corrupt-a';
      const corrupt = '{original corrupted archive';
      localStorage.setItem(key, corrupt);
      app.setProfile('corrupt-a');
      document.getElementById('note').value = 'recovery research';
      document.getElementById('note').dispatchEvent(new Event('input'));
      const notice = document.getElementById('notice').textContent;
      app.setProfile(null);
      const getItem = Storage.prototype.getItem;
      Storage.prototype.getItem = function(name) {
        if (name === key) throw new DOMException('Storage blocked', 'SecurityError');
        return getItem.call(this, name);
      };
      app.setProfile('corrupt-a');
      let exported;
      URL.createObjectURL = blob => { exported = blob; return 'blob:profile-test'; };
      HTMLAnchorElement.prototype.click = function() {};
      document.getElementById('export-save').click();
      return {note:app.getEnvelope().note, writable:app.getUI().writable, notice, afterNotice:document.getElementById('notice').textContent, raw:getItem.call(localStorage,key), corrupt, exported:await exported.text()};
    });
    assert.equal(result.note, 'recovery research');
    assert.equal(result.writable, false);
    assert.equal(result.afterNotice, result.notice);
    assert.equal(result.raw, result.corrupt);
    assert.equal(result.exported, result.corrupt);
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
});
