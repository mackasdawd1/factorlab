(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const views = ['research', 'portfolio', 'backtest', 'risk', 'journal'];
  const hashView = () => location.hash.replace(/^#\/?/, '');
  const labels = {
    'zh-CN': {
      research: ['研究台', '从行业证据出发 区分长期定位与本轮战术判断'],
      portfolio: ['构建配置', '先记录判断与依据 再将配置交给模拟市场'],
      backtest: ['回测与因子', '用事前信息检验方法 把收益与有效性放在一起看'],
      risk: ['风险与归因', '对照基准与长期锚 看清收益来源和承担的风险'],
      journal: ['决策手记', '对照当时的判断复盘 为下一轮留下问题'],
      factorNames: ['动量', '价值', '质量', '低波动'],
      factorHelp: ['过去六个月累计收益', '当时已公布的合成 E/P', '当时已公布的合成 ROE', '过去六个月波动率的负值'],
      weights: '研究因子偏好', run: '运行回测', reset: '恢复等权', pending: '偏好已修改，运行回测后更新结果', applied: '已完成 36 个月回放', invalid: '至少一个因子权重需要大于零',
      researchNote: '独立研究实验。调整这里的偏好不会改动持仓。', strategy: '合成策略收益', benchmark: '五行业等权基准', drawdown: '策略最大回撤', spread: '前二减后二 月均差',
      chartTitle: '36 个月合成历史', chartLabel: '事前因子策略与五行业等权基准净值', firstNav: '初始净值 1', months: '36 个月', factorValidity: '因子有效性', factor: '因子', ic: '平均 Rank IC', samples: '有效月份',
      method: '查看方法与逐月记录', methodText: '6 个月预热后，逐月使用当时可得信息排序，前二行业各 50%。基准为五行业各 20%。两者均每月再平衡，零交易成本，不加杠杆。',
      limitation: '全部历史为合成数据。小样本和反复调参不能证明现实有效性。该研究实验与模拟配置的 40% 单行业上限和交易成本不同。',
      month: '样本月', selected: '事前选择', monthlyStrategy: '策略收益', monthlyBenchmark: '基准收益', synthetic: '合成观测', inference: '解释与推断',
      cycle: '宏观条件与行业判断', rate: '政策利率', growth: '经济增长', credit: '信用压力',
      cycleNote: '当前周期标签由教学模型给出，并非现实市场判断。',
      inferenceText: '对照订单、库存与利润披露判断行业周期。价格上涨本身不足以确认行业复苏。',
      percent: '百分比', source: '来源与课程范围'
    },
    en: {
      research: ['Research desk', 'Separate long-term sector positioning from this round’s tactical view'],
      portfolio: ['Build allocation', 'Record your forecast and evidence before the simulated market unfolds'],
      backtest: ['Backtest & factors', 'Test a method with information available at the time'],
      risk: ['Risk & attribution', 'Compare the benchmark and long-term anchor to explain the outcome'],
      journal: ['Decision journal', 'Review what you believed then and record what to investigate next'],
      factorNames: ['Momentum', 'Value', 'Quality', 'Low volatility'],
      factorHelp: ['Prior six-month cumulative return', 'Synthetic E/P known at that time', 'Synthetic ROE known at that time', 'Negative prior six-month volatility'],
      weights: 'Research factor preferences', run: 'Run backtest', reset: 'Equal weights', pending: 'Preferences changed. Run the backtest to update results.', applied: '36-month replay complete', invalid: 'At least one factor weight must be positive',
      researchNote: 'An independent method exercise. These weights do not change your holdings.', strategy: 'Synthetic strategy return', benchmark: 'Equal-sector benchmark', drawdown: 'Strategy max drawdown', spread: 'Top two minus bottom two Monthly mean',
      chartTitle: '36 months of synthetic history', chartLabel: 'Prior-information factor strategy versus equal-sector benchmark NAV', firstNav: 'Initial NAV 1', months: '36 months', factorValidity: 'Factor validity', factor: 'Factor', ic: 'Mean Rank IC', samples: 'Valid months',
      method: 'Method and monthly records', methodText: 'After six warm-up months, rank only information known at each decision time. The top two sectors receive 50% each. The benchmark holds 20% in each sector. Both rebalance monthly with zero costs and no leverage.',
      limitation: 'All history is synthetic. Small samples and repeated tuning cannot establish real-world validity. This method exercise differs from the simulation’s 40% sector cap and trading costs.',
      month: 'Month', selected: 'Prior selection', monthlyStrategy: 'Strategy return', monthlyBenchmark: 'Benchmark return', synthetic: 'Synthetic observation', inference: 'Interpretation',
      cycle: 'Macro conditions and sector judgment', rate: 'Policy rate', growth: 'Economic growth', credit: 'Credit pressure',
      cycleNote: 'The cycle label is produced by a teaching model. It is not a real-market assessment.',
      inferenceText: 'Check orders, inventories and earnings. Rising prices alone do not establish recovery.',
      percent: 'percent', source: 'Sources and course scope'
    }
  };
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  let current = 'research', desired = current, phase = null, lang = 'zh-CN', initialized = false;
  let transition = null, settled = Promise.resolve(), preferences = [25, 25, 25, 25], researchResult = null, researchLanguage = null, researchDirty = false;
  let researchChartSize = '';
  const researchChartObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(() => renderResearchChart()) : null;
  const text = () => labels[lang];
  const numeric = (value, digits = 2) => Number.isFinite(value) ? (Math.abs(value) < .5 * 10 ** -digits ? 0 : value).toLocaleString(lang, { minimumFractionDigits: digits, maximumFractionDigits: digits }) : '—';
  const pct = value => Number.isFinite(value) ? numeric(value * 100) + '%' : '—';

  function animateSurface(root) {
    if (window.FactorExperience) return window.FactorExperience.surface(root);
    if (reduced() || !root || !window.Motion?.animate) return;
    const targets = [...root.querySelectorAll('.panel, .review-card, .backtest-controls, .backtest-summary, .cycle-evidence, .cycle-inference')].filter(el => el.getClientRects().length);
    if (!targets.length) targets.push(root);
    try { window.Motion.animate(targets, { opacity: [0.35, 1], y: [10, 0] }, { duration: .32, delay: window.Motion.stagger ? window.Motion.stagger(.025) : 0, ease: [0.22, 1, 0.36, 1] }); } catch {}
  }

  function updateLabels() {
    const t = text();
    if ($('view-title')) $('view-title').textContent = t[current][0];
    if ($('view-description')) $('view-description').textContent = t[current][1];
    document.querySelectorAll('[data-view]').forEach(button => {
      const selected = button.dataset.view === current;
      button.classList.toggle('active', selected);
      if (selected) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current');
      const label = button.querySelector('[data-nav-label]');
      if (label && t[button.dataset.view]) label.textContent = t[button.dataset.view][0];
    });
    document.querySelectorAll('[data-zh][data-en]').forEach(el => { el.textContent = lang === 'en' ? el.dataset.en : el.dataset.zh; });
  }

  function applyView(view, focus) {
    current = view;
    document.body.dataset.currentView = current;
    document.querySelectorAll('[data-view-panel]').forEach(panel => { panel.hidden = panel.dataset.viewPanel !== current; });
    const market = $('shared-market');
    const host = $(current === 'risk' ? 'market-host-risk' : 'market-host-research');
    if (market && host && market.parentElement !== host) host.appendChild(market);
    updateLabels();
    if (current === 'backtest') renderResearch();
    const panel = document.querySelector(`[data-view-panel="${current}"]`);
    if (panel) panel.scrollTop = 0;
    if (window.scrollY) window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    if (focus && $('view-title')) { $('view-title').setAttribute('tabindex', '-1'); $('view-title').focus({ preventScroll: true }); }
    try { history.replaceState(null, '', '#/' + current); } catch {}
    document.dispatchEvent(new CustomEvent('factorlab:view', { detail: { view: current } }));
  }

  function go(view, options = {}) {
    if (!views.includes(view)) return settled;
    desired = view;
    const focus = options.focus === true;
    if (current === view && !transition) { if (location.hash !== '#/' + view) applyView(view, focus); else updateLabels(); return settled; }
    if (transition) { transition.skipTransition(); return settled.then(() => go(desired, options)); }
    const apply = () => applyView(desired, focus);
    if (!reduced() && typeof document.startViewTransition === 'function' && options.animate !== false) {
      transition = document.startViewTransition(apply);
      settled = transition.finished.catch(() => {}).then(() => { transition = null; });
    } else {
      apply();
      if (options.animate !== false) animateSurface(document.querySelector(`[data-view-panel="${current}"]`));
      settled = Promise.resolve();
    }
    return settled;
  }

  function researchChart(result, width, height) {
    const t = text(), left = 56, right = 20, top = 22, bottom = 32;
    const values = result.strategy.nav.concat(result.benchmark.nav);
    let min = Math.min(...values), max = Math.max(...values);
    const pad = Math.max(.035, (max - min) * .12); min -= pad; max += pad;
    const y = value => top + (max - value) / (max - min) * (height - top - bottom);
    const points = values => values.map((value, i) => `${left + i / 36 * (width - left - right)},${y(value)}`).join(' ');
    const grid = [0, 1, 2].map(i => { const value = min + (max - min) * i / 2, yy = y(value); return `<line x1="${left}" x2="${width-right}" y1="${yy}" y2="${yy}" stroke="#444953"/><text x="${left-10}" y="${yy+5}" fill="#b8bcc3" font-size="14" text-anchor="end">${numeric(value)}</text>`; }).join('');
    return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(t.chartLabel)}" xmlns="http://www.w3.org/2000/svg">${grid}<polyline data-series="benchmarkNav" points="${points(result.benchmark.nav)}" stroke="#b8bcc3" stroke-width="2" stroke-dasharray="6 5" fill="none"/><polyline data-series="nav" points="${points(result.strategy.nav)}" stroke="#a8bfdb" stroke-width="3" fill="none" stroke-linejoin="round" stroke-linecap="round"/><text x="${left}" y="${height-5}" fill="#b8bcc3" font-size="14">${esc(t.firstNav)}</text><text x="${width-right}" y="${height-5}" fill="#b8bcc3" font-size="14" text-anchor="end">${esc(t.months)}</text></svg>`;
  }

  function renderResearchChart(force = false) {
    const host = $('backtest-content')?.querySelector('.backtest-chart');
    if (!host || !researchResult || !host.getClientRects().length || !host.clientWidth || !host.clientHeight) return;
    const size = host.clientWidth + 'x' + host.clientHeight;
    if (!force && researchChartSize === size) return;
    host.innerHTML = researchChart(researchResult, Math.max(160, host.clientWidth), Math.max(100, host.clientHeight));
    researchChartSize = size;
  }

  function renderResearch(force = false) {
    const root = $('backtest-content'), R = window.InvestigationResearch;
    if (!root || !R) return;
    if (researchResult && researchLanguage === lang && !force) return;
    const focusedControl = root.contains(document.activeElement) ? document.activeElement.id : null;
    const t = text();
    if (!researchResult) researchResult = R.analyze();
    researchLanguage = lang;
    const a = researchResult, sectorName = id => {
      const index = R.SECTORS.findIndex(sector => sector.id === id);
      return lang === 'en' ? ['Semiconductors', 'Robotics', 'Advanced materials', 'Clean energy', 'AI infrastructure'][index] : R.SECTORS[index]?.name || id;
    };
    const stats = [[t.strategy, pct(a.strategy.totalReturn)], [t.benchmark, pct(a.benchmark.totalReturn)], [t.drawdown, pct(a.strategy.maxDrawdown)], [t.spread, numeric(a.meanSpread * 100, 3) + ' pp']];
    researchChartObserver?.disconnect();
    researchChartSize = '';
    root.innerHTML = `<div class="backtest-layout"><section class="backtest-controls panel"><div class="panel-head"><h2>${esc(t.weights)}</h2><span class="source-tag">${esc(t.synthetic)}</span></div>${preferences.map((value, i) => `<div class="backtest-factor"><label for="research-weight-${i}">${esc(t.factorNames[i])}</label><output id="research-output-${i}" for="research-weight-${i}">${value}</output><input id="research-weight-${i}" data-research-factor="${i}" type="range" min="0" max="100" step="5" value="${value}" aria-label="${esc(t.factorNames[i])}"><small>${esc(t.factorHelp[i])}</small></div>`).join('')}<div class="backtest-actions"><button id="run-backtest" class="primary">${esc(t.run)}</button><button id="reset-backtest">${esc(t.reset)}</button></div><p class="backtest-status" id="backtest-status" role="status">${esc(t.applied)}</p><p class="footnote">${esc(t.researchNote)}</p></section><div class="backtest-results"><section class="backtest-summary">${stats.map(([label, value]) => `<div><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`).join('')}</section><section class="panel"><div class="panel-head"><h2>${esc(t.chartTitle)}</h2><span class="source-tag">${esc(t.synthetic)}</span></div><div class="backtest-chart"></div><div class="chart-legend"><span class="legend portfolio-line">${esc(t.strategy)}</span><span class="legend benchmark-line">${esc(t.benchmark)}</span></div></section><section class="panel factor-validity"><h2>${esc(t.factorValidity)}</h2><table><thead><tr><th>${esc(t.factor)}</th><th>${esc(t.ic)}</th><th>${esc(t.samples)}</th></tr></thead><tbody>${a.factors.map((factor, i) => `<tr><td>${esc(t.factorNames[i])}</td><td>${numeric(factor.meanIC, 3)}</td><td>${factor.validMonths} / ${a.sampleCount}</td></tr>`).join('')}</tbody></table><p class="footnote">${esc(t.limitation)}</p></section></div></div><details class="backtest-method"><summary>${esc(t.method)}</summary><p>${esc(t.methodText)}</p><div class="backtest-months"><table><thead><tr><th>${esc(t.month)}</th><th>${esc(t.selected)}</th><th>${esc(t.monthlyStrategy)}</th><th>${esc(t.monthlyBenchmark)}</th></tr></thead><tbody>${a.months.map((month, i) => `<tr><td>${i+1}</td><td>${esc(month.top.map(sectorName).join(lang === 'en' ? ' / ' : '、'))}</td><td>${pct(month.strategyReturn)}</td><td>${pct(month.benchmarkReturn)}</td></tr>`).join('')}</tbody></table></div></details>`;
    renderResearchChart(true);
    if (researchChartObserver) researchChartObserver.observe(root.querySelector('.backtest-chart'));
    root.querySelectorAll('[data-research-factor]').forEach(input => input.addEventListener('input', () => {
      const i = Number(input.dataset.researchFactor); preferences[i] = Number(input.value); researchDirty = true;
      $('research-output-' + i).textContent = input.value;
      $('backtest-status').textContent = t.pending;
    }));
    $('run-backtest').addEventListener('click', () => {
      try {
        researchResult = R.analyze(Object.fromEntries(R.FACTORS.map((factor, i) => [factor.id, preferences[i]]))); researchDirty = false;
        renderResearch(true); animateSurface(root);
        document.dispatchEvent(new CustomEvent('factorlab:feedback', {detail:{kind:'backtest', stage:'success'}}));
      } catch { $('backtest-status').textContent = t.invalid; }
    });
    $('reset-backtest').addEventListener('click', () => { preferences = [25, 25, 25, 25]; researchResult = R.analyze(); researchDirty = false; renderResearch(true); animateSurface(root); });
    $('backtest-status').textContent = researchDirty ? t.pending : t.applied;
    if (focusedControl && $(focusedControl)?.getClientRects().length) $(focusedControl).focus({ preventScroll: true });
  }

  function renderCycle(state) {
    const root = $('cycle-notes'); if (!root) return;
    const t = text(), macro = state.macro;
    root.innerHTML = `<div class="cycle-evidence"><span class="source-tag" title="${esc(t.cycleNote)}">${esc(t.synthetic)}</span><div class="cycle-row"><span>${esc(t.rate)} <strong>${numeric(macro.rate, 1)}%</strong></span><span>${esc(t.growth)} <strong>${numeric(macro.growth, 1)}%</strong></span><span>${esc(t.credit)} <strong>${numeric(macro.credit, 0)} / 100</strong></span></div></div><div class="cycle-inference"><span class="source-tag">${esc(t.inference)}</span><p>${esc(t.inferenceText)}</p></div>`;
  }

  function sync() {
    const app = window.FactorLabApp; if (!app) return;
    const state = app.getState(), nextLang = app.getUI().lang;
    const changedLanguage = nextLang !== lang;
    lang = nextLang;
    updateLabels(); renderCycle(state);
    if (changedLanguage && current === 'backtest') renderResearch(true);
    if (!initialized) {
      initialized = true; phase = state.phase;
      const requested = hashView();
      const initial = ['review', 'complete'].includes(phase) ? 'journal' : phase === 'event' ? 'research' : phase === 'simulating' ? 'portfolio' : views.includes(requested) ? requested : 'research';
      applyView(initial, false);
      animateSurface(document.querySelector(`[data-view-panel="${current}"]`));
      return;
    }
    if (state.phase !== phase) {
      const previous = phase; phase = state.phase;
      if (['review', 'complete'].includes(phase)) go('journal', { focus: true });
      else if (phase === 'event') go('research', { focus: true });
      else if (phase === 'simulating') go('portfolio', { focus: true });
      else if (phase === 'decision' && previous !== null) go('research', { focus: true });
    }
  }

  document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => go(button.dataset.view, { focus: true })));
  document.addEventListener('click', event => {
    const action = event.target.closest('[data-open-view]');
    if (action) { event.preventDefault(); go(action.dataset.openView, { focus: true }); }
  });
  window.addEventListener('hashchange', () => { const requested = hashView(); if (views.includes(requested)) go(requested); });
  for (const [openId, closeId, dialogId] of [['open-coach', 'close-coach', 'coach-drawer'], ['open-context', 'close-context', 'course-context']]) {
    $(openId)?.addEventListener('click', () => { document.dispatchEvent(new Event('factorlab:pause')); const dialog = $(dialogId); dialog.showModal(); animateSurface(dialog); });
    $(closeId)?.addEventListener('click', () => $(dialogId).close());
  }
  document.addEventListener('toggle', event => { if (event.target instanceof HTMLDetailsElement && event.target.open) animateSurface(event.target); }, true);
  document.addEventListener('factorlab:render', sync);
  document.addEventListener('factorlab:view', () => renderResearchChart());
  if (!researchChartObserver) window.addEventListener('resize', () => renderResearchChart());
  window.FactorLabWorkspace = { go, getView: () => current, get settled() { return settled; }, getResearch: () => researchResult };
  sync();
})();
