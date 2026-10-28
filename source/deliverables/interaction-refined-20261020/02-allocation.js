(() => {
  'use strict';
  const sectors = [
    {name:'半导体',short:'半导体',en:'SEMICONDUCTORS',icon:'semiconductor',color:'#202020'},
    {name:'机器人与工业自动化',short:'机器人',en:'ROBOTICS & AUTOMATION',icon:'robotics',color:'#4b4b4b'},
    {name:'先进材料',short:'先进材料',en:'ADVANCED MATERIALS',icon:'materials',color:'#777777'},
    {name:'清洁能源装备',short:'清洁能源',en:'CLEAN ENERGY EQUIPMENT',icon:'energy',color:'#9e9e9e'},
    {name:'AI 与数字基础设施',short:'AI 基建',en:'AI & DIGITAL INFRASTRUCTURE',icon:'infrastructure',color:'#bfbfbf'},
    {name:'现金',short:'现金',icon:'cash',color:'#d8d8d8'}
  ];
  const initial = [20,20,15,15,15];
  const root = document.querySelector('.allocation-demo');
  const $ = (id) => document.getElementById(id);
  const clone = () => weights.slice();
  const same = (a,b) => a.every((value,index) => value === b[index]);
  let weights = initial.slice();
  let history = [];
  let gesture = null;
  let focused = -1;
  let comparison = false;
  let horizon = 'long';
  let ringMotion = null;
  let chartFrame = 0;
  const allWeights = (draft=weights) => [...draft,100-draft.reduce((sum,value)=>sum+value,0)];
  let displayed = allWeights();
  let target = displayed.slice();

  sectors.slice(0,5).forEach((sector,index) => {
    const row = document.createElement('div');
    row.className = 'sector-control';
    row.dataset.sector = index;
    row.innerHTML = `<div class="sector-control-top"><span class="sector-icon"><span class="seal" data-seal="${sector.icon}" aria-hidden="true"></span></span><label for="weight-${index}">${sector.name}<span>${sector.en}</span></label><output id="output-${index}" for="weight-${index}"></output></div><div class="range-line"><input id="weight-${index}" type="range" min="0" max="100" step="1" value="${initial[index]}" aria-describedby="slider-help available-${index}"></div><div class="range-labels"><span aria-hidden="true">0</span><span id="available-${index}"></span></div>`;
    $('sector-controls').append(row);
  });
  const ranges = sectors.slice(0,5).map((_,index) => $(`weight-${index}`));
  const rows = [...document.querySelectorAll('.sector-control')];
  const rings = [];
  const faces = [];
  const connectors = [];
  function svgElement(tag,attributes,parent) {
    const node=document.createElementNS('http://www.w3.org/2000/svg',tag);
    Object.entries(attributes).forEach(([key,value])=>node.setAttribute(key,value));
    if(parent) parent.append(node);
    return node;
  }
  const point=(percent,radius)=>{
    const angle=percent*Math.PI/50-Math.PI/2;
    return {x:310+radius*Math.cos(angle),y:248+radius*Math.sin(angle)};
  };
  const coordinates=p=>`${p.x.toFixed(4)} ${p.y.toFixed(4)}`;
  function arc(start,value,radius) {
    if(value<=0) return '';
    const a=point(start,radius),b=point(start+value,radius);
    if(value>=99.999999) {
      const half=point(start+50,radius);
      return `M ${coordinates(a)} A ${radius} ${radius} 0 1 1 ${coordinates(half)} A ${radius} ${radius} 0 1 1 ${coordinates(a)}`;
    }
    return `M ${coordinates(a)} A ${radius} ${radius} 0 ${value>50?1:0} 1 ${coordinates(b)}`;
  }
  function sectorPath(start,value,outer=182,inner=84) {
    if(value<=0) return '';
    const a=point(start,outer),b=point(start+value,outer),c=point(start+value,inner),d=point(start,inner);
    if(value>=99.999999) {
      return `${arc(start,value,outer)} L ${coordinates(d)} A ${inner} ${inner} 0 1 0 ${coordinates(point(start+50,inner))} A ${inner} ${inner} 0 1 0 ${coordinates(d)} Z`;
    }
    const large=value>50?1:0;
    return `M ${coordinates(a)} A ${outer} ${outer} 0 ${large} 1 ${coordinates(b)} L ${coordinates(c)} A ${inner} ${inner} 0 ${large} 0 ${coordinates(d)} Z`;
  }
  sectors.forEach((sector,index) => {
    const group=svgElement('g',{class:'sector-blade','data-sector':index},$('current-ring'));
    rings.push(group);
    faces.push(svgElement('path',{class:'blade-face',fill:sector.color},group));
    const connector=svgElement('g',{class:'dial-connector'},$('dial-connectors'));
    const line=svgElement('path',{class:'dial-leader'},connector);
    const dot=svgElement('circle',{r:1.8,class:'dial-anchor'},connector);
    const label=svgElement('text',{class:'dial-label'},connector);
    label.textContent=sector.short;
    const number=svgElement('text',{class:'dial-label-weight'},connector);
    connectors.push({group:connector,line,dot,label,number});
    rings[index].addEventListener('click',()=> {
      if(index<5) ranges[index].focus();
      else select(5);
    });
  });
  const initialValues = allWeights(initial);
  function draw(values) {
    let offset=0;
    const labelSides=[[],[]];
    values.forEach((value,index)=>{
      const path=sectorPath(offset,value);
      faces[index].setAttribute('d',path);
      faces[index].dataset.renderedWeight=value;
      faces[index].setAttribute('stroke-width',value>=99.999999?0:Math.min(4,value*1.2));
      rings[index].style.visibility=value>0?'visible':'hidden';
      const midpoint=point(offset+value/2,188);
      const outside=point(offset+value/2,205);
      connectors[index].group.style.visibility=value>.000001?'visible':'hidden';
      if(value>.000001) labelSides[outside.x<310?0:1].push({index,midpoint,outside,y:outside.y});
      offset+=value;
    });
    labelSides.forEach((items,side)=>{
      items.sort((a,b)=>a.y-b.y);
      items.forEach((item,index)=>{item.y=Math.max(77,Math.min(420,item.y));if(index)item.y=Math.max(item.y,items[index-1].y+44);});
      if(items.length&&items[items.length-1].y>420){
        items[items.length-1].y=420;
        for(let index=items.length-2;index>=0;index--)items[index].y=Math.min(items[index].y,items[index+1].y-44);
      }
      items.forEach(({index,midpoint,outside,y})=>{
        const connector=connectors[index];
        const lineX=side?540:80,textX=side?600:20;
        connector.line.setAttribute('d',`M ${coordinates(midpoint)} L ${outside.x.toFixed(4)} ${y} L ${lineX} ${y}`);
        connector.dot.setAttribute('cx',midpoint.x);
        connector.dot.setAttribute('cy',midpoint.y);
        [connector.label,connector.number].forEach(node=>{node.setAttribute('x',textX);node.setAttribute('text-anchor',side?'end':'start');});
        connector.label.setAttribute('y',y-7);
        connector.number.setAttribute('y',y+12);
      });
    });
    $('composition').dataset.renderedValues=JSON.stringify(values);
    $('focus-visual').textContent=focused<0?'100':Math.round(values[focused]);
  }
  function finishChart() {
    cancelAnimationFrame(chartFrame);
    chartFrame=0;
    displayed=allWeights();
    target=displayed.slice();
    draw(displayed);
  }
  function animateChart(values) {
    if(same(values,target)) return;
    cancelAnimationFrame(chartFrame);
    const from=displayed.slice();
    target=values.slice();
    if(window.Demo?.reduced()||document.hidden) {finishChart();return;}
    const start=performance.now();
    const tick=now=>{
      const progress=Math.min(1,(now-start)/190);
      const ease=1-Math.pow(1-progress,3);
      displayed=from.map((value,index)=>value+(target[index]-value)*ease);
      draw(displayed);
      if(progress<1) chartFrame=requestAnimationFrame(tick);
      else {chartFrame=0;displayed=target.slice();draw(displayed);}
    };
    chartFrame=requestAnimationFrame(tick);
  }
  draw(displayed);

  function pulse() {
    if(window.Demo?.reduced()) return;
    ringMotion?.stop?.();
    ringMotion = window.Demo?.animate($('composition'),{scale:[.985,1]},{type:'spring',stiffness:330,damping:26,duration:.35});
  }
  function select(index) {
    focused=index;
    rows.forEach((row,i)=>row.classList.toggle('is-focused',i===index));
    $('composition').classList.toggle('has-focus',index>=0);
    rings.forEach((ring,i)=>ring.classList.toggle('is-focused',i===index));
    connectors.forEach((connector,i)=>connector.group.classList.toggle('is-focused',i===index));
    updateCenter();
  }
  function updateCenter() {
    const values=allWeights();
    $('focus-name').textContent=focused<0?'草稿总权重':sectors[focused].short;
    $('focus-value').textContent=focused<0?'100':values[focused];
    $('focus-value').setAttribute('aria-label',`${focused<0?'草稿总权重':sectors[focused].name} ${focused<0?100:values[focused]}%`);
    $('focus-visual').textContent=focused<0?'100':Math.round(displayed[focused]);
    const difference=focused<0?0:values[focused]-initialValues[focused];
    $('focus-detail').textContent=focused<0
      ? (comparison?'下方查看初始与当前':'5 个行业 + 现金')
      : (comparison?`初始 ${initialValues[focused]}% · ${difference>0?'+':''}${difference} 点`:(focused===5?'自动互补':'现金同步调整'));
  }
  function rules() {
    const values=allWeights();
    const max=Math.max(...weights);
    const highest=weights.indexOf(max);
    const list=[
      {pass:values.every(value=>Number.isInteger(value)&&value>=0)&&values.reduce((a,b)=>a+b,0)===100,title:'总和 100%，无负权重',detail:`五行业 ${100-values[5]}% + 现金 ${values[5]}% = 100%。`},
      {pass:max<=40,title:`单行业集中度 ${max<=40?'通过':'需复核'}`,detail:`当前最高：${sectors[highest].name} ${max}%；示意上限为 40%。`},
      {pass:values[5]>=10,title:`现金缓冲 ${values[5]>=10?'通过':'需复核'}`,detail:`当前现金 ${values[5]}%；示意最低缓冲为 10%。`}
    ];
    $('rule-results').replaceChildren(...list.map(rule=>{
      const row=document.createElement('div');
      row.className=`rule-row${rule.pass?'':' is-warning'}`;
      row.innerHTML=`<span class="rule-state">${rule.pass?'通过':'复核'}</span><div><strong>${rule.title}</strong><p>${rule.detail}</p></div>`;
      return row;
    }));
  }
  function render() {
    const values=allWeights();
    ranges.forEach((range,index)=>{
      const available=weights[index]+values[5];
      range.max=available;
      range.value=weights[index];
      range.style.setProperty('--fill',`${available?weights[index]/available*100:0}%`);
      range.style.setProperty('--sector-color',sectors[index].color);
      range.setAttribute('aria-valuetext',`${weights[index]}%，当前最多 ${available}%，现金 ${values[5]}%`);
      $(`output-${index}`).innerHTML=`${weights[index]}<small>%</small>`;
      $(`available-${index}`).textContent=`可用上限 ${available}%`;
      $(`available-${index}`).setAttribute('aria-label',`当前可调上限 ${available}%`);
    });
    $('cash-output').innerHTML=`${values[5]}<small>%</small>`;
    document.querySelector('.cash-row').classList.toggle('is-low',values[5]<10);
    $('cash-detail').textContent=values[5]<10?'低于示意缓冲 10%':'自动互补';
    $('total-output').textContent=`${values.reduce((a,b)=>a+b,0)}%`;
    $('undo-allocation').disabled=history.length===0;
    const changed=values.filter((value,index)=>value!==initialValues[index]).length;
    $('change-summary').textContent=changed?`${changed} 项比例已调整`:'尚未调整';
    values.forEach((value,index)=>{
      faces[index].dataset.weight=value;
      connectors[index].number.textContent=`${value}%`;
    });
    animateChart(values);
    updateCenter();
    if(comparison) renderComparison(values);
    if(!$('allocation-rules').hidden) rules();
  }
  function renderComparison(values) {
    $('comparison-rows').replaceChildren(...sectors.map((sector,index)=>{
      const row=document.createElement('div');
      const difference=values[index]-initialValues[index];
      row.className='comparison-line';
      row.innerHTML=`<span>${sector.short}</span><span>${initialValues[index]}%</span><span>${values[index]}%</span><span class="${difference?'changed':''}">${difference>0?'+':''}${difference} 点</span>`;
      return row;
    }));
  }
  function beginGesture() {
    if(!gesture) gesture=clone();
  }
  function commitGesture() {
    if(!gesture) return;
    if(!same(gesture,weights)) {
      history.push(gesture);
      if(history.length>30) history.shift();
    }
    gesture=null;
    render();
  }
  ranges.forEach((range,index)=>{
    range.addEventListener('focus',()=>select(index));
    range.addEventListener('pointerdown',beginGesture);
    range.addEventListener('keydown',event=>{
      if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End','PageUp','PageDown'].includes(event.key)) beginGesture();
    });
    range.addEventListener('keyup',commitGesture);
    range.addEventListener('input',()=>{
      beginGesture();
      const max=100-weights.reduce((sum,value,i)=>sum+(i===index?0:value),0);
      weights[index]=Math.max(0,Math.min(max,Math.round(Number(range.value)||0)));
      render();
      $('allocation-feedback').textContent=`${sectors[index].short} ${weights[index]}% · 现金 ${allWeights()[5]}%`;
    });
    range.addEventListener('change',commitGesture);
    range.addEventListener('blur',()=>{
      commitGesture();
      if(!ranges.includes(document.activeElement)) select(-1);
    });
  });
  window.addEventListener('pointerup',commitGesture);
  window.addEventListener('pointercancel',commitGesture);
  $('undo-allocation').addEventListener('click',()=>{
    commitGesture();
    if(!history.length) return;
    weights=history.pop();
    render();
    pulse();
    $('allocation-feedback').textContent='已撤销上一笔调整。';
  });
  function reset(full=false) {
    commitGesture();
    if(full) history=[];
    else if(!same(weights,initial)) history.push(clone());
    weights=initial.slice();
    if(full) {
      comparison=false;
      $('compare-allocation').setAttribute('aria-pressed','false');
      $('comparison').hidden=true;
      $('composition').classList.remove('comparing');
      $('ring-caption').textContent='五个行业与现金 · 面积随权重变化';
      $('allocation-rules').hidden=true;
      $('check-allocation').setAttribute('aria-expanded','false');
      setHorizon('long');
    }
    select(-1);
    render();
    pulse();
    $('allocation-feedback').textContent='已恢复初始草稿，现金 15%。';
  }
  $('reset-allocation').addEventListener('click',()=>reset());
  document.addEventListener('demo:reset',()=>reset(true));
  $('compare-allocation').addEventListener('click',()=>{
    comparison=!comparison;
    $('compare-allocation').setAttribute('aria-pressed',String(comparison));
    $('comparison').hidden=!comparison;
    $('composition').classList.toggle('comparing',comparison);
    $('ring-caption').textContent=comparison?'当前草稿 · 下方查看权重变化':'五个行业与现金 · 面积随权重变化';
    render();
  });
  function setHorizon(value) {
    horizon=value;
    document.querySelectorAll('[data-horizon]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.horizon===horizon)));
    $('horizon-copy').textContent=horizon==='long'
      ?'看产业位置与盈利兑现，再决定长期敞口。'
      :'看未来一轮的催化，明确短期验证期限。';
  }
  document.querySelectorAll('[data-horizon]').forEach(button=>button.addEventListener('click',()=>setHorizon(button.dataset.horizon)));
  $('check-allocation').addEventListener('click',()=>{
    const opening=$('allocation-rules').hidden;
    $('allocation-rules').hidden=!opening;
    $('check-allocation').setAttribute('aria-expanded',String(opening));
    if(opening) {
      rules();
      window.Demo?.animate($('allocation-rules'),{opacity:[0,1],y:[-5,0]},{duration:.22,ease:'easeOut'});
    }
  });
  function updateMotion() {
    const reduced=Boolean(window.Demo?.reduced());
    root.classList.toggle('motion-static',reduced);
    if(reduced) {
      ringMotion?.stop?.();
      $('composition').style.transform='';
      finishChart();
    }
  }
  document.addEventListener('demo:motion',updateMotion);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)finishChart();});
  window.addEventListener('pagehide',finishChart);
  updateMotion();
  render();
  window.Demo?.animate(document.querySelector('.allocation-heading'),{opacity:[0,1],y:[8,0]},{duration:.26,ease:'easeOut'});
  window.Demo?.animate($('composition'),{opacity:[0,1],scale:[.97,1]},{duration:.44,delay:.04,ease:'easeOut'});
  rows.forEach((row,index)=>window.Demo?.animate(row,{opacity:[0,1],y:[7,0]},{duration:.25,delay:.06+index*.045,ease:'easeOut'}));
})();
