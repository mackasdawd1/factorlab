(() => {
  'use strict';
  const sectors = [
    {name:'半导体',short:'半导体',en:'SEMICONDUCTORS',icon:'semiconductor',color:'#7c3652'},
    {name:'机器人与工业自动化',short:'机器人与自动化',en:'ROBOTICS & AUTOMATION',icon:'robotics',color:'#a96580'},
    {name:'先进材料',short:'先进材料',en:'ADVANCED MATERIALS',icon:'materials',color:'#574451'},
    {name:'清洁能源装备',short:'清洁能源装备',en:'CLEAN ENERGY EQUIPMENT',icon:'energy',color:'#ba9fab'},
    {name:'AI 与数字基础设施',short:'AI 与数字基础设施',en:'AI & DIGITAL INFRASTRUCTURE',icon:'infrastructure',color:'#8c7a8a'},
    {name:'现金',short:'现金',icon:'cash',color:'#d9cbd4'}
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
  const allWeights = (draft=weights) => [...draft,100-draft.reduce((sum,value)=>sum+value,0)];

  sectors.slice(0,5).forEach((sector,index) => {
    const row = document.createElement('div');
    row.className = 'sector-control';
    row.dataset.sector = index;
    row.innerHTML = `<div class="sector-control-top"><span class="sector-icon"><span class="seal" data-seal="${sector.icon}" aria-hidden="true"></span></span><label for="weight-${index}">${sector.name}<span>${sector.en}</span></label><output id="output-${index}" for="weight-${index}"></output></div><div class="range-line"><input id="weight-${index}" type="range" min="0" max="100" step="1" value="${initial[index]}" aria-describedby="slider-help available-${index}"><span id="available-${index}"></span></div>`;
    $('sector-controls').append(row);
  });
  const ranges = sectors.slice(0,5).map((_,index) => $(`weight-${index}`));
  const rows = [...document.querySelectorAll('.sector-control')];
  const rings = [];
  const initialRings = [];
  sectors.forEach((sector,index) => {
    const createRing = (className,radius,parent) => {
      const circle = document.createElementNS('http://www.w3.org/2000/svg','circle');
      Object.entries({cx:180,cy:180,r:radius,pathLength:100,stroke:sector.color,class:className}).forEach(([key,value])=>circle.setAttribute(key,value));
      $(parent).append(circle);
      return circle;
    };
    rings.push(createRing('ring-segment',134,'current-ring'));
    initialRings.push(createRing('initial-segment',111,'initial-ring'));
    rings[index].addEventListener('click',()=> {
      if(index<5) ranges[index].focus();
      else select(5);
    });
  });
  const initialValues = allWeights(initial);
  function draw(ringList,values) {
    let offset = 0;
    values.forEach((value,index) => {
      const gap = value>0 ? Math.min(.7,value*.3) : 0;
      ringList[index].style.strokeDasharray = `${Math.max(0,value-gap)} ${100-Math.max(0,value-gap)}`;
      ringList[index].style.strokeDashoffset = `${-offset-gap/2}`;
      ringList[index].style.visibility = value===0?'hidden':'visible';
      offset += value;
    });
  }
  draw(initialRings,initialValues);

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
    updateCenter();
  }
  function updateCenter() {
    const values=allWeights();
    $('focus-name').textContent=focused<0?'草稿总权重':sectors[focused].short;
    $('focus-value').textContent=focused<0?'100':values[focused];
    const difference=focused<0?0:values[focused]-initialValues[focused];
    $('focus-detail').textContent=focused<0
      ? (comparison?'细内环 · 初始草稿':'5 个行业 + 现金')
      : (comparison?`初始 ${initialValues[focused]}% · ${difference>0?'+':''}${difference} 个百分点`:(focused===5?'随五行业草稿自动互补':'调整来自现金，不改变其他行业'));
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
      $(`available-${index}`).textContent=`上限 ${available}%`;
      $(`available-${index}`).setAttribute('aria-label',`当前可调上限 ${available}%`);
    });
    $('cash-output').innerHTML=`${values[5]}<small>%</small>`;
    document.querySelector('.cash-row').classList.toggle('is-low',values[5]<10);
    $('cash-detail').textContent=values[5]<10?'自动互补 · 低于示意缓冲 10%':'自动互补 · 留出调整空间';
    $('total-output').textContent=`${values.reduce((a,b)=>a+b,0)}%`;
    $('undo-allocation').disabled=history.length===0;
    const changed=values.filter((value,index)=>value!==initialValues[index]).length;
    $('change-summary').textContent=changed?`${changed} 项比例已调整`:'尚未调整';
    draw(rings,values);
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
      $('allocation-feedback').textContent=`${sectors[index].name} ${weights[index]}%，现金 ${allWeights()[5]}%。其他行业保持原值。`;
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
    $('allocation-feedback').textContent='已撤销上一笔调整，恢复调整前的行业与现金比例。';
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
      $('ring-caption').textContent='外环 · 当前草稿';
      $('allocation-rules').hidden=true;
      $('check-allocation').setAttribute('aria-expanded','false');
      setHorizon('long');
    }
    select(-1);
    render();
    pulse();
    $('allocation-feedback').textContent='已恢复初始草稿：20 / 20 / 15 / 15 / 15，现金 15%。';
  }
  $('reset-allocation').addEventListener('click',()=>reset());
  document.addEventListener('demo:reset',()=>reset(true));
  $('compare-allocation').addEventListener('click',()=>{
    comparison=!comparison;
    $('compare-allocation').setAttribute('aria-pressed',String(comparison));
    $('comparison').hidden=!comparison;
    $('composition').classList.toggle('comparing',comparison);
    $('ring-caption').textContent=comparison?'外环 · 当前草稿 / 内环 · 初始草稿':'外环 · 当前草稿';
    render();
  });
  function setHorizon(value) {
    horizon=value;
    document.querySelectorAll('[data-horizon]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.horizon===horizon)));
    $('horizon-copy').textContent=horizon==='long'
      ?'先看产业位置与盈利兑现能力，再决定愿意长期承担的行业敞口。'
      :'聚焦未来一轮的催化与验证期限；短期信号不能替代长期产业判断。';
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
    }
  }
  document.addEventListener('demo:motion',updateMotion);
  updateMotion();
  render();
  window.Demo?.animate(document.querySelector('.allocation-workspace'),{opacity:[0,1],y:[9,0]},{duration:.4,ease:'easeOut'});
})();
