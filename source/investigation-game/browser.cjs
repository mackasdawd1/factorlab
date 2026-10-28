const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'../.local/qa/node_modules/playwright-core');
const {createServer}=require('./server.cjs');
(async()=>{
  const server=createServer({env:{}});await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const origin=`http://127.0.0.1:${server.address().port}`;
  const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
  const errors=[];fs.mkdirSync(path.join(__dirname,'evidence'),{recursive:true});
  try {
    for(const choice of ['hold','increase','decrease']) {
      const ctx=await browser.newContext({viewport:{width:1440,height:1050},reducedMotion:'reduce'}), page=await ctx.newPage();
      page.on('pageerror',e=>errors.push(e.message));
      await page.goto(origin);await page.getByRole('heading',{name:/好消息，\s*值得加仓吗？/}).waitFor();
      await page.evaluate(()=>localStorage.setItem('factorlab-duel-save-v1','legacy-save'));
      assert.equal(await page.locator('#lock').isEnabled(),false);
      await page.locator('[data-evidence="E1"]').first().click();
      await page.getByRole('dialog').getByRole('button',{name:'收起证据'}).click();
      await page.locator('[data-question]').first().click();
      await page.locator('#messages .message.assistant').last().waitFor();
      assert.ok((await page.locator('#messages').innerText()).includes('示例'));
      await page.locator(`[data-choice="${choice}"]`).click();
      await page.locator('#reason').selectOption('valuation');
      await page.locator('#note').fill('价格可能已经反映了增长，所以我考虑缓冲。');
      await page.locator('#note').blur();
      await page.reload();assert.equal(await page.locator('#note').inputValue(),'价格可能已经反映了增长，所以我考虑缓冲。');
      if(choice==='hold')await page.screenshot({path:path.join(__dirname,'evidence/investigate.png'),fullPage:true});
      await page.locator('#lock').click();
      await page.locator('#confirm-lock').click();
      await page.locator('#result').waitFor();
      const after=await page.locator('#nav').innerText();
      await page.reload();assert.equal(await page.locator('#nav').innerText(),after);
      assert.equal(await page.evaluate(()=>localStorage.getItem('factorlab-duel-save-v1')),'legacy-save');
      assert.ok((await page.locator('#result').innerText()).includes('长期持有对照'));
      await page.locator('#review-question').click();
      await page.locator('#messages .message.assistant').last().waitFor();
      await page.locator('#research-open').click();
      assert.ok((await page.getByRole('dialog').innerText()).includes('36'));
      await page.getByRole('button',{name:'返回工作台'}).click();
      if(choice==='hold')await page.screenshot({path:path.join(__dirname,'evidence/review.png'),fullPage:true});
      await ctx.close();
    }
    const ctx=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'}),page=await ctx.newPage();
    page.on('pageerror',e=>errors.push(e.message));await page.goto(origin);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await page.screenshot({path:path.join(__dirname,'evidence/mobile.png'),fullPage:true});
    await page.evaluate(()=>localStorage.setItem('investigation-save-v1','broken'));
    await page.reload();assert.ok((await page.locator('#notice').innerText()).includes('存档'));
    assert.equal(await page.evaluate(()=>localStorage.getItem('investigation-save-v1')),'broken');
    await ctx.close();
    const blocked=await browser.newContext();await blocked.addInitScript(()=>{Storage.prototype.setItem=()=>{throw Error('blocked')};Storage.prototype.getItem=()=>{throw Error('blocked')};});
    const bp=await blocked.newPage();await bp.goto(origin);await bp.locator('[data-evidence="E2"]').first().click();await bp.getByRole('button',{name:'收起证据'}).click();await bp.locator('#reason').selectOption('uncertain');await bp.locator('#lock').click();await bp.locator('#confirm-lock').click();await bp.locator('#result').waitFor();await blocked.close();
    assert.deepEqual(errors,[]);
    fs.writeFileSync(path.join(__dirname,'evidence/browser.json'),JSON.stringify({date:new Date().toISOString(),campaigns:3,mobileWidth:390,corruptSavePreserved:true,blockedStoragePlayable:true,pageErrors:errors,humanTesting:'NOT RUN'},null,2));
    console.log('PASS: 3 choices, dialog/chat/research, reload, legacy save, mobile, corrupt/blocked storage; no page errors. Human tests NOT RUN.');
  }finally {await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
