const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'../..');
const evidence=path.join(root,process.env.FACTORLAB_TEST_OUTPUT||'.local/self-service-20261021/cloud-regression');
fs.mkdirSync(path.join(evidence,'browser-tmp'),{recursive:true});
process.env.TEMP=process.env.TMP=process.env.TMPDIR=path.join(evidence,'browser-tmp');
process.env.PLAYWRIGHT_BROWSERS_PATH=path.join(root,'.local/redesign-20261013/runtime/browsers');
const {chromium}=require(path.join(root,'.local/redesign-20261013/runtime/web/node_modules/playwright'));
const build=require('../v3/build-pages.cjs').build({cloud:true,staging:path.join(evidence,'release')});
const origin='http://127.0.0.1:8897';
let browser;
test.before(async()=>{browser=await chromium.launch({headless:true});});
test.after(async()=>{await browser?.close();});
async function fixture(t,width=1440){
  const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'});
  const state={rows:[],calls:[],errors:[],quota:false};
  const user={id:'10000000-0000-4000-8000-000000000001',email:'learner@example.com',aud:'authenticated',role:'authenticated',email_confirmed_at:'2026-10-21T00:00:00Z',app_metadata:{provider:'email'},user_metadata:{},created_at:'2026-10-21T00:00:00Z'};
  const token=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url')+'.'+Buffer.from(JSON.stringify({sub:user.id,exp:Math.floor(Date.now()/1000)+3600,role:'authenticated'})).toString('base64url')+'.fixture';
  await context.route(origin+'/**',async route=>{
    const rel=decodeURIComponent(new URL(route.request().url()).pathname).replace(/^\/research-studio\//,'');
    const file=path.resolve(build.output,rel||'index.html');
    if(!file.startsWith(build.output+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile())return route.fulfill({status:404,body:''});
    const types={'.js':'application/javascript','.css':'text/css','.html':'text/html','.json':'application/json','.svg':'image/svg+xml','.mp4':'video/mp4','.png':'image/png','.webp':'image/webp'};
    return route.fulfill({body:fs.readFileSync(file),contentType:types[path.extname(file)]||'application/octet-stream'});
  });
  await context.route('https://uhmsxllsgwdjcnssbyxc.supabase.co/**',async route=>{
    const req=route.request(),url=new URL(req.url()),method=req.method(),body=req.postData()?req.postDataJSON():null;
    state.calls.push({path:url.pathname,method,body,params:Object.fromEntries(url.searchParams),authorization:req.headers().authorization});
    if(url.pathname==='/auth/v1/token'){
      if(body.password==='wrong')return route.fulfill({status:400,json:{code:'invalid_credentials',msg:'Invalid login credentials'}});
      return route.fulfill({json:{access_token:token,token_type:'bearer',expires_in:3600,refresh_token:'fixture-refresh',user}});
    }
    if(url.pathname==='/auth/v1/user')return route.fulfill({json:user});
    if(url.pathname==='/auth/v1/logout')return route.fulfill({status:204,body:''});
    if(url.pathname==='/rest/v1/factorlab_saves'){
      assert.equal(req.headers().authorization,'Bearer '+token);
      if(method==='POST'){
        assert.deepEqual(Object.keys(body).sort(),['envelope','name','slot']);
        const row={...body,id:'20000000-0000-4000-8000-000000000001',user_id:user.id,revision:1,updated_at:new Date().toISOString()};state.rows.push(row);return route.fulfill({status:201,json:[row]});
      }
      assert.equal(url.searchParams.get('user_id'),'eq.'+user.id);
      let rows=state.rows.filter(row=>!url.searchParams.has('id')||url.searchParams.get('id')==='eq.'+row.id);
      if(method==='PATCH'){
        rows=rows.filter(row=>url.searchParams.get('revision')==='eq.'+row.revision);
        rows.forEach(row=>Object.assign(row,body,{revision:row.revision+1}));
      }
      return route.fulfill({json:rows});
    }
    if(url.pathname==='/functions/v1/swift-service'){
      assert.equal(req.headers().authorization,'Bearer '+token);
      return route.fulfill(state.quota?{status:429,json:{error:'quota_exceeded'}}:{json:{mode:'live',model:'fixture-model',summary:'你好，我们可以从你的研究问题开始。',detail:'这是模拟接口响应，用于验证对话呈现。',references:[]}});
    }
    throw Error('Unexpected mocked endpoint '+url.pathname);
  });
  const page=await context.newPage();page.setDefaultTimeout(6000);page.on('pageerror',e=>state.errors.push(e.message));
  t.after(async()=>{await context.close();assert.deepEqual(state.errors,[]);});
  await page.goto(origin+'/research-studio/index.html?welcome=1#/research');
  await page.waitForFunction(()=>window.FactorLabAccounts?.ready);
  return {page,context,state};
}
async function login(page,password='fixture-password'){
  await page.locator('#account-username').fill('learner@example.com');
  await page.locator('#account-password').fill(password);
  await page.locator('#account-submit').click();
}
test('real SDK: email login, visibility, cloud save reload, optimistic conflict, logout and AI rendering',async t=>{
  const {page,context,state}=await fixture(t);
  assert.equal(await page.locator('#account-dialog [data-account-action="register-tab"]').count(),1);
  assert.equal(await page.locator('#account-dialog [data-account-action="forgot-password"]').count(),1);
  await login(page,'wrong');
  await page.waitForFunction(()=>document.querySelector('#account-message').textContent.includes('邮箱或密码'));
  await page.locator('#account-password').fill('fixture-password');
  await page.locator('[aria-controls="account-password"]').click();
  assert.equal(await page.locator('#account-password').getAttribute('type'),'text');
  await page.locator('#account-submit').click();
  await page.waitForFunction(()=>FactorLabAccounts.getStatus().signedIn&&!document.querySelector('#account-dialog').open);
  assert.equal(await page.evaluate(()=>FactorLabWorkspace.getView()),'research');
  await page.evaluate(()=>FactorLabAccounts.open());
  await page.locator('#account-save-name').fill('云存档界面测试');
  await page.locator('#account-create-save').click();
  await page.waitForFunction(()=>document.querySelectorAll('#account-slot-list article').length===1);
  assert.equal(state.rows.length,1);
  state.rows[0].revision=2;
  await page.locator('[data-account-action="overwrite"]').click();
  await page.locator('#account-confirm-action').click();
  await page.waitForFunction(()=>document.querySelector('#account-message').textContent.includes('别处更新'));
  assert.equal(state.rows[0].revision,2);
  await page.reload();
  await page.waitForFunction(()=>window.FactorLabAccounts?.getStatus().signedIn);
  await page.evaluate(()=>FactorLabAccounts.open());
  await page.locator('[data-account-action="load"]').click();
  await page.locator('#account-confirm-action').click();
  await page.waitForFunction(()=>document.querySelector('#account-message').textContent.includes('已载入'));
  await page.locator('#close-accounts').click();
  await page.evaluate(()=>{document.querySelector('#question').value='你好';document.querySelector('#coach-form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));});
  await page.waitForFunction(()=>document.querySelector('#coach-mode').textContent.includes('fixture-model'));
  assert.ok(state.calls.some(c=>c.path.endsWith('/swift-service')&&c.body.question==='你好'));
  state.quota=true;
  await page.evaluate(()=>{document.querySelector('#question').value='继续聊聊';document.querySelector('#coach-form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));});
  await page.waitForFunction(()=>document.querySelector('#coach-mode').textContent.includes('额度'));
  const second=await context.newPage();
  await second.goto(origin+'/research-studio/index.html#/research');
  await second.waitForFunction(()=>window.FactorLabAccounts?.getStatus().signedIn);
  await page.evaluate(()=>FactorLabAccounts.open());
  await page.locator('[data-account-action="logout"]').click();
  await page.waitForFunction(()=>!FactorLabAccounts.getStatus().signedIn);
  await second.waitForFunction(()=>!FactorLabAccounts.getStatus().signedIn&&FactorLabApp.getUI().profileId===null);
  assert.equal(await page.evaluate(()=>localStorage.getItem('factorlab-supabase-session-v1')),null);
});
test('mobile login remains within viewport and opens workspace',async t=>{
  const {page}=await fixture(t,390);
  await page.screenshot({path:path.join(evidence,'cloud-login-mobile.png')});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await login(page);
  await page.waitForFunction(()=>FactorLabAccounts.getStatus().signedIn&&!document.querySelector('#account-dialog').open);
  await page.screenshot({path:path.join(evidence,'cloud-workspace-mobile.png')});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
});
