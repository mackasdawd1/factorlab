const {chromium}=require('playwright');
const {pathToFileURL}=require('node:url');
const path=require('node:path');
const fs=require('node:fs');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE});
 try {
 const page=await browser.newPage();
 await page.goto(pathToFileURL(path.join(__dirname,'index.html')).href);
 await page.evaluate(()=>{sessionStorage.clear();localStorage.clear();});await page.reload();
 for(let run=0;run<2;run++){
  await page.locator('[data-strategy=guardian]').click();
  assert((await page.locator('.run-hud').innerText()).includes('100%'));
  for(const decision of ['boost','buffer']){
   assert(await page.locator('.round-mission').isVisible());
   await page.locator(`[data-decision=${decision}]`).click();
   assert.equal(await page.locator('meter').count(),2);
   await page.locator('[data-execute]').click();
   assert((await page.locator('.mission-outcome').innerText()).includes(decision==='boost'?'reflection':'complete'));
   await page.locator('[data-next]').click();
  }
  assert((await page.locator('.profile-badges').innerText()).includes('Risk-aware'));
  assert.equal(await page.locator('[data-explored]').innerText(),'1');
  await page.reload();assert.equal(await page.locator('[data-explored]').innerText(),'1');
  await page.locator('[data-replay]').click();assert.equal(await page.locator('[data-explored]').innerText(),'1');
 }
 await page.evaluate(()=>{localStorage.setItem('factorlab-week3-collection-v1','{"bad":true}');});
 await page.reload();assert.equal(await page.locator('[data-explored]').innerText(),'0');
 const blocked=await browser.newPage();
 await blocked.addInitScript(()=>{Storage.prototype.setItem=function(){throw new Error('blocked');};Storage.prototype.getItem=function(){throw new Error('blocked');};});
 await blocked.goto(pathToFileURL(path.join(__dirname,'index.html')).href);
 assert((await blocked.locator('.collection').innerText()).includes('存储不可用'));
 await blocked.locator('[data-strategy=navigator]').click();
 for(let i=0;i<2;i++){await blocked.locator('[data-decision=hold]').click();await blocked.locator('[data-execute]').click();await blocked.locator('[data-next]').click();}
 assert.equal(await blocked.locator('[data-explored]').innerText(),'1');
 await blocked.locator('[data-replay]').click();assert.equal(await blocked.locator('[data-explored]').innerText(),'1');
 const result={status:'PASS',verified_at:new Date().toISOString(),missions:'budget breach and buffer pass',collection:'terminal only / replay retained / refresh / duplicate deduplicated / malformed storage / blocked storage playable',user_testing:'NOT RUN'};
 fs.writeFileSync(path.join(__dirname,'evidence/progression.json'),JSON.stringify(result,null,2)+'\n');console.log(result);
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
