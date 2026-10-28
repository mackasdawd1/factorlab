const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const local = path.join(root, '.local/redesign-20261013');
const temporary = path.join(local, 'tmp');
const output = path.join(__dirname, 'evidence');
const reportFile = path.join(output, process.env.STUDIO_QA_GROUP ? 'browser-studio-' + process.env.STUDIO_QA_GROUP.toLowerCase().replace(/[^a-z0-9]+/g,'-') + '.json' : 'browser-studio-results.json');
fs.mkdirSync(temporary, {recursive:true});
fs.mkdirSync(output, {recursive:true});
process.env.TEMP = temporary;
process.env.TMP = temporary;
process.env.TMPDIR = temporary;
process.env.PLAYWRIGHT_BROWSERS_PATH = path.join(local, 'runtime/browsers');

const {chromium} = require(path.join(local, 'runtime/web/node_modules/playwright'));
const {createServer} = require('../server.cjs');
const SAVE_KEY = 'factorlab-simulation-ui-v3';
const OLD_SAVE_KEY = 'factorlab-simulation-ui-v2';
const views = ['research', 'portfolio', 'backtest', 'risk', 'journal'];
const results = {startedAt:new Date().toISOString(),scope:process.env.STUDIO_QA_GROUP||'all',environment:{runtime:process.execPath,browserCache:process.env.PLAYWRIGHT_BROWSERS_PATH,temporary},checks:[],layouts:[],controlBounds:[],layoutFailures:[],typography:[],focusTrace:[],screenshots:[],pageErrors:[],resourceErrors:[],requestFailures:[]};
let browser;
let origin;
const server = createServer({env:{}});

const check = async (name, run) => {
  if (process.env.STUDIO_QA_GROUP && !name.includes(process.env.STUDIO_QA_GROUP)) return;
  const started = Date.now();
  try { const detail = await run(); results.checks.push({name,status:'PASS',durationMs:Date.now()-started,detail}); console.log('PASS ' + name); }
  catch (error) { results.checks.push({name,status:'FAIL',durationMs:Date.now()-started,error:error.message,stack:error.stack}); console.error('FAIL ' + name + ': ' + error.message); }
};

async function newPage(options = {}, setup) {
  const context = await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce',acceptDownloads:true,...options});
  const page = await context.newPage();
  page.setDefaultTimeout(7000);
  page.on('pageerror', error => results.pageErrors.push({url:page.url(),message:error.message}));
  page.on('requestfailed', request => {
    if (!request.url().includes('/api/coach')) results.requestFailures.push({url:request.url(),error:request.failure()?.errorText});
  });
  page.on('response', response => {
    if(!response.ok() && ['script','stylesheet','image'].includes(response.request().resourceType()))results.resourceErrors.push({url:response.url(),status:response.status()});
  });
  if (setup) await setup(page);
  await page.goto(origin + '/v3/', {waitUntil:'networkidle'});
  await page.waitForFunction(() => !!window.FactorLabApp && !!window.FactorLabWorkspace);
  return {context,page};
}

async function go(page, view) {
  await page.locator(`button[data-view="${view}"]`).click();
  await page.waitForFunction(expected => FactorLabWorkspace.getView() === expected, view);
  await page.evaluate(() => FactorLabWorkspace.settled);
  await page.waitForTimeout(40);
}

async function language(page, value) {
  await page.locator('#settings').click();
  await page.locator('#language').selectOption(value);
  await page.waitForFunction(expected => document.documentElement.lang === expected, value);
  await page.locator('#close-settings').click();
}

async function screenshot(page, name) {
  const file = path.join(output, name + '.png');
  await page.screenshot({path:file,fullPage:false});
  results.screenshots.push(file);
}

async function advanceRound(page, eventScreenshots = false) {
  for (let step=0;step<12;step++) {
    const state = await page.evaluate(() => FactorLabApp.getState());
    if (state.phase === 'review' || state.phase === 'complete') return state;
    if (state.phase === 'event') {
      await go(page, 'research');
      if (eventScreenshots) { await screenshot(page, 'studio-event-zh-1440'); eventScreenshots=false; }
      await page.locator('#resume').click();
    } else if (state.phase === 'simulating') {
      await go(page, 'portfolio');
      await page.locator('#fast-forward').click();
    } else throw new Error('Unexpected phase while advancing: ' + state.phase);
    await page.waitForTimeout(40);
  }
  throw new Error('Round did not settle after 12 public UI operations');
}

async function layout(page, view, size, lang) {
  const measurement = await page.evaluate(() => {
    const visible = element => !!(element.getClientRects().length && getComputedStyle(element).visibility !== 'hidden');
    const width = document.documentElement.clientWidth;
    return {
      viewport:{width:innerWidth,height:innerHeight},scrollWidth:document.documentElement.scrollWidth,documentHeight:document.documentElement.scrollHeight,bodyWidth:document.body.scrollWidth,
      overflowing:[...document.querySelectorAll('body *')].filter(visible).map(element=>({tag:element.tagName,id:element.id,className:typeof element.className==='string'?element.className:'',rect:element.getBoundingClientRect()})).filter(item=>item.rect.left < -2 || item.rect.right > width+2).slice(0,12).map(({rect,...item})=>({...item,left:Math.round(rect.left),right:Math.round(rect.right)})),
      navLabelOverflow:[...document.querySelectorAll('button[data-view]')].filter(visible).flatMap(button=>[...button.querySelectorAll('[data-en]')].filter(visible).flatMap(label=>{const box=button.getBoundingClientRect(),range=document.createRange();range.selectNodeContents(label);return [...range.getClientRects()].filter(rect=>rect.width>0&&(rect.left<box.left+1||rect.right>box.right-1)).map(rect=>({view:button.dataset.view,label:label.textContent,labelLeft:rect.left,labelRight:rect.right,buttonLeft:box.left,buttonRight:box.right}));})),
      factorCollisions:[...document.querySelectorAll('.backtest-factor')].filter(visible).flatMap((element,index,elements)=>{const box=element.getBoundingClientRect(),range=document.createRange();range.selectNodeContents(element.querySelector('label'));const label=range.getBoundingClientRect(),value=element.querySelector('output').getBoundingClientRect(),next=elements[index+1]?.getBoundingClientRect(),issues=[];if(label.right>value.left-4)issues.push({index,type:'label/value',gap:value.left-label.right});if(next&&Math.abs(next.y-box.y)<2&&next.left-box.right<12)issues.push({index,type:'adjacent columns',gap:next.left-box.right});return issues;}),
      chartText:[...document.querySelectorAll('#nav-chart text,.backtest-chart text')].filter(visible).map(element=>{const matrix=element.getScreenCTM(),font=parseFloat(getComputedStyle(element).fontSize);return {text:element.textContent,font,screenFont:font*Math.hypot(matrix.a,matrix.b)};}),
      riskPanelWidths:[...document.querySelectorAll('#view-risk .panel,#view-risk .exposure-table,#view-risk .attribution-rows')].filter(visible).map(element=>({className:element.className,width:element.clientWidth,contentWidth:element.scrollWidth})),
      navButtons:[...document.querySelectorAll('button[data-view]')].filter(visible).length,
      bodyFont:parseFloat(getComputedStyle(document.body).fontSize)
    };
  });
  results.layouts.push({view,size,lang,...measurement});
  if(measurement.scrollWidth > size.width+1)results.layoutFailures.push(`${lang} ${view} at ${size.width} has document overflow ${measurement.scrollWidth}; ${JSON.stringify(measurement.overflowing)}`);
  if(measurement.navButtons!==5)results.layoutFailures.push(`${lang} ${view}: all five views must stay reachable`);
  if(measurement.navLabelOverflow.length)results.layoutFailures.push(`${lang} ${view} at ${size.width}: navigation labels exceed their controls ${JSON.stringify(measurement.navLabelOverflow)}`);
  if(measurement.factorCollisions.length)results.layoutFailures.push(`${lang} ${view} at ${size.width}: factor labels lack separation ${JSON.stringify(measurement.factorCollisions)}`);
  if(measurement.chartText.some(item=>item.screenFont<13.9))results.layoutFailures.push(`${lang} ${view} at ${size.width}: chart tick text falls below 14px on screen ${JSON.stringify(measurement.chartText)}`);
  if(size.width>=1280&&measurement.riskPanelWidths.some(item=>item.contentWidth>item.width+1))results.layoutFailures.push(`${lang} ${view} at ${size.width}: risk content overflows its panel ${JSON.stringify(measurement.riskPanelWidths)}`);
  if(measurement.bodyFont<16)results.layoutFailures.push(`${lang} ${view}: body font ${measurement.bodyFont} is below 16px`);
  const selector={research:'#go-allocation',portfolio:'#confirm',backtest:'#run-backtest',risk:'#view-risk [data-open-view="journal"]',journal:'#export-save'}[view];
  const initial=await page.locator(selector).evaluate(element=>{const r=element.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom,font:parseFloat(getComputedStyle(element).fontSize),withinViewport:r.top>=0&&r.bottom<=innerHeight&&r.left>=0&&r.right<=innerWidth};});
  results.controlBounds.push({view,size,lang,selector,initial});
  if(size.width===1440&&!initial.withinViewport)results.layoutFailures.push(`${lang} ${view}: primary ${selector} is outside the initial 1440x900 viewport at y=${Math.round(initial.y)}, bottom=${Math.round(initial.bottom)}, document height=${measurement.documentHeight}`);
  await page.locator(selector).evaluate(element=>element.scrollIntoView({block:'center',inline:'nearest',behavior:'instant'}));
  const reachability=await page.locator(selector).evaluate(element=>{const r=element.getBoundingClientRect(),x=Math.max(0,Math.min(innerWidth-1,r.x+r.width/2)),y=Math.max(0,Math.min(innerHeight-1,r.y+r.height/2)),hit=document.elementFromPoint(x,y);return {reachable:r.y>=-1&&r.bottom<=innerHeight+1&&element.contains(hit),x:r.x,y:r.y,bottom:r.bottom,viewportHeight:innerHeight,hit:hit?.tagName,hitId:hit?.id,hitClass:hit?.getAttribute('class')};});
  results.controlBounds.at(-1).reachability=reachability;
  if(!reachability.reachable){results.layoutFailures.push(`${lang} ${view} at ${size.width}: ${selector} cannot be scrolled to an unobstructed viewport position ${JSON.stringify(reachability)}`);await screenshot(page,`studio-unreachable-${view}-${lang}-${size.width}`);}
}

(async () => {
  assert.match(root,/^[Dd]:[\\/]/,'QA workspace must remain on D');
  assert.match(process.execPath,/^[Dd]:[\\/]/,'Use the D-drive Node runtime');
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
  const browserManifest = require(path.join(local,'runtime/web/node_modules/playwright-core/browsers.json'));
  const headless = browserManifest.browsers.find(item=>item.name==='chromium-headless-shell');
  const executable = path.join(process.env.PLAYWRIGHT_BROWSERS_PATH,`chromium_headless_shell-${headless.revision}`,'chrome-headless-shell-win64/chrome-headless-shell.exe');
  assert.ok(executable.toLowerCase().startsWith(process.env.PLAYWRIGHT_BROWSERS_PATH.toLowerCase()),'Browser must use the project cache');
  assert.ok(fs.existsSync(executable),'The manifest-selected headless browser must be installed');
  results.environment.browserExecutable = executable;
  results.environment.browserDistribution = headless.name;
  results.environment.browserRevision = headless.revision;
  results.environment.browserPathSource = 'Playwright browser manifest and verified Windows headless-shell installation';
  browser = await chromium.launch({headless:true,downloadsPath:path.join(temporary,'downloads')});
  results.environment.browserVersion = browser.version();
  assert.equal(results.environment.browserVersion,headless.browserVersion,'Running browser version must match the installed headless distribution');

  await check('responsive layouts and readable text', async () => {
    const {context,page} = await newPage();
    try {
      for (const lang of ['zh-CN','en']) {
        if (lang !== await page.locator('html').getAttribute('lang')) await language(page,lang);
        for (const size of [{width:1440,height:900},{width:1280,height:800},{width:390,height:844}]) {
          await page.setViewportSize(size);
          for (const view of views) {
            await go(page,view);
            if (size.width===1440 || (size.width===390 && ['research','portfolio','backtest'].includes(view))) await screenshot(page,`studio-${view}-${lang}-${size.width}`);
            await layout(page,view,size,lang);
          }
        }
      }
      await page.setViewportSize({width:1440,height:900});
      await go(page,'portfolio');
      for (const selector of ['#reason','#note','#forecast','#weight-0','#weight-5']) {
        const item=await page.locator(selector).evaluate(element=>({selector:'#'+element.id,font:parseFloat(getComputedStyle(element).fontSize),height:element.getBoundingClientRect().height}));
        results.typography.push(item);
        assert.ok(item.font>=16,`${selector} font ${item.font} must be >=16px`);
        assert.ok(item.height>=40,`${selector} height ${item.height} must support easy interaction`);
      }
      const coreCopy=await page.locator('.decision-intro,.decision-boundary p').evaluateAll(elements=>elements.map(element=>({selector:element.className||element.parentElement.className,font:parseFloat(getComputedStyle(element).fontSize)})));
      results.typography.push(...coreCopy);
      for(const item of coreCopy)assert.ok(item.font>=16,`${item.selector} body text is ${item.font}px`);
      assert.deepEqual(results.layoutFailures,[]);
      return {layouts:results.layouts.length,screenshots:results.screenshots.length};
    } finally { await context.close(); }
  });

  await check('research preferences are isolated from the simulation', async () => {
    const {context,page}=await newPage();
    try {
      const before=await page.evaluate(()=>JSON.stringify(FactorLabApp.getSave()));
      await go(page,'backtest');
      const inputs=page.locator('[data-research-factor]');
      assert.equal(await inputs.count(),4,'Four research factor controls are required');
      const previous=await page.locator('.backtest-results').innerText();
      for (let index=0;index<4;index++) await inputs.nth(index).press(index===0?'End':'Home');
      await page.locator('#run-backtest').click();
      await page.waitForTimeout(50);
      const next=await page.locator('.backtest-results').innerText();
      assert.notEqual(next,previous,'Factor changes must recompute backtest results');
      assert.equal(await page.evaluate(()=>document.activeElement.id),'run-backtest','Running backtest must preserve keyboard focus');
      assert.match(next,/IC|有效|valid/i);
      assert.match(await page.locator('body').innerText(),/36/);
      await page.locator('#research-weight-1').press('End');
      assert.match(await page.locator('#backtest-status').innerText(),/偏好|重新|调整|运行/);
      const computed=await page.evaluate(()=>JSON.stringify(FactorLabWorkspace.getResearch()));
      await language(page,'en');
      assert.match(await page.locator('#backtest-status').innerText(),/Preferences changed|update results/);
      assert.equal(await page.evaluate(()=>JSON.stringify(FactorLabWorkspace.getResearch())),computed,'Language change must not silently run pending backtest preferences');
      assert.equal(await page.evaluate(()=>JSON.stringify(FactorLabApp.getSave())),before,'Backtest must not advance time, consume simulation RNG or alter holdings');
      return {factors:4,frozenMonths:36,simulationUnchanged:true};
    } finally {await context.close();}
  });

  await check('six round flow, event pauses, reloads and replay', async () => {
    const {context,page}=await newPage();
    const rounds=[];
    try {
      for(let round=1;round<=6;round++) {
        await go(page,'portfolio');
        await page.locator('#reason').selectOption('evidence');
        await page.locator('#note').fill(`Review the revealed evidence before decision ${round}`);
        await page.locator('#confirm').click();
        const state=await advanceRound(page,round===1);
        assert.equal(state.round,round);
        assert.equal(state.day,round*20);
        assert.equal(state.results.length,round);
        const save=await page.evaluate(()=>JSON.stringify(FactorLabApp.getSave()));
        await page.reload({waitUntil:'networkidle'});
        await page.waitForFunction(()=>!!window.FactorLabApp&&!!window.FactorLabWorkspace);
        assert.equal(await page.evaluate(()=>JSON.stringify(FactorLabApp.getSave())),save);
        await go(page,'journal');
        if(round===1)await screenshot(page,'studio-review-zh-1440');
        if(round<6)await page.locator('#next-round').click();
        rounds.push({round,day:state.day,phase:state.phase,nav:state.nav});
      }
      assert.equal(await page.evaluate(()=>FactorLabApp.getState().phase),'complete');
      await screenshot(page,'studio-complete-zh-1440');
      assert.equal(await page.locator('#next-round').isVisible(),false);
      await page.locator('#replay').click();
      assert.equal(await page.locator('#new-dialog').isVisible(),true);
      await page.locator('#cancel-new').click();
      assert.equal(await page.evaluate(()=>FactorLabApp.getState().phase),'complete');
      await page.locator('#replay').click();
      await page.locator('#start-new').click();
      assert.equal(await page.evaluate(()=>FactorLabApp.getState().day),0);
      assert.equal(await page.evaluate(()=>FactorLabApp.getState().phase),'decision');
      return {rounds,reloadEachRound:true,replayCancelPreservesState:true};
    } finally {await context.close();}
  });

  await check('save migration, bilingual state and import export', async () => {
    const first=await newPage();
    let envelope;
    try {envelope=await first.page.evaluate(()=>FactorLabApp.getEnvelope());} finally {await first.context.close();}
    const legacy={...envelope,version:'factorlab-ui-v2'};
    const legacyRaw=JSON.stringify(legacy);
    const {context,page}=await newPage({},p=>p.addInitScript(({key,value})=>localStorage.setItem(key,value),{key:OLD_SAVE_KEY,value:legacyRaw}));
    try {
      assert.deepEqual(await page.evaluate(()=>FactorLabApp.getSave()),legacy.game);
      await go(page,'portfolio');
      await page.locator('[data-preset="defensive"]').click();
      await page.locator('#reason').selectOption('risk');
      await page.locator('#note').fill('Keep a buffer while the evidence is incomplete');
      await go(page,'journal');
      await page.locator('#reflection').fill('Watch conversion from orders into profit');
      const draft=await page.evaluate(()=>FactorLabApp.getEnvelope());
      await language(page,'en');
      assert.deepEqual(await page.evaluate(()=>FactorLabApp.getEnvelope()),draft);
      await page.reload({waitUntil:'networkidle'});
      await page.waitForFunction(()=>!!window.FactorLabApp&&!!window.FactorLabWorkspace);
      assert.deepEqual(await page.evaluate(()=>FactorLabApp.getEnvelope()),draft);
      assert.equal(await page.evaluate(key=>localStorage.getItem(key),OLD_SAVE_KEY),legacyRaw);
      assert.ok(await page.evaluate(key=>localStorage.getItem(key),SAVE_KEY));
      await go(page,'journal');
      const downloadPromise=page.waitForEvent('download');
      await page.locator('#export-save').click();
      const download=await downloadPromise;
      const savedFile=path.join(output,'studio-exported-save.json');
      await download.saveAs(savedFile);
      const exported=JSON.parse(fs.readFileSync(savedFile,'utf8'));
      assert.deepEqual(exported,draft);
      await go(page,'portfolio');
      await page.locator('[data-preset="growth"]').click();
      assert.notDeepEqual(await page.evaluate(()=>FactorLabApp.getEnvelope().draft),draft.draft);
      await page.locator('#settings').click();
      await page.locator('#import-save').setInputFiles({name:'saved.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(exported))});
      await page.waitForFunction(()=>!document.getElementById('settings-dialog').open);
      assert.deepEqual(await page.evaluate(()=>FactorLabApp.getEnvelope()),draft);
      const prior=await page.evaluate(()=>JSON.stringify(FactorLabApp.getEnvelope()));
      await page.locator('#settings').click();
      await page.locator('#import-save').setInputFiles({name:'broken.json',mimeType:'application/json',buffer:Buffer.from('{broken')});
      await page.waitForFunction(()=>/Import failed|无法导入/.test(document.getElementById('notice').textContent));
      assert.equal(await page.evaluate(()=>JSON.stringify(FactorLabApp.getEnvelope())),prior);
      assert.match(await page.locator('#notice').innerText(),/Import failed|无法导入/);
      return {legacyPreserved:true,draftReload:true,languagePreservesSimulation:true,exportImport:true,invalidImportPreservesState:true};
    }finally{await context.close();}
  });

  await check('corrupt and unavailable storage retain usable recovery paths', async () => {
    const bad=await newPage({},p=>p.addInitScript(key=>localStorage.setItem(key,'{broken-original'),SAVE_KEY));
    try {
      assert.match(await bad.page.locator('#notice').innerText(),/存档|save/i);
      await go(bad.page,'portfolio');
      await bad.page.locator('[data-preset]').first().click();
      assert.equal(await bad.page.evaluate(key=>localStorage.getItem(key),SAVE_KEY),'{broken-original');
    }finally{await bad.context.close();}
    const blocked=await newPage({},p=>p.addInitScript(()=>{Storage.prototype.getItem=function(){throw Error('blocked');};Storage.prototype.setItem=function(){throw Error('blocked');};}));
    try {
      assert.match(await blocked.page.locator('#notice').innerText(),/存储|storage/i);
      await go(blocked.page,'portfolio');
      await blocked.page.locator('#reason').selectOption('risk');
      await blocked.page.locator('#confirm').click();
      await advanceRound(blocked.page);
      assert.equal(await blocked.page.evaluate(()=>FactorLabApp.getState().day),20);
    }finally{await blocked.context.close();}
    return {corruptBytesPreserved:true,blockedStorageCompletesRound:true};
  });

  await check('AI fallback and drawer keyboard behavior', async () => {
    const {context,page}=await newPage();
    try {
      await page.locator('#open-coach').click();
      assert.equal(await page.locator('#coach-drawer').isVisible(),true);
      assert.ok(await page.evaluate(()=>document.getElementById('coach-drawer').contains(document.activeElement)),'Drawer must receive focus');
      for(let index=0;index<12;index++) {
        await page.keyboard.press('Tab');
        const focus=await page.evaluate(()=>({tag:document.activeElement.tagName,id:document.activeElement.id,inside:document.getElementById('coach-drawer').contains(document.activeElement),modal:document.getElementById('coach-drawer').matches(':modal')}));
        results.focusTrace.push({index,...focus});
        if(focus.tag==='BODY'&&focus.modal) {
          await page.keyboard.press('Tab');
          const returned=await page.evaluate(()=>({tag:document.activeElement.tagName,id:document.activeElement.id,inside:document.getElementById('coach-drawer').contains(document.activeElement)}));
          results.focusTrace.push({index,browserBoundaryReturn:true,...returned});
          assert.ok(returned.inside,'Tab from browser chrome must return inside the native modal: '+JSON.stringify(results.focusTrace));
        } else assert.ok(focus.inside,'Background controls must not receive modal focus: '+JSON.stringify(results.focusTrace));
      }
      const before=await page.evaluate(()=>JSON.stringify(FactorLabApp.getSave()));
      await page.locator('[data-question]').first().click();
      await page.locator('#messages .assistant').waitFor();
      assert.match(await page.locator('#messages').innerText(),/规则|合成|教学/);
      assert.equal(await page.evaluate(()=>JSON.stringify(FactorLabApp.getSave())),before,'AI cannot mutate holdings or simulation');
      await screenshot(page,'studio-ai-drawer-zh-1440');
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('#coach-drawer').isVisible(),false);
      assert.equal(await page.evaluate(()=>document.activeElement.id),'open-coach');
      await page.locator('#open-coach').click();
      await page.locator('#close-coach').click();
      assert.equal(await page.locator('#coach-drawer').isVisible(),false);
      return {offlineFallback:true,readOnly:true,focusTrap:true,escape:true,returnFocus:true};
    }finally{await context.close();}
  });

  await check('event continuation controls and dialog playback pause', async () => {
    const first=await newPage();
    try {
      await go(first.page,'portfolio');
      await first.page.locator('#reason').selectOption('evidence');
      await first.page.locator('#confirm').click();
      assert.equal(await first.page.evaluate(()=>FactorLabApp.getState().phase),'event');
      assert.equal(await first.page.evaluate(()=>FactorLabWorkspace.getView()),'research');
      await first.page.emulateMedia({reducedMotion:'no-preference'});
      await first.page.locator('#resume').click();
      await first.page.waitForFunction(()=>FactorLabWorkspace.getView()==='portfolio');
      await first.page.evaluate(()=>FactorLabWorkspace.settled);
      assert.equal(await first.page.locator('#pause-play').isVisible(),true,'Resuming an event must expose pause/forward controls');
      assert.equal(await first.page.locator('#fast-forward').isVisible(),true);
      await first.page.locator('#pause-play').click();
      const paused=await first.page.evaluate(()=>FactorLabApp.getState().day);
      assert.equal(await first.page.evaluate(()=>FactorLabApp.getUI().playing),false);
      await first.page.waitForTimeout(400);
      assert.equal(await first.page.evaluate(()=>FactorLabApp.getState().day),paused);
      await first.page.locator('#fast-forward').click();
      assert.equal(await first.page.evaluate(()=>FactorLabApp.getState().phase),'review');
    }finally{await first.context.close();}
    const pausedDialogs=[];
    for(const [trigger,dialog,close,view] of [['#settings','#settings-dialog','#close-settings','portfolio'],['#open-coach','#coach-drawer','#close-coach','portfolio'],['#open-context','#course-context','#close-context','portfolio'],['#model-info','#method-dialog','#close-method','risk']]) {
      const {context,page}=await newPage({reducedMotion:'no-preference'});
      try {
        await go(page,'portfolio');
        await page.locator('#reason').selectOption('anchor');
        await page.locator('#confirm').click();
        if(view!=='portfolio')await go(page,view);
        await page.locator(trigger).click();
        assert.equal(await page.locator(dialog).isVisible(),true);
        assert.equal(await page.evaluate(()=>FactorLabApp.getUI().playing),false,`${dialog} must pause playback`);
        const day=await page.evaluate(()=>FactorLabApp.getState().day);
        await page.waitForTimeout(450);
        assert.equal(await page.evaluate(()=>FactorLabApp.getState().day),day,`${dialog} must not advance the market while reading`);
        await page.locator(close).click();
        await page.waitForTimeout(220);
        assert.equal(await page.evaluate(()=>FactorLabApp.getState().day),day,`${dialog} closing must not restart playback`);
        pausedDialogs.push({dialog,day});
      }finally{await context.close();}
    }
    return {eventResumeRevealsControls:true,manualPauseWorks:true,pausedDialogs};
  });

  await check('normal motion and reduced motion', async () => {
    const {context,page}=await newPage({reducedMotion:'no-preference'},p=>p.addInitScript(()=>{
      window.__studioTransitions=0;
      if(document.startViewTransition){const start=document.startViewTransition.bind(document);document.startViewTransition=(...args)=>{window.__studioTransitions++;return start(...args);};}
    }));
    try {
      const target=page.locator('#settings');
      const before=await target.evaluate(element=>({transform:getComputedStyle(element).transform,scale:getComputedStyle(element).scale,transition:getComputedStyle(element).transitionDuration}));
      await target.hover();
      await page.waitForTimeout(220);
      const hovered=await target.evaluate(element=>({transform:getComputedStyle(element).transform,scale:getComputedStyle(element).scale,transition:getComputedStyle(element).transitionDuration}));
      const rect=await target.boundingBox();
      await page.mouse.move(rect.x+rect.width/2,rect.y+rect.height/2);
      await page.mouse.down();
      await page.waitForTimeout(160);
      const pressed=await target.evaluate(element=>({transform:getComputedStyle(element).transform,scale:getComputedStyle(element).scale}));
      await page.mouse.move(2,2);
      await page.mouse.up();
      assert.ok(before.transform!==hovered.transform||before.scale!==hovered.scale||hovered.transform!==pressed.transform||hovered.scale!==pressed.scale,'Buttons need visible scale/transform feedback');
      await go(page,'portfolio');
      await page.waitForTimeout(650);
      const transitions=await page.evaluate(()=>({nativeAvailable:typeof document.startViewTransition==='function',count:window.__studioTransitions,animations:document.getAnimations().length}));
      if(transitions.nativeAvailable)assert.ok(transitions.count>0,'View changes should use shared view transitions when supported');
      await page.emulateMedia({reducedMotion:'reduce'});
      const previousCount=await page.evaluate(()=>window.__studioTransitions);
      await go(page,'research');
      await page.waitForTimeout(100);
      const afterCount=await page.evaluate(()=>window.__studioTransitions);
      assert.equal(afterCount,previousCount,'Reduced motion should bypass morph transitions');
      assert.equal(await page.evaluate(()=>FactorLabWorkspace.getView()),'research');
      return {before,hovered,pressed,transitions,reducedMotionPreservesNavigation:true};
    }finally{await context.close();}
  });

  await check('page errors',async()=>{assert.deepEqual(results.pageErrors,[]);assert.deepEqual(results.resourceErrors,[]);return {count:0,missingAssets:0};});
  results.finishedAt=new Date().toISOString();
  results.status=results.checks.every(result=>result.status==='PASS')?'PASS':'FAIL';
  fs.writeFileSync(reportFile,JSON.stringify(results,null,2));
  console.log(`${results.status}: ${results.checks.filter(result=>result.status==='PASS').length}/${results.checks.length} groups`);
  if(results.status!=='PASS')process.exitCode=1;
})().catch(error=>{
  results.status='ERROR';results.fatal={message:error.message,stack:error.stack};results.finishedAt=new Date().toISOString();
  fs.writeFileSync(reportFile,JSON.stringify(results,null,2));console.error(error);process.exitCode=1;
}).finally(async()=>{
  if(browser)await browser.close();
  if(server.listening)await new Promise(resolve=>server.close(resolve));
});
