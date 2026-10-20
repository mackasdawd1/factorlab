(async function() {
  'use strict';
  const staticHosting=document.querySelector('meta[name="factorlab-hosting"]')?.content==='static';
  const E=window.FactorLabSimulation, $=id=>document.getElementById(id);
  const GUEST_SAVE_KEY='factorlab-simulation-ui-v3', LANG_KEY='factorlab-simulation-language-v3';
  const memoryProfiles=new Map();
  let SAVE_KEY=GUEST_SAVE_KEY,profileId=null;
  const PHASES={decision:'phaseDecision',simulating:'phaseSimulating',event:'phaseEvent',review:'phaseReview',complete:'phaseComplete'};
  const COLORS=['#CA9C68','#a8bcba','#c2b9a6','#b78f7e','#9faccb','#717f76'];
  const feedback=(kind,stage,extra={})=>document.dispatchEvent(new CustomEvent('factorlab:feedback',{detail:{kind,stage,...extra}}));
  let campaignEpoch=0;
  const clone=v=>JSON.parse(JSON.stringify(v));
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let lang='zh-CN',state=E.initial(),draft=[...state.weights],factorPrefs=[25,25,25,25];
  let reason='',note='',forecast='flat',reflection='',writable=true,brokenRaw=null,noticeKey='';
  let timer=null,playing=false,speed=180,busy=false,requestId=0,controller=null,messages=[],evidenceOpen='';
  const rawGet=key=>{try{return localStorage.getItem(key);}catch{writable=false;noticeKey='saveBlocked';return null;}};
  const storedLang=rawGet(LANG_KEY)||rawGet('factorlab-simulation-language');if(['zh-CN','en'].includes(storedLang))lang=storedLang;
  const staticCoach={'zh-CN':{coachRule:'公开版 · 规则提示',coachIntro:'公开版未连接在线 AI。以下提示根据当前可见数据与固定规则生成，用于辅助复盘。'},en:{coachRule:'Public version · Rule guidance',coachIntro:'The public version has no connected online AI. Guidance uses visible data and fixed rules to support reflection.'}};
  await i18next.init({lng:lang,fallbackLng:'zh-CN',keySeparator:false,initImmediate:false,interpolation:{escapeValue:false},resources:Object.fromEntries(['zh-CN','en'].map(l=>[l,{translation:{...E.TEXTS[l],...FactorLabStrings[l],...(staticHosting?staticCoach[l]:{}),...(l==='en'?{sectorShort0:'Semicon',sectorShort3:'Energy',sectorShort4:'AI infra'}:{})}}]))});
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
    const history=state.history||[];const W=Math.max(160,host.clientWidth),H=Math.max(100,host.clientHeight),left=75,right=22,top=18,bottom=35;
    const values=history.flatMap(h=>[h.nav,h.benchmarkNav,h.anchorNav]).filter(Number.isFinite);
    let min=Math.min(99500,...values),max=Math.max(100500,...values),padding=(max-min)*.12;min-=padding;max+=padding;
    const xmax=Math.max(20,state.day),x=day=>left+day/xmax*(W-left-right),y=v=>top+(max-v)/(max-min)*(H-top-bottom);
    let svg=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(t('chartLabel'))}" xmlns="http://www.w3.org/2000/svg">`;
    for(let n=0;n<4;n++){const v=min+(max-min)*n/3,yy=y(v);svg+=`<line x1="${left}" x2="${W-right}" y1="${yy}" y2="${yy}" stroke="#e8e8e8" stroke-dasharray="3 4"/><text x="${left-10}" y="${yy+5}" text-anchor="end" font-size="14">${esc(number(v))}</text>`;}
    for(let n=0;n<=4;n++){const day=Math.round(xmax*n/4);svg+=`<text x="${x(day)}" y="${H-5}" text-anchor="middle" font-size="14">${esc(t('eventDay',{day}))}</text>`;}
    for(const [field,color] of [['anchorNav','#a8a8a8'],['benchmarkNav','#292929'],['nav','#ec641c']]){const points=history.filter(h=>Number.isFinite(h[field])).map(h=>`${x(h.day)},${y(h[field])}`).join(' ');svg+=`<polyline data-series="${field}" points="${points}" stroke="${color}" stroke-width="${field==='nav'?3:1.8}" ${field==='benchmarkNav'?'stroke-dasharray="6 5"':''} fill="none" stroke-linejoin="round" stroke-linecap="round"/>`;}
    svg+='</svg>';host.innerHTML=svg+(state.day===0?`<div class="empty-chart">${esc(t('chartEmpty'))}</div>`:'');
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
    $('heatmap').innerHTML=state.prices.map((p,i)=>{const change=p/initialPrices[i]-1;return `<div class="sector-tile ${change<0?'down':change>0?'up':''}"><span title="${esc(t('sector'+i))}">${esc(t('sectorShort'+i))}</span><strong>${percent(change,1,true)}</strong><small>${number(p,2)}</small></div>`;}).join('');
    renderChart();document.querySelectorAll('[data-width]').forEach(el=>el.style.width=el.dataset.width+'%');
  }
  function renderEvents(){
    const focusedEvidence=document.activeElement?.dataset.evidence;
    const backgroundOpen=$('events').querySelector('.event-background')?.open,timelineOpen=$('events').querySelector('.event-timeline')?.open;
    const events=[...(state.events||[])].reverse();
    const evidence=E.publicView(state).evidence;
    const cards=`<div class="evidence-grid">${evidence.map(e=>`<button class="evidence-button ${(state.seen||[]).includes(e.id)?'read':''}" data-evidence="${esc(e.id)}" aria-expanded="${evidenceOpen===e.id}"><small>${esc(e.id)} · ${esc(t((state.seen||[]).includes(e.id)?'inspected':'inspect'))}</small><strong>${esc(t(e.titleKey))}</strong></button>`).join('')}</div>`;
    const open=evidence.find(e=>e.id===evidenceOpen);
    const eventHTML=ev=>`<article class="event-row"><span class="event-index">${esc(ev.id.replace(/[^0-9]/g,'')||ev.startDay)}</span><div><div class="event-meta"><span>${esc(t('eventDay',{day:ev.startDay}))}</span><b>${esc(t(ev.status==='resolved'||state.day>=ev.startDay+ev.duration?'eventResolved':'eventActive'))}</b></div><h3>${esc(t(ev.titleKey))}</h3><p>${esc(t(ev.bodyKey))}</p></div></article>`;
    const latest=events.length?eventHTML(events[0]):`<details class="event-background" ${backgroundOpen?'open':''}><summary>${esc(t('eventInitialTitle'))}</summary><p>${esc(t('eventInitialBody'))}</p></details>`;
    const earlier=events.length>1?`<details class="event-timeline" ${timelineOpen?'open':''}><summary>${lang==='en'?'Earlier events':'此前事件'} · ${events.length-1}</summary>${events.slice(1).map(eventHTML).join('')}</details>`:'';
    $('events').innerHTML=cards+(open?`<p class="evidence-detail">${esc(t(open.bodyKey))}</p>`:'')+latest+earlier;
    document.querySelectorAll('[data-evidence]').forEach(el=>el.addEventListener('click',()=>{evidenceOpen=evidenceOpen===el.dataset.evidence?'':el.dataset.evidence;if(!busy&&state.phase==='decision'&&!(state.seen||[]).includes(el.dataset.evidence))act({type:'read',id:el.dataset.evidence});else renderEvents();}));
    $('event-control').hidden=state.phase!=='event';$('resume').disabled=busy;
    if(focusedEvidence){const control=[...$('events').querySelectorAll('[data-evidence]')].find(el=>el.dataset.evidence===focusedEvidence);if(control?.getClientRects().length)control.focus({preventScroll:true});}
  }
  function renderAllocation(){
    const focusedWeight=$('allocation').contains(document.activeElement)?document.activeElement.id:null;
    const locked=state.phase!=='decision'||busy;
    $('allocation').innerHTML=draft.map((v,i)=>`<div class="allocation-row"><label for="weight-${i}">${esc(t('sector'+i))}</label><small title="${esc(t('current'))}">${percent(state.weights[i],1)}</small><div class="allocation-input"><input id="weight-${i}" aria-label="${esc(t('target')+' '+t('sector'+i))}" type="number" min="0" max="${i===5?100:40}" step="1" value="${(v*100).toFixed(2).replace(/\.00$/,'')}" ${locked?'disabled':''}></div></div>`).join('');
    document.querySelectorAll('.allocation-row label').forEach((el,i)=>el.style.setProperty('--sector-color',COLORS[i]));
    draft.forEach((_,i)=>$('weight-'+i).addEventListener('change',()=>{
      const value=Number($('weight-'+i).value)/100;
      if(!Number.isFinite(value)||value<0||value>(i===5?1:.4)){renderAllocation();showNotice('invalidWeights');return;}
      if(i<5){const newCash=draft[5]+draft[i]-value;if(newCash< -1e-9){renderAllocation();showNotice('invalidWeights');return;}draft[i]=value;draft[5]=Math.max(0,newCash);}
      else{const invested=draft.slice(0,5).reduce((a,b)=>a+b,0);const proposed=invested>0?draft.slice(0,5).map(w=>w/invested*(1-value)):Array(5).fill((1-value)/5);if(proposed.some(w=>w>.4+1e-9)){renderAllocation();showNotice('invalidWeights');return;}draft=[...proposed,value];}
      noticeKey=writable?'':noticeKey;renderAllocation();save();
    }));
    const factors=normalizedFactors();$('factors').innerHTML=factorPrefs.map((value,i)=>`<div class="factor-row"><label for="factor-${i}">${esc(t('factor'+i))}</label><input id="factor-${i}" type="range" min="0" max="100" step="5" value="${value}" ${locked?'disabled':''}><output id="factor-value-${i}" for="factor-${i}">${number(factors[i]*100,0)}%</output></div>`).join('');
    factorPrefs.forEach((_,i)=>$('factor-'+i).addEventListener('input',()=>{factorPrefs[i]=Number($('factor-'+i).value);const current=normalizedFactors();current.forEach((v,j)=>$('factor-value-'+j).textContent=number(v*100,0)+'%');updateDraftSummary();save();}));
    document.querySelectorAll('[data-preset]').forEach(el=>el.disabled=locked);$('apply-factors').disabled=locked;
    if($('reason').value!==reason)$('reason').value=reason;if($('note').value!==note)$('note').value=note;if($('forecast').value!==forecast)$('forecast').value=forecast;
    for(const id of ['reason','note','forecast'])$(id).disabled=locked;
    updateDraftSummary();
    if(focusedWeight&&$(focusedWeight)&&!$(focusedWeight).disabled&&$(focusedWeight).getClientRects().length)$(focusedWeight).focus({preventScroll:true});
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
      $('review-content').innerHTML=[['roundReturn',percent(result.returnValue,2,true)],['counterfactual',money(result.tacticalAmount,true)],['anchorDifference',money(state.nav-state.anchorNav,true)],['reward',number(result.reward?.points||0)]].map(([key,value])=>`<div class="review-stat"><span>${esc(t(key))}</span><strong>${value}</strong></div>`).join('')+`<p>${esc(t('forecastActual',{forecast:t('forecast'+predicted.charAt(0).toUpperCase()+predicted.slice(1)),actual:t('forecast'+String(actual).charAt(0).toUpperCase()+String(actual).slice(1))}))}</p><div class="badges">${(result.reward?.badges||[]).map(key=>`<span class="badge">${esc(t(key))}</span>`).join('')}</div><p>${esc(t('rewardHint'))}</p>`;
    }
    $('next-round').hidden=finished();$('next-round').disabled=busy;$('replay').hidden=!finished();
    $('history').innerHTML=state.results.length?state.results.map((r,i)=>`<div class="history-row"><span>${esc(t('roundShort',{round:i+1}))}</span><span>${esc(reasonText(r.reason||''))}</span><strong class="${r.returnValue<0?'negative':'positive'}">${percent(r.returnValue,2,true)}</strong></div>`).join(''):`<p class="history-empty">${esc(t('journalEmpty'))}</p>`;
    if($('reflection').value!==reflection)$('reflection').value=reflection;
  }
  function renderMessages(){
    $('messages').innerHTML=messages.map(msg=>`<div class="message ${msg.role}"><small>${esc(t(msg.role==='user'?'messageYou':msg.mode==='live'?'coachLive':msg.mode==='fallback'?'coachFallback':'coachRule'))} · ${esc(t('eventDay',{day:msg.day}))}</small><p>${esc(msg.summary)}</p>${msg.detail?`<details><summary>${esc(t('references'))}</summary><p>${esc(msg.detail)}</p><div class="references">${esc((msg.references||[]).join(' · '))}</div></details>`:''}${msg.lang!==lang?`<small>${esc(t('messageLanguage'))}</small>`:''}</div>`).join('')+(busy?`<p class="footnote">${esc(t('coachThinking'))}</p>`:'');
    $('messages').scrollTop=$('messages').scrollHeight;
    const last=messages.filter(m=>m.role==='assistant').at(-1);$('coach-mode').textContent=t(last?.mode==='live'?'coachLive':last?.mode==='fallback'?'coachFallback':'coachRule');
    $('question').disabled=busy;$('ask').disabled=busy;document.querySelectorAll('[data-question]').forEach(el=>el.disabled=busy);
  }
  function render(){document.body.dataset.phase=state.phase;translate();renderMarket();renderEvents();renderAllocation();renderRisk();renderReview();renderMessages();showNotice();$('save-status').textContent=t(writable?'saved':'memoryOnly');document.dispatchEvent(new CustomEvent('factorlab:render',{detail:{phase:state.phase,day:state.day,round:state.round,lang}}));}
  function stop(){clearTimeout(timer);timer=null;playing=false;}
  function act(action){try{const previousResults=state.results.length;state=E.reduce(state,action);if(state.phase!=='simulating')stop();if(action.type==='next'){draft=state.weights.map((v,i)=>i<5?Math.min(.4,v):v);draft[5]=1-draft.slice(0,5).reduce((a,b)=>a+b,0);reason='';note='';forecast='flat';}save();render();if(state.results.length>previousResults){const result=lastResult();feedback('settlement','success',{id:campaignEpoch+':'+state.day,returnValue:result.returnValue,milestone:state.phase==='complete'||Boolean(result.reward?.badges?.length)});}return true;}catch(error){showNotice(FactorLabStrings[lang][error.message]?error.message:'actionError');return false;}}
  function schedule(){if(!playing||state.phase!=='simulating'||busy)return;timer=setTimeout(()=>{if(act({type:'advance',days:1})&&playing)schedule();},speed);}
  function startPlayback(){if(matchMedia('(prefers-reduced-motion: reduce)').matches){act({type:'advance',days:state.daysPerRound});return;}playing=true;updateDraftSummary();schedule();}
  function download(data,name,type='application/json'){const url=URL.createObjectURL(new Blob([data],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1500);}
  function resetRequest(){feedback('coach','cancel',{id:requestId});requestId++;controller?.abort();controller=null;busy=false;}
  async function ask(question){
    if(busy||!question.trim())return;const id=++requestId,atDay=state.day,atLang=lang;stop();busy=true;if(!staticHosting)feedback('coach','start',{id});
    const history=messages.slice(-6).map(m=>({role:m.role,content:m.summary}));messages.push({role:'user',summary:question,day:atDay,lang:atLang});renderMessages();renderAllocation();
    const current=clone(state);let answer;
    if(staticHosting)answer={...E.sampleReply(current,question,atLang),mode:'example'};
    else{
      controller=new AbortController();const timeout=setTimeout(()=>controller?.abort(),9500);
      try{if(location.protocol==='file:')throw Error('offline');const response=await fetch('/api/coach-v2',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({save:E.serialize(current),question,lang:atLang,history}),signal:controller.signal});if(!response.ok)throw Error('network');answer=await response.json();if(typeof answer.summary!=='string'||typeof answer.detail!=='string'||!['live','example','fallback'].includes(answer.mode))throw Error('schema');}
      catch{answer={...E.sampleReply(current,question,atLang),mode:'fallback'};}
      finally{clearTimeout(timeout);}
    }
    if(id!==requestId)return;busy=false;controller=null;messages.push({...answer,role:'assistant',day:atDay,lang:atLang});messages=messages.slice(-14);$('question').value='';render();feedback('coach',staticHosting||answer.mode==='fallback'?'fallback':'success',{id});
  }
  const pauseForDialog=()=>{stop();updateDraftSummary();};
  document.addEventListener('factorlab:pause',pauseForDialog);
  $('settings').addEventListener('click',()=>{pauseForDialog();$('settings-dialog').showModal();});$('close-settings').addEventListener('click',()=>$('settings-dialog').close());
  $('language').addEventListener('change',async()=>{const next=$('language').value;if(!['zh-CN','en'].includes(next))return;lang=next;await i18next.changeLanguage(lang);try{localStorage.setItem(LANG_KEY,lang);}catch{}render();});
  $('speed').addEventListener('change',()=>{speed=Number($('speed').value);});
  $('reason').addEventListener('change',()=>{reason=$('reason').value;updateDraftSummary();save();});$('note').addEventListener('input',()=>{note=$('note').value;save();});$('forecast').addEventListener('change',()=>{forecast=$('forecast').value;save();});$('reflection').addEventListener('input',()=>{reflection=$('reflection').value;save();});
  document.querySelectorAll('[data-preset]').forEach(el=>el.addEventListener('click',()=>{if(state.phase!=='decision'||busy)return;draft=el.dataset.preset==='defensive'?[.12,.12,.13,.13,.10,.40]:el.dataset.preset==='growth'?[.30,.18,.10,.10,.27,.05]:[.20,.20,.15,.15,.15,.15];renderAllocation();save();}));
  $('apply-factors').addEventListener('click',()=>{if(!factorPrefs.some(v=>v>0)){showNotice('invalidFactors');return;}try{draft=E.recommend(state,normalizedFactors(),draft[5]);renderAllocation();save();}catch{showNotice('invalidFactors');}});
  $('confirm').addEventListener('click',()=>{if(busy||state.phase!=='decision')return;if(!reason){showNotice('missingReason');return;}if(act({type:'lock',weights:draft,factorWeights:normalizedFactors(),reason:reason+(note?' · '+note:''),forecast}))startPlayback();});
  $('pause-play').addEventListener('click',()=>{if(playing)stop();else{playing=true;schedule();}updateDraftSummary();});$('fast-forward').addEventListener('click',()=>{stop();act({type:'advance',days:state.daysPerRound});});$('resume').addEventListener('click',()=>{if(!busy&&act({type:'resume'})&&state.phase==='simulating')startPlayback();});$('next-round').addEventListener('click',()=>{if(!busy)act({type:'next'});});
  $('model-info').addEventListener('click',()=>{pauseForDialog();$('method-dialog').showModal();});$('close-method').addEventListener('click',()=>$('method-dialog').close());
  const openNew=()=>{pauseForDialog();$('settings-dialog').close();$('new-dialog').showModal();};$('new-game').addEventListener('click',openNew);$('replay').addEventListener('click',openNew);$('cancel-new').addEventListener('click',()=>$('new-dialog').close());
  $('start-new').addEventListener('click',()=>{let next;try{next=E.initial({seed:Number($('seed').value),scenario:$('scenario').value});}catch{showNotice('actionError');return;}stop();resetRequest();campaignEpoch++;state=next;draft=[...state.weights];factorPrefs=[25,25,25,25];reason='';note='';forecast='flat';reflection='';messages=[];brokenRaw=null;writable=true;noticeKey='';$('new-dialog').close();save();render();window.scrollTo({top:0});});
  $('save-now').addEventListener('click',()=>{save();feedback('save',writable?'success':'failure');});$('export-save').addEventListener('click',()=>download(brokenRaw||JSON.stringify(envelope(),null,2),'FactorLab-save-day-'+state.day+'.json'));
  $('import-save').addEventListener('change',async event=>{const file=event.target.files[0];if(!file)return;try{if(file.size>500000)throw Error('large');const raw=await file.text();const verified=unpack(raw);campaignEpoch++;stop();resetRequest();installSave(raw);messages=[];brokenRaw=null;writable=true;noticeKey='imported';save();render();$('settings-dialog').close();}catch{showNotice('invalidSave');}event.target.value='';});
  $('coach-form').addEventListener('submit',event=>{event.preventDefault();ask($('question').value.trim());});document.querySelectorAll('[data-question]').forEach(el=>el.addEventListener('click',()=>ask(t('question'+el.dataset.question.charAt(0).toUpperCase()+el.dataset.question.slice(1)))));
  window.addEventListener('pagehide',stop);
  document.addEventListener('factorlab:view',renderChart);
  if(typeof ResizeObserver==='function'){
    const chartObserver=new ResizeObserver(()=>{const host=$('nav-chart');if(host.getClientRects().length&&host.clientWidth&&host.clientHeight&&(chartDirty||chartSize!==host.clientWidth+'x'+host.clientHeight))renderChart();});
    chartObserver.observe($('nav-chart'));
  }else window.addEventListener('resize',renderChart);
  function loadEnvelope(value){unpack(value);campaignEpoch++;stop();resetRequest();installSave(value);messages=[];brokenRaw=null;writable=true;noticeKey='';save();render();document.dispatchEvent(new Event('factorlab:restore'));}
  function setProfile(id){
    if(id!==null&&(typeof id!=='string'||!/^[A-Za-z0-9_-]{1,80}$/.test(id)))throw Error('invalidProfile');
    if(id===profileId)return;campaignEpoch++;
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
