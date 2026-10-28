(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const body = document.body;
  const systemMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const motionControl = $('reduced-motion');
  let motionChosen = false;
  const groups = [
    {
      title: '研究与决策', caption: '从观察到配置', className: 'research-group',
      items: [
        ['research', '行业研究', '观察行业与可见证据'],
        ['factors', '多因子', '动量 · 价值 · 质量 · 低波动'],
        ['cycle', '行业周期', '区分阶段与判断期限'],
        ['backtest', '回测', '检验方法与历史样本'],
        ['allocation', '配置决策', '权重、理由与边界'],
        ['risk', '风险与归因', '风险指标与收益来源']
      ]
    },
    {
      title: '记录与协作', caption: '让判断留下依据', className: 'tools-group',
      items: [
        ['journal', '决策复盘', '记录反思与判断变化'],
        ['coach', 'AI 研究伙伴', '围绕证据追问'],
        ['evidence', '证据与来源', '核对出处与适用范围'],
        ['account', '本地账号', '进入自己的研究空间'],
        ['save', '本地存档', '保留当前研究进度'],
        ['settings', '偏好设置', '语言、速度与动态']
      ]
    },
    {
      title: '行业与现金', caption: '五个行业，一份现金仓位', className: 'sectors-group',
      items: [
        ['semiconductor', '半导体', '芯片与半导体产业'],
        ['robotics', '机器人', '机器人与工业自动化'],
        ['materials', '先进材料', '材料技术与制造升级'],
        ['energy', '清洁能源', '清洁能源装备'],
        ['infrastructure', 'AI 基础设施', 'AI 与数字基础设施'],
        ['cash', 'Cash', '现金仓位']
      ]
    }
  ];
  const selected = groups.map(group => group.items[0][1]);
  const views = {
    research: ['01', '观察 → 判断', '行业研究', '对照行业周期与可见证据，区分长期定位和本轮的短期变化。'],
    backtest: ['02', '假设 → 检验', '因子与回测', '比较动量、价值、质量与低波动的作用。正式工作台使用合成历史练习，结果不代表真实市场有效性。'],
    allocation: ['03', '依据 → 配置', '配置决策', '在五个行业与 Cash 之间安排权重，先记录理由，再观察结果。这里仅展示入口。'],
    risk: ['04', '结果 → 解释', '风险与归因', '将收益、成本、波动和回撤放在一起理解，短期盈利并不能单独证明策略有效。'],
    journal: ['05', '反思 → 下一轮', '决策复盘', '回看当时掌握的证据与事前理由，记录哪些判断得到支持，哪些还需要补充。']
  };
  const materialNames = { clear: '清透', smoke: '烟灰', frost: '磨砂' };
  const announce = message => { $('live-status').textContent = message; };
  const isReduced = () => motionControl.checked || systemMotion.matches;

  $('icon-catalog').innerHTML = groups.map((group, groupIndex) => `
    <section class="icon-group ${group.className}" aria-labelledby="icon-group-${groupIndex}">
      <div class="group-heading"><h3 id="icon-group-${groupIndex}">${group.title}</h3><p>${group.caption}</p></div>
      <div class="icon-grid" role="group" aria-label="${group.title}">
        ${group.items.map(([key, name, caption], index) => `
          <button class="icon-card glass-button${groupIndex === 2 ? ' sector-card' : ''}" type="button" data-catalog-icon="${key}" data-group="${groupIndex}" data-label="${name}" aria-pressed="${index === 0}">
            <span class="icon-number">${String(groupIndex * 6 + index + 1).padStart(2, '0')}</span>
            <span class="seal-icon" data-icon="${key}" aria-hidden="true"></span>
            <span class="icon-label">${name}</span><span class="icon-caption">${caption}</span>
            <span class="selection-mark" aria-hidden="true">✓</span>
          </button>`).join('')}
      </div>
    </section>`).join('');

  function setView(key, bringIntoView = false) {
    const view = views[key];
    if (!view) return;
    document.querySelectorAll('[data-view]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.view === key)));
    ['view-index', 'view-kicker', 'view-title', 'view-description'].forEach((id, index) => { $(id).textContent = view[index]; });
    $('workspace-preview').dataset.view = key;
    announce(`已切换到${view[2]}入口预览。`);
    if (bringIntoView) $('navigation').scrollIntoView({ behavior: isReduced() ? 'instant' : 'smooth', block: 'start' });
  }

  document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => setView(button.dataset.view)));
  document.querySelectorAll('[data-view-link]').forEach(button => button.addEventListener('click', () => setView(button.dataset.viewLink, true)));
  document.querySelectorAll('[data-catalog-icon]').forEach(button => button.addEventListener('click', () => {
    const group = button.dataset.group;
    document.querySelectorAll(`[data-group="${group}"]`).forEach(item => item.setAttribute('aria-pressed', String(item === button)));
    selected[Number(group)] = button.dataset.label;
    $('selection-summary').textContent = `已选：${selected.join(' · ')}`;
  }));

  document.querySelectorAll('[data-material]').forEach(button => button.addEventListener('click', () => {
    body.dataset.glass = button.dataset.material;
    document.querySelectorAll('[data-material]').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
    announce(`已切换为${materialNames[button.dataset.material]}玻璃。`);
  }));
  $('transmission').addEventListener('input', event => {
    const value = Number(event.target.value);
    $('transmission-value').value = `${value}%`;
    body.style.setProperty('--glass-transmission', String(value / 100));
  });
  $('transmission').addEventListener('change', event => announce(`透光强度已调整为 ${event.target.value}%。`));

  function updateMotion() {
    if (systemMotion.matches) motionControl.checked = true;
    motionControl.disabled = systemMotion.matches;
    motionControl.closest('label').title = systemMotion.matches ? '遵循系统的减少动态设置' : '';
    body.dataset.reducedMotion = String(isReduced());
    document.documentElement.style.scrollBehavior = isReduced() ? 'auto' : '';
    document.querySelectorAll('.glass-button').forEach(button => button.getAnimations().forEach(animation => animation.cancel()));
  }
  motionControl.checked = systemMotion.matches;
  updateMotion();
  motionControl.addEventListener('change', () => {
    motionChosen = true;
    updateMotion();
    announce(isReduced() ? '已减少动态，所有状态仍会显示。' : '已开启轻量动态。');
  });
  systemMotion.addEventListener('change', () => {
    if (!motionChosen) motionControl.checked = systemMotion.matches;
    updateMotion();
  });

  const demos = [
    { button: 'run-demo', status: 'run-status', waiting: '正在展示等待状态…', complete: '回测反馈演示完成 · 未运行计算', label: '再次体验回测反馈', delay: 850 },
    { button: 'save-demo', status: 'save-status', waiting: '正在展示保存反馈…', complete: '保存确认演示完成 · 未写入存档', label: '再次体验保存反馈', delay: 550 }
  ];
  demos.forEach(demo => {
    const button = $(demo.button);
    button.addEventListener('click', () => {
      if (button.disabled) return;
      button.disabled = true;
      button.dataset.loading = 'true';
      button.setAttribute('aria-busy', 'true');
      $(demo.status).textContent = demo.waiting;
      window.setTimeout(() => {
        button.disabled = false;
        button.dataset.loading = 'false';
        button.removeAttribute('aria-busy');
        button.dataset.complete = 'true';
        button.querySelector('.button-label').textContent = demo.label;
        $(demo.status).textContent = demo.complete;
      }, isReduced() ? 0 : demo.delay);
    });
  });

  document.querySelectorAll('[data-horizon]').forEach(button => button.addEventListener('click', () => {
    document.querySelectorAll('[data-horizon]').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
    $('horizon-status').textContent = button.dataset.horizon === 'long' ? '长期定位：关注产业逻辑与持续性。' : '短期战术：关注当前周期与可见变化。';
  }));
  document.querySelectorAll('.state-button:not(:disabled)').forEach(button => button.addEventListener('click', () => {
    announce(`${button.closest('.state-example').querySelector('h3').textContent}样式已点按。此区域保持固定状态，方便比较。`);
  }));

  const dialog = $('coach-dialog');
  let dialogTrigger = null;
  document.querySelectorAll('[data-open-coach]').forEach(button => button.addEventListener('click', () => {
    if (dialog.open) return;
    dialogTrigger = button;
    dialog.showModal();
  }));
  dialog.querySelector('.dialog-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => dialogTrigger?.focus({ preventScroll: true }));
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const bounds = dialog.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
  });
  const prompts = {
    evidence: '哪些已知信息支持这条判断？请列出来源、时间，以及仍然缺少的证据。',
    horizon: '这条依据影响的是长期产业定位，还是本轮短期变化？需要哪些信息区分两者？',
    risk: '当前配置有哪些集中度、费用和回撤方面的风险？哪些结论还不能从现有信息得到？'
  };
  document.querySelectorAll('[data-prompt]').forEach(button => button.addEventListener('click', () => {
    document.querySelectorAll('[data-prompt]').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
    $('coach-example').textContent = prompts[button.dataset.prompt];
  }));
})();
