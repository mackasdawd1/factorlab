const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const file=path.join(__dirname,'../v3/cloud.js');
const E=require('../v2/simulation.js');
const config={url:'https://fixture.supabase.co',key:'sb_publishable_fixture',functionName:'swift-service'};
function fixture(){
  let user={id:'user-a',email:'learner@example.com',email_confirmed_at:'yes'},callback;
  const calls=[];let rows=[],resolveInsert;
  const client={auth:{onAuthStateChange(fn){callback=fn;},async getSession(){return {data:{session:user?{user,access_token:'test-token'}:null},error:null};},async getUser(){return {data:{user},error:null};},async signInWithPassword(){return {data:{user,session:{user}},error:null};},async signOut(){user=null;callback('SIGNED_OUT',null);return {error:null};}},from(table){const call={table,filters:[]};calls.push(call);const q={select(){return q;},order(){return q;},limit(){return q;},eq(k,v){call.filters.push([k,v]);return q;},insert(value){call.insert=value;return q;},update(value){call.update=value;return q;},abortSignal(){return q;},then(ok){return Promise.resolve({data:rows,error:null}).then(ok);}};return q;}};
  const create=require(file).create;
  const cloud=create({client,config,engine:E,fetchImpl:async(url,init)=>{calls.push({url,init});return new Response(JSON.stringify({mode:'live',summary:'你好',detail:'',references:[]}));}});
  return {cloud,calls,setRows:v=>{rows=v;},switchUser:id=>{user=id?{...user,id}:null;callback('SIGNED_IN',user?{user}:null);}};
}
const envelope=()=>({version:'factorlab-ui-v3',game:E.serialize(E.initial())});
test('cloud adapter exists',()=>assert.ok(fs.existsSync(file)));
test('session uses email identity without exposing token',async()=>{const f=fixture(),s=await f.cloud.request('/api/session');assert.equal(s.user.id,'user-a');assert.equal(s.user.username,'learner@example.com');assert.equal(JSON.stringify(s).includes('test-token'),false);});
test('save listing explicitly filters the signed-in user',async()=>{const f=fixture();await f.cloud.request('/api/saves');assert.ok(f.calls[0].filters.some(([k,v])=>k==='user_id'&&v==='user-a'));});
test('stale save update cannot overwrite a newer revision',async()=>{const f=fixture();await assert.rejects(f.cloud.request('/api/saves/save-a',{method:'PUT',body:JSON.stringify({name:'研究',envelope:envelope(),revision:2})}),e=>e.status===409);assert.deepEqual(f.calls[0].filters,[['user_id','user-a'],['id','save-a'],['revision',2]]);assert.deepEqual(Object.keys(f.calls[0].update).sort(),['envelope','name']);});
test('slot limit refuses another insert and invalid envelope is rejected',async()=>{const f=fixture();f.setRows(Array.from({length:12},(_,i)=>({slot:i+1})));await assert.rejects(f.cloud.request('/api/saves',{method:'POST',body:JSON.stringify({name:'研究',envelope:envelope()})}),e=>e.status===409);assert.equal(f.calls.some(c=>c.insert),false);await assert.rejects(f.cloud.request('/api/saves',{method:'POST',body:JSON.stringify({name:'研究',envelope:{}})}),e=>e.status===422);});
test('AI requires login and uses the actual deployed function slug',async()=>{const f=fixture();await f.cloud.coach({question:'你好',save:envelope().game});const c=f.calls.at(-1);assert.equal(c.url,config.url+'/functions/v1/swift-service');assert.equal(c.init.headers.Authorization,'Bearer test-token');f.switchUser(null);await assert.rejects(f.cloud.coach({question:'你好'}),e=>e.code==='login_required');});
test('registration stays explicitly disabled pending email setup',async()=>{const f=fixture();await assert.rejects(f.cloud.request('/api/register',{method:'POST'}),e=>e.code==='registration_unavailable');});

test('pending AI response from an old account is discarded after identity changes',async()=>{
  let authChanged,release,started;
  const began=new Promise(resolve=>{started=resolve;});
  const user={id:'first',email_confirmed_at:'yes'};
  const client={auth:{onAuthStateChange(fn){authChanged=fn;},async getSession(){return {data:{session:{user,access_token:'fixture'}}};}}};
  const cloud=require(file).create({client,config,engine:E,fetchImpl:()=>{started();return new Promise(resolve=>{release=()=>resolve(new Response(JSON.stringify({mode:'live',summary:'old account'})));});}});
  const pending=cloud.coach({question:'你好'});
  await began;
  authChanged('SIGNED_IN',{user:{id:'second'}});
  release();
  await assert.rejects(pending,e=>e.code==='session_changed');
});
