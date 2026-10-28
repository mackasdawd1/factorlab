const assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'../.local/qa/node_modules/playwright-core');
const {createServer}=require('./server.cjs');
(async()=>{
 const server=createServer({env:{}});await new Promise(r=>server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${server.address().port}`;
 const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 try {
  const page=await browser.newPage();await page.goto(url);
  await page.locator('#study-open').click();await page.locator('#study-variant').selectOption('fixed');await page.locator('#study-save').click();
  await page.locator('[data-question]').first().click();await page.locator('#send:not([disabled])').waitFor();const a=await page.locator('.assistant p').last().innerText();
  await page.locator('[data-question]').nth(1).click();await page.locator('#send:not([disabled])').waitFor();const b=await page.locator('.assistant p').last().innerText();
  assert.equal(a,b,'Fixed comparison group must be independent of the question');
  await page.locator('[data-evidence="E1"]').click();await page.getByRole('button',{name:'收起证据'}).click();await page.locator('#reason').selectOption('demand');await page.locator('#lock').click();await page.locator('#confirm-lock').click();
  await page.locator('#review-question').click();await page.locator('#send:not([disabled])').waitFor();assert.equal(await page.locator('.assistant p').last().innerText(),a,'Fixed response must not change after settlement');
  await page.close();
  const p=await browser.newPage();await p.goto(url);
  let releaseBefore;const before=new Promise(r=>releaseBefore=r);
  await p.route('**/api/coach',async route=>{await before;await route.fulfill({json:{mode:'example',summary:'测试回复。',detail:'预结算测试。',references:['E2']}});});
  await p.locator('[data-question]').first().click();
  await p.locator('[data-evidence="E2"]').click();await p.getByRole('button',{name:'收起证据'}).click();
  assert.equal(await p.locator('[data-choice="increase"]').isEnabled(),false,'Reading evidence must not re-enable draft changes during AI request');
  releaseBefore();await p.locator('#send:not([disabled])').waitFor();await p.unroute('**/api/coach');
  await p.locator('#reason').selectOption('valuation');await p.locator('#lock').click();await p.locator('#confirm-lock').click();
  let release;const pending=new Promise(r=>release=r);
  await p.route('**/api/coach',async route=>{await pending;await route.fulfill({json:{mode:'example',summary:'这是延迟的测试回复。',detail:'仅用于验证界面，不是真实 AI。',references:['E2']}});});
  await p.locator('#review-question').click();await p.locator('#reflection').fill('我还想检查订单兑现为利润的速度。');release();await p.locator('#send:not([disabled])').waitFor();
  assert.equal(await p.locator('#reflection').inputValue(),'我还想检查订单兑现为利润的速度。','In-flight reflection must survive AI response');
  await p.reload();assert.equal(await p.locator('#reflection').inputValue(),'我还想检查订单兑现为利润的速度。');
  await p.locator('#finish').click();await p.reload();assert.ok(await p.getByText('调查档案已完成',{exact:true}).isVisible());
  await p.locator('#research-open').click();await p.locator('[data-factor="0"]').fill('100');for(const i of [1,2,3])await p.locator(`[data-factor="${i}"]`).fill('0');await p.locator('#run-research').click();assert.equal(await p.locator('#research-error').innerText(),'');await p.locator('[data-factor="0"]').fill('0');await p.locator('#run-research').click();assert.ok((await p.locator('#research-error').innerText()).includes('至少'));
  await p.close();console.log('PASS: fixed condition stable across questions and phases; pending reflection preserved/reloads; completion persists; research preferences validate.');
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
