const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
process.env.PLAYWRIGHT_BROWSERS_PATH = path.join(root, '.local/redesign-20261013/runtime/browsers');
const {chromium} = require(path.join(root, '.local/redesign-20261013/runtime/web/node_modules/playwright'));
const {createServer} = require('../server.cjs');

test('quick judgment is read-only and becomes stale when its evidence or rationale changes', async () => {
  const server = createServer({env:{}});
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({headless:true});
  try {
    const page = await browser.newPage({reducedMotion:'reduce'});
    await page.route('**/api/quick-check', route => route.fulfill({json:{mode:'live',asOfDay:0,checks:[{id:'evidence_fit',value:'insufficient',confidence:.6,needsReview:true},{id:'horizon',value:'tactical',confidence:.8,needsReview:false}],references:['E1']}}));
    await page.goto(`http://127.0.0.1:${server.address().port}/v3/`);
    await page.waitForFunction(() => window.FactorLabApp);
    await page.evaluate(() => FactorLabWorkspace.go('portfolio',{animate:false}));
    await page.locator('#note').fill('订单恢复可能支持长期定位');
    const before = await page.evaluate(() => FactorLabApp.getEnvelope());
    await page.locator('#run-quick-check').click({timeout:1500});
    await page.waitForFunction(() => document.getElementById('quick-check-result').textContent.includes('Jev'));
    assert.deepEqual(await page.evaluate(() => FactorLabApp.getEnvelope()), before);
    assert.match(await page.locator('#quick-check-result').innerText(), /证据不足/);
    await page.locator('#note').fill('修改后的理由');
    assert.match(await page.locator('#quick-check-result').innerText(), /理由或进度已改变，请重新核对。/);
    assert.doesNotMatch(await page.locator('#quick-check-result').innerText(), /短期战术/);
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
});
