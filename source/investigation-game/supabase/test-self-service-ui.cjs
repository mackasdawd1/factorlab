const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'../..');
const evidence=path.join(root,'.local/self-service-20261021');
fs.mkdirSync(path.join(evidence,'browser-tmp'),{recursive:true});
process.env.TEMP=process.env.TMP=process.env.TMPDIR=path.join(evidence,'browser-tmp');
process.env.PLAYWRIGHT_BROWSERS_PATH=path.join(root,'.local/redesign-20261013/runtime/browsers');
const {chromium}=require(path.join(root,'.local/redesign-20261013/runtime/web/node_modules/playwright'));
const build=require('../v3/build-pages.cjs').build({cloud:true,staging:path.join(evidence,'ui-fixture')});
const origin='http://127.0.0.1:8898',email='learner@example.com',password='new-fixture-password';
let browser;
test.before(async()=>{browser=await chromium.launch({headless:true});});
test.after(async()=>{await browser?.close();});
async function fixture(t,width=1440){
  const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'});
  const state={calls:[],errors:[],weak:false,unconfirmed:false};
  const user={id:'10000000-0000-4000-8000-000000000001',email,aud:'authenticated',role:'authenticated',email_confirmed_at:'2026-10-21T00:00:00Z',app_metadata:{provider:'email'},user_metadata:{},created_at:'2026-10-21T00:00:00Z'};
  const token=Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url')+'.'+Buffer.from(JSON.stringify({sub:user.id,exp:Math.floor(Date.now()/1000)+3600,role:'authenticated'})).toString('base64url')+'.fixture';
  const session={access_token:token,token_type:'bearer',expires_in:3600,refresh_token:'fixture-refresh',user};
  await context.route('**/*',async route=>{
    const req=route.request(),url=new URL(req.url());
    if(url.origin===origin){
      const rel=decodeURIComponent(url.pathname).replace(/^\/research-studio\//,'');
      const file=path.resolve(build.output,rel||'index.html');
      if(!file.startsWith(build.output+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile())return route.fulfill({status:404,body:''});
      const types={'.js':'application/javascript','.css':'text/css','.html':'text/html','.json':'application/json','.svg':'image/svg+xml','.mp4':'video/mp4','.png':'image/png'};
      return route.fulfill({body:fs.readFileSync(file),contentType:types[path.extname(file)]||'application/octet-stream'});
    }
    if(url.origin!=='https://uhmsxllsgwdjcnssbyxc.supabase.co'){state.errors.push('unexpected network origin');return route.abort();}
    const body=req.postData()?req.postDataJSON():null,endpoint=url.pathname.replace('/auth/v1/','');
    const headers={'x-supabase-api-version':'2024-01-01','access-control-expose-headers':'X-Supabase-Api-Version'};
    state.calls.push({endpoint,method:req.method(),body});
    if(endpoint==='signup')return route.fulfill({json:{...user,email_confirmed_at:undefined}});
    if(endpoint==='recover'||endpoint==='resend')return route.fulfill({json:{}});
    if(endpoint==='verify')return route.fulfill(body.token==='123456'?{json:session}:{headers,status:403,json:{code:'otp_expired',msg:'Expired token'}});
    if(endpoint==='user'&&req.method()==='PUT')return route.fulfill(state.weak?{headers,status:422,json:{code:'weak_password',msg:'Weak password'}}:{json:user});
    if(endpoint==='user')return route.fulfill({json:user});
    if(endpoint==='token')return route.fulfill(state.unconfirmed?{headers,status:400,json:{code:'email_not_confirmed',msg:'Email not confirmed'}}:{json:session});
    if(endpoint==='logout')return route.fulfill({status:204,body:''});
    if(url.pathname==='/rest/v1/factorlab_saves')return route.fulfill({json:[]});
    state.errors.push('unexpected endpoint '+endpoint);return route.abort();
  });
  const page=await context.newPage();page.setDefaultTimeout(5000);page.on('pageerror',e=>state.errors.push(e.message));
  t.after(async()=>{if(!t.passed)console.log(JSON.stringify({title:await page.locator('#account-title').textContent(),message:await page.locator('#account-message').textContent(),calls:state.calls.map(c=>({endpoint:c.endpoint,method:c.method})),errors:state.errors}));await context.close();assert.deepEqual(state.errors,[]);});
  await page.goto(origin+'/research-studio/index.html?welcome=1#/research');
  await page.waitForFunction(()=>window.FactorLabAccounts?.ready);
  assert.equal(await page.evaluate(()=>window.FactorLabCloudConfig.selfService),true);
  return {page,state,context};
}
const click=(page,name)=>page.locator('#account-dialog [data-account-action="'+name+'"]').click();
async function newPassword(page,value=password){await page.locator('#account-password').fill(value);await page.locator('#account-password-confirm').fill(value);}
test('registration: mismatch, verification, resend cooldown and direct workspace entry',async t=>{
  const {page,state}=await fixture(t);
  await click(page,'register-tab');await page.locator('#account-username').fill(email);await newPassword(page);
  await page.locator('#account-password-confirm').fill('different-password');await page.locator('#account-submit').click();
  await page.waitForFunction(()=>document.querySelector('#account-message').textContent.includes('两次密码'));
  assert.equal(state.calls.length,0);
  await newPassword(page);await page.locator('#account-submit').click();
  await page.locator('#account-code').waitFor();
  assert.equal(await page.locator('#account-password').count(),0);
  assert.equal(await page.evaluate(()=>FactorLabAccounts.getStatus().signedIn),false);
  assert.equal(await page.locator('[data-account-action="resend-code"]').isDisabled(),true);
  await page.locator('#account-code').fill('000000');await page.locator('#account-submit').click();
  await page.waitForFunction(()=>document.querySelector('#account-message').textContent.includes('验证码不正确或已失效'));
  await page.locator('#account-code').fill('123456');await page.locator('#account-submit').click();
  await page.waitForFunction(()=>FactorLabAccounts.getStatus().signedIn&&!document.querySelector('#account-dialog').open);
  assert.equal(await page.evaluate(()=>FactorLabWorkspace.getView()),'research');
  assert.equal(state.calls.filter(c=>c.endpoint==='signup').length,1);
});
test('mobile password recovery: temporary session, failed update retry, new password login, no secret residue',async t=>{
  const {page,state}=await fixture(t,390);
  await page.locator('#account-username').fill(email);await click(page,'forgot-password');
  assert.equal(await page.locator('#account-username').inputValue(),email);
  await page.locator('#account-submit').click();await page.locator('#account-code').waitFor();
  assert.equal(state.calls.filter(c=>c.endpoint==='recover').length,1);
  await page.screenshot({path:path.join(evidence,'reset-mobile.png')});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.locator('#account-code').fill('123456');await newPassword(page);state.weak=true;
  await page.locator('#account-submit').click();
  await page.waitForFunction(()=>document.querySelector('#account-message').textContent.includes('密码强度'));
  assert.equal(await page.evaluate(()=>FactorLabAccounts.getStatus().signedIn),false);
  assert.equal(await page.evaluate(()=>localStorage.getItem('factorlab-supabase-session-v1')),null);
  assert.equal(await page.locator('#account-code').count(),1);
  state.weak=false;await newPassword(page,password+'2');await page.locator('#account-submit').click();
  await page.waitForFunction(()=>document.querySelector('#account-message').textContent.includes('密码已更新'));
  assert.equal(state.calls.filter(c=>c.endpoint==='verify').length,1);
  assert.equal(await page.locator('#account-code').count(),0);
  assert.equal(await page.locator('#account-password').inputValue(),'');
  assert.equal(await page.evaluate(()=>JSON.stringify({...localStorage,...sessionStorage}).includes('fixture-password')),false);
  assert.equal(await page.evaluate(()=>FactorLabAccounts.getStatus().signedIn),false);
  await page.locator('#account-password').fill(password+'2');await page.locator('#account-submit').click();
  await page.waitForFunction(()=>FactorLabAccounts.getStatus().signedIn&&!document.querySelector('#account-dialog').open);
  assert.equal(await page.evaluate(()=>FactorLabApp.getUI().profileId),'10000000-0000-4000-8000-000000000001');
});
test('unconfirmed login offers verification, close clears sensitive fields and switching back preserves email',async t=>{
  const {page,state}=await fixture(t);
  state.unconfirmed=true;await page.locator('#account-username').fill(email);await page.locator('#account-password').fill(password);await page.locator('#account-submit').click();
  await page.waitForFunction(()=>document.querySelector('#account-message').textContent.includes('邮箱尚未验证'));
  await click(page,'verify-email');await page.locator('#account-code').waitFor();
  assert.equal(state.calls.filter(c=>c.endpoint==='resend').length,1);
  await page.locator('#account-code').fill('654321');await page.locator('#close-accounts').click();
  await page.waitForFunction(()=>!document.querySelector('#account-dialog').open&&document.querySelector('#account-code').value==='');
  assert.equal(await page.locator('#account-code').inputValue(),'');
  await page.evaluate(()=>FactorLabAccounts.open());await click(page,'login-tab');
  assert.equal(await page.locator('#account-username').inputValue(),email);
  assert.equal(await page.locator('#account-password').inputValue(),'');
});
