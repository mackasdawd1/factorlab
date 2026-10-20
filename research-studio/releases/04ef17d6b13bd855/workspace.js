(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const views = ['research', 'portfolio', 'backtest', 'risk', 'journal'];
  const hashView = () => location.hash.replace(/^#\/?/, '');
  const labels = {
    'zh-CN': {
      research: ['行业研究', '先看公开证据，再决定本轮是否调整配置。'],
      portfolio: ['本轮配置', '分配资金，再记录这次调整的依据。'],
      backtest: ['因子与回测', '用过去的数据检验选行业的方法。'],
      risk: ['风险与收益来源', '看赚了多少，也看过程中承受了多大下跌。'],
      journal: ['决策复盘', '回看当时理由，给下一轮留下一个可检验的问题。'],
      factorNames: ['动量', '价值', '质量', '低波动'],
      factorHelp: ['动量：过去六个月的涨跌表现', '价值：盈利相对价格的水平（E/P）', '质量：股东投入资本的盈利水平（ROE）', '低波动：过去六个月波动较小'],
      weights: '你更看重哪些选行业线索？', run: '运行回测', reset: '四因子恢复等权', pending: '偏好已更改，请重新运行回测。', applied: '36 个月回测完成', invalid: '请将至少一个因子权重设为大于 0。',
      researchNote: '这里只做研究，调整偏好不会改变持仓。', strategy: '策略收益', benchmark: '五行业等权收益', drawdown: '最大回撤', spread: '前二与后二行业的月均收益差', sampleBadge: '36 个月合成样本',
      preview: '等权示例已计算；运行回测后记录本次检验。', factorIntro: '因子是给行业打分的线索；权重越高，排序越重视它。',
      drawdownHelp: '最大回撤：资产从此前最高点下跌最多的幅度。',
      icHelp: '排序相关性越接近 1，打分高的行业随后越倾向涨得好；接近 0 表示关系弱，负值表示相反。',
      validityDetails: '查看差值与样本限制', sampleHelp: '可计算月份只表示数据足以计算，不能当作获利月份或胜率。', tuningHelp: '样本小、反复调参可能产生偶然结果。',
      macroDetails: '查看利率、需求与风险指标', noConclusion: '未披露的信息，暂不下结论。', positioning: '长期定位：你持续看好的行业；短期战术：因本轮新证据做的调整。',
      chartTitle: '36 个月合成历史', chartLabel: '事前因子策略与五行业等权基准净值', firstNav: '初始净值 1', months: '36 个月', factorValidity: '因子打分与随后收益的关系', factor: '因子', ic: '排序相关性（平均 Rank IC）', samples: '可计算月份',
      method: '查看回测规则和逐月结果', methodText: '先用 6 个月形成线索，再逐月用当时已知信息排序。前二行业各 50%，基准五行业各 20%；均每月调仓，免交易费、不加杠杆。',
      limitation: '合成回测，不证明真实市场有效。此实验每行业可达 50%、免交易费，与本轮配置规则不同。',
      month: '样本月', selected: '事前选择', monthlyStrategy: '策略收益', monthlyBenchmark: '基准收益', synthetic: '合成观测', inference: '根据证据判断',
      cycle: '周期观察', rate: '政策利率', growth: '经济增长', credit: '信用压力',
      cycleNote: '周期标签来自教学模型。',
      inferenceText: '看订单、库存和利润是否互相印证。只看价格上涨，不能确认行业复苏。',
      percent: '百分比', source: '来源与课程范围'
    },
    en: {
      research: ['Sector research', 'Read disclosed evidence before deciding whether to change this round’s allocation.'],
      portfolio: ['Round allocation', 'Allocate funds, then record the reason for this change.'],
      backtest: ['Factors & backtest', 'Use past data to test how you select sectors.'],
      risk: ['Risk & return sources', 'Look at returns and the declines you experienced along the way.'],
      journal: ['Decision review', 'Review your original reason and leave one testable question for next round.'],
      factorNames: ['Momentum', 'Value', 'Quality', 'Low volatility'],
      factorHelp: ['Prior six-month cumulative return', 'Synthetic E/P known at that time', 'Synthetic ROE known at that time', 'Negative prior six-month volatility'],
      weights: 'Research factor preferences', run: 'Run backtest', reset: 'Equal weights', pending: 'Preferences changed. Run the backtest to update results.', applied: '36-month replay complete', invalid: 'At least one factor weight must be positive',
      researchNote: 'This is a method exercise. These preferences do not change holdings.', strategy: 'Strategy return', benchmark: 'Equal-sector return', drawdown: 'Maximum drawdown', spread: 'Top two minus bottom two monthly mean', sampleBadge: '36 months of synthetic samples',
      preview: 'Equal-weight example calculated; run a backtest to record your test.', factorIntro: 'Factors are clues used to score sectors. A higher weight gives a clue more influence.',
      drawdownHelp: 'Maximum drawdown is the largest decline from an earlier asset peak.',
      icHelp: 'Closer to 1 means higher-scored sectors tended to have higher subsequent returns; near 0 means a weak relationship, and a negative value means the reverse.',
      validityDetails: 'View spread and sample limits', sampleHelp: 'Calculable months are months with sufficient data. They are not winning months or a win rate.', tuningHelp: 'Small samples and repeated tuning can produce chance results.',
      macroDetails: 'View rates, demand and risk indicators', noConclusion: 'Do not conclude from information that has not been disclosed.', positioning: 'Long-term positioning is the sector case you maintain; short-term tactics are changes based on new evidence this round.',
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
  let transition = null, settled = Promise.resolve(), preferences = [25, 25, 25, 25], researchResult = null, researchLanguage = null, researchDirty = false, researchRun = false;
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
    FactorVisuals.chart(host,{rows:researchResult.strategy.nav.map((nav,i)=>({nav,benchmarkNav:researchResult.benchmark.nav[i],month:i})),series:[{key:'benchmarkNav',name:text().benchmark,color:'#54534e',dash:true},{key:'nav',name:text().strategy,color:'#814d68'}],label:text().chartLabel,format:v=>numeric(v,2),xLabel:r=>(lang==='en'?'Month ':'样本月 ')+(r?.month||0)});
    researchChartSize=size;
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
    const stats = [[t.strategy, pct(a.strategy.totalReturn)], [t.benchmark, pct(a.benchmark.totalReturn)], [t.drawdown, pct(a.strategy.maxDrawdown)]];
    researchChartObserver?.disconnect();
    researchChartSize = '';
    root.innerHTML = `<div class="backtest-layout"><section class="backtest-controls panel"><div class="panel-head"><h2>${esc(t.weights)}</h2><span class="source-tag">${esc(t.sampleBadge)}</span></div><p class="footnote">${esc(t.factorIntro)}</p>${preferences.map((value, i) => `<div class="backtest-factor"><label for="research-weight-${i}">${esc(t.factorNames[i])}</label><output id="research-output-${i}" for="research-weight-${i}">${value}</output><input id="research-weight-${i}" data-research-factor="${i}" type="range" min="0" max="100" step="5" value="${value}" aria-label="${esc(t.factorNames[i])}"><small>${esc(t.factorHelp[i])}</small></div>`).join('')}<div class="backtest-actions"><button id="run-backtest" class="primary">${esc(t.run)}</button><button id="reset-backtest">${esc(t.reset)}</button></div><p class="backtest-status" id="backtest-status" role="status">${esc(t.applied)}</p><p class="footnote">${esc(t.researchNote)}</p></section><div class="backtest-results"><section class="backtest-summary">${stats.map(([label, value]) => `<div><span>${esc(label)}</span><strong>${esc(value)}</strong>${label === t.drawdown ? `<small>${esc(t.drawdownHelp)}</small>` : ''}</div>`).join('')}</section><section class="panel"><div class="panel-head"><h2>${esc(t.chartTitle)}</h2><span class="source-tag">${esc(t.sampleBadge)}</span></div><div class="backtest-chart"></div><div class="chart-legend"><span class="legend portfolio-line">${esc(t.strategy)}</span><span class="legend benchmark-line">${esc(t.benchmark)}</span></div></section><section class="panel factor-validity"><h2>${esc(t.factorValidity)}</h2><p class="footnote">${esc(t.icHelp)}</p><table><thead><tr><th>${esc(t.factor)}</th><th>${esc(t.ic)}</th><th>${esc(t.samples)}</th></tr></thead><tbody>${a.factors.map((factor, i) => `<tr><td>${esc(t.factorNames[i])}</td><td>${numeric(factor.meanIC, 3)}</td><td>${factor.validMonths} / ${a.sampleCount}</td></tr>`).join('')}</tbody></table><p class="footnote">${esc(t.limitation)}</p><details class="factor-sample-details"><summary>${esc(t.validityDetails)}</summary><p>${esc(t.spread)}: <strong>${numeric(a.meanSpread * 100, 3)} ${lang === 'en' ? 'percentage points' : '个百分点'}</strong></p><p>${esc(t.sampleHelp)}</p><p>${esc(t.tuningHelp)}</p></details></section></div></div><details class="backtest-method"><summary>${esc(t.method)}</summary><p>${esc(t.methodText)}</p><div class="backtest-months"><table><thead><tr><th>${esc(t.month)}</th><th>${esc(t.selected)}</th><th>${esc(t.monthlyStrategy)}</th><th>${esc(t.monthlyBenchmark)}</th></tr></thead><tbody>${a.months.map((month, i) => `<tr><td>${i+1}</td><td>${esc(month.top.map(sectorName).join(lang === 'en' ? ' / ' : '、'))}</td><td>${pct(month.strategyReturn)}</td><td>${pct(month.benchmarkReturn)}</td></tr>`).join('')}</tbody></table></div></details>`;
    renderResearchChart(true);
    if (researchChartObserver) researchChartObserver.observe(root.querySelector('.backtest-chart'));
    root.querySelectorAll('[data-research-factor]').forEach(input => input.addEventListener('input', () => {
      const i = Number(input.dataset.researchFactor); preferences[i] = Number(input.value); researchDirty = true; researchRun = false;
      $('research-output-' + i).textContent = input.value;
      $('backtest-status').textContent = t.pending;
    }));
    $('run-backtest').addEventListener('click', () => {
      try {
        researchResult = R.analyze(Object.fromEntries(R.FACTORS.map((factor, i) => [factor.id, preferences[i]]))); researchDirty = false; researchRun = true;
        renderResearch(true); animateSurface(root);
        document.dispatchEvent(new CustomEvent('factorlab:feedback', {detail:{kind:'backtest', stage:'success'}}));
      } catch { $('backtest-status').textContent = t.invalid; }
    });
    $('reset-backtest').addEventListener('click', () => { preferences = [25, 25, 25, 25]; researchResult = R.analyze(); researchDirty = false; researchRun = false; renderResearch(true); animateSurface(root); });
    $('backtest-status').textContent = researchDirty ? t.pending : researchRun ? t.applied : t.preview;
    if (focusedControl && $(focusedControl)?.getClientRects().length) $(focusedControl).focus({ preventScroll: true });
  }

  function renderCycle(state) {
    const root = $('cycle-notes'); if (!root) return;
    const t = text(), macro = state.macro, wasOpen = root.querySelector('details')?.open;
    root.innerHTML = `<details class="cycle-evidence" ${wasOpen ? 'open' : ''}><summary>${esc(t.macroDetails)}</summary><span class="source-tag" title="${esc(t.cycleNote)}">${esc(t.synthetic)}</span><div class="cycle-row"><span>${esc(t.rate)} <strong>${numeric(macro.rate, 1)}%</strong></span><span>${esc(t.growth)} <strong>${numeric(macro.growth, 1)}%</strong></span><span>${esc(t.credit)} <strong>${numeric(macro.credit, 0)} / 100</strong></span></div><p class="footnote">${esc(t.positioning)}</p></details><div class="cycle-inference"><span class="source-tag">${esc(t.inference)}</span><p>${esc(t.inferenceText)}</p><small>${esc(t.noConclusion)}</small></div>`;
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
  const resetResearchRun = () => { researchRun = false; if (current === 'backtest') renderResearch(true); };
  document.addEventListener('factorlab:profile', resetResearchRun);
  document.addEventListener('factorlab:restore', resetResearchRun);
  document.addEventListener('factorlab:new', resetResearchRun);
  $('start-new')?.addEventListener('click', resetResearchRun);
  if (!researchChartObserver) window.addEventListener('resize', () => renderResearchChart());
  window.FactorLabWorkspace = { go, getView: () => current, get settled() { return settled; }, getResearch: () => researchResult, getResearchStatus: () => ({ hasRun: researchRun, dirty: researchDirty, preferences: [...preferences] }) };
  sync();
})();
