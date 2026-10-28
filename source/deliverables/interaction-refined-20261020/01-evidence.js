(() => {
  'use strict';
  const orders = [48,48.6,47.9,49.2,48.6,49,48.4,48.9,48,48.7,48,48.3,47.4,47.8,46.7,47,46.9,48,47.1,48,48,48.6,47.9,49.2,48.6,49,48.4,48.9,48,48.7,48,48.9,48.6,49.6,49.1,50,49.5,50.2,48.9,49.4,49,49.1,48.1,49,48,48,47.8,48.7,48.2,49.3,49,49.7,49.2,50,49.3,50,49.5,50.2,48.9,49.4,49,49.6,48.9,50.2,49.6,50,49.4,49.9,49,49.7,49,49.9,49.6,50.6,50.1,51,50.5,51.2,49.9,50.4,50,50.8,50.3,51.8,51.4,52,51.4,51.9,51,51.7,51,51.9,51.6,52.6,52.1,53,52.5,53.2,51.9,52.4,52,52.8,52.3,53.8,53.4,54,53.4,53.9,53,53.7,53,53.9,53.6,54.6,54.1,55,54.7,55.3,54.8,55];
  const profits = [50,50,49.4,49.7,49.1,49,49,49.5,49.4,50,50,50,49.5,49.6,49,49,48.9,49.3,48.8,49.1,49,49,48.4,48.7,48.1,48,48,48.5,48.4,49,49,49,48.5,48.6,48,48,48.1,48.7,48.4,48.9,49,49,48.4,48.7,48.1,48,48,48.5,48.4,49,49,49.2,48.9,49.2,48.8,49,48.7,48.9,48.2,48.3,48,48.4,48.2,48.9,48.7,49,48.6,48.7,48.2,48.4,48,48.4,48.3,48.8,48.6,49,48.9,49.3,48.8,49.1,49,49,48.4,48.7,48.1,48,48,48.5,48.4,49,49,49.2,48.9,49.2,48.8,49,49.1,49.7,49.4,49.9,50,50,49.4,49.7,49.1,49,49,49.5,49.4,50,50,50.2,49.9,50.2,49.8,50,49.9,50.1,49.9,50];
  const samples = orders.map((order,index) => ({order,profit:profits[index],date:new Date(Date.UTC(2025,0,6+Math.floor(index/5)*7+index%5)).toISOString().slice(0,10)}));
  const evidence = {
    E1:{title:'订单 ≠ 盈利',summary:'订单向好，盈利仍待确认。',facts:['示意样本末点：订单 <strong>55.0</strong>，盈利 <strong>50.0</strong>。','需求修复，尚未同步成为盈利改善。','核对毛利率与现金流是否跟上。']},
    E2:{title:'预期，可能已定价',summary:'好消息，可能已被定价。',facts:['景气改善，可能已进入市场预期。','行业变好，不代表当前价格便宜。','把估值预期与盈利证据放在一起。']},
    E3:{title:'长期 ≠ 短期',summary:'长期支持，不等于本轮买点。',facts:['技术与产业投入支持长期跟踪。','长期方向不能直接解释本轮加仓。','写清期限，以及改变判断的条件。']}
  };
  const chart = document.getElementById('chart-interaction'), svg = document.getElementById('history-chart'), tooltip = document.getElementById('chart-tooltip');
  const dialog = document.getElementById('evidence-dialog'), content = document.getElementById('dialog-content');
  const status = document.getElementById('chart-status');
  let period = 24, selected = samples.length-1, geometry, tooltipVisible = false;
  let activeEvidence = 'E1', dialogPhase = 'closed', dialogEpoch = 0, dialogTimer, dialogMotion, origin;
  let extracts = [], undo = [], metricTimers = new Map(), metricMotion = new Map(), introMotion = [];
  const api = () => window.Demo || {reduced:()=>true,animate:()=>null,toast:()=>{}};
  const motion = (node,frames,options) => api().reduced() ? null : api().animate(node,frames,options);
  const stop = control => { try { control?.stop?.(); control?.cancel?.(); } catch (_) {} };
  const visibleCount = () => period*5;
  const startIndex = () => samples.length-visibleCount();
  const visibleSamples = () => samples.slice(startIndex());
  const card = id => document.querySelector(`[data-evidence="${id}"]`);
  const labelDate = date => date.replaceAll('-','.');

  function exactMetric(id,value,animate=true) {
    const node = document.getElementById(id), next = value.toFixed(1), old = node.dataset.value || node.textContent.trim();
    clearTimeout(metricTimers.get(id));
    (metricMotion.get(id)||[]).forEach(stop);
    node.dataset.value = next; node.setAttribute('aria-label',next);
    if (old===next || !animate || api().reduced()) { node.innerHTML = `<span>${next}</span>`; return; }
    node.innerHTML = `<span aria-hidden="true">${old}</span><span aria-hidden="true">${next}</span>`;
    const [outgoing,incoming] = node.children;
    metricMotion.set(id,[motion(outgoing,{opacity:[1,0],transform:['translateY(0)','translateY(-10px)']},{duration:.16}),motion(incoming,{opacity:[0,1],transform:['translateY(10px)','translateY(0)']},{duration:.18})]);
    metricTimers.set(id,setTimeout(()=>{node.innerHTML=`<span>${next}</span>`;metricMotion.delete(id);},190));
  }
  function updatePoint(index,animate=true,announce=false) {
    selected = Math.max(startIndex(),Math.min(samples.length-1,index));
    const point = samples[selected], local = selected-(startIndex());
    chart.setAttribute('aria-valuemin','1'); chart.setAttribute('aria-valuemax',String(visibleCount())); chart.setAttribute('aria-valuenow',String(local+1));
    const description = `${point.date}，订单 ${point.order.toFixed(1)}，盈利 ${point.profit.toFixed(1)}，模拟指数`;
    chart.setAttribute('aria-valuetext',description);
    document.getElementById('selected-date').textContent = labelDate(point.date);
    exactMetric('order-number',point.order,animate); exactMetric('profit-number',point.profit,animate);
    if (!geometry) return;
    const {x,y,height,width,bottom,top} = geometry, px=x(local), py=y(point.order);
    svg.querySelector('#crosshair').setAttribute('d',`M${px},${top}V${bottom}`);
    svg.querySelector('#crosshair').style.opacity=tooltipVisible?'1':'0';
    svg.querySelector('#order-dot').setAttribute('cx',px); svg.querySelector('#order-dot').setAttribute('cy',py);
    svg.querySelector('#order-halo').setAttribute('cx',px); svg.querySelector('#order-halo').setAttribute('cy',py);
    svg.querySelector('#profit-dot').setAttribute('cx',px); svg.querySelector('#profit-dot').setAttribute('cy',y(point.profit));
    tooltip.hidden = !tooltipVisible;
    tooltip.innerHTML = `<time>${point.date}</time><div class="tip-primary">订单<strong>${point.order.toFixed(1)}</strong></div><div>盈利<strong>${point.profit.toFixed(1)}</strong></div>`;
    const tipWidth = innerWidth<=700?138:158, tipLeft = px+18+tipWidth<width ? px+18 : px-tipWidth-18;
    tooltip.style.left = `${Math.max(38,Math.min(width-tipWidth-4,tipLeft))}px`;
    tooltip.style.top = `${Math.max(4,Math.min(height-112,py<112?py+20:py-112))}px`;
    if (announce) status.textContent = description;
  }
  function renderChart(animateNumbers=false) {
    const width = chart.clientWidth, height=chart.clientHeight, left=38,right=width-14,top=20,bottom=height-30, values=visibleSamples();
    const extent=values.flatMap(point=>[point.order,point.profit]);
    const low=Math.floor(Math.min(...extent)-.7),high=Math.ceil(Math.max(...extent)+.7);
    const levels=[low,(low+high)/2,high];
    const x = index => left+index*(right-left)/(values.length-1), y = value => bottom-(value-low)/(high-low)*(bottom-top);
    geometry={x,y,width,height,left,right,top,bottom}; svg.setAttribute('viewBox',`0 0 ${width} ${height}`);svg.dataset.samples=values.length;
    document.getElementById('sample-note').textContent=`${values.length} 个日度合成样本`;
    const path = field => {
      const points=values.map((point,index)=>({x:x(index),y:y(point[field])}));
      const slopes=points.slice(1).map((point,index)=>(point.y-points[index].y)/(point.x-points[index].x));
      const tangents=points.map((_,index)=>{
        if(!index)return slopes[0];
        if(index===points.length-1)return slopes.at(-1);
        const before=slopes[index-1],after=slopes[index];
        return before*after<=0?0:2*before*after/(before+after);
      });
      return `M${points[0].x},${points[0].y}`+points.slice(1).map((point,index)=>{
        const previous=points[index],step=(point.x-previous.x)/3;
        return `C${previous.x+step},${previous.y+tangents[index]*step} ${point.x-step},${point.y-tangents[index+1]*step} ${point.x},${point.y}`;
      }).join(' ');
    };
    const ticks = [...new Set([0,Math.round((values.length-1)/3),Math.round(2*(values.length-1)/3),values.length-1])];
    svg.innerHTML = `<defs><linearGradient id="area-shade" x1="0" x2="0" y1="0" y2="1"><stop stop-color="#814d68" stop-opacity=".16"/><stop offset="1" stop-color="#814d68" stop-opacity="0"/></linearGradient></defs>
      <g stroke="#d3d1ca" stroke-width=".55">${levels.map(value=>`<path d="M${left},${y(value)}H${right}"/>`).join('')}</g>
      <g fill="#929087" font-family="Segoe UI,Microsoft YaHei,sans-serif" font-size="10">${levels.map(value=>`<text x="4" y="${y(value)+3}">${value}</text>`).join('')}${ticks.map((index,i)=>`<text x="${x(index)}" y="${height-5}" text-anchor="${i===0?'start':i===ticks.length-1?'end':'middle'}">${values[index].date.slice(5).replace('-','/')}</text>`).join('')}</g>
      <path d="${path('order')}L${right},${bottom}L${left},${bottom}Z" fill="url(#area-shade)"/>
      <path id="profit-line" d="${path('profit')}" fill="none" stroke="#a4a19a" stroke-width="1.05" stroke-dasharray="3 4" stroke-linejoin="round"/>
      <path id="order-line" d="${path('order')}" fill="none" stroke="#814d68" stroke-width="1.55" stroke-linecap="round" stroke-linejoin="round"/>
      <path id="crosshair" fill="none" stroke="#814d68" stroke-opacity=".55" stroke-width=".8" stroke-dasharray="3 4"/>
      <circle id="profit-dot" r="2.6" fill="#a4a19a" stroke="#eeede8" stroke-width="1.5"/>
      <circle id="order-halo" r="8" fill="#814d68" fill-opacity=".11"/>
      <circle id="order-dot" r="3.7" fill="#814d68" stroke="#eeede8" stroke-width="1.5"/>`;
    updatePoint(selected,animateNumbers);
  }
  function pointFromPointer(event) {
    const rect = chart.getBoundingClientRect(), localX=event.clientX-rect.left;
    const index = Math.round((localX-geometry.left)/(geometry.right-geometry.left)*(visibleCount()-1));
    tooltipVisible=true; updatePoint(startIndex()+index,true,event.pointerType==='touch');
  }
  chart.addEventListener('pointermove',event=>{if(event.pointerType!=='touch'||event.buttons)pointFromPointer(event);});
  chart.addEventListener('pointerdown',event=>{pointFromPointer(event);chart.setPointerCapture(event.pointerId);chart.focus({preventScroll:true});});
  chart.addEventListener('pointerleave',()=>{if(document.activeElement!==chart){tooltipVisible=false;tooltip.hidden=true;svg.querySelector('#crosshair').style.opacity='0';}});
  chart.addEventListener('focus',()=>{tooltipVisible=true;updatePoint(selected,false);});
  chart.addEventListener('keydown',event=>{
    const keys={ArrowLeft:selected-1,ArrowRight:selected+1,Home:startIndex(),End:samples.length-1};
    if(keys[event.key]===undefined)return;
    event.preventDefault();tooltipVisible=true;updatePoint(keys[event.key],true,true);
  });
  document.querySelectorAll('[data-period]').forEach(button=>button.addEventListener('click',()=>{
    if(period===Number(button.dataset.period))return;
    period=Number(button.dataset.period); selected=Math.max(startIndex(),selected);
    document.querySelectorAll('[data-period]').forEach(item=>item.setAttribute('aria-pressed',String(item===button)));
    renderChart(true);motion(svg,{opacity:[.35,1]},{duration:.2});status.textContent=`显示 ${period} 周、${visibleCount()} 个日度合成样本。`;
  }));

  function resetDialogMotion() {
    dialogEpoch+=1;clearTimeout(dialogTimer);stop(dialogMotion);dialogMotion=null;
  }
  function renderEvidence(id) {
    activeEvidence=id; const data=evidence[id];
    content.innerHTML=`<p class="dialog-kicker">${id} / 研究证据</p><h2 id="dialog-title" tabindex="-1">${data.title}</h2><dl class="evidence-facts">${['发生什么','意味着什么','下一步查什么'].map((label,index)=>`<div><dt>${label}</dt><dd>${data.facts[index]}</dd></div>`).join('')}</dl>`;
    document.querySelectorAll('[data-dialog-evidence]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.dialogEvidence===id)));
    document.getElementById('save-extract').innerHTML=extracts.includes(id)?'已摘录 · 返回图表 <span aria-hidden="true">↘</span>':'摘录结论并关闭 <span aria-hidden="true">↘</span>';
  }
  function openEvidence(id,trigger) {
    if(!evidence[id])return;
    const wasOpen=dialog.open, interruptedClose=dialogPhase==='closing';
    const startOpacity=wasOpen?getComputedStyle(dialog).opacity:'0',startTransform=wasOpen?getComputedStyle(dialog).transform:'translateY(18px) scale(.975)';
    resetDialogMotion();dialog.removeAttribute('data-closing');origin=trigger||card(id);
    renderEvidence(id);
    if(!dialog.open)dialog.showModal();
    dialogPhase='opening';
    dialog.style.opacity='1';dialog.style.transform='none';
    if(!wasOpen||interruptedClose)dialogMotion=motion(dialog,{opacity:[startOpacity,1],transform:[startTransform,'translateY(0px) scale(1)']},{duration:.28,ease:[.2,.8,.2,1]});
    else dialogMotion=motion(content,{opacity:[.25,1],transform:['translateY(5px)','translateY(0px)']},{duration:.18});
    const epoch=dialogEpoch;
    const finish=()=>{if(epoch!==dialogEpoch)return;dialogPhase='open';dialog.style.opacity='1';dialog.style.transform='none';content.style.opacity='1';content.style.transform='none';document.getElementById('dialog-title')?.focus({preventScroll:true});};
    if(api().reduced())finish();else dialogTimer=setTimeout(finish,290);
  }
  function finishClose(restore=true) {
    resetDialogMotion();dialogPhase='closed';dialog.removeAttribute('data-closing');dialog.close();
    dialog.style.opacity='';dialog.style.transform='';content.style.opacity='';content.style.transform='';
    if(restore&&origin?.isConnected)origin.focus({preventScroll:true});
  }
  function closeEvidence() {
    if(!dialog.open||dialogPhase==='closing')return;
    const currentOpacity=getComputedStyle(dialog).opacity,currentTransform=getComputedStyle(dialog).transform;
    resetDialogMotion();dialogPhase='closing';dialog.dataset.closing='true';
    if(api().reduced()){finishClose();return;}
    dialogMotion=motion(dialog,{opacity:[currentOpacity,0],transform:[currentTransform,'translateY(10px) scale(.985)']},{duration:.18,ease:'easeIn'});
    const epoch=dialogEpoch;dialogTimer=setTimeout(()=>{if(epoch===dialogEpoch)finishClose();},190);
  }
  function renderExtracts() {
    document.getElementById('extract-count').textContent=extracts.length?`${extracts.length} 条结论已摘录`:'尚未摘录';
    document.getElementById('undo-extract').disabled=!undo.length;
    document.getElementById('extract-list').innerHTML=extracts.map(id=>`<li><span>${id}</span>${evidence[id].summary}<button type="button" data-remove="${id}" aria-label="移除 ${id} 摘录">×</button></li>`).join('');
    Object.keys(evidence).forEach(id=>{card(id).dataset.saved=String(extracts.includes(id));card(id).querySelector('.card-meta i').textContent=extracts.includes(id)?'已摘录':'↗';});
  }
  document.querySelectorAll('[data-evidence]').forEach(button=>button.addEventListener('click',()=>openEvidence(button.dataset.evidence,button)));
  document.querySelectorAll('[data-dialog-evidence]').forEach(button=>button.addEventListener('click',()=>openEvidence(button.dataset.dialogEvidence,card(button.dataset.dialogEvidence))));
  document.getElementById('dialog-close').addEventListener('click',closeEvidence);
  dialog.addEventListener('cancel',event=>{event.preventDefault();closeEvidence();});
  dialog.addEventListener('keydown',event=>{
    if(event.key!=='Tab')return;
    const buttons=[...dialog.querySelectorAll('button:not(:disabled)')],first=buttons[0],last=buttons[buttons.length-1];
    if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
    else if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
  });
  dialog.addEventListener('click',event=>{if(event.target!==dialog)return;const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)closeEvidence();});
  document.getElementById('save-extract').addEventListener('click',()=>{
    if(!extracts.includes(activeEvidence)){undo.push([...extracts]);extracts.push(activeEvidence);renderExtracts();api().toast(`${activeEvidence} 结论已摘录`);}
    closeEvidence();
  });
  document.getElementById('extract-list').addEventListener('click',event=>{const button=event.target.closest('[data-remove]');if(!button)return;undo.push([...extracts]);extracts=extracts.filter(id=>id!==button.dataset.remove);renderExtracts();document.getElementById('undo-extract').focus({preventScroll:true});});
  document.getElementById('undo-extract').addEventListener('click',()=>{if(!undo.length)return;extracts=undo.pop();renderExtracts();api().toast('已撤销上一步摘录操作');});
  function settleAll() {
    introMotion.forEach(stop);introMotion=[];
    document.querySelectorAll('[data-intro]').forEach(node=>{node.style.opacity='1';node.style.transform='none';});
    metricTimers.forEach(clearTimeout);metricTimers.clear();metricMotion.forEach(list=>list.forEach(stop));metricMotion.clear();
    exactMetric('order-number',samples[selected].order,false);exactMetric('profit-number',samples[selected].profit,false);
    if(dialogPhase==='closing')finishClose();
    else if(dialog.open){resetDialogMotion();dialogPhase='open';dialog.style.opacity='1';dialog.style.transform='none';content.style.opacity='1';content.style.transform='none';}
  }
  document.addEventListener('demo:motion',settleAll);
  document.addEventListener('demo:reset',()=>{
    settleAll();if(dialog.open)finishClose(false);
    period=24;selected=samples.length-1;tooltipVisible=false;extracts=[];undo=[];
    document.querySelectorAll('[data-period]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.period==='24')));
    renderChart();renderExtracts();
  });
  new ResizeObserver(()=>renderChart()).observe(chart);
  renderChart();renderExtracts();
  [document.querySelector('.question-heading'),document.querySelector('.trend-panel'),...document.querySelectorAll('.evidence-card')].forEach((node,index)=>{
    node.dataset.intro='true';
    const delay=[0,.08,.16,.18,.20][index];
    introMotion.push(motion(node,{opacity:[0,1],transform:['translateY(7px)','translateY(0px)']},{duration:index<2?.22:.18,delay,ease:'easeOut'}));
  });
})();
