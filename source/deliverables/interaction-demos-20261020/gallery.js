(() => {
  const demos = {
    '01': ['01-evidence.html','01 证据聚焦','点击 E1 展开阅读 → 加入对照 → 切到 E2 → 摘录或撤销。试试 Esc 返回、再次展开。'],
    '02': ['02-allocation.html','02 配置雕刻','拖动半导体权重 → 观察圆环与现金 → 开启前后对照 → 撤销 → 展开本地规则检查。'],
    '03': ['03-journey.html','03 研究航线','摘录一条证据 → 下一章选因子 → 检查草稿 → 写下札记；用快速跳转回看，内容仍保留。']
  };
  const frame=document.querySelector('#demo-frame'), player=document.querySelector('#play');
  frame.addEventListener('load',()=>{
    const d=demos[frame.contentDocument?.body.dataset.demo];if(!d)return;
    frame.title=d[1]+'交互演示';document.querySelector('#player-title').textContent=d[1];document.querySelector('#player-guide').textContent=d[2];document.querySelector('#standalone').href=d[0];
  });
  document.querySelectorAll('[data-open]').forEach(b=>b.addEventListener('click',()=>{
    const d=demos[b.dataset.open];frame.src=d[0];frame.title=d[1]+'交互演示';document.querySelector('#player-title').textContent=d[1];document.querySelector('#player-guide').textContent=d[2];document.querySelector('#standalone').href=d[0];player.hidden=false;
    player.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'auto':'smooth',block:'start'});
  }));
  document.querySelectorAll('[data-width]').forEach(b=>b.addEventListener('click',()=>{
    frame.classList.toggle('mobile',b.dataset.width==='mobile');
    document.querySelectorAll('[data-width]').forEach(x=>x.setAttribute('aria-pressed',x===b));
  }));
  document.querySelector('#player-close').addEventListener('click',()=>{player.hidden=true;frame.removeAttribute('src');document.querySelector('.demo-grid').scrollIntoView({behavior:'auto'});});
})();
