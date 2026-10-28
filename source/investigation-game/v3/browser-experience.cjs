const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root=path.resolve(__dirname,'../..'), local=path.join(root,'.local/mascot-20261019');
const output=path.join(__dirname,'evidence/mascot-20261019');
fs.mkdirSync(output,{recursive:true});fs.mkdirSync(path.join(local,'browser'),{recursive:true});
process.env.TEMP=process.env.TMP=process.env.TMPDIR=path.join(local,'browser');
process.env.PLAYWRIGHT_BROWSERS_PATH=path.join(root,'.local/redesign-20261013/runtime/browsers');
const {chromium}=require(path.join(root,'.local/redesign-20261013/runtime/web/node_modules/playwright'));
const {createServer}=require('../server.cjs');
const results={checks:[],errors:[],media:[],screenshots:[],humanTesting:'NOT RUN',startedAt:new Date().toISOString()};
const server=createServer({env:{},accounts:{dbPath:path.join(root,'.local/reuse-20261016','mascot-qa-'+Date.now()+'.sqlite')}});
let browser,context,page,origin;
async function check(name,fn){try{await fn();results.checks.push({name,status:'PASS'});console.log('PASS '+name);}catch(e){results.checks.push({name,status:'FAIL',error:e.message});console.error('FAIL '+name+': '+e.message);}}
async function shot(name){const file=path.join(output,name+'.png');await page.screenshot({path:file});results.screenshots.push(file);}
const state=host=>page.locator(host).getAttribute('data-state');
async function until(fn,arg,timeout=8000){await page.waitForFunction(fn,arg,{timeout});}
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin='http://127.0.0.1:'+server.address().port;
  browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  context=await browser.newContext({viewport:{width:1440,height:1000},recordVideo:{dir:output,size:{width:1440,height:1000}}});
  page=await context.newPage();page.setDefaultTimeout(7000);
  page.on('pageerror',e=>results.errors.push(e.message));
  await page.goto(origin+'/v3/?welcome=1');
  await page.waitForSelector('#account-dialog[open]');
  await check('Login focus, IME and reveal preserve a static mascot',async()=>{
    assert.equal(await state('#login-mascot'),'static');
    await page.locator('#account-username').fill('motion_student');
    await page.locator('#account-password').fill('OnlyForLocalTest42');
    await page.locator('#account-password').dispatchEvent('compositionstart');
    await page.locator('#account-password').dispatchEvent('input');
    assert.equal(await page.locator('#login-mascot').getAttribute('data-editing'),'true');
    assert.equal(await page.locator('#login-mascot video').evaluate(v=>v.paused&&v.hidden),true);
    await page.locator('#account-password').dispatchEvent('compositionend');
    await page.locator('[aria-controls="account-password"]').click();
    assert.equal(await page.locator('#account-password').getAttribute('type'),'text');
    await page.locator('[aria-controls="account-password"]').click();
    await page.locator('#account-password').focus();await shot('login-desktop');
  });
  await check('User-triggered welcome decodes and does not restart on repeated clicks',async()=>{
    await page.locator('#login-mascot button').click();
    await until(()=>{const v=document.querySelector('#login-mascot video');return !v.paused&&v.currentTime>.05;});
    const first=await page.locator('#login-mascot video').evaluate(v=>v.currentTime);
    await page.locator('#login-mascot button').click();
    const next=await page.locator('#login-mascot video').evaluate(v=>v.currentTime);
    assert.ok(next>=first);await shot('login-welcome');
    await until(()=>document.querySelector('#login-mascot').dataset.state==='static');
  });
  await check('Blur restarts the entire idle delay and suppresses any backlog',async()=>{
    await page.locator('#account-username').focus();
    await page.waitForTimeout(150);
    await page.locator('#account-title').click();
    await page.waitForTimeout(700);
    assert.equal(await state('#login-mascot'),'static');
    await until(()=>document.querySelector('#login-mascot').dataset.state==='idle',null,21000);
    await page.locator('#account-password').focus();assert.equal(await state('#login-mascot'),'static');
    assert.equal(await page.locator('#login-mascot video').evaluate(v=>v.paused),true);
  });
  await check('Authentication success enters the real workspace without waiting for animation',async()=>{
    await page.locator('#account-dialog [data-account-action="register-tab"]').click();
    await page.locator('#account-username').fill('motion_student');
    await page.locator('#account-password').fill('OnlyForLocalTest42');
    await page.locator('#account-password-confirm').fill('OnlyForLocalTest42');
    await page.locator('#account-submit').click();
    await page.waitForSelector('#account-dialog',{state:'hidden'});
    assert.equal(await page.evaluate(()=>FactorLabAccounts.getStatus().signedIn),true);
    assert.equal(await page.evaluate(()=>FactorLabWorkspace.getView()),'research');
    await page.waitForTimeout(400);await shot('research-desktop');
  });
  await check('All six derived MP4s decode with audio removed and bounded durations',async()=>{
    for(const name of ['idle','welcome','thinking','success','growth','milestone']){
      const data=await page.evaluate(async name=>{
        const v=document.createElement('video');v.muted=true;v.playsInline=true;v.src='assets/mascot/'+name+'.mp4';
        document.body.append(v);
        try { await v.play();await new Promise((resolve,reject)=>{if(v.currentTime>.04)return resolve();const timeout=setTimeout(()=>reject(Error('decode timeout')),4000);v.ontimeupdate=()=>{if(v.currentTime>.04){clearTimeout(timeout);resolve();}};});return {name,duration:v.duration,width:v.videoWidth,height:v.videoHeight,time:v.currentTime,audioTracks:v.audioTracks?.length??null}; }
        finally{v.pause();v.remove();}
      },name);
      assert.ok(data.duration>.5&&data.duration<3.1,JSON.stringify(data));assert.ok(data.width>0);results.media.push(data);
    }
  });
  await check('Confirmed SQLite save has visible success; failed save never celebrates',async()=>{
    await page.locator('#open-accounts').click();await page.locator('#account-save-name').fill('Motion validation');
    await page.locator('#account-create-save').click();
    await until(()=>document.querySelector('#library-mascot')?.dataset.state==='success');
    await until(()=>document.querySelector('#library-mascot video').currentTime>.04);
    assert.match(await page.locator('#account-slot-list').innerText(),/Motion validation/);
    await until(()=>document.querySelector('#library-mascot').dataset.state==='static');
    await page.route('**/api/saves',route=>route.request().method()==='POST'?route.fulfill({status:503,json:{error:'test_unavailable'}}):route.continue());
    await page.locator('#account-save-name').fill('Must not succeed');await page.locator('#account-create-save').click();
    await until(()=>!FactorLabAccounts.getStatus().busy);
    assert.equal(await state('#library-mascot'),'static');
    await page.unroute('**/api/saves');await page.locator('#close-accounts').click();
  });
  await check('AI pending follows request lifetime and language changes keep the request',async()=>{
    let release;const hold=new Promise(resolve=>release=resolve);
    await page.route('**/api/coach-v2',async route=>{await hold;await route.fulfill({json:{mode:'example',summary:'可核对的测试回复',detail:'隔离测试传输',references:[]}});});
    await page.locator('#open-coach').click();await page.locator('#question').fill('测试当前证据');await page.locator('#ask').click();
    await until(()=>FactorExperience.getState().coach.busyRequestId!==null);
    const before=await page.evaluate(()=>FactorExperience.getState().coach.busyRequestId);
    await page.evaluate(()=>{document.querySelector('#language').value='en';document.querySelector('#language').dispatchEvent(new Event('change'));});
    assert.equal(await page.evaluate(()=>FactorExperience.getState().coach.busyRequestId),before);
    assert.equal(await page.evaluate(()=>FactorLabApp.getUI().busy),true);
    release();await until(()=>!FactorLabApp.getUI().busy);
    assert.equal(await page.evaluate(()=>FactorExperience.getState().coach.busyRequestId),null);
    await page.waitForTimeout(300);await shot('coach-ready');
    await page.unroute('**/api/coach-v2');await page.locator('#close-coach').click();
  });
  await check('Jev failure uses caution, preserves the reason and stops thinking',async()=>{
    await page.locator('[data-view="portfolio"]').click();await page.locator('#note').fill('观察订单与库存，再核对长期判断。');
    await page.route('**/api/quick-check',route=>route.fulfill({status:503,json:{error:'test_unavailable'}}));
    await page.locator('#run-quick-check').click();await until(()=>!document.querySelector('#run-quick-check').disabled);
    assert.equal(await page.evaluate(()=>FactorExperience.getState().requests.length),0);
    assert.match(await page.locator('#quick-check-result').innerText(),/Rules only/);
    assert.equal(await page.locator('#note').inputValue(),'观察订单与库存，再核对长期判断。');
    await page.unroute('**/api/quick-check');
  });
  await check('Actual backtest uses an independent Lottie badge and preserves portfolio state',async()=>{
    const before=await page.evaluate(()=>JSON.stringify(FactorLabApp.getSave()));
    await page.locator('[data-view="backtest"]').click();await page.locator('#run-backtest').click();
    await page.waitForSelector('.research-badge svg');
    assert.equal(await page.evaluate(()=>JSON.stringify(FactorLabApp.getSave())),before);
    await shot('backtest-desktop');
  });
  await check('Manual motion off and reduced motion retain static and textual feedback',async()=>{
    await page.locator('#settings').click();await page.locator('#character-motion').uncheck();await page.locator('#close-settings').click();
    await page.locator('#workspace-mascot button').click();assert.equal(await state('#workspace-mascot'),'static');
    await page.locator('#settings').click();await page.locator('#character-motion').check();await page.locator('#close-settings').click();
    await page.emulateMedia({reducedMotion:'reduce'});await page.locator('#workspace-mascot button').click();assert.equal(await state('#workspace-mascot'),'static');
    await page.emulateMedia({reducedMotion:'no-preference'});
  });
  await check('Real allocation settles once and rerender does not replay celebration',async()=>{
    await page.locator('[data-view="portfolio"]').click();
    await page.locator('[data-preset="balanced"]').click();await page.locator('#reason').selectOption('evidence');
    await page.locator('#confirm').click();
    for(let i=0;i<30;i++){
      const phase=await page.evaluate(()=>FactorLabApp.getState().phase);if(['review','complete'].includes(phase))break;
      if(phase==='event')await page.locator('#resume').click();else await page.locator('#fast-forward').click();
      await page.waitForTimeout(120);
    }
    assert.equal(await page.evaluate(()=>FactorLabApp.getState().results.length),1);
    await page.waitForTimeout(350);await shot('settlement-desktop');
    const before=await page.evaluate(()=>FactorExperience.getState().workspace.token);
    await page.evaluate(()=>document.dispatchEvent(new Event('factorlab:render')));
    assert.equal(await page.evaluate(()=>FactorExperience.getState().workspace.token),before);
  });
  await check('Blocked autoplay remains static and the application stays usable',async()=>{
    const fresh=await context.newPage();await fresh.addInitScript(()=>{HTMLMediaElement.prototype.play=function(){return Promise.reject(new DOMException('Test blocked autoplay','NotAllowedError'));};});
    await fresh.goto(origin+'/v3/');await fresh.waitForFunction(()=>Boolean(window.FactorExperience));
    await fresh.locator('#workspace-mascot button').click();
    await fresh.waitForFunction(()=>FactorExperience.getState().workspace.failed);
    assert.equal(await fresh.locator('#workspace-mascot video').evaluate(v=>v.paused&&v.hidden),true);
    await fresh.locator('[data-view="portfolio"]').click();await fresh.waitForFunction(()=>FactorLabWorkspace.getView()==='portfolio');await fresh.close();
  });
  await check('Browser storage failure cannot announce progress saved',async()=>{
    const fresh=await context.newPage();await fresh.addInitScript(()=>{Storage.prototype.setItem=function(){throw new DOMException('Test quota','QuotaExceededError');};});
    await fresh.goto(origin+'/v3/');await fresh.waitForFunction(()=>Boolean(window.FactorLabApp));
    await fresh.locator('#settings').click();await fresh.locator('#save-now').click();await fresh.locator('#close-settings').click();
    assert.equal(await fresh.locator('#companion-feedback').getAttribute('data-message'),'caution');
    assert.equal(await fresh.evaluate(()=>FactorLabApp.getUI().writable),false);await fresh.close();
  });
})().catch(error=>{results.errors.push(error.stack);process.exitCode=1;}).finally(async()=>{
  const video=page?.video();await context?.close();if(video)await video.saveAs(path.join(output,'interaction-demo.webm'));await browser?.close();await new Promise(resolve=>server.close(resolve));
  results.finishedAt=new Date().toISOString();fs.writeFileSync(path.join(output,'browser-experience.json'),JSON.stringify(results,null,2));
  if(results.errors.length||results.checks.some(c=>c.status==='FAIL'))process.exitCode=1;
  console.log(JSON.stringify({checks:results.checks.length,failed:results.checks.filter(c=>c.status==='FAIL').length,errors:results.errors.length}));
});
