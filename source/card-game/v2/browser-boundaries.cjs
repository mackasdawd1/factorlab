const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const url=pathToFileURL(path.join(__dirname,'index.html')).href+'?seed=12',key='factorlab-duel-save-v1';
(async()=>{
 const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 const errors=[],out={};
 try{
  for(const method of ['keyboard','drag']){
   const ctx=await browser.newContext({reducedMotion:'reduce'}),p=await ctx.newPage();p.on('pageerror',e=>errors.push(e.message));
   await p.goto(url);await p.locator('[data-start="guardian"]').click();
   const move=await p.evaluate(()=>{const V=FACTORLAB_DUEL,D=FACTORLAB_CARD_DATA,s=V.restore(localStorage.getItem('factorlab-duel-save-v1'),D);for(const uid of s.hand){if(!['buy','sell'].includes(V.cards[V.identity(s,uid)].mode))continue;for(let target=0;target<5;target++)if(V.reduce(s,{type:'play',uid,target},D)!==s)return {uid,target};}});
   assert.ok(move);
   const card=p.locator(`[data-play="${move.uid}"]`),target=p.locator(`[data-target="${move.target}"]`);
   if(method==='keyboard'){await card.focus();await p.keyboard.press('Enter');await target.focus();await p.keyboard.press('Enter');}
   else await card.dragTo(target);
   assert.equal(await p.evaluate(()=>FACTORLAB_DUEL.restore(localStorage.getItem('factorlab-duel-save-v1'),FACTORLAB_CARD_DATA).played.length),1);
   await p.locator('[data-lock]').click();assert.equal(await p.locator('[data-next]').isEnabled(),true);assert.equal(await p.locator('.pending').count(),0);
   out[method]=true;out.reducedMotion=true;await ctx.close();
  }
  const ctx=await browser.newContext({reducedMotion:'no-preference'}),p=await ctx.newPage();p.on('pageerror',e=>errors.push(e.message));await p.goto(url);await p.locator('[data-start="guardian"]').click();
  const start=Date.now();await p.locator('[data-lock]').click();assert.equal(await p.locator('[data-next]').isEnabled(),false);
  await p.waitForFunction(()=>!document.querySelector('[data-next]').disabled,{},{timeout:10000});out.animationMs=Date.now()-start;assert.ok(out.animationMs<10000);
  await p.reload();assert.equal(await p.locator('[data-next]').isEnabled(),true);
  await p.evaluate(k=>localStorage.removeItem(k),key);await p.reload();await p.locator('[data-start="guardian"]').click();await p.locator('[data-lock]').click();await p.locator('[data-skip]').click();assert.equal(await p.locator('[data-next]').isEnabled(),true);assert.equal(await p.locator('.pending').count(),0);out.skip=true;await ctx.close();
  const bad=await browser.newContext(),q=await bad.newPage();q.on('pageerror',e=>errors.push(e.message));await q.goto(url);await q.evaluate(k=>localStorage.setItem(k,'{broken'),key);await q.reload();assert.equal(await q.locator('#storage-note').isVisible(),true);await q.locator('[data-start="guardian"]').click();await q.locator('[data-lock]').click();assert.equal(await q.evaluate(k=>localStorage.getItem(k),key),'{broken');out.corruptPreserved=true;await bad.close();
  assert.deepEqual(errors,[]);out.errors=errors;out.passed=true;fs.writeFileSync(path.join(__dirname,'evidence/browser-boundaries.json'),JSON.stringify(out,null,2));console.log(out);
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
