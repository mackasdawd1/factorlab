const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const runtime = path.join(root, '.local/redesign-20261013');
const temporary = path.join(root, '.local/login-20261019/browser-accounts');
fs.mkdirSync(temporary, { recursive: true });
process.env.TEMP = process.env.TMP = process.env.TMPDIR = temporary;
process.env.PLAYWRIGHT_BROWSERS_PATH = path.join(runtime, 'runtime/browsers');
const { chromium } = require(path.join(runtime, 'runtime/web/node_modules/playwright'));
const { createServer } = require('../server.cjs');
const server = createServer({ env: {} });
const results = { checks: [], errors: [], screenshots: [], requests: [] };

async function realServiceChecks(browser) {
  const dbDir = fs.mkdtempSync(path.join(root, '.local/reuse-20261016/accounts-ui-'));
  const service = createServer({ env: {}, accounts: { dbPath: path.join(dbDir, 'test.sqlite') } });
  await new Promise(resolve => service.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${service.address().port}`;
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  page.on('pageerror', error => results.errors.push(error.message));
  async function capture(name, selector) {
    const file = name + '.png';
    if (selector) await page.locator(selector).screenshot({ path: path.join(temporary, file) });
    else await page.screenshot({ path: path.join(temporary, file) });
    results.screenshots.push(file);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, name + ' page width');
    if (await page.locator('#account-dialog[open]').count()) assert.equal(await page.locator('#account-dialog').evaluate(node => node.scrollWidth <= node.clientWidth + 1), true, name + ' dialog width');
  }
  try {
    await page.goto(origin + '/v3/?welcome=1');
    await page.waitForFunction(() => FactorLabAccounts.ready);
    assert.equal(await page.locator('#account-dialog[open]').count(), 1);
    await page.locator('#close-accounts').click();
    results.checks.push('explicit ?welcome=1 opens the account entry without route interference');
    for (const language of ['zh-CN', 'en']) {
      await page.locator('#settings').click();
      await page.locator('#language').selectOption(language);
      await page.locator('#close-settings').click();
      for (const width of [1440, 1280, 390]) {
        await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
        await capture(`real-welcome-${language}-${width}`, '#account-welcome');
        await page.locator('#open-accounts').click();
        await capture(`real-login-${language}-${width}`);
        await page.locator('#account-dialog [data-account-action="register-tab"]').click();
        await capture(`real-register-${language}-${width}`);
        await page.locator('#account-dialog [data-account-action="login-tab"]').click();
        await page.locator('#close-accounts').click();
      }
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.locator('#settings').click();
    await page.locator('#language').selectOption('zh-CN');
    await page.locator('#close-settings').click();
    await page.locator('#open-accounts').click();
    await page.locator('#account-dialog [data-account-action="register-tab"]').click();
    await page.locator('#account-username').fill('real_test_learner');
    await page.locator('#account-password').fill('local-test-passphrase');
    await page.locator('#account-password-confirm').fill('local-test-passphrase');
    await page.locator('#account-submit').click();
    await page.waitForFunction(() => FactorLabApp.getUI().profileId !== null && !FactorLabAccounts.getStatus().busy);
    const userId = await page.evaluate(() => FactorLabApp.getUI().profileId);
    assert.equal(await page.locator('#account-dialog[open]').count(), 0);
    await page.locator('#open-accounts').click();
    await page.waitForFunction(() => !FactorLabAccounts.getStatus().busy);
    await page.locator('#account-save-name').fill('真实服务 · 行业周期');
    await page.locator('#account-create-save').click();
    await page.locator('[data-account-action="load"]').waitFor();
    assert.equal((await context.cookies()).some(c => c.httpOnly && c.sameSite === 'Strict'), true);
    const first = await page.evaluate(async () => (await (await fetch('/api/saves')).json()).saves[0]);
    assert.equal(first.revision, 1);
    for (const language of ['zh-CN', 'en']) {
      await page.locator('#close-accounts').click();
      await page.locator('#settings').click();
      await page.locator('#language').selectOption(language);
      await page.locator('#close-settings').click();
      await page.locator('#open-accounts').click();
      await page.waitForFunction(() => !FactorLabAccounts.getStatus().busy);
      for (const width of [1440, 1280, 390]) {
        await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
        await capture(`real-saves-${language}-${width}`);
      }
    }
    await page.evaluate(() => { const e = FactorLabApp.getEnvelope(); e.note = 'recoverable before server load'; FactorLabApp.loadEnvelope(e); });
    await page.locator('[data-account-action="load"]').click();
    await page.locator('#account-confirm-action').click();
    await page.waitForFunction(() => FactorLabApp.getEnvelope().note === '' && !FactorLabAccounts.getStatus().busy);
    await page.locator('[data-account-action="recover"]').click();
    await page.locator('#account-confirm-action').click();
    await page.waitForFunction(() => FactorLabApp.getEnvelope().note === 'recoverable before server load');
    results.checks.push('real SQLite register, HttpOnly session, save/load and recoverable draft');
    await page.locator('#close-accounts').click();
    await page.reload();
    await page.waitForFunction(() => FactorLabAccounts.ready);
    assert.equal(await page.evaluate(() => FactorLabApp.getUI().profileId), userId);
    assert.equal(await page.evaluate(() => FactorLabApp.getEnvelope().note), 'recoverable before server load');
    if (!await page.locator('#account-dialog[open]').count()) await page.locator('#open-accounts').click();
    await page.waitForFunction(() => !FactorLabAccounts.getStatus().busy);
    const changed = await page.evaluate(async id => {
      const s = await (await fetch('/api/session')).json();
      const saved = (await (await fetch('/api/saves/' + id)).json()).save;
      const response = await fetch('/api/saves/' + id, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': s.csrfToken }, body: JSON.stringify({ name: 'Updated elsewhere', envelope: saved.envelope, revision: saved.revision }) });
      return { status: response.status, data: await response.json() };
    }, first.id);
    assert.equal(changed.status, 200);
    await page.locator('[data-account-action="overwrite"]').click();
    await page.locator('#account-confirm-action').click();
    await page.waitForFunction(() => document.querySelector('#account-message').textContent.includes('changed elsewhere'));
    assert.equal(await page.evaluate(() => FactorLabApp.getEnvelope().note), 'recoverable before server load');
    results.checks.push('real session reload and stale-revision 409 preserve current draft');
    await context.clearCookies();
    await page.locator('[data-account-action="refresh"]').click();
    await page.waitForFunction(() => FactorLabApp.getUI().profileId === null && !FactorLabAccounts.getStatus().busy);
    assert.match(await page.locator('#account-message').innerText(), /session expired/);
    await page.locator('#account-username').fill('real_test_learner');
    await page.locator('#account-password').fill('incorrect-passphrase');
    await page.locator('#account-submit').click();
    await page.waitForFunction(() => document.querySelector('#account-message').textContent.includes('incorrect'));
    await page.locator('#account-username').fill('real_test_learner');
    await page.locator('#account-password').fill('local-test-passphrase');
    await page.locator('#account-submit').click();
    await page.waitForFunction(() => FactorLabApp.getUI().profileId !== null && !FactorLabAccounts.getStatus().busy);
    assert.equal(await page.evaluate(() => FactorLabApp.getEnvelope().note), 'recoverable before server load');
    results.checks.push('real 401 expiration, invalid credentials and re-login restore isolated account draft');
    assert.equal(await page.locator('#account-dialog[open]').count(), 0);
    await page.locator('#open-accounts').click();
    await page.waitForFunction(() => !FactorLabAccounts.getStatus().busy);
    const otherAccount = await context.request.post(origin + '/api/register', { headers: { Origin: origin }, data: { username: 'second_tab_learner', password: 'second-local-passphrase' } });
    assert.equal(otherAccount.status(), 201);
    await page.locator('[data-account-action="refresh"]').click();
    await page.waitForFunction(() => FactorLabApp.getUI().profileId === null && !FactorLabAccounts.getStatus().busy);
    assert.equal(await page.locator('#account-slot-list').count(), 0);
    const preserved = await page.evaluate(id => JSON.parse(localStorage.getItem('factorlab-simulation-ui-v3-account-' + id)).note, userId);
    assert.equal(preserved, 'recoverable before server load');
    assert.match(await page.locator('#account-message').innerText(), /session changed/);
    await page.locator('#account-username').fill('real_test_learner');
    await page.locator('#account-password').fill('local-test-passphrase');
    await page.locator('#account-submit').click();
    await page.waitForFunction(() => FactorLabApp.getUI().profileId !== null && !FactorLabAccounts.getStatus().busy);
    assert.equal(await page.evaluate(() => FactorLabApp.getEnvelope().note), 'recoverable before server load');
    results.checks.push('cross-tab account switch 403 opens re-login and preserves the previous account draft');
  } finally {
    await context.close();
    await new Promise(resolve => service.close(resolve));
  }
}

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    page.setDefaultTimeout(7000);
    page.on('pageerror', error => results.errors.push(error.message));
    page.on('requestfailed', req => results.requests.push({ failed: new URL(req.url()).pathname, message: req.failure()?.errorText }));
    await page.route('**/v3/accounts.js', route => route.fulfill({ path: path.join(__dirname, 'accounts.js'), contentType: 'application/javascript' }));
    await page.route('**/v3/accounts.css', route => route.fulfill({ path: path.join(__dirname, 'accounts.css'), contentType: 'text/css' }));
    let user = null, slots = [], conflict = false, revision = 0;
    await page.route('**/api/session', route => route.fulfill({ json: { enabled: true, user, csrfToken: user ? 'test-token' : null } }));
    await page.route('**/api/register', route => {
      const body = route.request().postDataJSON();
      assert.equal(body.username, 'learner_one');
      user = { id: 'learner_one', username: body.username };
      return route.fulfill({ json: { enabled: true, user, csrfToken: 'test-token' } });
    });
    await page.route('**/api/logout', route => { user = null; return route.fulfill({ json: { enabled: true, user: null, csrfToken: null } }); });
    await page.route('**/api/saves**', route => {
      const req = route.request(), method = req.method();
      results.requests.push({ method, path: new URL(req.url()).pathname, conflict });
      if (method === 'POST') {
        assert.equal(req.headers()['x-csrf-token'], 'test-token');
        const body = req.postDataJSON();
        const save = { id: 'slot_one', name: body.name, revision: ++revision, updatedAt: new Date().toISOString(), day: 0, round: 1, scenario: 'baseline', envelope: body.envelope };
        slots = [save];
        return route.fulfill({ json: { save } });
      }
      if (method === 'PUT' && conflict) return route.fulfill({ status: 409, json: { error: 'conflict' } });
      if (req.url().endsWith('/slot_one')) return route.fulfill({ json: { save: slots[0] } });
      return route.fulfill({ json: { saves: slots.map(({ envelope, ...save }) => save) } });
    });
    await page.goto(origin + '/v3/');
    await page.waitForFunction(() => !!window.FactorLabApp);
    if (!await page.locator('#open-accounts').count()) {
      await page.addStyleTag({ url: origin + '/v3/accounts.css' });
      await page.addScriptTag({ url: origin + '/v3/accounts.js' });
    }
    await page.waitForFunction(() => window.FactorLabAccounts?.ready);
    assert.equal(await page.locator('#account-dialog[open]').count(), 0);
    await page.locator('button[data-view="portfolio"]').click();
    await page.locator('#note').fill('guest-owned draft');
    const guest = await page.evaluate(() => FactorLabApp.getEnvelope());
    await page.locator('#open-accounts').click();
    await page.locator('#account-dialog [data-account-action="register-tab"]').click();
    await page.screenshot({ path: path.join(temporary, 'accounts-register-zh.png') });
    results.screenshots.push('accounts-register-zh.png');
    await page.locator('#account-username').fill('learner_one');
    await page.locator('#account-password').fill('classroom-passphrase');
    await page.locator('#account-password-confirm').fill('classroom-passphrase');
    await page.locator('#account-submit').click();
    await page.waitForFunction(() => FactorLabApp.getUI().profileId === 'learner_one' && !FactorLabAccounts.getStatus().busy);
    assert.equal(await page.evaluate(() => FactorLabApp.getEnvelope().note), '');
    assert.equal(await page.locator('#account-dialog[open]').count(), 0);
    await page.locator('#open-accounts').click();
    await page.waitForFunction(() => !FactorLabAccounts.getStatus().busy);
    assert.equal(await page.locator('#account-slot-list article').count(), 0);
    results.checks.push('registration isolates guest draft and creates no automatic server save');
    await page.locator('#account-save-name').fill('周期研究第一稿');
    await page.locator('#account-create-save').click();
    await page.locator('[data-account-action="load"]').waitFor();
    await page.screenshot({ path: path.join(temporary, 'accounts-library-zh.png') });
    results.screenshots.push('accounts-library-zh.png');
    assert.equal(slots.length, 1);
    await page.evaluate(() => { const e = FactorLabApp.getEnvelope(); e.note = 'unsaved current draft'; FactorLabApp.loadEnvelope(e); });
    await page.locator('[data-account-action="load"]').click();
    assert.equal(await page.evaluate(() => FactorLabApp.getEnvelope().note), 'unsaved current draft');
    await page.locator('#account-confirm-action').click();
    await page.waitForFunction(() => FactorLabApp.getEnvelope().note === '');
    results.checks.push('named server save and explicit load confirmation');
    conflict = true;
    await page.locator('[data-account-action="overwrite"]').click();
    await page.locator('#account-confirm-action').click();
    await page.waitForFunction(() => document.querySelector('#account-message').textContent.includes('另一处')).catch(async error => {
      results.conflictDiagnostic = await page.evaluate(() => ({ message: document.querySelector('#account-message')?.textContent, status: FactorLabAccounts.getStatus(), confirm: document.querySelector('.account-confirm')?.textContent }));
      throw error;
    });
    assert.equal(revision, 1);
    results.checks.push('409 conflict preserves saved revision');
    await page.locator('[data-account-action="logout"]').click();
    await page.waitForFunction(() => FactorLabApp.getUI().profileId === null);
    assert.deepEqual(await page.evaluate(() => FactorLabApp.getEnvelope()), guest);
    results.checks.push('logout restores exact visitor draft');
    await page.locator('#close-accounts').click();
    await page.locator('#settings').click();
    await page.locator('#language').selectOption('en');
    await page.locator('#close-settings').click();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('#open-accounts').click();
    await page.screenshot({ path: path.join(temporary, 'accounts-login-en-mobile.png') });
    results.screenshots.push('accounts-login-en-mobile.png');
    assert.equal(await page.locator('#account-username').getAttribute('autocomplete'), 'username');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#account-dialog[open]').count(), 0);
    results.checks.push('English mobile layout and Escape dialog close');
    await context.close();
    const offline = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const offlinePage = await offline.newPage();
    await offlinePage.route('**/v3/accounts.js', route => route.fulfill({ path: path.join(__dirname, 'accounts.js'), contentType: 'application/javascript' }));
    await offlinePage.route('**/v3/accounts.css', route => route.fulfill({ path: path.join(__dirname, 'accounts.css'), contentType: 'text/css' }));
    await offlinePage.route('**/api/session', route => route.fulfill({ status: 404, json: {} }));
    await offlinePage.goto(origin + '/v3/');
    await offlinePage.waitForFunction(() => !!window.FactorLabApp);
    if (!await offlinePage.locator('#open-accounts').count()) {
      await offlinePage.addStyleTag({ url: origin + '/v3/accounts.css' });
      await offlinePage.addScriptTag({ url: origin + '/v3/accounts.js' });
    }
    await offlinePage.waitForFunction(() => window.FactorLabAccounts?.ready);
    await offlinePage.locator('#open-accounts').click();
    assert.equal(await offlinePage.locator('#account-submit').isDisabled(), true);
    await offlinePage.locator('[data-account-action="guest"]').last().click();
    assert.equal(await offlinePage.locator('#account-dialog[open]').count(), 0);
    results.checks.push('unavailable backend disables account form and permits visitor use');
    await offline.close();
    await realServiceChecks(browser);
    assert.deepEqual(results.errors, []);
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
    fs.writeFileSync(path.join(temporary, 'browser-accounts-result.json'), JSON.stringify(results, null, 2));
  }
  console.log(JSON.stringify(results));
})().catch(error => { console.error(error); process.exitCode = 1; });
