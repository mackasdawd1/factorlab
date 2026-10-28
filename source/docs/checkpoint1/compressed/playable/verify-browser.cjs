const {chromium}=require('playwright');
const fs=require('fs');
const path=require('path');
const {pathToFileURL}=require('url');
const assert=require('assert/strict');

(async()=>{
 const dir=__dirname, data=JSON.parse(fs.readFileSync(path.join(dir,'data.json'),'utf8'));
 const browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE});
 const context=await browser.newContext({viewport:{width:1366,height:768}});
 const page=await context.newPage(); const errors=[], requests=[], paths=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('request',r=>{if(/^https?:/.test(r.url())&&!r.url().startsWith('http://127.0.0.1:8876/'))requests.push(r.url());});
 const url='http://127.0.0.1:8876/index.html';
 const reset=async()=>{await page.goto(url);await page.evaluate(()=>sessionStorage.clear());await page.reload();};
 const pct=v=>(v*100).toFixed(2)+'%';
 let interactions=0;
 const click=async selector=>{await page.locator(selector).click();interactions++;};
 for(const strategy of Object.keys(data.strategies))for(const a of ['boost','hold','buffer'])for(const b of ['boost','hold','buffer']){
  await reset();await click(`[data-strategy=${strategy}]`);
  let id=strategy+':';
  for(const [round,decision]of [a,b].entries()){
   assert(await page.locator('[data-execute]').isDisabled());
   const before=await page.locator('#app').innerText();
   assert(!before.includes(data.nodes[id].options[decision].event),'no future event rendered');
   await click(`[data-decision=${decision}]`);
   const preview=await page.locator('.preview').innerText();
   assert(preview.includes(pct(data.nodes[id].options[decision].weights[4])));
   const saved=await page.evaluate(()=>sessionStorage.getItem('factorlab-week3-playable-v1'));
   await click('[data-learning=why]');await click('#learning > [data-close-learning]');
   assert.equal(await page.evaluate(()=>sessionStorage.getItem('factorlab-week3-playable-v1')),saved);
   await page.locator('[data-execute]').evaluate(b=>{b.click();b.click();});interactions++;
   id=data.nodes[id].options[decision].next;
   assert(await page.locator('#result').isVisible());
   assert.equal((await page.locator('[data-return]').innerText()).replace('+',''),pct(data.nodes[id].ledger.at(-1).return_value));
   const current=JSON.parse(await page.evaluate(()=>sessionStorage.getItem('factorlab-week3-playable-v1')));
   assert.equal(current.node,id);assert.equal(data.nodes[id].ledger.length,round+1);
   await click('[data-next]');
  }
  assert.equal(await page.locator('h1').innerText(),data.nodes[id].profile.title);
  await click('[data-learning=factors]');
  assert.equal(await page.locator('.contributions tr').count(),8);
  await page.keyboard.press('Escape');
  await click('[data-replay]');assert.equal(await page.locator('[data-strategy]').count(),3);
  paths.push({strategy,decisions:[a,b],status:'PASS',golden_path_clicks:7});
 }
 await reset();await click('[data-strategy=guardian]');await click('[data-decision=boost]');await page.reload();
 assert.equal(await page.locator('[data-decision=boost]').getAttribute('aria-pressed'),'true');
 await click('[data-execute]');await page.reload();assert(await page.locator('#result').isVisible());
 assert.equal(await page.locator('#result .reward h3').innerText(),'Pause & Reflect');
 await page.keyboard.press('Escape');await click('[data-result]');await click('[data-next]');
 await click('[data-decision=buffer]');await click('[data-execute]');
 assert.equal(await page.locator('#result .reward h3').innerText(),'Risk-aware');
 await click('[data-next]');await page.reload();assert(await page.locator('[data-replay]').isVisible());
 const layouts=[];
 for(const [width,height] of [[1440,900],[1366,768],[1280,720],[1024,768],[900,700]]){
  await page.setViewportSize({width,height});await reset();await click('[data-strategy=navigator]');await click('[data-decision=boost]');
  const check=async stage=>{
   const bad=await page.evaluate(()=>[...document.querySelectorAll('#app button,#app h1,#app h2,#app p,dialog[open] button')].filter(e=>{
    const r=e.getBoundingClientRect();return r.width>0&&(r.left<-.5||r.right>innerWidth+.5||e.scrollWidth>e.clientWidth+2);
   }).map(e=>e.textContent));
   assert.deepEqual(bad,[],`${width} ${stage} overflow`);
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   layouts.push({width,height,stage,status:'PASS'});
  };
  await check('plan');await click('[data-execute]');await check('reward');await click('[data-next]');
 }
 await page.setViewportSize({width:1440,height:1000});await reset();
 await page.screenshot({path:path.join(dir,'evidence/strategy.png'),fullPage:true});
 await click('[data-strategy=navigator]');await click('[data-decision=boost]');
 await page.screenshot({path:path.join(dir,'evidence/main-preview.png'),fullPage:true});
 await click('[data-execute]');await page.waitForTimeout(950);
 await page.screenshot({path:path.join(dir,'evidence/reward-round1.png'),fullPage:true});
 await click('[data-next]');await click('[data-decision=buffer]');await click('[data-execute]');await page.waitForTimeout(950);
 await page.screenshot({path:path.join(dir,'evidence/reward-loss.png'),fullPage:true});
 await click('[data-next]');await page.screenshot({path:path.join(dir,'evidence/profile.png'),fullPage:true});
 await page.emulateMedia({reducedMotion:'reduce'});await click('[data-replay]');await click('[data-strategy=challenger]');await click('[data-decision=hold]');await click('[data-execute]');
 assert.equal(await page.locator('.reward svg').evaluate(e=>getComputedStyle(e).animationName),'none');
 await click('[data-next]');
 await context.setOffline(true);await click('[data-decision=buffer]');await click('[data-execute]');await click('[data-next]');assert(await page.locator('[data-replay]').isVisible());
 await context.setOffline(false);
 const filePage=await context.newPage();await filePage.goto(pathToFileURL(path.join(dir,'index.html')).href);await context.setOffline(true);await filePage.reload();
 await filePage.locator('[data-strategy=navigator]').click();
 for(let i=0;i<2;i++){await filePage.locator('[data-decision=hold]').click();await filePage.locator('[data-execute]').click();await filePage.locator('[data-next]').click();}
 assert(await filePage.locator('[data-replay]').isVisible());
 assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);
 const result={status:'PASS',verified_at:new Date().toISOString(),browser:browser.version(),complete_paths:paths,interactions,layouts,refresh:'plan/result/profile PASS',duplicate_execute:'PASS',learning_return:'PASS',replay:'PASS',reduced_motion:'PASS',offline:'loaded HTTP game and cold file:// launch PASS',console_errors:errors,external_requests:requests,user_testing:'NOT RUN',figma:'MCP QUOTA BLOCKED / NOT VERIFIED'};
 fs.writeFileSync(path.join(dir,'evidence/browser.json'),JSON.stringify(result,null,2)+'\n');
 console.log(JSON.stringify({status:'PASS',paths:paths.length,interactions,layouts:layouts.length}));await browser.close();
})().catch(e=>{console.error(e);process.exit(1);});
