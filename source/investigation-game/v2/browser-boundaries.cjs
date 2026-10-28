const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require('../../.local/qa/node_modules/playwright-core');
const {createServer}=require('../server.cjs');
const E=require('./simulation.js');
const dictionary=require('./i18n.js');

(async()=>{
  assert.deepEqual(Object.keys(dictionary.en).sort(),Object.keys(dictionary['zh-CN']).sort());
  const server=createServer({env:{}});await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const origin=`http://127.0.0.1:${server.address().port}`;
  const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
  const errors=[],checks=[];
  const newPage=async(width=1366,reducedMotion='reduce')=>{const context=await browser.newContext({viewport:{width,height:900},reducedMotion});const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));return page;};
  try{
    const p=await newPage();await p.goto(origin+'/v2/');await p.locator('#confirm').waitFor();
    const before=await p.evaluate(()=>JSON.stringify(FactorLabApp.getSave()));await p.waitForTimeout(150);assert.equal(await p.evaluate(()=>JSON.stringify(FactorLabApp.getSave())),before);checks.push('Decision pause does not consume RNG or advance time');
    await p.evaluate(()=>localStorage.setItem('factorlab-duel-save-v1','preserve-legacy'));
    await p.locator('[data-evidence="E1"]').click();await p.locator('[data-preset="growth"]').click();await p.locator('summary[data-i18n="factorsTitle"]').click();await p.locator('#factor-0').fill('70');await p.locator('#factor-1').fill('5');await p.locator('#apply-factors').click();await p.locator('#reason').selectOption('valuation');await p.locator('#note').fill('Price may already reflect growth');await p.locator('#reflection').fill('Watch margins after the next disclosure');
    const draft=await p.evaluate(()=>FactorLabApp.getEnvelope());await p.reload();await p.locator('#confirm').waitFor();assert.deepEqual(await p.evaluate(()=>FactorLabApp.getEnvelope()),draft);assert.equal(await p.evaluate(()=>localStorage.getItem('factorlab-duel-save-v1')),'preserve-legacy');checks.push('Draft, factor preferences, reasons and reflection survive reload; legacy save preserved');
    await p.route('**/api/coach-v2',async route=>{await new Promise(r=>setTimeout(r,300));try{await route.fulfill({json:{mode:'live',summary:'Delayed English reply.',detail:'Visible data only.',references:['E1']}});}catch{}});
    await p.locator('[data-question]').first().click();await p.locator('#settings').click();await p.locator('#language').selectOption('en');await p.locator('#close-settings').click();await p.waitForTimeout(450);assert.equal(await p.locator('#messages .assistant').count(),0);assert.equal(await p.locator('#ask').isEnabled(),true);checks.push('Language change cancels stale AI response without locking UI');
    const engineBefore=await p.evaluate(()=>JSON.stringify(FactorLabApp.getSave()));assert.deepEqual(JSON.parse(engineBefore),draft.game);
    for(const width of [1440,1024,768,390,360]){await p.setViewportSize({width,height:900});assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`overflow at ${width}`);}checks.push('No horizontal overflow at five viewport widths in English');
    const bad=await newPage();await bad.addInitScript(()=>localStorage.setItem('factorlab-simulation-ui-v2','{broken-original'));await bad.goto(origin+'/v2/');await bad.locator('#confirm').waitFor();assert.match(await bad.locator('#notice').innerText(),/存档/);await bad.locator('[data-preset]').first().click();assert.equal(await bad.evaluate(()=>localStorage.getItem('factorlab-simulation-ui-v2')),'{broken-original');checks.push('Corrupt original save is preserved without automatic overwrite');
    const blocked=await newPage(390);await blocked.addInitScript(()=>{Storage.prototype.getItem=function(){throw Error('blocked');};Storage.prototype.setItem=function(){throw Error('blocked');};});await blocked.goto(origin+'/v2/');await blocked.locator('#confirm').waitFor();assert.match(await blocked.locator('#notice').innerText(),/存储/);await blocked.locator('#reason').selectOption('risk');await blocked.locator('#confirm').click();assert.ok((await blocked.evaluate(()=>FactorLabApp.getState().day))>0);checks.push('Blocked storage still permits play and visible export guidance');
    let state=E.initial({seed:3});state=E.reduce(state,{type:'lock',weights:state.weights,factorWeights:[.25,.25,.25,.25],reason:'evidence',forecast:'flat'});while(!['review','complete'].includes(state.phase))state=E.reduce(state,state.phase==='event'?{type:'resume'}:{type:'advance',days:20});
    const testSave={version:'factorlab-ui-v2',game:E.serialize(state),draft:state.weights,factorPrefs:[25,25,25,25],reason:'evidence',forecast:'flat',note:'',reflection:''};
    const forecastPage=await newPage();await forecastPage.addInitScript(save=>localStorage.setItem('factorlab-simulation-ui-v2',JSON.stringify(save)),testSave);await forecastPage.goto(origin+'/v2/');await forecastPage.locator('#review').waitFor();const r=state.results[0];const expected=dictionary['zh-CN']['forecast'+r.realizedForecast[0].toUpperCase()+r.realizedForecast.slice(1)];assert.ok((await forecastPage.locator('#review-content').innerText()).includes('实际 '+expected));checks.push('Review uses engine-realized forecast category, not a second UI threshold');
    const moving=await newPage(1440,'no-preference');await moving.goto(origin+'/v2/');await moving.locator('#reason').selectOption('anchor');await moving.locator('#confirm').click();await moving.locator('#pause-play').click();const day=await moving.evaluate(()=>FactorLabApp.getState().day);await moving.waitForTimeout(300);assert.equal(await moving.evaluate(()=>FactorLabApp.getState().day),day);await moving.reload();await moving.locator('#fast-forward').waitFor();assert.equal(await moving.evaluate(()=>FactorLabApp.getState().day),day);checks.push('Playback pause and reload retain partial round without unrequested advancement');
    assert.deepEqual(errors,[]);fs.writeFileSync(path.join(__dirname,'evidence','browser-boundaries.json'),JSON.stringify({checks,errors,translationKeys:Object.keys(dictionary.en).length},null,2));console.log(`PASS: ${checks.length} browser boundaries; bilingual key parity; zero page errors.`);
  }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
