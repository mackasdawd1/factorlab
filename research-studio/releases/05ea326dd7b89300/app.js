(async function() {
  'use strict';
  const staticHosting=document.querySelector('meta[name="factorlab-hosting"]')?.content==='static';
  const cloudMode=!!window.FactorLabCloudConfig,cloud=window.FactorLabCloud,offlineHosting=staticHosting&&!cloudMode;
  const E=window.FactorLabSimulation, $=id=>document.getElementById(id);
  const GUEST_SAVE_KEY='factorlab-simulation-ui-v3', LANG_KEY='factorlab-simulation-language-v3';
  const memoryProfiles=new Map();
  let SAVE_KEY=GUEST_SAVE_KEY,profileId=null;
  const PHASES={decision:'phaseDecision',simulating:'phaseSimulating',event:'phaseEvent',review:'phaseReview',complete:'phaseComplete'};
  const COLORS=['#202020','#4b4b4b','#777777','#9e9e9e','#bfbfbf','#d8d8d8'];
  let allocationUndo=null;
  const SECTOR_ICONS=['semiconductor','robotics','materials','energy','infrastructure','cash'];
  const feedback=(kind,stage,extra={})=>document.dispatchEvent(new CustomEvent('factorlab:feedback',{detail:{kind,stage,...extra}}));
  let campaignEpoch=0;
  const clone=v=>JSON.parse(JSON.stringify(v));
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let lang='zh-CN',state=E.initial(),draft=[...state.weights],factorPrefs=[25,25,25,25];
  let reason='',note='',forecast='flat',reflection='',writable=true,brokenRaw=null,noticeKey='';
  let timer=null,playing=false,speed=180,busy=false,requestId=0,controller=null,messages=[],evidenceOpen='',evidenceReturn='';
  const rawGet=key=>{try{return localStorage.getItem(key);}catch{writable=false;noticeKey='saveBlocked';return null;}};
  const storedLang=rawGet(LANG_KEY)||rawGet('factorlab-simulation-language');if(['zh-CN','en'].includes(storedLang))lang=storedLang;
  const staticCoach={'zh-CN':{coachRule:'离线学习助手',coachIntro:'公开版未连接在线 AI。这里可解释流程和常用概念；自由对话将在服务器接通后启用。'},en:{coachRule:'Offline learning helper',coachIntro:'This public version has no live AI connection. Explore the workflow and key concepts here; open-ended chat requires the server connection.'}};
  const cloudCoach={'zh-CN':{coachRule:'离线学习助手',coachIntro:'登录后可与 AI 交流研究问题。访客仍可使用离线概念提示；AI 不替你做配置决定。'},en:{coachRule:'Offline learning helper',coachIntro:'Sign in to discuss your research with AI. Visitors can use offline concept hints. Allocation decisions remain yours.'}};
  await i18next.init({lng:lang,fallbackLng:'zh-CN',keySeparator:false,initImmediate:false,interpolation:{escapeValue:false},resources:Object.fromEntries(['zh-CN','en'].map(l=>[l,{translation:{...E.TEXTS[l],...FactorLabStrings[l],...(offlineHosting?staticCoach[l]:cloudMode?cloudCoach[l]:{}),...(l==='en'?{sectorShort0:'Semicon',sectorShort3:'Energy',sectorShort4:'AI infra'}:{})}}]))});
  const t=(key,values={})=>i18next.t(key,values);
  const number=(value,digits=0)=>Number.isFinite(value)?(Math.abs(value)<.5*10**-digits?0:value).toLocaleString(lang,{minimumFractionDigits:digits,maximumFractionDigits:digits}):'—';
  const percent=(v,d=2,sign=false)=>Number.isFinite(v)?(sign&&v>0?'+':'')+number(v*100,d)+'%':'—';
  const money=(v,sign=false)=>(sign&&v>0?'+':'')+number(v,2);
  const normalizedFactors=()=>{const sum=factorPrefs.reduce((a,b)=>a+b,0);return sum>0?factorPrefs.map(v=>v/sum):[0,0,0,0];};
  const totalRounds=()=>state.totalRounds||state.config?.rounds||6;
  const lastResult=()=>state.results?.at(-1);
  const finished=()=>state.day>=totalRounds()*state.daysPerRound;
  function validDraft(values) {return Array.isArray(values)&&values.length===6&&values.every(v=>Number.isFinite(v)&&v>=0&&v<=1)&&Math.abs(values.reduce((a,b)=>a+b,0)-1)<1e-7&&values.slice(0,5).every(v=>v<=.4+1e-10);}
  function unpack(raw) {
    const item=typeof raw==='string'?JSON.parse(raw):raw;
    if(!['factorlab-ui-v2','factorlab-ui-v3'].includes(item?.version)||!item.game)throw Error('invalidSave');
    const loaded=E.restore(item.game);
    const proposed=validDraft(item.draft)?item.draft:[...loaded.weights];
    const prefs=Array.isArray(item.factorPrefs)&&item.factorPrefs.length===4&&item.factorPrefs.every(v=>Number.isFinite(v)&&v>=0&&v<=100)&&item.factorPrefs.some(v=>v>0)?item.factorPrefs:[25,25,25,25];
    return {loaded,proposed,prefs,reason:['','evidence','risk','anchor','valuation'].includes(item.reason)?item.reason:'',note:typeof item.note==='string'?item.note.slice(0,180):'',forecast:['up','flat','down'].includes(item.forecast)?item.forecast:'flat',reflection:typeof item.reflection==='string'?item.reflection.slice(0,600):''};
  }
  function installSave(raw) {const x=unpack(raw);state=x.loaded;draft=x.proposed;factorPrefs=x.prefs;reason=x.reason;note=x.note;forecast=x.forecast;reflection=x.reflection;}
  const ownSave=rawGet(SAVE_KEY),rawSave=ownSave===null?rawGet('factorlab-simulation-ui-v2'):ownSave;
  if(rawSave){try{installSave(rawSave);}catch{brokenRaw=rawSave;writable=false;noticeKey='corruptSave';}}
  function envelope(){return {version:'factorlab-ui-v3',game:E.serialize(state),draft:[...draft],factorPrefs:[...factorPrefs],reason,note,forecast,reflection};}
  function save(){if(writable){try{localStorage.setItem(SAVE_KEY,JSON.stringify(envelope()));}catch{writable=false;noticeKey='saveBlocked';}}$('save-status').textContent=t(writable?'saved':'memoryOnly');showNotice();document.dispatchEvent(new CustomEvent('factorlab:save',{detail:{profileId,day:state.day}}));}
  function showNotice(key){if(key)noticeKey=key;$('notice').hidden=!noticeKey;$('notice').textContent=noticeKey?t(noticeKey):'';}
  function translate(){document.documentElement.lang=lang;document.title='FactorLab · '+t('chapter');document.querySelectorAll('[data-i18n]').forEach(el=>el.textContent=t(el.dataset.i18n));document.querySelectorAll('[data-i18n-placeholder]').forEach(el=>el.placeholder=t(el.dataset.i18nPlaceholder));$('language').value=lang;$('design-link').href=staticHosting?'previous/':'import/'+lang+'.html';document.querySelector('.rail')?.setAttribute('aria-label',t('desk'));$('rounds').setAttribute('aria-label',t('round',{round:state.round,total:totalRounds()}));$('macro').setAttribute('aria-label',t('macroHint'));}
  let chartSize='',chartDirty=false;
  function renderChart(){
    chartDirty=true;
    const host=$('nav-chart');
    if(!host.getClientRects().length||!host.clientWidth||!host.clientHeight)return;
    FactorVisuals.chart(host,{rows:state.history,series:[
      {key:'anchorNav',name:t('anchor'),color:'#999891'},
      {key:'benchmarkNav',name:t('benchmark'),color:'#54534e',dash:true},
      {key:'nav',name:t('yourPortfolio'),color:'#814d68'}
    ],label:t('chartLabel'),format:v=>number(v,0),xLabel:r=>t('eventDay',{day:r?.day||0}),empty:state.day===0?t('chartEmpty'):''});
    chartSize=host.clientWidth+'x'+host.clientHeight;chartDirty=false;
  }
  function renderMarket(){
    $('phase').textContent=t(PHASES[state.phase]||'phaseDecision');$('day-count').textContent=t('day',{day:state.day});$('round-count').textContent=t('round',{round:state.round,total:totalRounds()});
    $('rounds').innerHTML=Array.from({length:totalRounds()},(_,i)=>`<div class="round-item ${i+1===state.round?'active':i+1<state.round?'done':''}"><b>${esc(t('roundShort',{round:i+1}))}</b><span>${esc(t('roundStage'+i))}</span></div>`).join('');
    $('macro').innerHTML=['rate','inflation','growth','liquidity','credit','sentiment'].map((key,i)=>`<div class="macro-metric"><span>${esc(t(key))}</span><strong>${number(state.macro[key],i<3?1:0)}<small>${i<3?'%':'/100'}</small></strong><div class="micro-track"><i data-width="${Math.min(100,Math.max(0,i<3?state.macro[key]*12:state.macro[key]))}"></i></div></div>`).join('');
    const cyc=String(state.macro.cycle||'Recovery');$('cycle').textContent=t('cycle.'+cyc,{defaultValue:t('cycle'+cyc.charAt(0).toUpperCase()+cyc.slice(1))});
    $('nav').textContent=number(state.nav,2);$('benchmark-nav').textContent=number(state.benchmarkNav,2);$('anchor-nav').textContent=number(state.anchorNav,2);
    const r=state.nav/100000-1;$('nav-change').textContent=percent(r,2,true);$('nav-change').className=r>=0?'positive':'negative';
    const initialPrices=state.history?.[0]?.prices||[100,100,100,100,100];
    $('heatmap').innerHTML=state.prices.map((p,i)=>{const change=p/initialPrices[i]-1;return `<div class="sector-tile ${change<0?'down':change>0?'up':''}"><span data-icon="${SECTOR_ICONS[i]}" aria-hidden="true"></span><span title="${esc(t('sector'+i))}">${esc(t('sectorShort'+i))}</span><strong>${percent(change,1,true)}</strong><small>${number(p,2)}</small></div>`;}).join('');
    renderChart();document.querySelectorAll('[data-width]').forEach(el=>el.style.width=el.dataset.width+'%');
  }
  function renderEvents(){
    const focusedEvidence=document.activeElement?.dataset.evidence;
    const backgroundOpen=$('events').querySelector('.event-background')?.open,timelineOpen=$('events').querySelector('.event-timeline')?.open;
    const events=[...(state.events||[])].reverse();
    const evidence=E.publicView(state).evidence;
    const cards=`<div class="evidence-grid">${evidence.map(e=>`<button class="evidence-button ${(state.seen||[]).includes(e.id)?'read':''}" data-evidence="${esc(e.id)}" aria-expanded="${evidenceOpen===e.id}"><small>${esc(e.id)} · ${esc((state.seen||[]).includes(e.id)?t('inspected'):lang==='en'?({'E1':'Inspect orders','E2':'Inspect pricing','E3':'Inspect policy'}[e.id]||t('inspect')):({'E1':'查看订单线索','E2':'查看价格风险','E3':'查看政策影响'}[e.id]||t('inspect')))}</small><strong>${esc(t(e.titleKey))}</strong></button>`).join('')}</div>`;
    const open=evidence.find(e=>e.id===evidenceOpen);
    const eventHTML=ev=>`<article class="event-row"><span class="event-index">${esc(ev.id.replace(/[^0-9]/g,'')||ev.startDay)}</span><div><div class="event-meta"><span>${esc(t('eventDay',{day:ev.startDay}))}</span><b>${esc(t(ev.status==='resolved'||state.day>=ev.startDay+ev.duration?'eventResolved':'eventActive'))}</b></div><h3>${esc(t(ev.titleKey))}</h3><p>${esc(t(ev.bodyKey))}</p></div></article>`;
    const latest=events.length?eventHTML(events[0]):`<details class="event-background" ${backgroundOpen?'open':''}><summary>${esc(t('eventInitialTitle'))}</summary><p>${esc(t('eventInitialBody'))}</p></details>`;
    const earlier=events.length>1?`<details class="event-timeline" ${timelineOpen?'open':''}><summary>${lang==='en'?'Earlier events':'此前事件'} · ${events.length-1}</summary>${events.slice(1).map(eventHTML).join('')}</details>`:'';
    $('events').innerHTML=cards+latest+earlier+`<p class="round-question">${esc(t('roundQuestion'+(state.round-1)))}</p>`;
    document.querySelectorAll('[data-evidence]').forEach(el=>el.addEventListener('click',()=>openEvidence(el.dataset.evidence)));
    $('event-control').hidden=state.phase!=='event';$('resume').disabled=busy;
    if(focusedEvidence){const control=[...$('events').querySelectorAll('[data-evidence]')].find(el=>el.dataset.evidence===focusedEvidence);if(control?.getClientRects().length)control.focus({preventScroll:true});}
  }
  function renderAllocation(){
    const focusedWeight=$('allocation').contains(document.activeElement)?document.activeElement.id:null;
    const locked=state.phase!=='decision'||busy;
    $('allocation').innerHTML=draft.map((v,i)=>`<div class="allocation-row"><label for="weight-${i}" class="sector-label"><span data-icon="${SECTOR_ICONS[i]}" aria-hidden="true"></span><span>${esc(t('sector'+i))}</span></label><small title="${esc(t('current'))}">${percent(state.weights[i],1)} →</small><div class="allocation-input"><input id="weight-${i}" aria-label="${esc(t('target')+' '+t('sector'+i))}" type="number" min="0" max="${i===5?100:40}" step="1" value="${(v*100).toFixed(2).replace(/\.00$/,'')}" ${locked?'disabled':''}></div>${i<5?`<input class="allocation-slider" id="weight-range-${i}" aria-label="${esc(t('target')+' '+t('sector'+i))}" type="range" min="0" max="${Math.min(40,Math.floor((v+draft[5])*100+1e-8))}" step="1" value="${Math.round(v*100)}" ${locked?'disabled':''}>`:''}</div>`).join('');
    window.FactorLabIcons?.render();
    draft.forEach((_,i)=>$('weight-'+i).addEventListener('change',()=>{
      const value=Number($('weight-'+i).value)/100;
      if(!Number.isFinite(value)||value<0||value>(i===5?1:.4)){renderAllocation();showNotice('invalidWeights');return;}
      const before=[...draft];
      if(i<5){const cash=draft[5]+draft[i]-value;if(cash< -1e-9){renderAllocation();showNotice('invalidWeights');return;}draft[i]=value;draft[5]=Math.max(0,cash);}
      else{const invested=draft.slice(0,5).reduce((a,b)=>a+b,0);const proposed=invested>0?draft.slice(0,5).map(w=>w/invested*(1-value)):Array(5).fill((1-value)/5);if(proposed.some(w=>w>.4+1e-9)){renderAllocation();showNotice('invalidWeights');return;}draft=[...proposed,value];}
      allocationUndo=before;noticeKey=writable?'':noticeKey;renderAllocation();save();
    }));
    draft.slice(0,5).forEach((_,i)=>{
      const range=$('weight-range-'+i);let gesture=false;
      const begin=()=>{if(!gesture){allocationUndo=[...draft];gesture=true;}};
      range.addEventListener('pointerdown',begin);
      range.addEventListener('input',()=>{
        begin();const value=Number(range.value)/100;draft[5]=Math.max(0,draft[5]+draft[i]-value);draft[i]=value;
        $('weight-'+i).value=(value*100).toFixed(0);$('weight-5').value=(draft[5]*100).toFixed(2).replace(/\.00$/,'');
        drawAllocation();updateDraftSummary();save();
      });
      range.addEventListener('change',()=>{gesture=false;renderAllocation();});
    });
    drawAllocation();
    const factors=normalizedFactors();$('factors').innerHTML=factorPrefs.map((value,i)=>`<div class="factor-row"><label for="factor-${i}">${esc(t('factor'+i))}</label><input id="factor-${i}" type="range" min="0" max="100" step="5" value="${value}" ${locked?'disabled':''}><output id="factor-value-${i}" for="factor-${i}">${number(factors[i]*100,0)}%</output></div>`).join('');
    factorPrefs.forEach((_,i)=>$('factor-'+i).addEventListener('input',()=>{factorPrefs[i]=Number($('factor-'+i).value);const current=normalizedFactors();current.forEach((v,j)=>$('factor-value-'+j).textContent=number(v*100,0)+'%');updateDraftSummary();save();}));
    document.querySelectorAll('[data-preset]').forEach(el=>el.disabled=locked);$('apply-factors').disabled=locked;
    if($('reason').value!==reason)$('reason').value=reason;if($('note').value!==note)$('note').value=note;if($('forecast').value!==forecast)$('forecast').value=forecast;
    for(const id of ['reason','note','forecast'])$(id).disabled=locked;
    updateDraftSummary();
    if(focusedWeight&&$(focusedWeight)&&!$(focusedWeight).disabled&&$(focusedWeight).getClientRects().length)$(focusedWeight).focus({preventScroll:true});
  }
  function drawAllocation(){
    FactorVisuals.dial($('allocation-dial'),draft,Array.from({length:6},(_,i)=>t('sectorShort'+i,{defaultValue:t('sector'+i)})));
    $('undo-allocation').disabled=!allocationUndo||state.phase!=='decision'||busy;
  }
  function openEvidence(id){
    const evidence=E.publicView(state).evidence,entry=evidence.find(e=>e.id===id);if(!entry)return;
    if(!$('evidence-dialog').open)evidenceReturn=id;
    evidenceOpen=id;pauseForDialog();
    if(!busy&&state.phase==='decision'&&!(state.seen||[]).includes(id))act({type:'read',id});
    $('evidence-id').textContent=id+' · '+(lang==='en'?'PUBLIC EVIDENCE':'公开证据');
    $('evidence-title').textContent=t(entry.titleKey);$('evidence-body').textContent=t(entry.bodyKey);
    if(!$('evidence-dialog').open)$('evidence-dialog').showModal();
  }
  function updateDraftSummary(){
    let p;try{p=E.preview(state,draft);}catch{p={ok:false};}
    $('total').textContent=percent(draft.reduce((a,b)=>a+b,0),0);$('cost-label').textContent=t(state.phase==='decision'?'estimatedCost':'actualCost');$('fee').textContent=state.phase==='decision'?(p.ok?money(p.fee):'—'):money(state.transactions.at(-1)?.fee||0);
    const factorValid=factorPrefs.some(v=>v>0);$('allocation-error').textContent=!p.ok?t('invalidWeights'):!factorValid?t('invalidFactors'):'';
    $('confirm').disabled=state.phase!=='decision'||busy||!p.ok||!factorValid||!reason;
    $('confirm').hidden=state.phase!=='decision';$('simulation-controls').hidden=state.phase!=='simulating';
    const progressed=state.day-(state.round-1)*state.daysPerRound;$('sim-progress').style.width=Math.max(0,Math.min(100,progressed/state.daysPerRound*100))+'%';
    $('simulation-message').textContent=t('simulationProgress',{day:progressed,total:state.daysPerRound});$('pause-play').textContent=t(playing?'pauseAnimation':'playAnimation');$('pause-play').disabled=busy;$('fast-forward').disabled=busy;
  }
  function renderRisk(){
    const m=E.metrics(state);$('risk-metrics').innerHTML=[['volatility',percent(m.volatility)],['sharpe',number(m.sharpe,2)],['maxDrawdown',percent(m.maxDrawdown)],['diversification',percent(m.diversification,0)]].map(([key,value])=>`<div class="risk-metric"><span>${esc(t(key))}</span><strong>${value}</strong></div>`).join('');
    const result=lastResult();
    const exposure=Array.from({length:4},(_,i)=>state.weights.slice(0,5).reduce((sum,w,j)=>sum+w*E.EXPOSURES[j][i],0));
    const returns=state.history.at(-1).factorReturns;
    const factorTable=`<div class="exposure-table"><div><span>${esc(t('factorLabel'))}</span><span>${esc(t('exposure'))}</span><span>${esc(t('factorReturn'))}</span></div>${exposure.map((v,i)=>`<div><span>${esc(t('factor'+i))}</span><b>${number(v,2)}</b><b>${state.day?percent(returns[i],2,true):'—'}</b></div>`).join('')}<p class="footnote">${esc(t('exposureHint'))}</p></div>`;
    if(!result){$('attribution').innerHTML=factorTable;return;}
    const a=result.attribution,entries=[['attributionMarket',a.market],...(a.factors||[]).map((v,i)=>['factor'+i,v]),['attributionSector',a.sector],['attributionEvent',a.event],['attributionIdiosyncratic',a.idiosyncratic],['attributionCash',a.cash],['attributionCost',a.cost]];
    const max=Math.max(1,...entries.map(([,v])=>Math.abs(v)));
    $('attribution').innerHTML=factorTable+`<div class="attribution-breakdown"><h3>${esc(t('attributionTitle',{round:result.round}))}</h3><div class="attribution-rows">`+entries.map(([key,value])=>`<div class="attribution-row"><span>${esc(t(key))}</span><span class="attribution-bar"><i class="${value<0?'loss':''}" data-width="${Math.abs(value)/max*100}"></i></span><strong class="${value<0?'negative':'positive'}">${money(value,true)}</strong></div>`).join('')+'</div></div>';
    $('attribution').querySelectorAll('[data-width]').forEach(el=>el.style.width=el.dataset.width+'%');
  }
  function reasonText(key){const mapping={evidence:'reasonEvidence',risk:'reasonRisk',anchor:'reasonAnchor',valuation:'reasonValuation'},parts=key.split(' · ');return mapping[parts[0]]?[t(mapping[parts[0]]),...parts.slice(1)].join(' · '):key;}
  function renderReview(){
    const result=lastResult(),show=['review','complete'].includes(state.phase);$('review').hidden=!show;
    if(show&&result){$('review-title').textContent=t(finished()?'completeTitle':'reviewTitle');const actual=result.realizedForecast;const predicted=result.forecast;
      $('review-content').innerHTML=[['roundReturn',percent(result.returnValue,2,true)],['counterfactual',money(result.tacticalAmount,true)],['anchorDifference',money(state.nav-state.anchorNav,true)]].map(([key,value])=>`<div class="review-stat"><span>${esc(t(key))}</span><strong>${value}</strong></div>`).join('')+`<p>${esc(t('forecastActual',{forecast:t('forecast'+predicted.charAt(0).toUpperCase()+predicted.slice(1)),actual:t('forecast'+String(actual).charAt(0).toUpperCase()+String(actual).slice(1))}))}</p><details class="supporting-detail"><summary>${esc(t('reward'))} · ${number(result.reward?.points||0)}</summary><div class="badges">${(result.reward?.badges||[]).map(key=>`<span class="badge">${esc(t(key))}</span>`).join('')}</div><p>${esc(t('rewardHint'))}</p></details>`;
    }
    $('next-round').hidden=finished();$('next-round').disabled=busy;$('replay').hidden=!finished();
    document.querySelector('label[for="reflection"]').textContent=t(finished()?'reflectionPromptComplete':'reflectionPrompt');
    $('history').innerHTML=state.results.length?state.results.map((r,i)=>`<div class="history-row"><span>${esc(t('roundShort',{round:i+1}))}</span><span>${esc(reasonText(r.reason||''))}</span><strong class="${r.returnValue<0?'negative':'positive'}">${percent(r.returnValue,2,true)}</strong></div>`).join(''):`<p class="history-empty">${esc(t('journalEmpty'))}</p>`;
    if($('reflection').value!==reflection)$('reflection').value=reflection;
  }
  function renderMessages(){
    $('messages').innerHTML=messages.map(msg=>`<div class="message ${msg.role}"><small>${esc(t(msg.role==='user'?'messageYou':msg.mode==='live'?'coachLive':msg.mode==='fallback'?'coachFallback':'coachRule'))} · ${esc(t('eventDay',{day:msg.day}))}</small><p>${esc(msg.summary)}</p>${msg.detail?`<details><summary>${esc(t('references'))}</summary><p>${esc(msg.detail)}</p><div class="references">${esc((msg.references||[]).join(' · '))}</div></details>`:''}${msg.lang!==lang?`<small>${esc(t('messageLanguage'))}</small>`:''}</div>`).join('')+(busy?`<p class="footnote">${esc(t('coachThinking'))}</p>`:'');
    $('messages').scrollTop=$('messages').scrollHeight;
    const last=messages.filter(m=>m.role==='assistant').at(-1);
    $('coach-mode').textContent=last?.mode==='live'?t('coachLive')+(last.model?' · '+last.model:''):last?.mode==='fallback'?t('coachFallback'):offlineHosting?t('coachRule'):cloudMode&&!window.FactorLabAccounts?.getStatus().signedIn?(lang==='en'?'Sign in to use online AI':'登录后可使用在线 AI'):lang==='en'?'Ready · connects when you send':'就绪 · 发送后连接';
    if(last?.mode==='fallback'&&last.reason){
      const reasons={authentication:['服务端密钥未通过验证','Server credentials were rejected'],balance:['服务额度不足','Provider balance is insufficient'],rate_limited:['请求过于频繁，请稍后再试','Rate limited; try again shortly'],region_restricted:['服务商限制了当前地区的访问','Provider access is restricted in this region'],provider_unavailable:['模型服务暂不可用','The model service is temporarily unavailable'],invalid_response:['回复未通过校验','The response did not pass validation'],connection_failed:['暂时无法连接模型','Cannot connect to the model'],timeout:['模型响应超时，可重试','The model timed out; you can retry'],not_configured:['服务器尚未配置 AI','Server AI is not configured']};
      Object.assign(reasons,{login_required:['请先登录，再使用在线 AI','Sign in to use online AI'],session_changed:['账号已切换，请重新发送','Account changed; send again'],verified_email_required:['请先完成邮箱验证','Verify your email first'],quota_exceeded:['已达调用额度或间隔过短，请稍后再试','Quota reached or requests too close; try later'],quota_unavailable:['云端额度服务暂不可用','Cloud quota service unavailable'],service_not_configured:['云端 AI 配置未完成','Cloud AI configuration incomplete'],provider_authentication:reasons.authentication,provider_balance:reasons.balance,provider_rate_limited:reasons.rate_limited,provider_region_restricted:reasons.region_restricted,provider_timeout:reasons.timeout,invalid_provider_response:reasons.invalid_response,session_unavailable:['登录已失效，请重新登录','Session expired; sign in again']});
      const reasonLabel=reasons[last.reason]||reasons.connection_failed;
      $('coach-mode').textContent+=' · '+reasonLabel[lang==='en'?1:0];
    }
    $('question').disabled=busy;$('ask').disabled=busy;document.querySelectorAll('[data-question]').forEach(el=>el.disabled=busy);
  }
  function render(){document.body.dataset.phase=state.phase;translate();renderMarket();renderEvents();renderAllocation();renderRisk();renderReview();renderMessages();showNotice();$('save-status').textContent=t(writable?'saved':'memoryOnly');document.dispatchEvent(new CustomEvent('factorlab:render',{detail:{phase:state.phase,day:state.day,round:state.round,lang}}));}
  function stop(){clearTimeout(timer);timer=null;playing=false;}
  function act(action){try{const previousResults=state.results.length;state=E.reduce(state,action);if(state.phase!=='simulating')stop();if(action.type==='next'){allocationUndo=null;draft=state.weights.map((v,i)=>i<5?Math.min(.4,v):v);draft[5]=1-draft.slice(0,5).reduce((a,b)=>a+b,0);reason='';note='';forecast='flat';}save();render();if(state.results.length>previousResults){const result=lastResult();feedback('settlement','success',{id:campaignEpoch+':'+state.day,returnValue:result.returnValue,milestone:state.phase==='complete'||Boolean(result.reward?.badges?.length)});}return true;}catch(error){showNotice(FactorLabStrings[lang][error.message]?error.message:'actionError');return false;}}
  function schedule(){if(!playing||state.phase!=='simulating'||busy)return;timer=setTimeout(()=>{if(act({type:'advance',days:1})&&playing)schedule();},speed);}
  function startPlayback(){if(matchMedia('(prefers-reduced-motion: reduce)').matches){act({type:'advance',days:state.daysPerRound});return;}playing=true;updateDraftSummary();schedule();}
  function download(data,name,type='application/json'){const url=URL.createObjectURL(new Blob([data],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1500);}
  function resetRequest(){feedback('coach','cancel',{id:requestId});requestId++;controller?.abort();controller=null;busy=false;}
  async function ask(question){
    if(busy||!question.trim())return;const id=++requestId,atDay=state.day,atLang=lang;stop();busy=true;if(!offlineHosting)feedback('coach','start',{id});
    const history=messages.slice(-12).map(m=>({role:m.role,content:[m.summary,m.detail].filter(Boolean).join('\n')}));messages.push({role:'user',summary:question,day:atDay,lang:atLang});renderMessages();renderAllocation();
    const current=clone(state);let answer;
    if(offlineHosting)answer={...FactorLabAssistant.offlineReply(current,question,atLang,history),mode:'example'};
    else{
      controller=new AbortController();const timeout=setTimeout(()=>controller?.abort(),cloudMode?45000:26000);
      try{if(location.protocol==='file:')throw Error('offline');const payload={save:E.serialize(current),question,lang:atLang,history};if(cloudMode){if(!cloud)throw Error('cloud');answer=await cloud.coach(payload,controller.signal);}else{const response=await fetch('/api/coach-v3',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload),signal:controller.signal});if(!response.ok)throw Error('network');answer=await response.json();}if(typeof answer.summary!=='string'||typeof answer.detail!=='string'||!['live','example','fallback'].includes(answer.mode))throw Error('schema');}
      catch(error){answer={...FactorLabAssistant.offlineReply(current,question,atLang,history),mode:'fallback',reason:error.name==='AbortError'?'timeout':error.code||'connection_failed'};}
      finally{clearTimeout(timeout);}
    }
    if(id!==requestId)return;busy=false;controller=null;messages.push({...answer,role:'assistant',day:atDay,lang:atLang});messages=messages.slice(-14);$('question').value='';render();feedback('coach',offlineHosting||answer.mode==='fallback'?'fallback':'success',{id});
  }
  const pauseForDialog=()=>{stop();updateDraftSummary();};
  document.addEventListener('factorlab:pause',pauseForDialog);
  $('settings').addEventListener('click',()=>{pauseForDialog();$('settings-dialog').showModal();});$('close-settings').addEventListener('click',()=>$('settings-dialog').close());
  $('language').addEventListener('change',async()=>{const next=$('language').value;if(!['zh-CN','en'].includes(next))return;lang=next;await i18next.changeLanguage(lang);try{localStorage.setItem(LANG_KEY,lang);}catch{}render();});
  $('speed').addEventListener('change',()=>{speed=Number($('speed').value);});
  $('reason').addEventListener('change',()=>{reason=$('reason').value;updateDraftSummary();save();});$('note').addEventListener('input',()=>{note=$('note').value;save();});$('forecast').addEventListener('change',()=>{forecast=$('forecast').value;save();});$('reflection').addEventListener('input',()=>{reflection=$('reflection').value;save();});
  document.querySelectorAll('[data-preset]').forEach(el=>el.addEventListener('click',()=>{if(state.phase!=='decision'||busy)return;allocationUndo=[...draft];draft=el.dataset.preset==='defensive'?[.12,.12,.13,.13,.10,.40]:el.dataset.preset==='growth'?[.30,.18,.10,.10,.27,.05]:[.20,.20,.15,.15,.15,.15];renderAllocation();save();}));
  $('apply-factors').addEventListener('click',()=>{if(!factorPrefs.some(v=>v>0)){showNotice('invalidFactors');return;}try{allocationUndo=[...draft];draft=E.recommend(state,normalizedFactors(),draft[5]);renderAllocation();save();}catch{showNotice('invalidFactors');}});
  $('confirm').addEventListener('click',()=>{
    if(busy||state.phase!=='decision')return;if(!reason){showNotice('missingReason');return;}
    const preview=E.preview(state,draft);if(!preview.ok)return;
    $('trade-preview').innerHTML=`<div class="trade-weights">${draft.map((v,i)=>`<span>${esc(t('sector'+i))}</span><strong>${percent(v,1)}</strong>`).join('')}</div><div class="review-stat"><span>${esc(t('estimatedCost'))}</span><strong>${money(preview.fee)}</strong></div><p>${esc(reasonText(reason))}${note?' · '+esc(note):''}</p>`;
    $('trade-confirm').showModal();
  });
  $('cancel-trade').addEventListener('click',()=>$('trade-confirm').close());
  $('execute-trade').addEventListener('click',()=>{if(busy||state.phase!=='decision')return;$('trade-confirm').close();allocationUndo=null;if(act({type:'lock',weights:draft,factorWeights:normalizedFactors(),reason:reason+(note?' · '+note:''),forecast}))startPlayback();});
  $('undo-allocation').addEventListener('click',()=>{if(!allocationUndo||busy||state.phase!=='decision')return;draft=[...allocationUndo];allocationUndo=null;renderAllocation();save();});
  for(const id of ['close-evidence','done-evidence'])$(id).addEventListener('click',()=>$('evidence-dialog').close());
  $('next-evidence').addEventListener('click',()=>{const all=E.publicView(state).evidence;openEvidence(all[(all.findIndex(e=>e.id===evidenceOpen)+1)%all.length].id);});
  $('evidence-dialog').addEventListener('close',()=>{
    const returnId=evidenceReturn;evidenceOpen='';evidenceReturn='';renderEvents();
    const control=[...$('events').querySelectorAll('[data-evidence]')].find(el=>el.dataset.evidence===returnId);
    if(control?.getClientRects().length)control.focus({preventScroll:true});
  });
  $('evidence-dialog').addEventListener('keydown',event=>{
    if(event.key!=='Tab'||event.altKey||event.ctrlKey||event.metaKey)return;
    const controls=[...$('evidence-dialog').querySelectorAll('button:not([disabled])')].filter(el=>el.getClientRects().length);
    const first=controls[0],last=controls.at(-1);if(!first)return;
    if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
  });
  $('pause-play').addEventListener('click',()=>{if(playing)stop();else{playing=true;schedule();}updateDraftSummary();});$('fast-forward').addEventListener('click',()=>{stop();act({type:'advance',days:state.daysPerRound});});$('resume').addEventListener('click',()=>{if(!busy&&act({type:'resume'})&&state.phase==='simulating')startPlayback();});$('next-round').addEventListener('click',()=>{if(!busy)act({type:'next'});});
  $('model-info').addEventListener('click',()=>{pauseForDialog();$('method-dialog').showModal();});$('close-method').addEventListener('click',()=>$('method-dialog').close());
  const openNew=()=>{pauseForDialog();$('settings-dialog').close();$('new-dialog').showModal();};$('new-game').addEventListener('click',openNew);$('replay').addEventListener('click',openNew);$('cancel-new').addEventListener('click',()=>$('new-dialog').close());
  $('start-new').addEventListener('click',()=>{let next;try{next=E.initial({seed:Number($('seed').value),scenario:$('scenario').value});}catch{showNotice('actionError');return;}stop();resetRequest();campaignEpoch++;allocationUndo=null;state=next;draft=[...state.weights];factorPrefs=[25,25,25,25];reason='';note='';forecast='flat';reflection='';messages=[];brokenRaw=null;writable=true;noticeKey='';$('new-dialog').close();save();render();window.scrollTo({top:0});});
  $('save-now').addEventListener('click',()=>{save();feedback('save',writable?'success':'failure');});$('export-save').addEventListener('click',()=>download(brokenRaw||JSON.stringify(envelope(),null,2),'FactorLab-save-day-'+state.day+'.json'));
  $('import-save').addEventListener('change',async event=>{const file=event.target.files[0];if(!file)return;try{if(file.size>500000)throw Error('large');const raw=await file.text();const verified=unpack(raw);campaignEpoch++;allocationUndo=null;stop();resetRequest();installSave(raw);messages=[];brokenRaw=null;writable=true;noticeKey='imported';save();render();document.dispatchEvent(new Event('factorlab:restore'));$('settings-dialog').close();}catch{showNotice('invalidSave');}event.target.value='';});
  $('coach-form').addEventListener('submit',event=>{event.preventDefault();ask($('question').value.trim());});document.querySelectorAll('[data-question]').forEach(el=>el.addEventListener('click',()=>ask(t('question'+el.dataset.question.charAt(0).toUpperCase()+el.dataset.question.slice(1)))));
  window.addEventListener('pagehide',stop);
  document.addEventListener('factorlab:view',renderChart);
  if(typeof ResizeObserver==='function'){
    const chartObserver=new ResizeObserver(()=>{const host=$('nav-chart');if(host.getClientRects().length&&host.clientWidth&&host.clientHeight&&(chartDirty||chartSize!==host.clientWidth+'x'+host.clientHeight))renderChart();});
    chartObserver.observe($('nav-chart'));
  }else window.addEventListener('resize',renderChart);
  function loadEnvelope(value){unpack(value);campaignEpoch++;allocationUndo=null;stop();resetRequest();installSave(value);messages=[];brokenRaw=null;writable=true;noticeKey='';save();render();document.dispatchEvent(new Event('factorlab:restore'));}
  function setProfile(id){
    if(id!==null&&(typeof id!=='string'||!/^[A-Za-z0-9_-]{1,80}$/.test(id)))throw Error('invalidProfile');
    if(id===profileId)return;campaignEpoch++;allocationUndo=null;
    stop();resetRequest();save();
    if(!writable)memoryProfiles.set(SAVE_KEY,{envelope:envelope(),brokenRaw,writable,noticeKey});else memoryProfiles.delete(SAVE_KEY);
    profileId=id;SAVE_KEY=id===null?GUEST_SAVE_KEY:GUEST_SAVE_KEY+'-account-'+id;
    state=E.initial();draft=[...state.weights];factorPrefs=[25,25,25,25];reason='';note='';forecast='flat';reflection='';messages=[];brokenRaw=null;writable=true;noticeKey='';
    const memory=memoryProfiles.get(SAVE_KEY);
    if(memory){installSave(memory.envelope);brokenRaw=memory.brokenRaw;writable=memory.writable;noticeKey=memory.noticeKey;}
    else{const raw=rawGet(SAVE_KEY);if(raw){try{installSave(raw);}catch{brokenRaw=raw;writable=false;noticeKey='corruptSave';}}}
    render();if(!brokenRaw)save();document.dispatchEvent(new CustomEvent('factorlab:profile',{detail:{profileId}}));
  }
  window.FactorLabApp={getSave:()=>E.serialize(state),getState:()=>E.publicView(state),getEnvelope:envelope,loadEnvelope,setProfile,getUI:()=>({lang,busy,writable,playing,profileId,factorPrefs:[...factorPrefs]})};
  render();if(!brokenRaw)save();
})();
