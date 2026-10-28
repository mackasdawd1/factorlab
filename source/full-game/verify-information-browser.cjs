const {chromium}=require('playwright');
const {pathToFileURL}=require('node:url');
const path=require('node:path'),fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE});
 try{
 const context=await browser.newContext({viewport:{width:1366,height:768},offline:true});
 const page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 const url=pathToFileURL(path.join(__dirname,'index.html')).href;
 await page.goto(url);
 await page.locator('[data-strategy=navigator]').click();
 assert.equal(await page.locator('[data-research]').count(),1,'research entry required');
 const key='factorlab-campaign-save-v2';
 for(let round=1;round<=6;round++){
  const buy=[1,3,5].includes(round);
  assert.equal(await page.locator('[data-information] [data-point]').count(),3);
  const before=JSON.parse(await page.evaluate(k=>localStorage.getItem(k),key));
  await page.locator('[data-decision=hold]').click();
  if(buy){
   await page.locator('[data-research]').evaluate(b=>{b.click();b.click();});
   assert.equal(await page.locator('[data-information] [data-point]').count(),7);
   const after=JSON.parse(await page.evaluate(k=>localStorage.getItem(k),key));
   assert.equal(after.node,before.node);assert.equal(after.research.length,[1,3,5].filter(r=>r<=round).length);
   assert.equal(after.draft,'hold','purchase preserves selected allocation');
   await page.reload();assert.equal(await page.locator('[data-information] [data-point]').count(),7);
  }
  if(round===6)assert(await page.locator('[data-research]').isDisabled());
  await page.locator('[data-reason]').selectOption('uncertain');
  await page.reload();assert.equal(await page.locator('[data-reason]').inputValue(),'uncertain');
  const times=await page.locator('[data-information] [data-point]').evaluateAll(es=>es.map(e=>Number(e.dataset.time)));
  assert(times.every(t=>t<round));
  if(round===1)await page.screenshot({path:path.join(__dirname,'evidence/information-plan.png'),fullPage:true,animations:'disabled'});
  await page.locator('[data-execute]').click();
  assert.equal(await page.locator('#result [data-research-status]').innerText(),buy?'当时已解锁详细历史':'当时仅有基础历史');
  assert((await page.locator('#result [data-reason-review]').innerText()).includes('信息不足'));
  await page.locator('#result .information-review summary').click();
  assert.equal(await page.locator('#result [data-review-cutoff]').innerText(),String(round-1));
  await page.reload();assert(await page.locator('#result').isVisible());
  if(round===1){
   await page.locator('#result .information-review summary').click();
   await page.locator('#result .information-review').scrollIntoViewIfNeeded();
   await page.screenshot({path:path.join(__dirname,'evidence/information-review.png'),animations:'disabled'});
  }
  await page.locator('[data-next]').click();
 }
 assert.equal(await page.locator('[data-research-used]').innerText(),'3');
 assert.equal(await page.locator('.decision-log [data-research-status]').count(),6);
 await page.reload();assert.equal(await page.locator('[data-research-used]').innerText(),'3');
 await page.locator('[data-replay]').click();await page.locator('[data-strategy=guardian]').click();
 assert.equal(await page.locator('[data-research-points]').innerText(),'3');
 const layouts=[];
 for(const width of [1440,1366,1024,900]){
  await page.setViewportSize({width,height:900});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  const overflow=await page.locator('[data-information]').evaluate(e=>e.scrollWidth>e.clientWidth+2);
  assert.equal(overflow,false);layouts.push(width);
 }
 const legacy=await context.newPage();
 const old='{"version":"factorlab-campaign-v1","node":"navigator:","phase":"plan","draft":null}';
 await legacy.goto(url);await legacy.evaluate(({key,old})=>{localStorage.removeItem(key);localStorage.setItem('factorlab-campaign-save-v1',old);},{key,old});
 await legacy.reload();assert(await legacy.locator('.storage-note').isVisible());
 await legacy.locator('[data-strategy=guardian]').click();await legacy.locator('[data-research]').click();
 assert.equal(await legacy.evaluate(()=>localStorage.getItem('factorlab-campaign-save-v1')),old);
 const blocked=await context.newPage();
 blocked.on('pageerror',e=>errors.push(e.message));
 await blocked.addInitScript(()=>{Storage.prototype.getItem=function(){throw Error('disabled');};Storage.prototype.setItem=function(){throw Error('disabled');};});
 await blocked.goto(url);await blocked.locator('[data-strategy=navigator]').click();
 assert(await blocked.locator('.storage-note').isVisible());
 for(let round=1;round<=6;round++){
  if(round<=3)await blocked.locator('[data-research]').evaluate(b=>{b.click();b.click();});
  else assert(await blocked.locator('[data-research]').isDisabled());
  await blocked.locator('[data-reason]').selectOption('buffer');
  await blocked.locator('[data-decision=hold]').click();await blocked.locator('[data-execute]').click();
  assert((await blocked.locator('#result [data-reason-review]').innerText()).includes('保留缓冲'));
  await blocked.locator('[data-next]').click();
 }
 assert.equal(await blocked.locator('[data-research-used]').innerText(),'3');
 await blocked.locator('[data-replay]').click();await blocked.locator('[data-strategy=navigator]').click();
 assert.equal(await blocked.locator('[data-research-points]').innerText(),'3');
 assert.deepEqual(errors,[]);
 fs.writeFileSync(path.join(__dirname,'evidence/information-browser.json'),JSON.stringify({status:'PASS',verified_at:new Date().toISOString(),browser:browser.version(),six_round_buy_skip:[true,false,true,false,true,false],duplicate_purchase:'PASS',draft_preserved:'PASS',budget_exhaustion:'PASS',refresh:'purchase/reason/result/final',legacy_save:'preserved',blocked_storage:'six rounds with purchases/reasons/exhaustion/replay PASS',offline:true,layouts,errors,user_testing:'NOT RUN'},null,2)+'\n');
 console.log('PASS: six-round research/skip loop, budget, reasoning, refresh, legacy preservation and layouts');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
