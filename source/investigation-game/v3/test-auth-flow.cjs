const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const temporary = path.join(root, '.local/login-20261019/browser-tmp');
fs.mkdirSync(temporary, {recursive:true});
process.env.TEMP = process.env.TMP = process.env.TMPDIR = temporary;
process.env.PLAYWRIGHT_BROWSERS_PATH = path.join(root, '.local/redesign-20261013/runtime/browsers');
const {chromium} = require(path.join(root, '.local/redesign-20261013/runtime/web/node_modules/playwright'));
const {createServer} = require('../server.cjs');
let server, browser, origin;

test.before(async () => {
  server = createServer({env:{}});
  for (let attempt = 0; attempt < 8; attempt++) {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    origin = `http://127.0.0.1:${server.address().port}`;
    try { await fetch(origin + '/api/status'); break; }
    catch (error) {
      await new Promise(resolve => server.close(resolve));
      if (error.cause?.message !== 'bad port' || attempt === 7) throw error;
    }
  }
  browser = await chromium.launch({headless:true});
});
test.after(async () => {
  await browser?.close();
  if (server?.listening) await new Promise(resolve => server.close(resolve));
});

async function fixture(t, options = {}) {
  const context = await browser.newContext({viewport:{width:options.width || 1440,height:844},reducedMotion:'reduce'});
  const page = await context.newPage();
  page.setDefaultTimeout(2500);
  const state = {user:options.user || null,auth:[],saves:0,releaseAuth:null,releaseSaves:null,errors:[]};
  page.on('pageerror', error => state.errors.push(error.message));
  t.after(async () => {
    state.releaseAuth?.(); state.releaseSaves?.();
    await context.close();
    assert.deepEqual(state.errors, []);
  });
  if (options.language) await context.addInitScript(language => localStorage.setItem('factorlab-simulation-language-v3', language), options.language);
  await page.route('**/api/**', async route => {
    const request = route.request(), endpoint = new URL(request.url()).pathname;
    const session = () => ({enabled:true,user:state.user,csrfToken:state.user ? 'local-mock-csrf' : null});
    if (endpoint === '/api/session') return route.fulfill({json:session()});
    if (endpoint === '/api/login' || endpoint === '/api/register') {
      const submitted = request.postDataJSON();
      state.auth.push({endpoint,...submitted});
      if (options.pauseAuth) await new Promise(resolve => { state.releaseAuth = resolve; });
      if (options.failFirst && state.auth.length === 1) return route.fulfill({status:401,json:{error:'invalid_credentials'}});
      state.user = {id:'test_learner',username:submitted.username};
      return route.fulfill({json:session()});
    }
    if (endpoint === '/api/saves') {
      state.saves++;
      if (options.pauseSaves) await new Promise(resolve => { state.releaseSaves = resolve; });
      return route.fulfill({json:{saves:[]}});
    }
    if (endpoint === '/api/quick-check/status') return route.fulfill({json:{configured:false,model:null}});
    return route.fulfill({status:404,json:{error:'unexpected_mock_request'}});
  });
  await page.goto(origin + '/v3/?welcome=1#/portfolio');
  await page.waitForFunction(() => window.FactorLabAccounts?.ready);
  return {page,state};
}

async function credentials(page, register = false) {
  if (register) await page.locator('#account-dialog [data-account-action="register-tab"]').click();
  await page.locator('#account-username').fill('test_learner');
  await page.locator('#account-password').fill('test-local-passphrase');
  if (register) await page.locator('#account-password-confirm').fill('test-local-passphrase');
}

async function assertWorkspace(page) {
  await page.waitForFunction(() => !FactorLabAccounts.getStatus().busy && !document.getElementById('account-dialog').open);
  assert.equal(await page.evaluate(() => FactorLabWorkspace.getView()), 'research');
  assert.equal(new URL(page.url()).searchParams.has('welcome'), false);
}

test('password visibility controls preserve values, expose pressed state, and never submit either form', async t => {
  const {page,state} = await fixture(t);
  await credentials(page);
  const passwordToggle = page.locator('button[aria-controls="account-password"]');
  assert.equal(await passwordToggle.count(), 1);
  assert.equal(await passwordToggle.getAttribute('type'), 'button');
  assert.equal(await passwordToggle.getAttribute('aria-pressed'), 'false');
  const hiddenLabel = await passwordToggle.getAttribute('aria-label');
  assert.ok(hiddenLabel?.trim());
  await passwordToggle.click();
  assert.equal(await page.locator('#account-password').getAttribute('type'), 'text');
  assert.equal(await page.locator('#account-password').inputValue(), 'test-local-passphrase');
  assert.equal(await passwordToggle.getAttribute('aria-pressed'), 'true');
  assert.notEqual(await passwordToggle.getAttribute('aria-label'), hiddenLabel);
  await passwordToggle.click();
  assert.equal(await page.locator('#account-password').getAttribute('type'), 'password');
  await credentials(page, true);
  const confirmToggle = page.locator('button[aria-controls="account-password-confirm"]');
  assert.equal(await confirmToggle.count(), 1);
  assert.equal(await confirmToggle.getAttribute('type'), 'button');
  assert.equal(await confirmToggle.getAttribute('aria-pressed'), 'false');
  assert.ok((await confirmToggle.getAttribute('aria-label'))?.trim());
  await confirmToggle.click();
  assert.equal(await page.locator('#account-password-confirm').getAttribute('type'), 'text');
  assert.equal(await page.locator('#account-password-confirm').inputValue(), 'test-local-passphrase');
  assert.equal(await confirmToggle.getAttribute('aria-pressed'), 'true');
  assert.equal(await page.locator('#account-password').getAttribute('type'), 'password');
  await confirmToggle.click();
  assert.equal(await page.locator('#account-password-confirm').getAttribute('type'), 'password');
  await passwordToggle.click();
  await confirmToggle.click();
  await page.locator('#close-accounts').click();
  await page.waitForFunction(() => [...document.querySelectorAll('#account-dialog input[name^="password"]')].every(node => node.value === '' && node.type === 'password'));
  for (const field of ['account-password','account-password-confirm']) {
    assert.equal(await page.locator('#' + field).inputValue(), '');
    assert.equal(await page.locator('#' + field).getAttribute('type'), 'password');
  }
  await page.locator('#open-accounts').click();
  for (const field of ['account-password','account-password-confirm']) {
    assert.equal(await page.locator('#' + field).inputValue(), '');
    assert.equal(await page.locator('#' + field).getAttribute('type'), 'password');
    assert.equal(await page.locator(`button[aria-controls="${field}"]`).getAttribute('aria-pressed'), 'false');
  }
  assert.equal(state.auth.length, 0);
});

for (const register of [false,true]) {
  test(`${register ? 'registration' : 'login'} submits once on Enter and enters research without waiting for save-list requests`, async t => {
    const {page,state} = await fixture(t, {pauseAuth:true,pauseSaves:true});
    await credentials(page, register);
    const submitted = page.waitForRequest('**/api/' + (register ? 'register' : 'login'));
    await page.locator(register ? '#account-password-confirm' : '#account-password').press('Enter');
    await submitted;
    await page.waitForFunction(() => FactorLabAccounts.getStatus().busy);
    assert.equal(await page.locator('#account-submit').isDisabled(), true);
    assert.equal(await page.locator('#account-username').isDisabled(), true);
    assert.equal(await page.locator('#account-password').isDisabled(), true);
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    assert.equal(state.auth.length, 1);
    state.releaseAuth();
    await assertWorkspace(page);
    assert.equal(await page.evaluate(() => FactorLabApp.getUI().profileId), 'test_learner');
    assert.equal(state.saves, 0);
    const savesRequested = page.waitForRequest('**/api/saves');
    await page.locator('#open-accounts').click();
    await savesRequested;
    assert.equal(state.saves, 1);
    state.releaseSaves();
    await page.waitForFunction(() => !FactorLabAccounts.getStatus().busy);
    assert.equal(await page.locator('#account-dialog[open]').count(), 1);
    assert.equal(await page.locator('#account-slot-list').count(), 1);
  });
}

test('invalid credentials retain the username and allow a successful retry', async t => {
  const {page,state} = await fixture(t, {failFirst:true});
  await credentials(page);
  await page.locator('#account-password').press('Enter');
  await page.waitForFunction(() => document.getElementById('account-message').textContent && !FactorLabAccounts.getStatus().busy);
  assert.equal(await page.locator('#account-username').inputValue(), 'test_learner');
  assert.equal(await page.locator('#account-dialog[open]').count(), 1);
  assert.equal(await page.locator('#account-message').evaluate(node => node.classList.contains('is-error')), true);
  await page.locator('#account-password').fill('retry-local-passphrase');
  await page.locator('#account-password').press('Enter');
  await assertWorkspace(page);
  assert.equal(state.auth.length, 2);
  assert.equal(state.auth[1].username, 'test_learner');
  assert.equal(state.auth[1].password, 'retry-local-passphrase');
});

test('an existing session skips the welcome dialog and save-list loading', async t => {
  const {page,state} = await fixture(t, {user:{id:'existing_learner',username:'existing_learner'}});
  assert.equal(await page.locator('#account-dialog[open]').count(), 0);
  assert.equal(await page.evaluate(() => FactorLabWorkspace.getView()), 'portfolio');
  assert.equal(new URL(page.url()).searchParams.has('welcome'), false);
  assert.equal(await page.evaluate(() => FactorLabApp.getUI().profileId), 'existing_learner');
  assert.equal(await page.locator('#account-welcome').isVisible(), false);
  assert.equal(state.auth.length, 0);
  assert.equal(state.saves, 0);
});

test('continuing as a guest enters research and keeps the visitor draft', async t => {
  const {page,state} = await fixture(t);
  const before = await page.evaluate(() => {
    const value = {...FactorLabApp.getEnvelope(),note:'visitor research'};
    FactorLabApp.loadEnvelope(value);
    return FactorLabApp.getEnvelope();
  });
  await page.locator('#account-dialog [data-account-action="guest"]').click();
  await assertWorkspace(page);
  assert.deepEqual(await page.evaluate(() => FactorLabApp.getEnvelope()), before);
  assert.equal(await page.evaluate(() => FactorLabApp.getUI().profileId), null);
  assert.equal(state.auth.length, 0);
  assert.equal(state.saves, 0);
});

test('English login and registration remain usable at 390px without horizontal overflow', async t => {
  const {page} = await fixture(t, {language:'en',width:390});
  for (const register of [false,true]) {
    if (register) await page.locator('#account-dialog [data-account-action="register-tab"]').click();
    const toggle = page.locator('button[aria-controls="account-password"]');
    assert.match(await toggle.getAttribute('aria-label'), /show.*password/i);
    await toggle.click();
    assert.match(await toggle.getAttribute('aria-label'), /hide.*password/i);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.equal(await page.locator('#account-dialog').evaluate(node => node.scrollWidth <= node.clientWidth + 1), true);
    assert.equal(await page.locator('#account-submit').isVisible(), true);
    const controls = await page.locator('#account-auth-form input, #account-auth-form button').evaluateAll(nodes => nodes.map(node => ({left:node.getBoundingClientRect().left,right:node.getBoundingClientRect().right,width:innerWidth})));
    assert.ok(controls.every(control => control.left >= 0 && control.right <= control.width), 'auth controls fit the viewport');
    if (register) assert.match(await page.locator('button[aria-controls="account-password-confirm"]').getAttribute('aria-label'), /show.*password/i);
  }
});
