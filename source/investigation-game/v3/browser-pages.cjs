const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const { build, staging, output, sha } = require('./build-pages.cjs');

const root = path.resolve(__dirname, '../..');
const temporary = path.join(staging, 'browser-temp');
const shots = path.join(staging, 'screenshots');
for (const dir of [temporary, shots]) fs.mkdirSync(dir, { recursive: true });
process.env.TEMP = process.env.TMP = process.env.TMPDIR = temporary;
process.env.PLAYWRIGHT_BROWSERS_PATH = path.join(root, '.local/redesign-20261013/runtime/browsers');
const { chromium } = require(path.join(root, '.local/redesign-20261013/runtime/web/node_modules/playwright'));
const prefix = '/factorlab/research-studio/';
const executable = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const report = {
  version: null, status: 'FAIL', startedAt: new Date().toISOString(), checks: [], layouts: [],
  screenshots: [], media: [], pageErrors: [], consoleErrors: [], httpErrors: [], requestFailures: [],
  cancelledMedia: [], apiRequests: [], externalRequests: [],
  environment: { runtime: process.execPath, browserExecutable: executable, prefix, temporary },
  limits: { humanTesting: 'NOT RUN', financialEfficacy: 'NOT RUN', previousArchive: 'Link only; remote archive is not in the local package' }
};
let browser, server, origin, bundle, allowed;

async function check(name, run) {
  const start = Date.now();
  try {
    const detail = await run();
    report.checks.push({ name, status: 'PASS', durationMs: Date.now() - start, detail });
    console.log('PASS ' + name);
  } catch (error) {
    report.checks.push({ name, status: 'FAIL', durationMs: Date.now() - start, error: error.message });
    console.error('FAIL ' + name + ': ' + error.message);
  }
}

function serve(request, response) {
  const pathname = new URL(request.url, 'http://127.0.0.1').pathname;
  const reject = status => {
    report.httpErrors.push({ path: pathname, status });
    response.writeHead(status); response.end();
  };
  if (!['GET', 'HEAD'].includes(request.method) || !pathname.startsWith(prefix)) return reject(404);
  let relative;
  try { relative = decodeURIComponent(pathname.slice(prefix.length)) || 'index.html'; } catch { return reject(400); }
  if (!allowed.has(relative)) return reject(404);
  const bytes = fs.readFileSync(path.join(output, relative));
  const types = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.mp4': 'video/mp4' };
  const headers = { 'Content-Type': types[path.extname(relative)] || 'text/plain; charset=utf-8', 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-cache' };
  const range = /^bytes=(\d+)-(\d*)$/.exec(request.headers.range || '');
  if (range) {
    const start = Number(range[1]), end = Math.min(range[2] ? Number(range[2]) : bytes.length - 1, bytes.length - 1);
    if (start > end) return reject(416);
    response.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${bytes.length}`, 'Content-Length': end - start + 1 });
    response.end(request.method === 'HEAD' ? undefined : bytes.subarray(start, end + 1));
  } else {
    response.writeHead(200, { ...headers, 'Content-Length': bytes.length });
    response.end(request.method === 'HEAD' ? undefined : bytes);
  }
}

async function listen() {
  for (let attempt = 0; attempt < 12; attempt++) {
    const candidate = http.createServer(serve);
    try {
      await new Promise((resolve, reject) => { candidate.once('error', reject); candidate.listen(crypto.randomInt(20000, 50000), '127.0.0.1', resolve); });
      server = candidate;
      origin = `http://127.0.0.1:${server.address().port}`;
      report.environment.origin = origin;
      return;
    } catch (error) { if (error.code !== 'EADDRINUSE') throw error; }
  }
  throw Error('No free local QA port');
}

async function withPage(run, options = {}) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce', acceptDownloads: true, ...options });
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  page.on('pageerror', error => report.pageErrors.push({ url: page.url(), message: error.message }));
  page.on('console', message => { if (message.type() === 'error') report.consoleErrors.push(message.text()); });
  page.on('request', request => {
    const url = new URL(request.url());
    if (/(?:^|\/)api(?:\/|$)/.test(url.pathname)) report.apiRequests.push({ url: request.url(), method: request.method() });
    if (['http:', 'https:'].includes(url.protocol) && url.origin !== origin) report.externalRequests.push(request.url());
  });
  page.on('requestfailed', request => {
    const item = { url: request.url(), type: request.resourceType(), error: request.failure()?.errorText };
    if (item.type === 'media' && item.error === 'net::ERR_ABORTED') report.cancelledMedia.push(item);
    else report.requestFailures.push(item);
  });
  page.on('response', response => {
    if (!response.ok() && response.status() !== 304) report.httpErrors.push({ url: response.url(), status: response.status() });
  });
  try {
    await page.goto(origin + prefix, { waitUntil: 'networkidle' });
    await ready(page);
    return await run(page);
  } finally { await context.close(); }
}

async function ready(page) {
  await page.waitForFunction(() => !!window.FactorLabApp && !!window.FactorLabWorkspace && window.FactorLabAccounts?.ready);
}
async function go(page, view) {
  await page.locator(`button[data-view="${view}"]`).click();
  await page.waitForFunction(value => FactorLabWorkspace.getView() === value, view);
  await page.evaluate(() => FactorLabWorkspace.settled);
}
async function language(page, lang) {
  await page.locator('#settings').click();
  await page.locator('#language').selectOption(lang);
  await page.waitForFunction(value => document.documentElement.lang === value, lang);
  await page.locator('#close-settings').click();
}
async function shot(page, name) {
  const file = path.join(shots, name + '.png');
  await page.screenshot({ path: file });
  report.screenshots.push(file);
}
const save = page => page.evaluate(() => FactorLabApp.getSave());
const envelope = page => page.evaluate(() => FactorLabApp.getEnvelope());

(async () => {
  try {
    assert.match(root, /^[Dd]:[\\/]/);
    assert.match(process.execPath, /^[Dd]:[\\/]/, 'Use the D-drive runtime from environment.ps1');
    assert.ok(fs.existsSync(executable), 'System Chrome is required to decode the actual H.264 clips');
    bundle = build(); report.version = bundle.version;
    allowed = new Set(bundle.files.map(file => file.path.replace(/^research-studio\//, '')));
    await check('Build manifest matches every staged public file', async () => {
      for (const file of bundle.files) {
        const bytes = fs.readFileSync(path.join(output, file.path.replace(/^research-studio\//, '')));
        assert.equal(bytes.length, file.bytes); assert.equal(sha(bytes), file.sha256);
      }
      const manifest = JSON.parse(fs.readFileSync(path.join(output, 'version.json'), 'utf8'));
      assert.equal(manifest.id, bundle.version);
      assert.equal(manifest.files.length + 1, bundle.files.length);
      return { files: bundle.files.length, version: bundle.version };
    });
    await listen();
    browser = await chromium.launch({ headless: true, executablePath: executable, downloadsPath: path.join(temporary, 'downloads') });
    report.environment.browserVersion = browser.version();

    await check('Original woodcut sprite decodes and navigation uses the intended atlas symbols', () => withPage(async page => {
      const resource = `releases/${bundle.version}/assets/icons/woodcut-atlas.png`;
      const expected = {
        research: { icon: 'squares-four', atlas: 'research', position: [2.25437, 8.34725] },
        backtest: { icon: 'flask', atlas: 'backtest', position: [59.11844, 9.09850] },
        portfolio: { icon: 'sliders-horizontal', atlas: 'allocation', position: [78.36474, 8.34725] },
        risk: { icon: 'shield-check', atlas: 'risk', position: [97.64468, 8.84808] },
        journal: { icon: 'notebook', atlas: 'journal', position: [2.08614, 50.16694] }
      };
      const loaded = await page.evaluate(async ({resource, views}) => {
        const url = new URL(resource, location.href).href;
        const response = await fetch(url), bytes = await response.arrayBuffer();
        const digest = await crypto.subtle.digest('SHA-256', bytes);
        const image = new Image(); image.src = url; await image.decode();
        const navigation = views.map(view => {
          const button = document.querySelector(`button[data-view="${view}"]`);
          const host = button?.querySelector('[data-icon]'), sprite = host?.querySelector('[data-atlas]');
          const style = sprite ? getComputedStyle(sprite) : null;
          return {view, icon:host?.dataset.icon, atlas:sprite?.dataset.atlas,
            background:style?.backgroundImage, position:style?.backgroundPosition.split(/\s+/).map(parseFloat),
            clip:style?.clipPath, hiddenFromAssistiveTechnology:sprite?.getAttribute('aria-hidden'),
            name:button?.getAttribute('aria-label') || button?.innerText.trim()};
        });
        return {status:response.status, type:response.headers.get('content-type'), bytes:bytes.byteLength,
          width:image.naturalWidth, height:image.naturalHeight,
          sha256:[...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join(''), navigation};
      }, {resource, views:Object.keys(expected)});
      assert.equal(loaded.status, 200); assert.match(loaded.type, /^image\/png\b/);
      assert.equal(loaded.width, 1774); assert.equal(loaded.height, 887);
      const original = fs.readFileSync(path.join(__dirname, 'assets/icons/woodcut-atlas.png'));
      assert.equal(loaded.bytes, original.length); assert.equal(loaded.sha256, sha(original));
      const expectedUrl = origin + prefix + resource;
      for (const item of loaded.navigation) {
        const intended = expected[item.view];
        assert.equal(item.icon, intended.icon, item.view);
        assert.equal(item.atlas, intended.atlas, item.view);
        assert.equal(item.background, `url("${expectedUrl}")`, item.view);
        assert.equal(item.position.length, 2, item.view);
        assert.ok(item.position.every((value, index) => Math.abs(value - intended.position[index]) < .0001), JSON.stringify(item));
        assert.match(item.clip, /^inset\(/, item.view);
        assert.equal(item.hiddenFromAssistiveTechnology, 'true'); assert.ok(item.name, item.view);
      }
      return loaded;
    }));

    await check('Static welcome supports visitors without a password form', () => withPage(async page => {
      for (const lang of ['zh-CN', 'en']) {
        await language(page, lang);
        await page.goto(origin + prefix + '?welcome=1', { waitUntil: 'networkidle' }); await ready(page);
        await page.locator('#account-dialog[open]').waitFor();
        assert.equal(await page.locator('meta[name="factorlab-hosting"]').getAttribute('content'), 'static');
        assert.equal(await page.locator('meta[name="factorlab-version"]').getAttribute('content'), bundle.version);
        assert.equal(await page.locator('#account-auth-form,input[type=password]').count(), 0);
        assert.match(await page.locator('#account-title').innerText(), lang === 'en' ? /Browser saves/ : /浏览器存档/);
        assert.match(await page.locator('#account-dialog').innerText(), lang === 'en' ? /no connected account or online AI/ : /不提供账号存档和在线 AI/);
        assert.equal(await page.locator('#login-mascot .mascot-poster').evaluate(image => image.complete && image.naturalWidth > 0), true);
        await shot(page, 'pages-welcome-' + lang);
        await page.locator('#account-dialog [data-account-action=guest]').click();
        assert.equal(await page.locator('#account-dialog').isVisible(), false);
        assert.equal(await page.evaluate(() => FactorLabWorkspace.getView()), 'research');
        assert.equal(new URL(page.url()).searchParams.has('welcome'), false);
        assert.deepEqual(await page.evaluate(() => FactorLabAccounts.getStatus()), { enabled: false, signedIn: false, busy: false });
      }
    }));

    await check('Browser draft survives explicit save, reload, export and import', () => withPage(async page => {
      const initial = await save(page);
      await go(page, 'portfolio');
      await page.locator('[data-preset=defensive]').click();
      await page.locator('#reason').selectOption('risk');
      await page.locator('#forecast').selectOption('down');
      await page.locator('#note').fill('公开版测试：等待订单转化为利润，保留现金缓冲。');
      await go(page, 'journal');
      await page.locator('#reflection').fill('复查利润兑现与行业周期之间的证据。');
      const draft = await envelope(page);
      await page.locator('#settings').click(); await page.locator('#save-now').click(); await page.locator('#close-settings').click();
      await page.reload({ waitUntil: 'networkidle' }); await ready(page);
      assert.deepEqual(await envelope(page), draft);
      await go(page, 'journal');
      const pending = page.waitForEvent('download');
      await page.locator('#export-save').click();
      const downloaded = await pending, destination = path.join(staging, 'browser-pages-export.json');
      await downloaded.saveAs(destination);
      const exported = JSON.parse(fs.readFileSync(destination, 'utf8'));
      assert.deepEqual(exported, draft);
      await go(page, 'portfolio'); await page.locator('[data-preset=growth]').click();
      await page.locator('#note').fill('Temporary draft to be replaced by imported backup');
      assert.notDeepEqual(await envelope(page), draft);
      await page.locator('#settings').click();
      await page.locator('#import-save').setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(exported)) });
      await page.waitForFunction(() => !document.querySelector('#settings-dialog').open);
      assert.deepEqual(await envelope(page), draft);
      assert.deepEqual(await save(page), initial, 'Draft operations must not change market state or actual holdings');
      return { reason: draft.reason, forecast: draft.forecast, financialStateUnchanged: true };
    }));

    await check('Bilingual research views remain usable at desktop and mobile widths', () => withPage(async page => {
      const before = await save(page);
      for (const lang of ['zh-CN', 'en']) {
        await language(page, lang);
        for (const [width, height] of [[1440, 900], [1280, 800], [390, 844]]) {
          await page.setViewportSize({ width, height });
          for (const view of ['research', 'portfolio', 'backtest', 'risk', 'journal']) {
            await go(page, view);
            const layout = await page.evaluate(() => {
              const icons = [...document.querySelectorAll('button [data-icon]')].filter(host => {
                const button = host.closest('button'), style = getComputedStyle(button);
                return button.getClientRects().length && style.visibility !== 'hidden' && style.opacity !== '0';
              }).map(host => {
                const button = host.closest('button'), rendered = host.querySelector('[data-atlas], svg');
                const box = host.getBoundingClientRect(), parent = button.getBoundingClientRect();
                const content = rendered?.getBoundingClientRect(), style = getComputedStyle(host);
                return {icon:host.dataset.icon, button:button.id || button.dataset.view || button.innerText.trim().slice(0, 60),
                  atlas:rendered?.dataset.atlas || null, width:box.width, height:box.height,
                  renderedWidth:content?.width || 0, renderedHeight:content?.height || 0,
                  visible:style.visibility !== 'hidden' && style.opacity !== '0',
                  contained:box.left >= parent.left - 1 && box.top >= parent.top - 1 && box.right <= parent.right + 1 && box.bottom <= parent.bottom + 1,
                  contentContained:!!content && content.left >= box.left - 1 && content.top >= box.top - 1 && content.right <= box.right + 1 && content.bottom <= box.bottom + 1,
                  buttonScrollWidth:button.scrollWidth, buttonClientWidth:button.clientWidth};
              });
              return {viewport:innerWidth, scrollWidth:document.documentElement.scrollWidth,
                navCount:[...document.querySelectorAll('[data-view]')].filter(node => node.getClientRects().length).length,
                bodyFont:Number.parseFloat(getComputedStyle(document.body).fontSize),
                oldVersion:document.querySelector('#design-link').getAttribute('href'), icons};
            });
            report.layouts.push({ lang, view, width, height, ...layout });
            assert.ok(layout.scrollWidth <= width + 1, JSON.stringify(report.layouts.at(-1)));
            assert.equal(layout.navCount, 5); assert.ok(layout.bodyFont >= 16);
            assert.equal(layout.oldVersion, 'previous/');
            assert.ok(layout.icons.length >= 5, 'Expected the five visible navigation icons');
            for (const icon of layout.icons) {
              const detail = JSON.stringify({lang, view, viewportWidth: width, ...icon});
              assert.ok(icon.visible && icon.width > 0 && icon.height > 0 && icon.renderedWidth > 0 && icon.renderedHeight > 0, detail);
              assert.ok(icon.contained && icon.contentContained, detail);
              assert.ok(icon.buttonScrollWidth <= icon.buttonClientWidth + 1, detail);
            }
            await page.evaluate(() => scrollTo(0, 0));
            await shot(page, `pages-${view}-${lang}-${width}`);
          }
        }
        await page.setViewportSize({ width: 1440, height: 900 });
      }
      assert.deepEqual(await save(page), before, 'Views and language changes must not alter market state');
      return { layouts: report.layouts.length, financialStateUnchanged: true };
    }));

    await check('Actual factor backtest recomputes 36 months without trading', () => withPage(async page => {
      const before = await save(page);
      await go(page, 'backtest');
      const previous = await page.evaluate(() => FactorLabWorkspace.getResearch());
      const factors = page.locator('[data-research-factor]');
      assert.equal(await factors.count(), 4);
      for (let index = 0; index < 4; index++) await factors.nth(index).press(index === 0 ? 'End' : 'Home');
      await page.locator('#run-backtest').click();
      const result = await page.evaluate(() => FactorLabWorkspace.getResearch());
      assert.equal(result.sampleCount, 36); assert.equal(result.months.length, 36);
      assert.equal(result.factors.length, 4); assert.ok(Number.isFinite(result.strategy.totalReturn));
      assert.notDeepEqual(result.months, previous.months);
      assert.equal(await page.locator('.factor-validity tbody tr').count(), 4);
      assert.match(await page.locator('.backtest-results').innerText(), /合成|Synthetic/i);
      assert.deepEqual(await save(page), before);
      await shot(page, 'pages-backtest-computed');
      return { sampleCount: result.sampleCount, factors: result.factors.length, financialStateUnchanged: true };
    }));

    await check('Offline helper handles greetings and follow-ups; Jev stays labelled as rules', () => withPage(async page => {
      const before = await save(page);
      for (const lang of ['zh-CN', 'en']) {
        await language(page, lang);
        await go(page, 'portfolio'); await page.locator('#note').fill('订单有改善，但利润兑现仍需核实。');
        await page.locator('#run-quick-check').click();
        const checked = await page.locator('#quick-check-result').innerText();
        assert.match(checked, lang === 'en' ? /Public version · Rule check/ : /规则检查 · 此版本未连接 AI/);
        assert.match(checked, lang === 'en' ? /Jev is not connected/ : /不能判断理由是否成立/);
        await page.locator('#open-coach').click();
        assert.match(await page.locator('#coach-mode').innerText(), lang === 'en' ? /Offline|Rule guidance/i : /离线|规则提示/);
        await page.locator('#question').fill(lang === 'en' ? 'Hello' : '你好');
        await page.locator('#ask').click();
        await page.locator('#messages .assistant').first().waitFor();
        await page.waitForFunction(() => !FactorLabApp.getUI().busy);
        assert.match(await page.locator('#messages .assistant').last().innerText(), lang === 'en' ? /Hello!/ : /你好！/);
        await page.locator('#question').fill(lang === 'en' ? 'What is a backtest?' : '什么是回测？');
        await page.locator('#ask').click();
        await page.waitForFunction(() => !FactorLabApp.getUI().busy);
        assert.match(await page.locator('#messages .assistant').last().innerText(), lang === 'en' ? /backtest|historical|past/i : /回测|过去/);
        await page.locator('#question').fill(lang === 'en' ? 'Explain it more simply' : '说简单一点');
        await page.locator('#ask').click();
        await page.waitForFunction(() => !FactorLabApp.getUI().busy);
        assert.match(await page.locator('#messages .assistant').last().innerText(), lang === 'en' ? /rehearsal/ : /彩排/);
        await shot(page, 'pages-coach-rules-' + lang);
        await page.locator('#close-coach').click();
      }
      assert.deepEqual(await save(page), before);
      return { languages: 2, financialStateUnchanged: true };
    }));

    await check('Research summary exports only current practice and explicitly run backtest evidence', () => withPage(async page => {
      await go(page, 'journal');
      assert.equal(await page.locator('#report-details').getAttribute('open'), null);
      assert.equal(await page.evaluate(() => FactorLabReport.build().hasRunBacktest), false);
      await page.locator('#reflection').fill('报告测试：订单转化是否兑现，下一轮继续核对利润。');
      const before = await envelope(page);
      const pending = page.waitForEvent('download');
      await page.locator('#export-report').click();
      const downloaded = await pending, destination = path.join(staging, 'browser-pages-report.txt');
      await downloaded.saveAs(destination);
      const exported = fs.readFileSync(destination, 'utf8').replace(/^\uFEFF/, '');
      assert.equal(exported, await page.evaluate(() => FactorLabReport.build().text));
      assert.match(exported, /尚未运行回测/);
      assert.match(exported, /名称冲突/);
      assert.match(exported, /报告测试：订单转化/);
      assert.deepEqual(await envelope(page), before);
      await go(page, 'backtest');
      await page.locator('#run-backtest').click();
      await page.waitForFunction(() => FactorLabReport.build().hasRunBacktest);
      await page.locator('[data-research-factor]').first().press('End');
      await page.waitForFunction(() => !FactorLabReport.build().hasRunBacktest);
      assert.match(await page.evaluate(() => FactorLabReport.build().text), /尚未重新运行/);
      assert.deepEqual(await envelope(page), before);
      return { exactDownload: true, courseBoundaries: true, distinguishesExplicitRun: true, financialStateUnchanged: true };
    }));

    await check('Active navigation contrast, single-line mobile day and scrollable AI close control remain usable', () => withPage(async page => {
      const before = await save(page), colors = [];
      await language(page, 'en');
      for (const width of [1440, 390]) {
        await page.setViewportSize({width, height:844});
        await go(page, 'research');
        await page.locator('.rail button[aria-current=page]').hover();
        const color = await page.locator('.rail button[aria-current=page]').evaluate(button => {
          const style = getComputedStyle(button);
          return {foreground:style.color, background:style.backgroundColor};
        });
        const luminance = css => {
          const rgb = css.match(/[\d.]+/g).slice(0, 3).map(Number).map(value => {
            value /= 255;
            return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4;
          });
          return .2126 * rgb[0] + .7152 * rgb[1] + .0722 * rgb[2];
        };
        const foreground = luminance(color.foreground), background = luminance(color.background);
        const contrast = (Math.max(foreground, background) + .05) / (Math.min(foreground, background) + .05);
        assert.ok(contrast >= 4.5, JSON.stringify({width,...color,contrast}));
        colors.push({width,...color,contrast});
      }
      for (const lang of ['zh-CN', 'en']) {
        await language(page, lang);
        const day = await page.locator('#day-count').evaluate(element => {
          const range = document.createRange(); range.selectNodeContents(element);
          const box = element.getBoundingClientRect();
          return {lines:range.getClientRects().length, text:element.textContent, left:box.left, right:box.right, viewport:innerWidth};
        });
        assert.equal(day.lines, 1, JSON.stringify(day));
        assert.ok(day.left >= 0 && day.right <= day.viewport, JSON.stringify(day));
      }
      await page.setViewportSize({width:390,height:640});
      await page.locator('#open-coach').click();
      for (const question of ['Hello', 'What is a backtest?', 'Explain it more simply', 'What is a factor?', 'What is risk?', 'What is IC?']) {
        await page.locator('#question').fill(question);
        await page.locator('#ask').click();
        await page.waitForFunction(() => !FactorLabApp.getUI().busy);
      }
      const close = await page.evaluate(() => {
        const dialog = document.querySelector('#coach-drawer');
        dialog.scrollTop = dialog.scrollHeight;
        const button = document.querySelector('#close-coach'), box = button.getBoundingClientRect(), frame = dialog.getBoundingClientRect();
        return {scroll:dialog.scrollTop, overflow:dialog.scrollHeight-dialog.clientHeight, top:box.top, bottom:box.bottom,
          frameTop:frame.top, frameBottom:frame.bottom, viewport:innerHeight,
          clickable:document.elementFromPoint((box.left+box.right)/2,(box.top+box.bottom)/2)?.closest('button')?.id==='close-coach'};
      });
      assert.ok(close.overflow > 0 && close.scroll > 0, JSON.stringify(close));
      assert.ok(close.top >= Math.max(0,close.frameTop) && close.bottom <= Math.min(close.viewport,close.frameBottom), JSON.stringify(close));
      assert.equal(close.clickable, true, JSON.stringify(close));
      await shot(page, 'pages-mobile-coach-close-after-scroll');
      await page.locator('#close-coach').click();
      assert.equal(await page.locator('#coach-drawer').isVisible(), false);
      assert.deepEqual(await save(page), before);
      return {colors, mobileDaySingleLine:true, closeButton:close, financialStateUnchanged:true};
    }));

    await check('All six public video files fetch and decode in system Chrome', () => withPage(async page => {
      const before = await save(page);
      for (const name of ['idle', 'welcome', 'thinking', 'success', 'growth', 'milestone']) {
        const media = await page.evaluate(async ({ name, version }) => {
          const url = `releases/${version}/assets/mascot/${name}.mp4`;
          const response = await fetch(url), bytes = await response.arrayBuffer();
          if (!response.ok) throw Error('Video fetch failed');
          const video = document.createElement('video');
          video.muted = true; video.playsInline = true; video.src = url;
          video.style.cssText = 'position:fixed;width:1px;height:1px;bottom:0;left:0';
          document.body.append(video);
          try {
            await video.play();
            await new Promise((resolve, reject) => {
              const timer = setTimeout(() => reject(Error('Video decode timeout: ' + name)), 5000);
              const decoded = () => { if (video.currentTime > .04 && video.videoWidth > 0) { clearTimeout(timer); resolve(); } };
              video.addEventListener('timeupdate', decoded);
              video.addEventListener('error', () => { clearTimeout(timer); reject(Error('Decode error: ' + name)); }, { once: true });
              decoded();
            });
            return { name, bytes: bytes.byteLength, status: response.status, duration: video.duration, width: video.videoWidth, height: video.videoHeight, time: video.currentTime, audioTracks: video.audioTracks?.length ?? null };
          } finally { video.pause(); video.removeAttribute('src'); video.load(); video.remove(); }
        }, { name, version: bundle.version });
        assert.equal(media.status, 200); assert.ok(media.bytes > 1000);
        assert.equal(media.width, 512); assert.equal(media.height, 512);
        assert.ok(media.duration >= .5 && media.duration < 3.1);
        if (media.audioTracks !== null) assert.equal(media.audioTracks, 0);
        report.media.push(media);
      }
      assert.deepEqual(await save(page), before);
      return { decoded: report.media.length, financialStateUnchanged: true };
    }));

    await check('Published financial modules complete one interactive round and restore it', () => withPage(async page => {
      await go(page, 'portfolio'); await page.locator('#reason').selectOption('evidence');
      await page.locator('#confirm').click();
      await page.locator('#trade-confirm[open]').waitFor();
      assert.equal((await page.evaluate(() => FactorLabApp.getState())).phase, 'decision');
      await page.locator('#execute-trade').click();
      for (let step = 0; step < 12; step++) {
        const state = await page.evaluate(() => FactorLabApp.getState());
        if (['review', 'complete'].includes(state.phase)) break;
        if (state.phase === 'event') { await go(page, 'research'); await page.locator('#resume').click(); }
        else if (state.phase === 'simulating') { await go(page, 'portfolio'); await page.locator('#fast-forward').click(); }
        else throw Error('Unexpected round phase: ' + state.phase);
      }
      const state = await page.evaluate(() => FactorLabApp.getState());
      assert.equal(state.phase, 'review'); assert.equal(state.day, 20);
      const completed = await envelope(page);
      await page.reload({ waitUntil: 'networkidle' }); await ready(page);
      assert.deepEqual(await envelope(page), completed);
      await go(page, 'journal'); await shot(page, 'pages-round-one-restored');
      return { day: state.day, phase: state.phase, restored: true };
    }));

    await check('Static bundle makes no backend calls and has no runtime or HTTP errors', async () => {
      for (const key of ['pageErrors', 'consoleErrors', 'httpErrors', 'requestFailures', 'apiRequests', 'externalRequests']) assert.deepEqual(report[key], [], key);
      return { apiRequests: 0, runtimeErrors: 0, httpErrors: 0, cancelledMedia: report.cancelledMedia.length };
    });
  } catch (error) {
    report.checks.push({ name: 'Setup or execution', status: 'FAIL', error: error.stack });
    console.error(error.message);
  } finally {
    if (browser) await browser.close();
    if (server) await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
    report.finishedAt = new Date().toISOString();
    report.status = report.version && report.checks.length > 0 && report.checks.every(item => item.status === 'PASS') ? 'PASS' : 'FAIL';
    fs.writeFileSync(path.join(staging, 'browser-pages.json'), JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify({ version: report.version, status: report.status, checks: report.checks.length, report: path.join(staging, 'browser-pages.json') }));
    if (report.status !== 'PASS') process.exitCode = 1;
  }
})();
