const fs=require('node:fs'),assert=require('node:assert/strict'),path=require('node:path'),{pathToFileURL}=require('node:url');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
assert.ok(fs.existsSync(path.join(__dirname,'index.html')),'V2 interface must exist');
(async()=>{const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});const errors=[];let campaigns=0;
try{
for(const key of ['guardian','navigator','challenger']){
 const ctx=await browser.newContext({viewport:{width:1366,height:900},reducedMotion:'reduce'}),page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.goto(pathToFileURL(path.join(__dirname,'index.html')).href+'?seed=12');
 await page.evaluate(()=>localStorage.setItem('factorlab-card-save-v1','preserve-classic'));
 if(key==='navigator')await page.locator('[value="realistic"]').check();
 await page.locator('[data-start="'+key+'"]').click();
 await page.screenshot({path:path.join(__dirname,'evidence/board.png'),fullPage:true});
 let guard=0;
 while(await page.locator('[data-phase="final"]').count()===0&&guard++<60){
  const phase=await page.locator('main').getAttribute('data-phase');
  if(phase==='plan'){
   await page.reload();
   assert.ok(await page.locator('#duel-hud').isVisible());
   const possible=page.locator('[data-play]:not([disabled])');
   if(await possible.count()){
    await possible.first().click();
    const targets=page.locator('[data-target]:not([disabled])');if(await page.locator('[data-cancel]').count()){
     await targets.nth(4).click();if(await page.locator('[data-cancel]').count())await targets.nth(0).click();
    }
    if(await page.locator('[data-direction="up"]').count())await page.locator('[data-direction="up"]').click();
   }
   await page.locator('[data-lock]').click();
  }else if(phase==='result'){
   await page.locator('[data-skip]').click();await page.screenshot({path:path.join(__dirname,'evidence/result.png'),fullPage:true});
   await page.reload();assert.equal(await page.locator('[data-next]').isEnabled(),true);await page.locator('[data-next]').click();
  }else if(phase==='shop'){
   await page.reload();await page.screenshot({path:path.join(__dirname,'evidence/shop.png'),fullPage:true});
   const buy=page.locator('[data-buy]:not([disabled])');if(await buy.count())await buy.first().click();
   await page.locator('[data-leave]').click();
  }else if(phase==='draft'){await page.reload();await page.locator('[data-pick="0"]').click();}
  else if(phase==='search')await page.locator('[data-search="skip"]').click();
 }
 assert.ok(guard<60);await page.reload();assert.equal(await page.locator('main').getAttribute('data-phase'),'final');
 assert.equal(await page.evaluate(()=>localStorage.getItem('factorlab-card-save-v1')),'preserve-classic');
 await page.screenshot({path:path.join(__dirname,'evidence/final.png'),fullPage:true});campaigns++;
 await page.locator('[data-replay]').click();await page.locator('[data-start="guardian"]').click();
 for(const width of [1366,1024,768,390,360]){await page.setViewportSize({width,height:900});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'overflow '+width);if(width===390)await page.screenshot({path:path.join(__dirname,'evidence/mobile.png'),fullPage:true});}
 await ctx.close();
}
const ctx=await browser.newContext({reducedMotion:'reduce'});await ctx.addInitScript(()=>Object.defineProperty(window,'localStorage',{get(){throw Error('disabled');}}));
const p=await ctx.newPage();p.on('pageerror',e=>errors.push(e.message));await p.goto(pathToFileURL(path.join(__dirname,'index.html')).href);await p.locator('[data-start="guardian"]').click();await p.locator('[data-lock]').click();await p.locator('[data-next]').click();assert.equal(await p.locator('main').getAttribute('data-phase'),'shop');await ctx.close();
assert.deepEqual(errors,[]);const out={passed:true,campaigns,widths:[1366,1024,768,390,360],refreshPhases:true,blockedStorage:true,legacyPreserved:true,errors};fs.writeFileSync(path.join(__dirname,'evidence/browser.json'),JSON.stringify(out,null,2));console.log(out);
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
