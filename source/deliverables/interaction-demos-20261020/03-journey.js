(() => {
  const $ = s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
  const chapters=$$('[data-chapter]'), nav=$$('[data-step]'), marker=$('.chapter-marker');
  const names=['阅读证据','挑选因子','检查草稿','留下札记'], en=['EVIDENCE','FACTORS','DRAFT','NOTES'];
  const evidenceNames={E1:'订单与盈利',E2:'价格与预期',E3:'长期与短期'};
  let step=0,horizon='long',visited=new Set([0]),evidence=new Set(),factors=new Set(),running=[],cmdIndex=0,commandOpener;
  function animate(el,frames,options={}){const a=Demo.animate(el,frames,{duration:.42,ease:[.22,1,.36,1],...options});running.push(a);return a;}
  function stop(){running.forEach(a=>a.complete?.());running=[];}
  function moveMarker(){
    const button=nav[step], parent=$('.chapter-nav').getBoundingClientRect(),rect=button.getBoundingClientRect();
    animate(marker,{x:rect.left-parent.left,y:rect.top-parent.top,width:rect.width,height:rect.height},{type:'spring',bounce:.12,duration:.5});
  }
  function navigate(next,focus=true){
    if(next<0||next>3)return;
    const direction=next>=step?1:-1;stop();step=next;visited.add(step);
    chapters.forEach((el,i)=>el.hidden=i!==step);
    nav.forEach((el,i)=>{i===step?el.setAttribute('aria-current','step'):el.removeAttribute('aria-current');el.classList.toggle('visited',visited.has(i));});
    $('#chapter-label').textContent=`CHAPTER 0${step+1} / ${en[step]}`;$('#step-counter').textContent=`0${step+1} / 04`;
    $('#visited-count').textContent=`已浏览 ${visited.size} / 4 章`;$('#visited-bar').style.width=`${visited.size*25}%`;
    $('#prev-step').disabled=step===0;$('#next-step').innerHTML=step===3?'回到证据 <span>↶</span>':`${names[step+1]} <span>→</span>`;
    updateSummary();moveMarker();
    animate(chapters[step],{opacity:[0,1],x:[direction*24,0],filter:['blur(3px)','blur(0px)']});
    if(focus)chapters[step].querySelector('h2').focus({preventScroll:true});
  }
  function updateSummary(){
    $('#carry-tags').replaceChildren();
    if(!evidence.size)$('#carry-tags').innerHTML='<small>还没有摘录；回第一章添加</small>';
    [...evidence].sort().forEach(id=>{const tag=document.createElement('span');tag.className='carry-tag';tag.textContent=`${id} ${evidenceNames[id]}`;$('#carry-tags').append(tag);});
    const factorLabels=$$('[data-factor]').filter(b=>factors.has(b.dataset.factor)).map(b=>b.querySelector('strong').textContent);
    $('#note-summary').textContent=`随行证据：${[...evidence].sort().join('、')||'尚未摘录'} · 研究因子：${factorLabels.join('、')||'尚未选择'} · 判断期限：${horizon==='long'?'长期定位':'短期战术'}。`;
  }
  nav.forEach(b=>b.addEventListener('click',()=>navigate(Number(b.dataset.step))));
  $('#next-step').addEventListener('click',()=>navigate((step+1)%4));$('#prev-step').addEventListener('click',()=>navigate(step-1));
  $$('[data-evidence]').forEach(b=>b.addEventListener('click',()=>{
    const id=b.dataset.evidence;evidence.has(id)?evidence.delete(id):evidence.add(id);
    b.setAttribute('aria-pressed',evidence.has(id));b.querySelector('b').textContent=evidence.has(id)?'已摘录':'摘录';
    updateSummary();animate($('#carry-tags'),{y:[5,0],opacity:[.5,1]},{duration:.25});Demo.toast(evidence.has(id)?`${id} 已加入随行摘录`:`${id} 已移出摘录`);
  }));
  $$('[data-factor]').forEach(b=>b.addEventListener('click',()=>{
    const id=b.dataset.factor;factors.has(id)?factors.delete(id):factors.add(id);
    b.setAttribute('aria-pressed',factors.has(id));b.querySelector('i').textContent=factors.has(id)?'✓':'＋';
    animate(b.querySelector('.seal'),{scale:[.85,1]},{type:'spring',duration:.35,bounce:.25});updateSummary();
  }));
  function setHorizon(value){
    horizon=value;$$('[data-horizon]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.horizon===horizon));
    animate($('.horizon-thumb'),{x:horizon==='long'?0:126},{type:'spring',duration:.4,bounce:.1});
    $('#horizon-note').textContent=horizon==='long'?'长期定位：关注产业竞争力与盈利兑现路径，接受验证需要时间。':'短期战术：关注盈利催化、价格预期与执行期限，产业支持本身不足以确定买入时点。';
    updateSummary();
  }
  $$('[data-horizon]').forEach(b=>b.addEventListener('click',()=>setHorizon(b.dataset.horizon)));
  $('#reflection').addEventListener('input',()=>{$('#char-count').textContent=`${$('#reflection').value.length} / 280`;$('#pinned-note').hidden=true;});
  $('#pin-note').addEventListener('click',()=>{
    const text=$('#reflection').value.trim();if(!text){Demo.toast('先写下一条待验证的问题');$('#reflection').focus();return;}
    $('#pinned-note p').textContent=text;$('#pinned-note').hidden=false;animate($('#pinned-note'),{y:[8,0],opacity:[0,1]});Demo.toast('已整理到本页札记');
  });
  const dialog=$('#command-dialog'),search=$('#command-input');
  function commands(){
    const query=search.value.trim().toLowerCase(), keys=['阅读证据 E1 E2 E3 周期 research evidence','挑选因子 质量 价值 动量 低波动 factor','检查草稿 配置 长期 战术 allocation','留下札记 记录 反思 note'];
    $('#command-results').replaceChildren();
    keys.forEach((key,i)=>{if(query&&!key.toLowerCase().includes(query))return;const b=document.createElement('button');b.innerHTML=`<span>0${i+1} ${names[i]}</span><small>${i===step?'当前章节':'前往 →'}</small>`;b.dataset.destination=i;b.addEventListener('click',()=>{dialog.close('navigate');navigate(i);});$('#command-results').append(b);});
    if(!$('#command-results').children.length)$('#command-results').innerHTML='<p class="command-help">没有匹配章节，请试试「因子」或「札记」。</p>';
    cmdIndex=0;highlight();
  }
  function highlight(){$$('#command-results button').forEach((b,i)=>{b.classList.toggle('active',i===cmdIndex);});}
  function openCommand(){commandOpener=document.activeElement;dialog.returnValue='';search.value='';commands();dialog.showModal();search.focus();animate(dialog,{opacity:[0,1],y:[-12,0],scale:[.98,1]},{duration:.2});}
  $('#command-open').addEventListener('click',openCommand);$('#command-close').addEventListener('click',()=>dialog.close());search.addEventListener('input',commands);
  dialog.addEventListener('keydown',e=>{const buttons=$$('#command-results button');if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();if(buttons.length)cmdIndex=(cmdIndex+(e.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length;highlight();}if(e.key==='Enter'&&document.activeElement===search){e.preventDefault();buttons[cmdIndex]?.click();}});
  dialog.addEventListener('close',()=>{if(!dialog.returnValue)commandOpener?.focus({preventScroll:true});});
  document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'&&!e.repeat){e.preventDefault();dialog.open?dialog.close():openCommand();}});
  document.addEventListener('demo:motion',()=>{stop();moveMarker();});
  document.addEventListener('demo:reset',()=>{
    stop();dialog.close('reset');evidence.clear();factors.clear();visited=new Set([0]);$('#reflection').value='';$('#char-count').textContent='0 / 280';$('#pinned-note').hidden=true;
    $$('[data-evidence]').forEach(b=>{b.setAttribute('aria-pressed','false');b.querySelector('b').textContent='摘录';});
    $$('[data-factor]').forEach(b=>{b.setAttribute('aria-pressed','false');b.querySelector('i').textContent='＋';});setHorizon('long');navigate(0,false);
  });
  new ResizeObserver(()=>moveMarker()).observe($('.chapter-nav'));
  navigate(0,false);
})();
