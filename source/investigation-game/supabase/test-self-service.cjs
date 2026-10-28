const test=require('node:test');
const assert=require('node:assert/strict');
const {create}=require('../v3/cloud.js');
const email='learner@example.com',password='new-fixture-password';
function fixture(selfService=true){
  let changed,user=null;
  const state={calls:[],updateError:null,verifyError:null,signUpSession:false};
  const result=(data={})=>({data,error:null});
  const client={auth:{
    onAuthStateChange(fn){changed=fn;},
    async getSession(){return result({session:user?{user}:null});},
    async signUp(value){state.calls.push(['signup',value]);return result({user:{id:'signup-user'},session:state.signUpSession?{}:null});},
    async resend(value){state.calls.push(['resend',value]);return result();},
    async resetPasswordForEmail(value){state.calls.push(['recover',value]);return result();},
    async verifyOtp(value){state.calls.push(['signup-verify',value]);user={id:'registered',email};changed('SIGNED_IN',{user});return result({user,session:{user}});},
    async signOut(){state.calls.push(['logout']);user=null;changed('SIGNED_OUT',null);return result();}
  }};
  const cloud=create({client,config:{selfService},engine:{},recoveryClientFactory:()=>({auth:{
    async verifyOtp(value){state.calls.push(['recovery-verify',value]);return state.verifyError?{error:state.verifyError}:result({user:{id:'original-user',email},session:{user:{id:'original-user',email},expires_at:Math.floor(Date.now()/1000)+3600}});},
    async updateUser(value){state.calls.push(['update',value]);return state.updateError?{error:state.updateError}:result({user:{id:'original-user',email}});},
    async signOut(value){state.calls.push(['recovery-logout',value]);return result();}
  }})});
  const request=(path,body={})=>cloud.request(path,{method:'POST',body:JSON.stringify(body)});
  return {request,state,switchUser(){user={id:'other-user'};changed('SIGNED_IN',{user});}};
}
test('self-service gate rejects registration and recovery until mail is configured',async()=>{
  const f=fixture(false);
  for(const path of ['/api/register','/api/auth/resend','/api/auth/verify','/api/auth/recover','/api/auth/reset'])await assert.rejects(f.request(path),e=>e.status===403);
  assert.equal(f.state.calls.length,0);
});
test('registration waits for verification, uses SDK and does not expose account existence',async()=>{
  const f=fixture();
  const response=await f.request('/api/register',{username:email,password});
  assert.deepEqual(response,{verificationRequired:true});
  assert.deepEqual(f.state.calls,[['signup',{email,password}]]);
  assert.deepEqual(await f.request('/api/auth/verify',{email,token:'123456'}),{enabled:true,user:{id:'registered',username:email},csrfToken:''});
  assert.deepEqual(f.state.calls.at(-1),['signup-verify',{email,token:'123456',type:'email'}]);
});
test('automatic confirmation cannot silently bypass the promised verification flow',async()=>{
  const f=fixture();f.state.signUpSession=true;
  await assert.rejects(f.request('/api/register',{username:email,password}),e=>e.code==='email_confirmation_required');
  assert.equal(f.state.calls.at(-1)[0],'logout');
});
test('resend uses signup type; recovery sends through official recovery endpoint',async()=>{
  const f=fixture();
  await f.request('/api/auth/resend',{email});await f.request('/api/auth/recover',{email});
  assert.deepEqual(f.state.calls,[['resend',{type:'signup',email}],['recover',email]]);
});
test('invalid email, password and OTP never reach the provider',async()=>{
  const f=fixture();
  for(const [p,b] of [['/api/register',{username:'bad',password}],['/api/register',{username:email,password:'short'}],['/api/auth/verify',{email,token:'bad'}],['/api/auth/reset',{email,token:'123456',password:'short'}]])await assert.rejects(f.request(p,b),e=>e.status===422);
  assert.equal(f.state.calls.length,0);
});
test('recovery verifies in a temporary client and updates the existing user, without logging the app in',async()=>{
  const f=fixture();
  assert.deepEqual(await f.request('/api/auth/reset',{email,token:'123456',password}),{ok:true});
  assert.deepEqual(f.state.calls,[['recovery-verify',{email,token:'123456',type:'recovery'}],['update',{password}],['recovery-logout',{scope:'local'}]]);
  assert.deepEqual(await f.request('/api/session'),{enabled:true,user:null,csrfToken:''});
});
test('expired or incorrect OTP cannot update a password',async()=>{
  const f=fixture();f.state.verifyError={status:403,code:'otp_expired'};
  await assert.rejects(f.request('/api/auth/reset',{email,token:'123456',password}),e=>e.code==='otp_expired');
  assert.equal(f.state.calls.some(c=>c[0]==='update'),false);
});
test('password update retry does not reuse an already consumed OTP',async()=>{
  const f=fixture();f.state.updateError={status:422,code:'weak_password'};
  await assert.rejects(f.request('/api/auth/reset',{email,token:'123456',password}),e=>e.code==='weak_password');
  f.state.updateError=null;
  await f.request('/api/auth/reset',{email,token:'123456',password:password+'2'});
  assert.equal(f.state.calls.filter(c=>c[0]==='recovery-verify').length,1);
  assert.equal(f.state.calls.filter(c=>c[0]==='update').length,2);
});
test('switching accounts after verification blocks a pending reset retry',async()=>{
  const f=fixture();f.state.updateError={status:422,code:'weak_password'};
  await assert.rejects(f.request('/api/auth/reset',{email,token:'123456',password}));
  f.switchUser();f.state.updateError=null;
  await assert.rejects(f.request('/api/auth/reset',{email,token:'123456',password}),e=>e.code==='session_changed');
  assert.equal(f.state.calls.filter(c=>c[0]==='update').length,1);
});
test('cancel discards the verified recovery grant; another attempt must verify again',async()=>{
  const f=fixture();f.state.updateError={status:422,code:'weak_password'};
  await assert.rejects(f.request('/api/auth/reset',{email,token:'123456',password}));
  await f.request('/api/auth/cancel');f.state.updateError=null;
  await f.request('/api/auth/reset',{email,token:'654321',password});
  assert.equal(f.state.calls.filter(c=>c[0]==='recovery-verify').length,2);
});
