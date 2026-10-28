const {chromium}=require('playwright');
const {pathToFileURL}=require('node:url');
const path=require('node:path'),fs=require('node:fs'),assert=require('node:assert/strict');
const D=require('./data.json');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE});
 try{
 const context=await browser.newContext({viewport:{width:1366,height:768},offline:true});
 const page=await context.newPage(),errors=[],requests=[],runs=[],layouts=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(/^https?:/.test(r.url()))requests.push(r.url());});
 const url=pathToFileURL(path.join(__dirname,'index.html')).href;
 await page.goto(url);await page.evaluate(()=>localStorage.clear());await page.reload();
 for(const strategy of Object.keys(D.strategies))for(const variant of [0,1,2]){
  await page.locator(`[data-strategy=${strategy}]`).click();let id=strategy+':';
  for(let round=1;round<=6;round++){
   assert(await page.locator('[data-execute]').isDisabled());
   const decision=['boost','hold','buffer'][(round+variant-1)%3];
   const next=D.nodes[id].options[decision].next;
   const before=await page.locator('#app').innerText();
   for(let future=round;future<=6;future++){
    const futureNode=Object.values(D.nodes).find(n=>n.record?.round===future);
    assert(!before.includes(futureNode.record.event),`Round ${round} decision UI reveals round ${future}: ${futureNode.record.event}`);
   }
   await page.locator('[data-decision='+decision+']').click();
   const saved=await page.evaluate(()=>localStorage.getItem('factorlab-campaign-save-v2'));
   await page.locator('[data-learning]').click();await page.keyboard.press('Escape');
   assert.equal(await page.evaluate(()=>localStorage.getItem('factorlab-campaign-save-v2')),saved);
   if(round===3){await page.reload();assert.equal(await page.locator(`[data-decision=${decision}]`).getAttribute('aria-pressed'),'true');}
   await page.locator('[data-execute]').evaluate(b=>{b.click();b.click();});
   assert.equal(JSON.parse(await page.evaluate(()=>localStorage.getItem('factorlab-campaign-save-v2'))).node,next);
   assert.equal((await page.locator('[data-return]').innerText()).replace('+',''),(D.nodes[next].record.return_value*100).toFixed(2)+'%');
   if(round===4){await page.reload();assert(await page.locator('#result').isVisible());}
   await page.locator('[data-next]').click();id=next;
  }
  assert(await page.locator('[data-replay]').isVisible());
  assert.equal(await page.locator('.decision-log li').count(),6);
  assert.equal(await page.locator('[data-next]').count(),0);
  const historyCount=await page.locator('[data-history-count]').innerText();
  await page.reload();assert.equal(await page.locator('[data-history-count]').innerText(),historyCount);
  await page.locator('[data-learning]').click();assert.equal(await page.locator('.contributions tr').count(),8);await page.keyboard.press('Escape');
  if(strategy==='navigator'&&variant===0)await page.screenshot({path:path.join(__dirname,'evidence/debrief.png'),fullPage:true});
  const count=await page.locator('[data-explored]').innerText();
  await page.locator('[data-replay]').click();assert.equal(await page.locator('[data-explored]').innerText(),count);
  runs.push({strategy,variant,status:'PASS'});
 }
 assert.equal(await page.locator('[data-explored]').innerText(),'9');
 for(const [width,height] of [[1440,900],[1366,768],[1280,720],[1024,768],[900,700]]){
  await page.setViewportSize({width,height});await page.locator('[data-strategy=navigator]').click();await page.locator('[data-decision=boost]').click();
  const check=async stage=>{
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   const bad=await page.evaluate(()=>[...document.querySelectorAll('#app button,#app h1,#app h2,#app p,dialog[open] button')].filter(e=>{const r=e.getBoundingClientRect();return r.width&&(r.left<-.5||r.right>innerWidth+.5||e.scrollWidth>e.clientWidth+2);}).map(e=>e.textContent));
   assert.deepEqual(bad,[],`${width}: ${stage}`);layouts.push({width,height,stage,status:'PASS'});
  };
  await check('plan');
  if(width===1440)await page.screenshot({path:path.join(__dirname,'evidence/campaign.png'),fullPage:true});
  await page.locator('[data-execute]').click();await check('result');
  if(width===1440)await page.screenshot({path:path.join(__dirname,'evidence/reveal.png'),fullPage:true,animations:'disabled'});
  await page.evaluate(()=>localStorage.removeItem('factorlab-campaign-save-v2'));await page.reload();
 }
 await page.emulateMedia({reducedMotion:'reduce'});await page.locator('[data-strategy=guardian]').click();await page.locator('[data-decision=hold]').click();await page.locator('[data-execute]').click();
 assert.equal(await page.locator('#result').evaluate(e=>getComputedStyle(e).animationName),'none');
 const broken='{"version":"old","node":"bad"}';
 await page.evaluate(raw=>localStorage.setItem('factorlab-campaign-save-v2',raw),broken);await page.reload();
 assert(await page.locator('.storage-note').isVisible());await page.locator('[data-strategy=navigator]').click();
 assert.equal(await page.evaluate(()=>localStorage.getItem('factorlab-campaign-save-v2')),broken);
 const blocked=await context.newPage();
 await blocked.addInitScript(()=>{Storage.prototype.getItem=function(){throw Error('disabled');};Storage.prototype.setItem=function(){throw Error('disabled');};});
 await blocked.goto(url);await blocked.locator('[data-strategy=navigator]').click();
 for(let i=0;i<6;i++){await blocked.locator('[data-decision=buffer]').click();await blocked.locator('[data-execute]').click();await blocked.locator('[data-next]').click();}
 assert.equal(await blocked.locator('[data-explored]').innerText(),'1');
 await blocked.locator('[data-replay]').click();assert.equal(await blocked.locator('[data-explored]').innerText(),'1');
 assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);
 const result={status:'PASS',verified_at:new Date().toISOString(),browser:browser.version(),runs,layouts,offline:'cold file launch and every run with network disabled',refresh:'plan/result/final',duplicate_execute:'PASS',replay_collection:'PASS',reduced_motion:'PASS',future_leakage:'no current/future event in pre-execution DOM',invalid_save:'preserved without overwrite',blocked_storage:'six-round run + replay PASS',errors,external_requests:requests,user_testing:'NOT RUN'};
 fs.writeFileSync(path.join(__dirname,'evidence/browser.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({status:'PASS',runs:runs.length,layouts:layouts.length}));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
