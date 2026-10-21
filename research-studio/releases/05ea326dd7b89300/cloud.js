(function(root){
  'use strict';
  function create({client,config,engine,fetchImpl}){
    const error=(status,code)=>Object.assign(new Error(code),{status,code});
    let identity,epoch=0;const listeners=new Set();
    client.auth.onAuthStateChange((_event,session)=>{
      const id=session?.user?.id||null;
      if(identity!==id){identity=id;epoch++;setTimeout(()=>listeners.forEach(fn=>fn()),0);}
    });
    async function session(required=false){
      const {data,error:failure}=await client.auth.getSession();
      if(failure)throw error(401,'login_required');
      const value=data.session;
      if(required&&!value?.user)throw error(401,'login_required');
      if(identity===undefined)identity=value?.user?.id||null;
      return {value,epoch};
    }
    const guard=snapshot=>{if(snapshot.epoch!==epoch||snapshot.value?.user?.id!==identity)throw error(401,'session_changed');};
    const userView=user=>({enabled:true,user:user?{id:user.id,username:user.email||'Researcher'}:null,csrfToken:''});
    async function query(builder,snapshot){
      const result=await builder.abortSignal(AbortSignal.timeout(15000));guard(snapshot);
      if(result.error){const code=result.error.code;throw error(code==='23505'?409:code==='42501'?403:code==='PGRST301'?401:422,code||'save_failed');}
      return result.data;
    }
    function validateEnvelope(envelope){
      try{if(envelope?.version!=='factorlab-ui-v3'||new TextEncoder().encode(JSON.stringify(envelope)).length>480000)throw Error();engine.restore(envelope.game);}catch{throw error(422,'invalid_save');}
    }
    function metadata(row){
      let day='—',round='—',scenario='baseline';
      try{const s=engine.restore(row.envelope?.game);day=s.day;round=s.round;scenario=s.scenario;}catch{}
      return {id:row.id,name:row.name,revision:row.revision,updatedAt:row.updated_at,day,round,scenario};
    }
    async function request(path,options={}){
      const method=options.method||'GET',body=options.body?JSON.parse(options.body):{};
      if(path==='/api/register')throw error(403,'registration_unavailable');
      if(path==='/api/login'){
        const {data,error:failure}=await client.auth.signInWithPassword({email:body.username,password:body.password});
        if(failure)throw error(failure.status===429?429:401,failure.code||'invalid_credentials');
        return userView(data.user);
      }
      if(path==='/api/logout'){
        const {error:failure}=await client.auth.signOut({scope:'local'});if(failure)throw error(503,'logout_failed');return {ok:true};
      }
      if(path==='/api/session'){
        const s=await session();if(!s.value)return userView(null);
        const {data,error:failure}=await client.auth.getUser();guard(s);
        if(failure)throw error(failure.status===401||failure.status===403?401:503,'session_unavailable');
        return userView(data.user);
      }
      const s=await session(true),uid=s.value.user.id;
      const base=()=>client.from('factorlab_saves');
      if(path==='/api/saves'&&method==='GET'){
        const rows=await query(base().select('id,name,revision,updated_at,envelope,slot').eq('user_id',uid).order('slot').limit(12),s);
        return {saves:rows.map(metadata)};
      }
      if((path==='/api/saves'&&method==='POST')||(path.startsWith('/api/saves/')&&method==='PUT')){
        if(typeof body.name!=='string'||!body.name.trim()||body.name.trim().length>60)throw error(422,'invalid_name');
        validateEnvelope(body.envelope);
        if(method==='POST'){
          const rows=await query(base().select('slot').eq('user_id',uid).limit(12),s),used=new Set(rows.map(r=>r.slot));
          const slot=Array.from({length:12},(_,i)=>i+1).find(n=>!used.has(n));
          if(!slot)throw error(409,'save_limit');
          const inserted=await query(base().insert({slot,name:body.name.trim(),envelope:body.envelope}).select('id,name,revision,updated_at,envelope'),s);
          if(inserted.length!==1)throw error(422,'save_failed');return {save:metadata(inserted[0])};
        }
        if(!Number.isInteger(body.revision)||body.revision<1)throw error(422,'invalid_revision');
        const rows=await query(base().update({name:body.name.trim(),envelope:body.envelope}).eq('user_id',uid).eq('id',decodeURIComponent(path.slice(11))).eq('revision',body.revision).select('id,name,revision,updated_at,envelope'),s);
        if(rows.length!==1)throw error(409,'revision_conflict');return {save:metadata(rows[0])};
      }
      if(path.startsWith('/api/saves/')&&method==='GET'){
        const rows=await query(base().select('id,name,revision,updated_at,envelope').eq('user_id',uid).eq('id',decodeURIComponent(path.slice(11))).limit(1),s);
        if(rows.length!==1)throw error(404,'save_not_found');validateEnvelope(rows[0].envelope);return {save:{...metadata(rows[0]),envelope:rows[0].envelope}};
      }
      throw error(404,'not_found');
    }
    async function coach(body,signal){
      const s=await session(true);if(!s.value.user.email_confirmed_at)throw error(403,'verified_email_required');
      const response=await fetchImpl(config.url+'/functions/v1/'+config.functionName,{method:'POST',headers:{apikey:config.key,Authorization:'Bearer '+s.value.access_token,'Content-Type':'application/json'},body:JSON.stringify(body),signal});
      const value=await response.json();guard(s);if(!response.ok)throw error(response.status,value.error||'connection_failed');return value;
    }
    return {request,coach,subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);}};
  }
  if(typeof module!=='undefined'&&module.exports){module.exports={create};return;}
  if(!root.FactorLabCloudConfig||!root.supabase?.createClient)return;
  const config=root.FactorLabCloudConfig;
  const client=root.supabase.createClient(config.url,config.key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false,storageKey:'factorlab-supabase-session-v1'},global:{fetch:(url,init={})=>fetch(url,{...init,signal:init.signal||AbortSignal.timeout(15000)})}});
  root.FactorLabCloud=create({client,config,engine:root.FactorLabSimulation,fetchImpl:fetch});
})(typeof window==='undefined'?globalThis:window);
