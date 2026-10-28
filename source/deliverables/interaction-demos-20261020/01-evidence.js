(() => {
  'use strict';
  const evidence = {
    E1: { kind: '周期传导', title: '订单回暖，还不是盈利确认', lead: '订单修复是先行信号。产能利用、成本和回款节奏，决定需求能否传导到利润与现金流。', chain: [['先行信号','订单改善'],['传导环节','产能与成本'],['需要确认','利润与现金流']], quotes: ['订单改善支持继续跟踪，但不能单独证明盈利已经兑现。','若毛利率与经营现金流没有同步改善，本轮加仓理由仍需补充证据。'], verify: '核对毛利率与现金流是否同步改善。', short: '订单 ≠ 盈利' },
    E2: { kind: '价格与预期', title: '好消息，可能已经被定价', lead: '行业前景与价格吸引力要分开判断。即使需求改善，也需要检查市场是否已经提前反映乐观预期。', chain: [['基本面','景气改善'],['市场预期','估值已反映？'],['需要确认','预期差与价格']], quotes: ['行业变好，并不自动意味着当前价格仍然有吸引力。','把盈利改善的证据与估值预期放在一起，才能解释为什么此时调整配置。'], verify: '对照盈利证据与当前估值预期。', short: '好消息可能已定价' },
    E3: { kind: '判断期限', title: '长期支持，不等于短期买点', lead: '技术进步与产业投入支持长期跟踪，但本轮配置仍要说明兑现时点。长期方向与短期战术需要各自的证据。', chain: [['长期驱动','技术与产业投入'],['兑现过程','需求与产能'],['本轮判断','调整还是等待']], quotes: ['长期产业支持可以解释为什么跟踪，却不能直接解释为什么本轮加仓。','先写清判断期限，再说明什么新证据会改变短期配置。'], verify: '分别写清长期定位与本轮调整理由。', short: '长期支持 ≠ 短期买点' }
  };
  const ids = Object.keys(evidence);
  const desk = document.getElementById('reading-desk');
  const sheet = document.getElementById('focus-sheet');
  const empty = document.getElementById('reading-empty');
  const collection = document.getElementById('collection-body');
  const status = document.getElementById('evidence-status');
  const card = id => document.querySelector(`[data-evidence="${id}"]`);
  let selected = null;
  let read = new Set();
  let state = { compared: [], excerpts: [] };
  let history = [];
  let returnFocus = null;
  let sequence = 0;
  const running = new Set();
  const fallback = { reduced: () => true, animate: () => null, toast: () => {} };
  const demo = () => window.Demo || fallback;
  const clone = value => JSON.parse(JSON.stringify(value));
  const announce = text => { status.textContent = text; demo().toast(text); };

  function settleMotion() {
    sequence += 1;
    running.forEach(control => { try { control.stop?.(); control.cancel?.(); } catch (_) {} });
    running.clear();
    sheet.style.transform = '';
    sheet.style.opacity = '';
    sheet.querySelectorAll('[data-motion-content]').forEach(node => { node.style.opacity = ''; node.style.transform = ''; });
  }
  function animate(node, keyframes, options) {
    if (demo().reduced()) return;
    const control = demo().animate(node, keyframes, options);
    if (control) {
      running.add(control);
      if (typeof control.then === 'function') Promise.resolve(control).then(() => running.delete(control), () => running.delete(control));
    }
  }
  function updateWire() {
    const path = document.getElementById('focus-link');
    if (!selected || innerWidth <= 760 || sheet.hidden) { path.setAttribute('d', ''); return; }
    const area = desk.getBoundingClientRect(), from = card(selected).getBoundingClientRect(), to = sheet.getBoundingClientRect();
    const x = from.right - area.left, y = from.top + 30 - area.top, tx = to.left - area.left, ty = to.top + 44 - area.top;
    path.setAttribute('d', `M ${x} ${y} C ${x+22} ${y}, ${tx-22} ${ty}, ${tx} ${ty}`);
  }
  function updateCards() {
    ids.forEach(id => {
      const button = card(id);
      button.setAttribute('aria-expanded', String(id === selected));
      button.querySelector('.card-state').textContent = id === selected ? '正在阅读' : state.compared.includes(id) ? '已加入对照' : read.has(id) ? '已阅读' : '待阅读';
    });
  }
  function readerMarkup(id) {
    const data = evidence[id], index = ids.indexOf(id);
    return `<div class="reading-toolbar"><div class="reading-key"><span class="evidence-code">${id}</span><span>${data.kind} · 示意材料</span></div><div class="reading-controls"><span>${index+1} / 3</span><button type="button" data-switch="-1" aria-label="上一条证据"${index===0?' disabled':''}>↑</button><button type="button" data-switch="1" aria-label="下一条证据"${index===2?' disabled':''}>↓</button><button type="button" id="close-reading">收起 <span aria-hidden="true">↙</span></button></div></div><div data-motion-content><h2 id="focus-title" class="focus-title" tabindex="-1">${data.title}</h2><p class="reading-lead">${data.lead}</p><div class="reading-chain" aria-label="证据传导与确认关系">${data.chain.map(([label,value],i)=>`${i?'<i aria-hidden="true">→</i>':''}<span>${label}<b>${value}</b></span>`).join('')}</div><h3 class="reading-question">哪些话值得留在判断旁边？</h3>${data.quotes.map((quote,i)=>`<div class="excerpt-row"><p>${quote}</p><button type="button" data-excerpt="${i}" aria-label="摘录 ${id} 第 ${i+1} 句" aria-pressed="false">摘录这句</button></div>`).join('')}<div class="reading-bottom"><span class="reading-source">材料来源：本演示的合成研究场景<br>不代表真实公司数据或投资建议</span><button type="button" class="compare-button" id="compare-evidence" aria-pressed="false">加入对照</button></div></div>`;
  }
  function syncReaderActions() {
    if (!selected || sheet.hidden) return;
    const compared = state.compared.includes(selected), button = sheet.querySelector('#compare-evidence');
    button.setAttribute('aria-pressed', String(compared));
    button.textContent = compared ? '已加入对照 · 移除' : '加入对照';
    sheet.querySelectorAll('[data-excerpt]').forEach(button => {
      const saved = state.excerpts.some(item => item.id === selected && item.index === Number(button.dataset.excerpt));
      button.setAttribute('aria-pressed', String(saved));
      button.setAttribute('aria-label', `${saved ? '撤回' : '摘录'} ${selected} 第 ${Number(button.dataset.excerpt)+1} 句`);
      button.textContent = saved ? '已摘录 · 撤回' : '摘录这句';
    });
  }
  function focusTitle() {
    const title = document.getElementById('focus-title');
    title?.focus({ preventScroll: true });
    if (innerWidth <= 760 && title) {
      const box = title.getBoundingClientRect();
      if (box.top < 84 || box.bottom > innerHeight - 35) title.scrollIntoView({ block: 'start', behavior: demo().reduced() ? 'instant' : 'smooth' });
    }
  }
  function openEvidence(id, trigger) {
    if (!ids.includes(id)) return;
    if (selected === id && !sheet.hidden) { focusTitle(); return; }
    const previous = selected;
    const origin = card(id).getBoundingClientRect();
    settleMotion();
    selected = id;
    read.add(id);
    returnFocus = trigger?.matches('.evidence-card,#start-reading') ? trigger : card(id);
    desk.classList.add('is-focused');
    empty.hidden = true;
    sheet.hidden = false;
    sheet.innerHTML = readerMarkup(id);
    syncReaderActions();
    updateCards();
    const target = sheet.getBoundingClientRect();
    if (!previous) {
      const transform = `translate(${origin.left-target.left}px,${origin.top-target.top}px) scale(${origin.width/target.width},${origin.height/target.height})`;
      animate(sheet, { transform: [transform, 'translate(0px,0px) scale(1,1)'], opacity: [.4,1] }, { duration: .42, ease: [.22,.8,.2,1] });
      animate(sheet.querySelector('[data-motion-content]'), { opacity: [0,1] }, { duration: .24, delay: .16 });
    } else {
      animate(sheet.querySelector('[data-motion-content]'), { opacity: [0,1], transform: ['translateY(9px)','translateY(0px)'] }, { duration: .2, ease: 'easeOut' });
    }
    updateWire();
    const ownSequence = sequence;
    setTimeout(() => { if (ownSequence === sequence && selected === id) { sheet.style.transform = ''; sheet.style.opacity = ''; updateWire(); focusTitle(); } }, demo().reduced() ? 0 : 430);
    status.textContent = `已展开 ${id}，可摘录或加入对照。`;
  }
  function closeEvidence() {
    if (!selected) return;
    settleMotion();
    const focus = returnFocus || card(selected);
    selected = null;
    sheet.hidden = true;
    sheet.innerHTML = '';
    empty.hidden = false;
    desk.classList.remove('is-focused');
    updateCards();
    updateWire();
    focus.focus({ preventScroll: true });
    if (innerWidth <= 760) focus.scrollIntoView({ block: 'nearest', behavior: 'instant' });
    status.textContent = '已收起阅读，返回证据索引。';
  }
  function changeState(action, message) {
    history.push(clone(state));
    action();
    renderCollection();
    syncReaderActions();
    updateCards();
    announce(message);
  }
  function toggleComparison(id) {
    const included = state.compared.includes(id);
    changeState(() => { state.compared = included ? state.compared.filter(item => item !== id) : [...state.compared,id]; }, included ? `${id} 已移出对照。` : `${id} 已加入下方研究对照。`);
  }
  function toggleExcerpt(id, index) {
    const included = state.excerpts.some(item => item.id===id && item.index===index);
    changeState(() => { state.excerpts = included ? state.excerpts.filter(item => !(item.id===id && item.index===index)) : [...state.excerpts,{id,index}]; }, included ? '已撤回这条摘录。' : `${id} 的句子已加入下方摘录。`);
  }
  function renderCollection() {
    document.getElementById('collection-count').textContent = `${state.compared.length} 条对照 · ${state.excerpts.length} 条摘录`;
    document.getElementById('undo-action').disabled = history.length === 0;
    document.getElementById('clear-collection').disabled = !state.compared.length && !state.excerpts.length;
    if (!state.compared.length && !state.excerpts.length) {
      collection.innerHTML = '<p class="collection-empty">把值得一起看的证据放到这里。对照与摘录只保留在本次演示中。</p>';
      return;
    }
    const comparisons = state.compared.length ? `<div class="compare-table" style="--columns:${state.compared.length}">${state.compared.map(id=>`<article class="comparison-item"><header><span>${id} · ${evidence[id].kind}</span><button type="button" class="remove-item" data-remove-compare="${id}" aria-label="移除 ${id} 对照">移除</button></header><h3>${evidence[id].short}</h3><p>${evidence[id].verify}</p></article>`).join('')}</div><p class="comparison-hint">${state.compared.length===1?'加入另一条证据，看看它们分别约束了什么。':'共同核对：证据是否充分、价格是否合理、期限是否一致。对照不会自动生成投资结论。'}</p>` : '';
    const excerpts = state.excerpts.length ? `<ul class="excerpt-list" aria-label="已保存摘录">${state.excerpts.map(({id,index})=>`<li class="saved-excerpt"><span class="quote-code">${id}</span><blockquote>${evidence[id].quotes[index]}</blockquote><button type="button" class="remove-item" data-remove-excerpt="${id}:${index}" aria-label="移除 ${id} 第 ${index+1} 条摘录">移除</button></li>`).join('')}</ul>` : '';
    collection.innerHTML = comparisons + excerpts;
  }
  ids.forEach(id => card(id).addEventListener('click', event => openEvidence(id,event.currentTarget)));
  document.getElementById('start-reading').addEventListener('click', event => openEvidence('E1',event.currentTarget));
  sheet.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button || !selected) return;
    if (button.id === 'close-reading') closeEvidence();
    else if (button.dataset.switch) openEvidence(ids[ids.indexOf(selected)+Number(button.dataset.switch)]);
    else if (button.id === 'compare-evidence') toggleComparison(selected);
    else if (button.dataset.excerpt !== undefined) toggleExcerpt(selected,Number(button.dataset.excerpt));
  });
  collection.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (button?.dataset.removeCompare) { toggleComparison(button.dataset.removeCompare); document.getElementById('collection-title').setAttribute('tabindex','-1'); document.getElementById('collection-title').focus({preventScroll:true}); }
    if (button?.dataset.removeExcerpt) { const [id,index] = button.dataset.removeExcerpt.split(':'); toggleExcerpt(id,Number(index)); document.getElementById('collection-title').setAttribute('tabindex','-1'); document.getElementById('collection-title').focus({preventScroll:true}); }
  });
  document.getElementById('undo-action').addEventListener('click', () => {
    if (!history.length) return;
    state = history.pop();
    renderCollection(); syncReaderActions(); updateCards(); announce('已撤销上一步，对照与摘录已恢复。');
  });
  document.getElementById('clear-collection').addEventListener('click', () => {
    if (!state.compared.length && !state.excerpts.length) return;
    changeState(() => { state = {compared:[],excerpts:[]}; }, '已清空，可用“撤销上一步”恢复。');
  });
  document.addEventListener('keydown', event => {
    if (!selected || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === 'Escape') { event.preventDefault(); closeEvidence(); }
    else if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && (sheet.contains(event.target) || event.target.closest('[data-evidence]'))) {
      event.preventDefault();
      const next = ids.indexOf(selected) + (event.key==='ArrowDown'?1:-1);
      if (next>=0 && next<ids.length) openEvidence(ids[next]);
    }
  });
  document.addEventListener('demo:reset', () => {
    settleMotion(); selected = null; read = new Set(); state = {compared:[],excerpts:[]}; history = [];
    sheet.hidden = true; sheet.innerHTML = ''; empty.hidden = false; desk.classList.remove('is-focused');
    renderCollection(); updateCards(); updateWire(); status.textContent = '证据聚焦演示已重置。';
  });
  document.addEventListener('demo:motion', () => { settleMotion(); updateWire(); });
  new ResizeObserver(updateWire).observe(desk);
  window.addEventListener('resize', updateWire);
})();
