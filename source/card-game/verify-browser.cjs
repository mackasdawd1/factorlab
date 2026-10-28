const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
assert.ok(fs.existsSync(path.join(__dirname,'index.html')), 'Playable card board must exist');
const base = process.env.CARD_URL || pathToFileURL(path.join(__dirname,'index.html')).href;
const dir=path.join(__dirname,'evidence');fs.mkdirSync(dir,{recursive:true});
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 const errors=[];let runs=0,realisticRuns=0;
 try{
  const context=await browser.newContext({viewport:{width:1440,height:1050},reducedMotion:'reduce'});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'?seed=7');
  await page.evaluate(()=>{localStorage.setItem('factorlab-campaign-save-v2','legacy-v2-preserve');localStorage.setItem('factorlab-campaign-save-v1','legacy-v1-preserve');});
  await page.getByRole('button',{name:'选择平衡型'}).click();
  assert.equal(await page.locator('.cycle-chip').count(),5);
  await page.locator('[data-card="scout"]').click();
  await page.locator('[data-card="buy"]').click();await page.locator('[data-target="4"]').click();
  assert.match(await page.locator('#combo').innerText(),/研究/);
  await page.getByRole('button',{name:'撤回调仓'}).click();
  assert.match(await page.locator('#energy').innerText(),/2\s*\/\s*3/);
  await page.locator('[data-card="rotate"]').click();await page.locator('[data-target="0"]').click();await page.locator('[data-target="3"]').click();
  await page.locator('[data-reason="buffer"]').click();
  await page.reload();assert.match(await page.locator('#energy').innerText(),/0\s*\/\s*3/);
  assert.equal(await page.locator('[data-reason="buffer"]').getAttribute('aria-pressed'),'true');
  await page.screenshot({path:path.join(dir,'board-desktop.png'),fullPage:true});
  for(let r=1;r<=6;r++){
   if(r>1){
    await page.locator('[data-card="buy"]').click();await page.locator('[data-target="'+(r%5)+'"]').click();
    if(r<=3)await page.locator('[data-card="scout"]').click();
   }
   await page.getByRole('button',{name:'锁定组合'}).click();
   await page.locator('#resolution').waitFor({state:'visible'});
   assert.equal(await page.locator('#resolution').getAttribute('data-round'),String(r));
   if(r===2){await page.screenshot({path:path.join(dir,'resolution.png'),fullPage:true});await page.reload();await page.locator('#resolution').waitFor();}
   await page.getByRole('button',{name:r===6?'查看本局复盘':'继续旅程'}).click();
   if(r===2||r===4){
    await page.locator('#upgrade-screen').waitFor();
    if(r===2){await page.reload();await page.screenshot({path:path.join(dir,'upgrade.png'),fullPage:true});}
    await page.locator('[data-upgrade="'+(r===2?'energy':'precision')+'"]').click();
   }
  }
  await page.locator('#final-screen').waitFor();await page.reload();await page.locator('#final-screen').waitFor();
  await page.screenshot({path:path.join(dir,'final.png'),fullPage:true});
  assert.equal(await page.evaluate(()=>localStorage.getItem('factorlab-campaign-save-v2')),'legacy-v2-preserve');
  assert.equal(await page.evaluate(()=>localStorage.getItem('factorlab-campaign-save-v1')),'legacy-v1-preserve');runs++;
  await page.getByRole('button',{name:'再开一局'}).click();await page.getByRole('button',{name:'选择稳健型'}).waitFor();
  await context.close();
  for(const seed of [0,1,2]){
   const ctx=await browser.newContext({viewport:{width:1280,height:800},reducedMotion:'reduce'}),p=await ctx.newPage();
   p.on('pageerror',e=>errors.push(e.message));await p.goto(base+'?seed='+seed);await p.getByRole('button',{name:'选择进取型'}).click();
   const special=['focus','spread','reserve'][seed];
   await p.locator('[data-card="'+special+'"]').click();if(special==='focus')await p.locator('[data-target="4"]').click();
   for(let r=1;r<=6;r++){
    await p.getByRole('button',{name:'锁定组合'}).click();await p.getByRole('button',{name:r===6?'查看本局复盘':'继续旅程'}).click();
    if(r===2||r===4)await p.locator('[data-upgrade="'+(r===2?'lens':'energy')+'"]').click();
    if(r===2){await p.locator('[data-card="scout"]').click();assert.match(await p.locator('#energy').innerText(),/3\s*\/\s*3/);}
   }
   await p.locator('#final-screen').waitFor();runs++;await ctx.close();
  }
  const ctx=await browser.newContext({viewport:{width:1440,height:900}}),p=await ctx.newPage();p.on('pageerror',e=>errors.push(e.message));
  await p.goto(base+'?seed=1');await p.getByRole('button',{name:'选择平衡型'}).click();
  await p.locator('[data-card="buy"]').dragTo(p.locator('[data-target="4"]'));
  assert.match(await p.locator('#energy').innerText(),/2\s*\/\s*3/);
  await p.locator('[data-card="sell"]').focus();await p.keyboard.press('Enter');await p.locator('[data-target="0"]').focus();await p.keyboard.press('Enter');
  assert.match(await p.locator('#energy').innerText(),/1\s*\/\s*3/);
  for(const width of [1440,1024,768,390,360]){
   await p.setViewportSize({width,height:900});
   assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'overflow '+width);
   if(width===390)await p.screenshot({path:path.join(dir,'board-mobile.png'),fullPage:true});
  }
  await p.getByRole('button',{name:'锁定组合'}).click();await p.locator('#resolution').waitFor();await ctx.close();
  // D16 R1-R3: realistic mode smoke — costs, cap disclosure, anchor and cycle UI
  const rctx=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce'}),rp=await rctx.newPage();
  rp.on('pageerror',e=>errors.push(e.message));
  await rp.goto(base+'?seed=3');
  await rp.getByRole('button',{name:/现实约束/}).click();
  assert.equal(await rp.locator('[data-mode="realistic"]').getAttribute('aria-pressed'),'true');
  await rp.getByRole('button',{name:'选择稳健型'}).click();
  assert.equal(await rp.locator('.cycle-chip').count(),5);
  await rp.locator('[data-card="buy"]').click();await rp.locator('[data-target="4"]').click();
  await rp.getByRole('button',{name:'锁定组合'}).click();
  await rp.locator('#resolution').waitFor();
  assert.match(await rp.locator('.costs-line').innerText(),/已扣交易成本/);
  assert.match(await rp.locator('.anchor-line').innerText(),/长期锚/);
  await rp.getByRole('button',{name:'继续旅程'}).click();
  for(let r=2;r<=6;r++){
    await rp.getByRole('button',{name:'锁定组合'}).click();
    await rp.locator('#resolution').waitFor();
    await rp.getByRole('button',{name:r===6?'查看本局复盘':'继续旅程'}).click();
    if(r===2||r===4)await rp.locator('[data-upgrade="'+(r===2?'energy':'lens')+'"]').click();
  }
  await rp.locator('#final-screen').waitFor();
  const finalText=await rp.locator('#final-screen').innerText();
  assert.match(finalText,/交易成本合计/);
  assert.match(finalText,/长期锚/);
  assert.match(finalText,/战术偏移贡献/);
  await rp.screenshot({path:path.join(dir,'final-realistic.png'),fullPage:true});
  await rctx.close();runs++;realisticRuns++;
  for(const mode of ['corrupt','blocked']){
   const ctx=await browser.newContext({reducedMotion:'reduce'});
   await ctx.addInitScript(mode=>{
    if(mode==='blocked')Object.defineProperty(window,'localStorage',{get(){throw Error('blocked');}});
    else if(!sessionStorage.getItem('fixture')){localStorage.setItem('factorlab-card-save-v1','broken-save');sessionStorage.setItem('fixture','1');}
   },mode);
   const p=await ctx.newPage();p.on('pageerror',e=>errors.push(e.message));await p.goto(base);await p.getByRole('button',{name:'选择稳健型'}).click();
   assert.equal(await p.locator('#storage-notice').isVisible(),true);
   for(let r=1;r<=6;r++){await p.getByRole('button',{name:'锁定组合'}).click();await p.getByRole('button',{name:r===6?'查看本局复盘':'继续旅程'}).click();if(r===2||r===4)await p.locator('[data-upgrade="'+(r===2?'energy':'lens')+'"]').click();}
   await p.locator('#final-screen').waitFor();if(mode==='corrupt')assert.equal(await p.evaluate(()=>localStorage.getItem('factorlab-card-save-v1')),'broken-save');runs++;await ctx.close();
  }
  assert.deepEqual(errors,[]);const report={passed:true,campaigns:runs,realisticCampaigns:realisticRuns,widths:[1440,1024,768,390,360],drag:true,keyboard:true,saveRefresh:true,legacyPreserved:true,corruptAndBlockedStorage:true,cycleChips:true,anchorAndCostsUi:true,errors};
  fs.writeFileSync(path.join(dir,'browser.json'),JSON.stringify(report,null,2));console.log(report);
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
