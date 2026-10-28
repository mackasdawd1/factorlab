function createHandler({env,fetchImpl,engine,conversation}) {
  const origin='https://zhugeliang7512-eng.github.io';
  const cors={'access-control-allow-origin':origin,'access-control-allow-headers':'authorization, apikey, content-type, x-client-info','access-control-allow-methods':'POST, OPTIONS','vary':'Origin','cache-control':'no-store'};
  const reply=(status,value,extra={})=>new Response(JSON.stringify(value),{status,headers:{...cors,'content-type':'application/json; charset=utf-8',...extra}});
  const fail=(status,error,extra={})=>reply(status,{error},extra);
  const key=(dictionary,legacy)=>{
    try{return JSON.parse(env(dictionary)||'{}').default||env(legacy)||'';}catch{return '';}
  };
  async function readJson(stream,limit) {
    if(!stream)throw Error('body');
    const reader=stream.getReader(),chunks=[];let size=0;
    try {
      while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>limit){await reader.cancel();throw Error('size');}chunks.push(value);}
    } finally {reader.releaseLock();}
    const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
    return JSON.parse(new TextDecoder().decode(bytes));
  }
  async function call(url,init,timeout=8000) {
    return fetchImpl(url,{...init,redirect:'error',signal:AbortSignal.timeout(timeout)});
  }
  return async function handler(req) {
    if(req.headers.get('origin')&&req.headers.get('origin')!==origin)return fail(403,'origin_not_allowed');
    if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
    if(req.method!=='POST')return fail(405,'method_not_allowed');
    const authorization=req.headers.get('authorization')||'';
    if(!/^Bearer [A-Za-z0-9._-]{10,8192}$/.test(authorization)||/^Bearer sb_/.test(authorization))return fail(401,'login_required');
    const url=env('SUPABASE_URL')||'',publicKey=key('SUPABASE_PUBLISHABLE_KEYS','SUPABASE_ANON_KEY'),adminKey=key('SUPABASE_SECRET_KEYS','SUPABASE_SERVICE_ROLE_KEY'),providerKey=env('DEEPSEEK_API_KEY')||'';
    if(!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url)||!publicKey||!adminKey||!providerKey)return fail(503,'service_not_configured');
    let user;
    try{
      const res=await call(url+'/auth/v1/user',{headers:{apikey:publicKey,authorization}});
      if(!res.ok){await res.body?.cancel();return fail(res.status===401||res.status===403?401:503,'session_unavailable');}
      user=await readJson(res.body,32768);
    }catch{return fail(503,'auth_unavailable');}
    if(!user||!/^[-a-f0-9]{36}$/i.test(user.id||''))return fail(401,'login_required');
    if(user.is_anonymous||!user.email_confirmed_at)return fail(403,'verified_email_required');
    if(!/^application\/json(?:;|$)/i.test(req.headers.get('content-type')||''))return fail(415,'json_required');
    let body,state,context,history,lang;
    try{
      body=await readJson(req.body,131072);
      if(!body||typeof body.question!=='string'||!body.question.trim()||body.question.length>1000||!['zh-CN','en',undefined].includes(body.lang)||(body.mode!==undefined&&body.mode!=='contextual'))throw Error('body');
      lang=body.lang||'zh-CN';state=engine.restore(body.save);context=engine.coachContext(state,lang);history=conversation.historyItems(body.history);
    }catch(error){return fail(error.message==='size'?413:400,'invalid_request');}
    let quota;
    try{
      const res=await call(url+'/rest/v1/rpc/factorlab_ai_take',{method:'POST',headers:{apikey:adminKey,...(adminKey.startsWith('sb_secret_')?{}:{authorization:'Bearer '+adminKey}),'content-type':'application/json'},body:JSON.stringify({p_user_id:user.id})});
      if(!res.ok){await res.body?.cancel();return fail(503,'quota_unavailable');}
      quota=await readJson(res.body,2048);
    }catch{return fail(503,'quota_unavailable');}
    if(quota?.allowed===false)return fail(429,'quota_exceeded',{'retry-after':String(Math.max(1,Math.min(86400,Number(quota.retry_after)||60)))});
    if(quota?.allowed!==true)return fail(503,'quota_unavailable');
    const decisionNotes=[];
    context.results=context.results.map(({reason,...result})=>{if(typeof reason==='string')decisionNotes.push({id:result.id,reason});return result;});
    const ids=new Set();
    function collect(value){if(!value||typeof value!=='object')return;if(typeof value.id==='string')ids.add(value.id);for(const child of Object.values(value))if(typeof child==='object')collect(child);}
    collect(context);
    const inspect=text=>{
      if([providerKey,adminKey,authorization.slice(7)].some(s=>s&&text.includes(s))||/\b(?:sk-|sb_secret_|Bearer\s+)[A-Za-z0-9_-]{10,}/.test(text))throw Error('secret');
      const found=text.match(/\b(?:E\d+|RESULT(?:-R\d+)?|(?:MACRO|PORTFOLIO|METRICS)-D\d+|EVENT-[A-Z0-9-]+)\b/g)||[];
      if(found.some(id=>!ids.has(id)))throw Error('references');
    };
    try{
      const res=await call('https://api.deepseek.com/chat/completions',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+providerKey},body:JSON.stringify({model:'deepseek-flash',stream:false,temperature:0.5,max_tokens:1200,thinking:{type:'disabled'},messages:conversation.messages({context,ids,history,question:body.question,lang,decisionNotes})})},24000);
      if(!res.ok){await res.body?.cancel();const reason=({401:'provider_authentication',403:'provider_authentication',402:'provider_balance',429:'provider_rate_limited',451:'provider_region_restricted'})[res.status]||'provider_unavailable';return fail(502,reason);}
      const result=await readJson(res.body,32768),content=result.choices?.[0]?.message?.content;
      if(typeof content!=='string')throw Error('schema');
      const answer=conversation.decode(content,inspect);
      if(!answer.summary.trim()||answer.summary.length>450||answer.detail.length>3000||!Array.isArray(answer.references)||answer.references.length>4||answer.references.some(id=>!ids.has(id)))throw Error('schema');
      if((lang==='en'&&/[\u3400-\u9fff]/.test(answer.summary+answer.detail))||(lang==='zh-CN'&&!/[\u3400-\u9fff]/.test(answer.summary)))throw Error('language');
      return reply(200,{summary:answer.summary.trim(),detail:answer.detail.trim(),references:[...new Set(answer.references)],mode:'live',model:'deepseek-flash'});
    }catch(error){return fail(502,error.name==='TimeoutError'||error.name==='AbortError'?'provider_timeout':'invalid_provider_response');}
  };
}
module.exports={createHandler};
