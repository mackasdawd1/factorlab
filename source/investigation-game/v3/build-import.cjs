const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');
const {pathToFileURL} = require('node:url');

const root = path.resolve(__dirname, '../..');
const local = path.join(root, '.local/redesign-20261013');
const temporary = path.join(local, 'tmp');
const output = path.join(__dirname, 'import');
const screens = path.join(output, 'screens');
const delivery = path.join(__dirname, 'delivery');
const evidence = path.join(__dirname, 'evidence');
const width = 1440, height = 900;
assert.match(root, /^[dD]:[\\/]/, 'All export work must stay on D:');
process.env.TEMP = temporary;
process.env.TMP = temporary;
process.env.TMPDIR = temporary;
process.env.PLAYWRIGHT_BROWSERS_PATH = path.join(local, 'runtime/browsers');
process.env.PYTHONDONTWRITEBYTECODE = '1';
process.env.PYTHONIOENCODING = 'utf-8';
const E = require('../v2/simulation.js');
const read = name => fs.readFileSync(path.resolve(__dirname, name), 'utf8');
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const esc = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function makeScenarios() {
  let state = E.reduce(E.initial({seed:20261013}), {type:'read',id:'E1'});
  const initial = state;
  state = E.reduce(state, {type:'lock',weights:[.25,.18,.12,.15,.15,.15],factorWeights:[.25,.25,.25,.25],reason:'evidence',forecast:'flat'});
  state = E.reduce(state, {type:'advance',days:20});
  assert.equal(state.phase, 'event');
  const event = state;
  let actions = 0;
  while (state.phase !== 'review') {
    assert.ok(actions++ < 100, 'First round must terminate');
    state = E.reduce(state, state.phase === 'event' ? {type:'resume'} : {type:'advance',days:20});
  }
  const review = state;
  while (state.phase !== 'complete') {
    assert.ok(actions++ < 250, 'Six-round example must terminate');
    const action = state.phase === 'review' ? {type:'next'} : state.phase === 'decision'
      ? {type:'lock',weights:E.recommend(state,[.25,.25,.25,.25],.15),factorWeights:[.25,.25,.25,.25],reason:'risk',forecast:'flat'}
      : state.phase === 'event' ? {type:'resume'} : {type:'advance',days:20};
    state = E.reduce(state, action);
  }
  assert.equal(state.results.length, 6);
  return [
    {id:'01-research',view:'research',state:initial,zh:'行业研究',en:'Sector research'},
    {id:'02-backtest',view:'backtest',state:initial,zh:'因子与回测',en:'Factors and backtest'},
    {id:'03-allocation',view:'portfolio',state:initial,zh:'配置决策',en:'Allocation decision'},
    {id:'04-event',view:'research',state:event,zh:'事件检查点',en:'Event checkpoint'},
    {id:'05-risk',view:'risk',state:review,zh:'风险与归因',en:'Risk and attribution'},
    {id:'06-review',view:'journal',state:review,zh:'本轮复盘',en:'Round review'},
    {id:'07-complete',view:'journal',state,zh:'六轮完成示例',en:'Six-round completion example'},
    {id:'08-coach',view:'research',state:initial,dialog:'coach-drawer',zh:'AI 研究伙伴',en:'AI research partner'},
    {id:'09-settings',view:'research',state:initial,dialog:'settings-dialog',zh:'语言与存档',en:'Language and saves'},
    {id:'10-sources',view:'research',state:initial,dialog:'course-context',zh:'研究边界与来源',en:'Scope and sources'}
  ];
}

const scenarios = makeScenarios();
const screenForView = {research:'01-research',backtest:'02-backtest',portfolio:'03-allocation',risk:'05-risk',journal:'06-review'};
const requiredIds = {'01-research':['go-allocation'],'02-backtest':['run-backtest'],'03-allocation':['confirm'],'04-event':['resume'],'05-risk':['model-info'],'06-review':['next-round'],'07-complete':['replay'],'08-coach':['close-coach','ask'],'09-settings':['close-settings','language'],'10-sources':['close-context']};
const criticalSelectors = {
  '01-research':['.macro-strip','#shared-market','.event-panel','.thesis-panel','.next-action'],
  '02-backtest':['.backtest-controls','.backtest-summary','.backtest-chart','.factor-validity','.backtest-method>summary'],
  '03-allocation':['#portfolio','.decision-panel'],
  '04-event':['#shared-market','.event-panel','.thesis-panel'],
  '05-risk':['#risk','#shared-market','.risk-notes'],
  '06-review':['#review','#journal'],
  '07-complete':['#review','#journal'],
  '08-coach':['.drawer-top','.coach-state','.coach-intro','#messages','.quick-questions','#coach-form'],
  '09-settings':['#settings-dialog'],
  '10-sources':['#course-context']
};
const exportCss = `
html{scroll-behavior:auto}body{margin:0;background:#fff}
.design-canvas{position:relative;isolation:isolate;display:block;width:1440px;height:900px;min-height:900px;margin:0;overflow:hidden;background:#fff;color:var(--ink)}
.design-canvas,.design-canvas *,.design-canvas *::before,.design-canvas *::after{animation:none!important;transition:none!important;scroll-behavior:auto!important;view-transition-name:none!important}
.design-canvas .sidebar{position:absolute;height:900px;bottom:auto}
.design-canvas .topbar{position:relative;top:auto}
.design-canvas .skip{display:none}
.design-canvas dialog[open]{position:absolute;z-index:101;max-height:none;transform:none!important;display:block}
.design-canvas .export-backdrop{position:absolute;inset:0;background:rgba(23,23,23,.25);z-index:100}
.design-canvas input,.design-canvas textarea,.design-canvas select{pointer-events:none}
.overview-header{width:1440px;margin:0 auto;padding:32px 0;font:16px/1.6 Arial,sans-serif;color:#171717}
.overview-header h1{font-size:28px;margin:0 0 12px}.overview-header nav{display:flex;flex-wrap:wrap;gap:10px 22px;margin-top:18px}.overview-header a{color:#a94612;text-decoration:underline}
.design-overview{background:#e9e9e9;min-width:1504px}.design-overview .design-canvas{margin:0 auto 40px}.overview-caption{width:1440px;margin:0 auto;padding:12px 0;font:600 18px/1.5 Arial,sans-serif}
`;
const documentHtml = (lang, title, css, body, overview = false) => `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=${width},initial-scale=1"><title>FactorLab Studio — ${esc(title)}</title><style>${css}\n${exportCss}\n${overview?'':'html,body{width:1440px;min-width:1440px;max-width:1440px}'}</style></head><body${overview?' class="design-overview"':''}>${body}</body></html>`;

function envelope(scenario) {
  const state = scenario.state;
  return {version:'factorlab-ui-v3',game:E.serialize(state),draft:state.phase === 'decision' ? [.25,.18,.12,.15,.15,.15] : state.results.at(-1)?.weights || state.weights,factorPrefs:[25,25,25,25],reason:'evidence',note:'',forecast:'flat',reflection:''};
}

async function capture(page, scenario, lang) {
  await page.evaluate(async ({view}) => { await window.FactorLabWorkspace.go(view,{animate:false}); await window.FactorLabWorkspace.settled; }, scenario);
  if (scenario.id === '06-review') await page.locator('#next-round').evaluate((el, lang) => { el.textContent = lang === 'en' ? 'View six-round completion example' : '查看六轮完成示例'; }, lang);
  if (scenario.id === '07-complete') await page.locator('#replay').evaluate((el, lang) => { el.textContent = lang === 'en' ? 'Return to research start' : '回到研究起点'; }, lang);
  if (scenario.dialog) {
    const opener = {'coach-drawer':'#open-coach','settings-dialog':'#settings','course-context':'#open-context'}[scenario.dialog];
    await page.locator(opener).click();
    if (scenario.dialog === 'coach-drawer') {
      await page.route('**/api/coach-v2', route => route.abort());
      await page.locator('[data-question="macro"]').click();
      await page.waitForFunction(() => !window.FactorLabApp.getUI().busy && document.querySelectorAll('#messages .assistant').length > 0);
    }
  }
  await page.evaluate(async () => { await document.fonts.ready; document.getAnimations().forEach(animation => { try { animation.finish(); } catch { animation.cancel(); } }); window.scrollTo(0,0); });
  return page.evaluate(({scenario, lang, width, height, screenForView, requiredIds}) => {
    const round = n => Math.round(n * 100) / 100;
    const bounds = el => { const r = el.getBoundingClientRect(); return {x:round(r.x),y:round(r.y),width:round(r.width),height:round(r.height)}; };
    const visible = el => { const s = getComputedStyle(el); return el.getClientRects().length > 0 && s.display !== 'none' && s.visibility !== 'hidden' && s.opacity !== '0' && !el.closest('[hidden]'); };
    const selector = el => el.id ? '#' + el.id : ['view','openView','evidence','preset','question','researchFactor'].map(key => el.dataset[key] ? '[data-' + key.replace(/[A-Z]/g, letter => '-' + letter.toLowerCase()) + '="' + el.dataset[key] + '"]' : '').find(Boolean) || el.tagName.toLowerCase();
    const target = el => {
      if (el.dataset.view || el.dataset.openView) return {kind:'NAVIGATE',target:screenForView[el.dataset.view || el.dataset.openView]};
      const links = {confirm:'04-event',resume:'06-review','next-round':'07-complete',replay:'01-research','open-coach':'08-coach',settings:'09-settings','open-context':'10-sources'};
      if (links[el.id]) return {kind:'NAVIGATE',target:links[el.id],exampleJump:el.id === 'next-round',resetsExample:el.id === 'replay'};
      if (['close-coach','close-settings','close-context'].includes(el.id)) return {kind:'BACK'};
      if (el.tagName === 'A' && /^https:/.test(el.href)) return {kind:'URL',url:el.href};
      return {kind:'LIVE_APP_ONLY',target:null};
    };
    const activeDialog = document.querySelector('dialog[open]');
    const interactive = [...document.querySelectorAll('button,a[href],input:not([type=file]),select,textarea,summary')].filter(visible);
    const hotspots = interactive.map(el => ({selector:selector(el),label:(el.innerText || el.getAttribute('aria-label') || el.getAttribute('placeholder') || el.value || '').trim(),bounds:bounds(el),disabled:el.disabled === true,coveredByDialog:Boolean(activeDialog && !activeDialog.contains(el)),...target(el)}));
    const required = requiredIds[scenario.id].map(id => { const el = document.getElementById(id), b = bounds(el); return {id,bounds:b,visible:visible(el),inCanvas:b.x >= 0 && b.y >= 0 && b.x+b.width <= width+.5 && b.y+b.height <= height+.5}; });
    const scrollers = [...document.querySelectorAll('main,.view-stack,.workspace-view,dialog[open],.messages,.history,.backtest-results,.risk-layout,.journal-layout')].filter(visible).filter(el => el.scrollHeight > el.clientHeight + 2).map(el => ({selector:selector(el),bounds:bounds(el),clientHeight:el.clientHeight,scrollHeight:el.scrollHeight,overflowY:getComputedStyle(el).overflowY}));
    const source = document.body, copy = source.cloneNode(true);
    const originalControls = source.querySelectorAll('input,textarea,select'), clonedControls = copy.querySelectorAll('input,textarea,select');
    originalControls.forEach((el, index) => {
      const cloned = clonedControls[index];
      if (el.tagName === 'TEXTAREA') cloned.textContent = el.value;
      else if (el.tagName === 'SELECT') [...cloned.options].forEach((option, i) => option.toggleAttribute('selected', i === el.selectedIndex));
      else { cloned.setAttribute('value', el.value); if (['checkbox','radio'].includes(el.type)) cloned.toggleAttribute('checked', el.checked); }
    });
    const liveNodes = [...source.querySelectorAll('*')], clonedNodes = [...copy.querySelectorAll('*')];
    liveNodes.forEach((el,index) => {
      const cloned = clonedNodes[index];
      if (el instanceof HTMLElement && !['SCRIPT','STYLE'].includes(el.tagName) && (getComputedStyle(el).display === 'none' || getComputedStyle(el).visibility === 'hidden' || el.hidden)) cloned.remove();
    });
    copy.querySelectorAll('script,[hidden],input[type=file],.skip,.sr-only,dialog:not([open])').forEach(el => el.remove());
    copy.querySelectorAll('details:not([open])').forEach(el => [...el.children].forEach(child => { if (child.tagName !== 'SUMMARY') child.remove(); }));
    copy.querySelectorAll('*').forEach(el => {
      for (const attr of [...el.attributes]) if (attr.name.startsWith('on')) el.removeAttribute(attr.name);
      el.removeAttribute('autofocus');
    });
    if (activeDialog) {
      const modal = copy.querySelector('#' + activeDialog.id), b = bounds(activeDialog);
      Object.assign(modal.style,{left:b.x+'px',top:b.y+'px',right:'auto',bottom:'auto',width:b.width+'px',height:b.height+'px',margin:'0',maxWidth:'none'});
      const backdrop = document.createElement('div'); backdrop.className = 'export-backdrop'; backdrop.setAttribute('aria-hidden','true'); copy.insertBefore(backdrop,modal);
    }
    for (const hotspot of hotspots) {
      const el = copy.querySelector(hotspot.selector);
      if (el && hotspot.target) el.dataset.prototypeTarget = hotspot.target + '-' + lang;
    }
    const artifact = document.createElement('section'); artifact.className = 'design-canvas'; artifact.id = scenario.id + '-' + lang; Object.assign(artifact.dataset,source.dataset); artifact.dataset.frameName = 'FactorLab / ' + scenario.id + ' / ' + lang; artifact.dataset.currentView = scenario.view;
    artifact.style.backgroundColor = getComputedStyle(source).backgroundColor;
    artifact.innerHTML = copy.innerHTML;
    const overview = artifact.cloneNode(true), ids = new Map();
    overview.querySelectorAll('[id]').forEach(el => { const id = el.id; ids.set(id,artifact.id + '--' + id); el.dataset.designId = id; el.id = ids.get(id); });
    const references = new Set(['for','aria-labelledby','aria-describedby','aria-controls','aria-owns','aria-activedescendant','list','form','headers']);
    overview.querySelectorAll('*').forEach(el => {
      for (const attr of [...el.attributes]) {
        let value = attr.value;
        if (references.has(attr.name)) value = value.split(/\s+/).map(id => ids.get(id) || id).join(' ');
        if (['href','xlink:href'].includes(attr.name) && value.startsWith('#') && ids.has(value.slice(1))) value = '#' + ids.get(value.slice(1));
        value = value.replace(/url\(#([^)]+)\)/g,(match,id) => ids.has(id) ? 'url(#' + ids.get(id) + ')' : match);
        if (value !== attr.value) el.setAttribute(attr.name,value);
      }
    });
    const exportRule = (rule,namespaced) => {
      if (rule.type === CSSRule.STYLE_RULE) {
        let selector = rule.selectorText.replace(/\bbody\b/g,'.design-canvas');
        if (namespaced) selector = selector.replace(/#([a-zA-Z_][\w-]*)/g,(_,id) => '[data-design-id="' + id + '"]');
        return selector + '{' + rule.style.cssText + '}';
      }
      if (rule.type === CSSRule.MEDIA_RULE) return matchMedia(rule.conditionText).matches ? [...rule.cssRules].map(child => exportRule(child,namespaced)).join('\n') : '';
      if (rule.cssRules && rule.type !== CSSRule.KEYFRAMES_RULE) return rule.cssText.slice(0,rule.cssText.indexOf('{')+1) + [...rule.cssRules].map(child => exportRule(child,namespaced)).join('\n') + '}';
      return rule.cssText;
    };
    const staticCss = [...document.styleSheets].map(sheet => [...sheet.cssRules].map(rule => exportRule(rule,false)).join('\n')).join('\n');
    const overviewCss = [...document.styleSheets].map(sheet => [...sheet.cssRules].map(rule => exportRule(rule,true)).join('\n')).join('\n');
    return {markup:artifact.outerHTML,overviewMarkup:overview.outerHTML,staticCss,overviewCss,hotspots,required,scrollers,bodyHeight:document.documentElement.scrollHeight,bodyWidth:document.documentElement.scrollWidth,textNodes:[...copy.querySelectorAll('*')].filter(el => [...el.childNodes].some(node => node.nodeType === Node.TEXT_NODE && node.textContent.trim())).length,svgCount:copy.querySelectorAll('svg').length,backtest:window.FactorLabWorkspace.getResearch(),domPhase:window.FactorLabApp.getState().phase};
  }, {scenario:{id:scenario.id,view:scenario.view},lang,width,height,screenForView,requiredIds});
}

function makePlayable(css) {
  const source = read('index.html');
  const scriptTags = [...source.matchAll(/<script\b[^>]*\bsrc="([^"]+)"[^>]*><\/script>/g)];
  assert.ok(scriptTags.length >= 6, 'App scripts were not found');
  let html = source.replace(/<link\b[^>]*rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/g, (_tag, relative) => `<style>${read(relative)}</style>`).replace(/<script\b[^>]*\bsrc="([^"]+)"[^>]*><\/script>/g, '');
  const scripts = scriptTags.map(([, relative]) => {
    const sourcePath = path.resolve(__dirname, relative);
    assert.ok(sourcePath.startsWith(root + path.sep), 'App source must stay in the project');
    let code = fs.readFileSync(sourcePath, 'utf8');
    if (relative === 'app.js') {
      assert.ok(code.includes("'import/'+lang+'.html'"), 'Design download hook changed');
      code = code.replace("'import/'+lang+'.html'", 'window.FactorLabDesignExports[lang]');
    }
    return '<script>' + code.replace(/<\/script/gi, '<\\/script') + '</script>';
  });
  const exports = Object.fromEntries(['zh-CN','en'].map(lang => [lang,read('import/' + lang + '.html')]));
  const designCode = `<script>window.FactorLabDesignExports=Object.fromEntries(Object.entries(${JSON.stringify(exports).replace(/</g,'\\u003c')}).map(([lang,html])=>[lang,URL.createObjectURL(new Blob([html],{type:'text/html;charset=utf-8'}))]));</script>`;
  const licenses = ['../v2/vendor/i18next.LICENSE',...fs.readdirSync(path.join(__dirname,'vendor')).filter(name => /LICENSE/i.test(name)).map(name => 'vendor/' + name)].map(name => ({file:name,text:read(name)}));
  const notices = `<script type="application/json" id="third-party-licenses">${JSON.stringify(licenses).replace(/</g,'\\u003c')}</script>`;
  html = html.replace('</body>', () => notices + designCode + scripts.join('\n') + '</body>');
  html = html.replace('href="./" aria-label="FactorLab"', 'href="#research" aria-label="FactorLab"').replace('id="design-link"', 'id="design-link" download="FactorLab-Studio-design.html"');
  html = html.replace(/<a href="\.\.\/v2\/"[^>]*>[\s\S]*?<\/a>/, '');
  return html;
}

async function build() {
  for (const dir of [temporary,output,screens,delivery,evidence]) fs.mkdirSync(dir,{recursive:true});
  const {chromium} = require(path.join(local,'runtime/web/node_modules/playwright'));
  const {createServer} = require('../server.cjs');
  const server = createServer({env:{}});
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  let browser;
  const css = read('style.css');
  const sourceSha256 = Object.fromEntries(['index.html','style.css','app.js','workspace.js','icons.js','accounts.js','accounts.css','quick-check.js','quick-check.css'].map(file => [file,sha(read(file))]));
  const manifest = {createdAt:new Date().toISOString(),canvas:{width,height,scale:1},synthetic:true,sourceOfValues:'FactorLabSimulation reducer, fixed seed 20261013; backtest from InvestigationResearch',engineSha256:sha(read('../v2/simulation.js')),researchSha256:sha(read('../research.js')),sourceSha256,cloudImportVerified:false,nativeMotionTransfer:false,interactionManifestOnly:true,states:[],files:[],layoutFailures:[],errors:[]};
  try {
    browser = await chromium.launch({headless:true,downloadsPath:temporary});
    for (const lang of ['zh-CN','en']) {
      const all = [];
      let overviewCss;
      for (const scenario of scenarios) {
        const context = await browser.newContext({viewport:{width,height},reducedMotion:'reduce'});
        const page = await context.newPage();
        page.on('pageerror', error => manifest.errors.push({lang,screen:scenario.id,message:error.message}));
        await page.addInitScript(({lang,save}) => { localStorage.clear(); localStorage.setItem('factorlab-simulation-language-v3',lang); localStorage.setItem('factorlab-simulation-ui-v3',JSON.stringify(save)); }, {lang,save:envelope(scenario)});
        await page.goto(origin + '/v3/',{waitUntil:'networkidle'});
        await page.waitForFunction(() => window.FactorLabApp && window.FactorLabWorkspace);
        const shot = await capture(page,scenario,lang);
        assert.equal(shot.domPhase,scenario.state.phase);
        const title = lang === 'en' ? scenario.en : scenario.zh;
        const name = scenario.id + '-' + lang + '.html';
        const html = documentHtml(lang,title,shot.staticCss,shot.markup);
        fs.writeFileSync(path.join(screens,name),html);
        all.push(`<h2 class="overview-caption">${esc(scenario.id + ' / ' + title)}</h2>` + shot.overviewMarkup);
        overviewCss = shot.overviewCss;
        manifest.files.push({file:'screens/' + name,bytes:Buffer.byteLength(html),sha256:sha(html)});
        const failures = shot.required.filter(item => !item.visible || !item.inCanvas);
        if (shot.bodyWidth > width + 2 || shot.bodyHeight > height + 2 || failures.length) manifest.layoutFailures.push({screen:scenario.id,lang,bodyWidth:shot.bodyWidth,bodyHeight:shot.bodyHeight,required:failures});
        manifest.states.push({id:scenario.id,lang,phase:scenario.state.phase,day:scenario.state.day,round:scenario.state.round,nav:scenario.state.nav,canvas:{x:0,y:0,width,height},textNodes:shot.textNodes,svgCount:shot.svgCount,required:shot.required,scrollRegions:shot.scrollers,bodyHeight:shot.bodyHeight,hotspots:shot.hotspots,backtest:scenario.id === '02-backtest' ? {sampleCount:shot.backtest?.sampleCount,strategyReturn:shot.backtest?.strategy?.totalReturn,benchmarkReturn:shot.backtest?.benchmark?.totalReturn} : undefined});
        await page.screenshot({path:path.join(evidence,'export-' + scenario.id + '-' + lang + '.png'),fullPage:false});
        await context.close();
        console.log('Captured ' + name + (failures.length || shot.bodyHeight > height+2 || shot.bodyWidth > width+2 ? ' — layout review required' : ''));
      }
      const explanation = lang === 'en' ? '20 fixed 1440 × 900 editable HTML screens across two languages Source values are synthetic Import individual files or the ZIP through html.to.design Native web motion and live application logic are not transferred by importing HTML' : '中英共 20 张 1440 × 900 可编辑 HTML 画板 数值来自合成模型 使用 html.to.design 导入单个文件或 ZIP 网页动效与应用逻辑不会随 HTML 自动转入设计工具';
      const header = `<header class="overview-header"><h1>FactorLab Studio / ${lang === 'en' ? 'Editable design screens' : '可编辑设计画板'}</h1><p>${explanation}</p><nav>${scenarios.map(scenario => `<a href="#${scenario.id}-${lang}">${esc(lang === 'en' ? scenario.en : scenario.zh)}</a>`).join('')}</nav></header>`;
      const html = documentHtml(lang,'Design overview',overviewCss,header + all.join('\n'),true);
      fs.writeFileSync(path.join(output,lang + '.html'),html);
      manifest.files.push({file:lang + '.html',bytes:Buffer.byteLength(html),sha256:sha(html)});
    }
    const playable = makePlayable(css), playableName = 'FactorLab-Research-Studio.html';
    fs.writeFileSync(path.join(delivery,playableName),playable);
    manifest.playable = {file:'../delivery/' + playableName,bytes:Buffer.byteLength(playable),sha256:sha(playable),ai:'Offline rule-based fallback; live AI requires the server'};
    const python = path.join(local,'runtime/python/python.exe');
    assert.ok(fs.existsSync(python),'D-local Python is required to create the ZIP');
    const zipName = 'FactorLab-Research-Studio-html-to-design.zip', zip = path.join(delivery,zipName);
    assert.equal(fs.readdirSync(screens).filter(name => name.endsWith('.html')).length,20,'Unexpected HTML files in export directory');
    execFileSync(python,['-c','from pathlib import Path\nimport sys,zipfile\np=Path(sys.argv[1])\nfiles=sorted(p.glob("*.html"))\nwith zipfile.ZipFile(sys.argv[2],"w",zipfile.ZIP_DEFLATED) as z:\n for f in files: z.write(f,f.name)\nwith zipfile.ZipFile(sys.argv[2]) as z:\n assert z.testzip() is None\n assert z.namelist()==[f.name for f in files]\n assert all(z.read(f.name)==f.read_bytes() for f in files)\n',screens,zip],{env:process.env,windowsHide:true});
    manifest.zip = {file:'../delivery/' + zipName,bytes:fs.statSync(zip).size,sha256:sha(fs.readFileSync(zip)),screens:20,crcValidated:true,sourceBytesVerified:true};
    assert.ok(manifest.zip.bytes < 32000000);
    await validate(browser,manifest,path.join(delivery,playableName));
    for (const [file,original] of Object.entries(sourceSha256)) if (sha(read(file)) !== original) manifest.errors.push({stage:'source-consistency',file,message:'Source changed while exporting; rebuild the final files'});
    manifest.validated = manifest.layoutFailures.length === 0 && manifest.errors.length === 0;
    fs.writeFileSync(path.join(output,'manifest.json'),JSON.stringify(manifest,null,2));
    fs.writeFileSync(path.join(delivery,'FactorLab-Research-Studio-manifest.json'),JSON.stringify(manifest,null,2));
    fs.writeFileSync(path.join(evidence,'export-results.json'),JSON.stringify({validated:manifest.validated,canvas:manifest.canvas,screens:20,noImageFlattening:true,offlinePlayable:true,nativeMotionTransfer:false,cloudImportVerified:false,layoutFailures:manifest.layoutFailures,errors:manifest.errors},null,2));
    assert.equal(manifest.layoutFailures.length,0,'Content exceeds or is clipped inside the export canvas; see import/manifest.json');
    assert.deepEqual(manifest.errors,[]);
    console.log(JSON.stringify({validated:true,screens:20,zip:manifest.zip,playable:manifest.playable},null,2));
  } catch (error) {
    manifest.validated = false;
    manifest.failure = error.message;
    fs.writeFileSync(path.join(output,'manifest.json'),JSON.stringify(manifest,null,2));
    fs.writeFileSync(path.join(delivery,'FactorLab-Research-Studio-manifest.json'),JSON.stringify(manifest,null,2));
    throw error;
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
}

async function validate(browser,manifest,playablePath) {
  const context = await browser.newContext({viewport:{width,height},reducedMotion:'reduce',acceptDownloads:true});
  const page = await context.newPage();
  page.on('pageerror',error => manifest.errors.push({stage:'standalone',message:error.message}));
  for (const lang of ['zh-CN','en']) {
    for (const scenario of scenarios) {
      await page.goto(pathToFileURL(path.join(screens,scenario.id + '-' + lang + '.html')).href);
      assert.equal(await page.locator('script,img,canvas,iframe,link[rel=stylesheet],[hidden]').count(),0);
      assert.equal(await page.locator('.design-canvas').count(),1);
      assert.equal(await page.locator('[data-view-panel]').count(),1);
      assert.ok(await page.locator('svg').count() > 5);
      const bounds = await page.locator('.design-canvas').boundingBox();
      assert.equal(bounds.width,width); assert.equal(bounds.height,height);
      const layout = await page.evaluate(({critical,required,width,height}) => {
        const rounded = value => Math.round(value * 100) / 100;
        const box = el => { const r = el.getBoundingClientRect(); return {x:rounded(r.x),y:rounded(r.y),width:rounded(r.width),height:rounded(r.height)}; };
        const visible = el => el && el.getClientRects().length > 0 && getComputedStyle(el).display !== 'none' && getComputedStyle(el).visibility !== 'hidden';
        const describe = el => el.id ? '#' + el.id : el.tagName.toLowerCase() + (el.classList.length ? '.' + [...el.classList].join('.') : '');
        const overflow = (a,b) => a.x < b.x-2 || a.y < b.y-2 || a.x+a.width > b.x+b.width+2 || a.y+a.height > b.y+b.height+2;
        const failures = [], elements = new Set();
        for (const selector of critical) {
          const root = document.querySelector(selector);
          if (!visible(root)) { failures.push({selector,problem:'missing-critical-content'}); continue; }
          elements.add(root);
          if (selector !== '#messages') root.querySelectorAll('*').forEach(el => { if (visible(el) && !el.closest('svg') && el.tagName !== 'OPTION') elements.add(el); });
        }
        for (const id of required) {
          const el = document.getElementById(id);
          if (!visible(el)) failures.push({selector:'#' + id,problem:'missing-required-control'});
          else elements.add(el);
        }
        for (const el of elements) {
          const bounds = box(el), selector = describe(el);
          if (overflow(bounds,{x:0,y:0,width,height})) { failures.push({selector,problem:'outside-canvas',bounds}); continue; }
          for (let ancestor = el.parentElement; ancestor && !ancestor.classList.contains('design-canvas'); ancestor = ancestor.parentElement) {
            const style = getComputedStyle(ancestor), clipX = /hidden|clip|auto|scroll/.test(style.overflowX), clipY = /hidden|clip|auto|scroll/.test(style.overflowY);
            if (!clipX && !clipY) continue;
            const parent = box(ancestor);
            if ((clipX && (bounds.x < parent.x-2 || bounds.x+bounds.width > parent.x+parent.width+2)) || (clipY && (bounds.y < parent.y-2 || bounds.y+bounds.height > parent.y+parent.height+2))) {
              failures.push({selector,problem:'clipped-by-ancestor',ancestor:describe(ancestor),bounds,clipBounds:parent}); break;
            }
          }
        }
        const ids = [...document.querySelectorAll('[id]')].map(el => el.id);
        return {checkedElements:elements.size,failures,geometry:Object.fromEntries(critical.map(selector => [selector,box(document.querySelector(selector))])),duplicateIds:ids.filter((id,index) => ids.indexOf(id) !== index),intentionalScrollRegions:[...document.querySelectorAll('#messages')].filter(el => el.scrollHeight > el.clientHeight+2).map(el => ({selector:describe(el),bounds:box(el),scrollHeight:el.scrollHeight,clientHeight:el.clientHeight}))};
      },{critical:criticalSelectors[scenario.id],required:requiredIds[scenario.id],width,height});
      assert.deepEqual(layout.duplicateIds,[],'Individual export contains duplicate IDs');
      manifest.states.find(state => state.id === scenario.id && state.lang === lang).staticValidation = layout;
      if (layout.failures.length) manifest.layoutFailures.push({stage:'static',screen:scenario.id,lang,failures:layout.failures});
      await page.screenshot({path:path.join(evidence,'static-' + scenario.id + '-' + lang + '.png'),fullPage:false});
      await page.setViewportSize({width:1920,height});
      const wide = await page.evaluate(critical => {
        const box = el => { const r = el.getBoundingClientRect(); return {x:Math.round(r.x*100)/100,y:Math.round(r.y*100)/100,width:Math.round(r.width*100)/100,height:Math.round(r.height*100)/100}; };
        return {viewportWidth:innerWidth,documentWidth:document.documentElement.getBoundingClientRect().width,documentScrollWidth:document.documentElement.scrollWidth,bodyWidth:document.body.getBoundingClientRect().width,canvas:box(document.querySelector('.design-canvas')),geometry:Object.fromEntries(critical.map(selector => [selector,box(document.querySelector(selector))]))};
      },criticalSelectors[scenario.id]);
      manifest.states.find(state => state.id === scenario.id && state.lang === lang).wideViewportValidation = wide;
      assert.equal(wide.documentWidth,width); assert.equal(wide.bodyWidth,width); assert.equal(wide.canvas.width,width); assert.equal(wide.canvas.height,height);
      assert.deepEqual(wide.geometry,layout.geometry,'A larger viewport changed the fixed export layout');
      await page.setViewportSize({width,height});
    }
    await page.goto(pathToFileURL(path.join(output,lang + '.html')).href);
    assert.equal(await page.locator('.design-canvas').count(),10);
    assert.equal(await page.locator('script,img,canvas,iframe').count(),0);
    assert.deepEqual(await page.evaluate(() => { const ids = [...document.querySelectorAll('[id]')].map(el => el.id); return ids.filter((id,index) => ids.indexOf(id) !== index); }),[],'Overview contains duplicate IDs');
  }
  await page.addInitScript(() => localStorage.clear());
  await page.goto(pathToFileURL(playablePath).href);
  await page.waitForFunction(() => window.FactorLabApp && window.FactorLabWorkspace);
  assert.equal(await page.locator('script[src],link[rel=stylesheet]').count(),0);
  assert.equal(await page.evaluate(() => window.FactorLabApp.getState().day),0);
  await page.evaluate(() => window.FactorLabWorkspace.go('backtest',{animate:false}));
  assert.equal(await page.locator('.factor-validity tbody tr').count(),4);
  await page.locator('#open-coach').click();
  await page.locator('[data-question="macro"]').click();
  await page.waitForFunction(() => !window.FactorLabApp.getUI().busy && document.querySelector('#messages .assistant'));
  assert.ok(await page.locator('#coach-mode').innerText());
  await page.locator('#close-coach').click();
  for (const lang of ['zh-CN','en']) {
    await page.locator('#settings').click();
    await page.locator('#language').selectOption(lang);
    await page.waitForFunction(lang => document.documentElement.lang === lang,lang);
    await page.locator('#close-settings').click();
    const pending = page.waitForEvent('download');
    await page.locator('#design-link').click();
    const downloaded = await pending;
    const contents = fs.readFileSync(await downloaded.path(),'utf8');
    assert.ok(contents.includes(`<html lang="${lang}">`));
    assert.equal((contents.match(/class="design-canvas"/g) || []).length,10);
  }
  await page.evaluate(() => window.FactorLabWorkspace.go('portfolio',{animate:false}));
  await page.locator('#reason').selectOption('risk');
  await page.locator('#confirm').click();
  assert.equal(await page.evaluate(() => window.FactorLabApp.getState().phase),'event');
  await context.close();
}

if (process.argv.includes('--check-states')) console.log(JSON.stringify(scenarios.map(({id,state}) => ({id,phase:state.phase,day:state.day,round:state.round,nav:state.nav})),null,2));
else build().catch(error => { console.error(error); process.exitCode = 1; });
