(() => {
  'use strict';
  const valid = value => typeof value === 'string' && /^[a-f\d]{12,64}$/i.test(value);
  const installed = document.querySelector('meta[name="factorlab-version"]')?.content;
  if (!valid(installed)) return;

  const endpoint = new URL('./version.json', location.href);
  if (endpoint.origin !== location.origin) return;
  const firstCheck = Date.now() + 20000;
  let timer = null, pending = null, timeout = null, lastCheck = -Infinity;
  let available = '', dismissed = '', notice = null, message = null, apply = null, exportButton = null, later = null;
  let saving = false, failed = false, activePage = true;
  const visible = () => activePage && document.visibilityState === 'visible';
  const translations = {
    'zh-CN': {ready:'新版本已发布。你可以继续当前研究，准备好后再更新。', action:'保存进度并更新', saving:'正在保存进度…', failed:'本次进度未能保存。请先导出进度，确认文件已保存后再手动刷新。当前页面会保留。', export:'导出进度', later:'稍后'},
    en: {ready:'A new version is available. Continue your research and update when ready.', action:'Save progress and update', saving:'Saving progress…', failed:'Progress could not be saved. Export it and confirm the file was saved before refreshing manually. This page will stay open.', export:'Export progress', later:'Later'}
  };
  function translate() {
    if (!notice) return;
    const lang = window.FactorLabApp?.getUI?.().lang || document.documentElement.lang;
    const text = translations[lang] || translations['zh-CN'];
    message.textContent = text[failed ? 'failed' : 'ready'];
    apply.textContent = text[saving ? 'saving' : 'action'];
    exportButton.textContent = text.export;
    exportButton.hidden = !failed;
    later.textContent = text.later;
  }
  function update() {
    if (saving || !available) return;
    saving = true; failed = false; apply.disabled = true; translate();
    let saved = null;
    const acknowledge = event => { saved = event.detail; };
    document.addEventListener('factorlab:save', acknowledge);
    try {
      const button = document.getElementById('save-now');
      if (!button || button.disabled) throw Error('Save unavailable');
      button.click();
      const ui = window.FactorLabApp?.getUI?.();
      if (!saved || ui?.writable !== true || saved.profileId !== ui.profileId) throw Error('Save not confirmed');
      const destination = new URL(location.href);
      destination.searchParams.set('build', available);
      location.assign(destination.href);
    } catch {
      saving = false; failed = true; apply.disabled = false; translate();
    } finally {
      document.removeEventListener('factorlab:save', acknowledge);
    }
  }
  function show(version) {
    available = version;
    if (version === dismissed) { if (notice) notice.hidden = true; return; }
    if (!notice) {
      notice = document.createElement('aside'); notice.id = 'pages-update';
      notice.setAttribute('role', 'status'); notice.setAttribute('aria-live', 'polite');
      message = document.createElement('p'); message.id = 'pages-update-message';
      apply = document.createElement('button'); apply.id = 'pages-update-apply'; apply.type = 'button';
      exportButton = document.createElement('button'); exportButton.id = 'pages-update-export'; exportButton.type = 'button';
      later = document.createElement('button'); later.id = 'pages-update-later'; later.type = 'button';
      apply.addEventListener('click', update);
      exportButton.addEventListener('click', () => document.getElementById('export-save')?.click());
      later.addEventListener('click', () => { dismissed = available; notice.hidden = true; });
      notice.append(message, apply, exportButton, later); document.body.append(notice);
    }
    notice.hidden = false;
    translate();
  }
  function schedule(delay) {
    clearTimeout(timer); timer = null;
    if (visible() && !pending) timer = setTimeout(check, delay);
  }
  function wake() {
    schedule(Math.max(0, firstCheck - Date.now(), lastCheck + 15000 - Date.now()));
  }
  async function check() {
    timer = null;
    if (!visible() || pending) return;
    lastCheck = Date.now();
    const controller = new AbortController(); pending = controller;
    timeout = setTimeout(() => controller.abort(), 5000);
    try {
      const response = await fetch(endpoint.href, {cache:'no-store', mode:'same-origin', credentials:'same-origin', redirect:'error', signal:controller.signal});
      if (!response.ok) return;
      if (response.url && new URL(response.url).origin !== location.origin) return;
      const result = await response.json();
      if (controller.signal.aborted || !visible() || !valid(result?.id)) return;
      if (result.id.toLowerCase() !== installed.toLowerCase()) show(result.id.toLowerCase());
    } catch {
    } finally {
      clearTimeout(timeout); timeout = null; pending = null;
      schedule(60000);
    }
  }
  document.addEventListener('visibilitychange', () => {
    if (visible()) wake();
    else { clearTimeout(timer); timer = null; clearTimeout(timeout); timeout = null; pending?.abort(); }
  });
  document.addEventListener('factorlab:render', translate);
  window.addEventListener('focus', () => { if (visible()) wake(); });
  window.addEventListener('pagehide', () => { activePage = false; clearTimeout(timer); clearTimeout(timeout); pending?.abort(); });
  window.addEventListener('pageshow', () => { activePage = true; wake(); });
  schedule(20000);
})();
