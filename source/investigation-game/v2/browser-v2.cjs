const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('../../.local/qa/node_modules/playwright-core');
const { createServer } = require('../server.cjs');

(async () => {
  const server = createServer({env:{}});
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe', headless:true});
  const errors = [];
  const output = path.join(__dirname, 'evidence');
  fs.mkdirSync(output, {recursive:true});
  try {
    const page = await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(origin + '/v2/');
    await page.locator('#confirm').waitFor({timeout:5000});
    assert.match(await page.title(), /FactorLab/);
    const initial = await page.evaluate(() => JSON.stringify(FactorLabApp.getSave()));
    await page.locator('#settings').click();
    await page.locator('#language').selectOption('en');
    assert.equal(await page.locator('html').getAttribute('lang'), 'en');
    await page.locator('#close-settings').click();
    assert.equal(await page.evaluate(() => JSON.stringify(FactorLabApp.getSave())), initial);
    await page.screenshot({path:path.join(output,'desktop-en.png'),fullPage:true});
    await page.locator('#settings').click();
    await page.locator('#language').selectOption('zh-CN');
    await page.locator('#close-settings').click();
    await page.screenshot({path:path.join(output,'desktop-zh.png'),fullPage:true});
    await page.locator('[data-question]').first().click();
    await page.locator('#messages .assistant').waitFor();
    assert.match(await page.locator('#messages').innerText(), /规则|示例/);
    for(let round=1;round<=6;round++) {
      await page.locator('#reason').selectOption('evidence');
      await page.locator('#confirm').click();
      for(let limit=0;limit<8;limit++) {
        const phase = await page.evaluate(() => FactorLabApp.getState().phase);
        if(phase==='review'||phase==='complete') break;
        if(phase==='event') await page.locator('#resume').click();
        else if(phase==='simulating') await page.locator('#fast-forward').click();
        await page.waitForTimeout(30);
      }
      assert.ok(['review','complete'].includes(await page.evaluate(() => FactorLabApp.getState().phase)));
      const before = await page.evaluate(() => JSON.stringify(FactorLabApp.getSave()));
      await page.reload();
      await page.locator('#settings').waitFor();
      assert.equal(await page.evaluate(() => JSON.stringify(FactorLabApp.getSave())), before);
      if(round<6) await page.locator('#next-round').click();
    }
    assert.equal(await page.evaluate(() => FactorLabApp.getState().day),120);
    await page.screenshot({path:path.join(output,'complete-zh.png'),fullPage:true});
    await page.setViewportSize({width:390,height:844});
    await page.screenshot({path:path.join(output,'mobile-zh.png'),fullPage:true});
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(output,'browser-results.json'), JSON.stringify({sixRounds:true,days:120,languagePreservesSave:true,reloadEachRound:true,aiFallback:true,pageErrors:errors},null,2));
    console.log('PASS: six rounds, event pauses, bilingual state preservation, reloads, fallback, desktop/mobile.');
  } finally { await browser.close(); await new Promise(r=>server.close(r)); }
})().catch(e=>{console.error(e);process.exitCode=1;});
