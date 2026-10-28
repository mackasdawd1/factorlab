const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const {chromium}=require('../../.local/qa/node_modules/playwright-core');
const {createServer}=require('../server.cjs');
const E=require('./simulation.js');

const dir=__dirname,output=path.join(dir,'import'),screens=path.join(output,'screens'),delivery=path.join(dir,'delivery');
for(const folder of [output,screens,delivery])fs.mkdirSync(folder,{recursive:true});
const css=fs.readFileSync(path.join(dir,'style.css'),'utf8');
const read=file=>fs.readFileSync(path.join(dir,file),'utf8');
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
let s=E.initial({seed:20261013});s=E.reduce(s,{type:'read',id:'E1'});
const initial=s;
s=E.reduce(s,{type:'lock',weights:[.25,.18,.12,.15,.15,.15],factorWeights:[.25,.25,.25,.25],reason:'evidence',forecast:'flat'});
s=E.reduce(s,{type:'advance',days:20});assert.equal(s.phase,'event');const event=s;
while(s.phase!=='review')s=E.reduce(s,s.phase==='event'?{type:'resume'}:{type:'advance',days:20});const review=s;
while(s.phase!=='complete'){
  if(s.phase==='review')s=E.reduce(s,{type:'next'});
  else if(s.phase==='decision')s=E.reduce(s,{type:'lock',weights:E.recommend(s,[.25,.25,.25,.25],.15),factorWeights:[.25,.25,.25,.25],reason:'risk',forecast:'flat'});
  else s=E.reduce(s,s.phase==='event'?{type:'resume'}:{type:'advance',days:20});
}
const scenarios=[{id:'01-research',state:initial,zh:'研究与配置',en:'Research & allocation'},{id:'02-event',state:event,zh:'事件中断',en:'Event checkpoint'},{id:'03-review',state:review,zh:'本轮复盘',en:'Round review'},{id:'04-complete',state:s,zh:'章节完成',en:'Chapter complete'},{id:'05-settings',state:initial,zh:'语言与存档设置',en:'Language & save settings',settings:true}];
const exportCss=`.design-sheet{width:1440px;margin:36px auto 80px;box-shadow:0 6px 35px #263e3417;background:var(--paper)}.sheet-heading{width:1440px;margin:35px auto -20px;font-size:18px;font-weight:600}.design-intro{width:1440px;margin:35px auto;padding:25px;background:#244c3d;color:#fffdf7}.design-intro h1{font-size:26px}.design-intro p{font-size:13px;margin-top:12px;max-width:1080px}.design-intro a{margin-right:20px;text-decoration:underline}.design-sheet .skip{display:none}.design-sheet .app-shell{width:1440px}.design-sheet .rail{width:144px}.design-sheet .chart{height:178px}.design-sheet input,.design-sheet select,.design-sheet textarea{pointer-events:none}.design-sheet details:not([open])>*:not(summary){display:none}.design-sheet dialog[open]{position:relative;display:block;margin:30px auto;max-width:500px}.design-sheet .settings-export{padding:30px;background:#d8dfd2}.design-sheet .settings-export label{display:block;margin:16px 0 7px}.design-sheet .settings-export dialog{width:500px}.design-sheet .settings-export .settings-actions{margin-bottom:20px}`;
const makeHtml=(lang,title,body)=>`<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>FactorLab 2.0 — ${title}</title><style>${css}\n${exportCss}</style></head><body>${body}</body></html>`;

(async()=>{
  const server=createServer({env:{}});await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const origin=`http://127.0.0.1:${server.address().port}`;
  const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
  const manifest={date:'2026-10-13',synthetic:true,cloudImportVerified:false,format:'Standalone HTML with inline CSS, real text and SVG; import using html.to.design File tab.',engineSha256:sha(read('simulation.js')),files:[],states:[]};
  try{
    for(const lang of ['zh-CN','en']){
      const all=[];
      for(const scenario of scenarios){
        const context=await browser.newContext({viewport:{width:1440,height:1050},reducedMotion:'reduce'});const page=await context.newPage();
        const save={version:'factorlab-ui-v2',game:E.serialize(scenario.state),draft:scenario.state.phase==='decision'?[.25,.18,.12,.15,.15,.15]:scenario.state.results.at(-1)?.weights||scenario.state.weights,factorPrefs:[25,25,25,25],reason:'evidence',note:'',forecast:'flat',reflection:''};
        await page.addInitScript(({lang,save})=>{localStorage.setItem('factorlab-simulation-language',lang);localStorage.setItem('factorlab-simulation-ui-v2',JSON.stringify(save));},{lang,save});
        await page.goto(origin+'/v2/');await page.waitForFunction(()=>window.FactorLabApp);
        if(scenario.state.phase==='decision')await page.locator('[data-evidence="E1"]').click();
        await page.locator('details.factor-details').evaluate(el=>el.open=true);
        if(scenario.settings)await page.locator('#settings').click();
        const markup=await page.evaluate(({settings})=>{
          const source=settings?document.querySelector('#settings-dialog'):document.body;
          const copy=source.cloneNode(true);
          const originals=source.querySelectorAll('input,textarea,select'),copies=copy.querySelectorAll('input,textarea,select');
          originals.forEach((el,i)=>{const cloned=copies[i];if(el.tagName==='TEXTAREA')cloned.textContent=el.value;else if(el.tagName==='SELECT'){[...cloned.options].forEach((o,j)=>{o.toggleAttribute('selected',j===el.selectedIndex);});}else cloned.setAttribute('value',el.value);});
          copy.querySelectorAll('script').forEach(el=>el.remove());
          if(!settings)copy.querySelectorAll('dialog').forEach(el=>el.remove());
          copy.querySelectorAll('a').forEach(el=>{if(!el.getAttribute('href')?.startsWith('#'))el.removeAttribute('href');});
          copy.querySelectorAll('input[type=file]').forEach(el=>el.remove());
          copy.querySelectorAll('*').forEach(el=>{for(const a of [...el.attributes])if(a.name.startsWith('on'))el.removeAttribute(a.name);});
          if(settings){copy.setAttribute('open','');return '<div class="settings-export">'+copy.outerHTML+'</div>';}
          return copy.innerHTML;
        },{settings:Boolean(scenario.settings)});
        const title=lang==='en'?scenario.en:scenario.zh;
        const body=`<h2 class="sheet-heading" id="${scenario.id}">${scenario.id.slice(0,2)} / ${title}</h2><section class="design-sheet" data-frame-name="FactorLab / ${scenario.id} / ${lang}">${markup}</section>`;
        all.push(body);const name=`${scenario.id}-${lang}.html`,html=makeHtml(lang,title,body);fs.writeFileSync(path.join(screens,name),html);
        manifest.files.push({file:'screens/'+name,sha256:sha(html),bytes:Buffer.byteLength(html)});manifest.states.push({lang,screen:scenario.id,phase:scenario.state.phase,day:scenario.state.day,nav:scenario.state.nav});
        if(scenario.id==='03-review'&&lang==='zh-CN')await page.screenshot({path:path.join(dir,'evidence','delivery-review.png'),fullPage:false});
        await context.close();
      }
      const intro=lang==='en'?'Editable HTML design handoff: 5 states rendered from the tested simulation. In Figma, open html.to.design → File and import an individual HTML file, or the ZIP containing all screens. Text, controls and charts remain DOM/SVG elements. Static design states do not contain live AI or economic execution. Figma/Pixso cloud import has not been performed.':'可编辑 HTML 设计交付：从已测试模拟导出 5 个状态。在 Figma 打开 html.to.design → File，导入单个 HTML 或包含全部画面的 ZIP。文字、控件与图表保留为 DOM/SVG 元素。静态设计稿不执行 AI 或经济计算，尚未实际执行 Figma/Pixso 云端导入。';
      const body=`<header class="design-intro"><h1>FactorLab 2.0 · ${lang==='en'?'Editable design states':'可编辑设计状态'}</h1><p>${intro}</p><p>${scenarios.map(x=>`<a href="#${x.id}">${lang==='en'?x.en:x.zh}</a>`).join('')}</p></header>`+all.join('\n');
      const html=makeHtml(lang,'html.to.design',body);fs.writeFileSync(path.join(output,lang+'.html'),html);manifest.files.push({file:lang+'.html',sha256:sha(html),bytes:Buffer.byteLength(html)});
    }
    let playable=read('index.html').replace('<link rel="stylesheet" href="style.css">',()=>`<style>${css}</style>`);
    for(const file of ['vendor/i18next.min.js','simulation.js','i18n.js','app.js']){
      const source=file==='app.js'?read(file).replace("'import/'+lang+'.html'","window.FactorLabDesignExports[lang]"):read(file);
      playable=playable.replace(`<script defer src="${file}"></script>`,()=>`<script defer>${source.replace(/<\/script/gi,'<\\/script')}</script>`);
    }
    // Inline defer scripts run immediately; placing them after the markup preserves the original startup order.
    const scripts=playable.match(/<script defer>[\s\S]*?<\/script>/g)||[];
    const designs=Object.fromEntries(['zh-CN','en'].map(lang=>[lang,read('import/'+lang+'.html')]));
    const designScript=`<script>window.FactorLabDesignExports=Object.fromEntries(Object.entries(${JSON.stringify(designs).replace(/</g,'\\u003c')}).map(([lang,html])=>[lang,URL.createObjectURL(new Blob([html],{type:'text/html;charset=utf-8'}))]));</script>`;
    playable=playable.replace(/<script defer>[\s\S]*?<\/script>/g,'').replace('</body>',()=>designScript+scripts.map(x=>x.replace('<script defer>','<script>')).join('\n')+'</body>');
    playable=playable.replace('id="design-link"','id="design-link" download="FactorLab-2.0-design.html"').replace('href="./" class="brand"','href="#workspace" class="brand"').replace('<a href="../" data-i18n="originalEntry"></a>','');
    playable=playable.replace('</head>',()=>`<!-- Third-party license: i18next 26.0.0\n${read('vendor/i18next.LICENSE')}-->\n</head>`);
    fs.writeFileSync(path.join(delivery,'FactorLab-2.0-playable.html'),playable);
    manifest.playable={file:'../delivery/FactorLab-2.0-playable.html',sha256:sha(playable),bytes:Buffer.byteLength(playable),ai:'Offline rule-based feedback; local server provides live AI.'};
    const python='from pathlib import Path\nimport zipfile\np=Path(__import__("sys").argv[1]); out=Path(__import__("sys").argv[2])\nwith zipfile.ZipFile(out,"w",zipfile.ZIP_DEFLATED) as z:\n for f in sorted(p.glob("*.html")): z.write(f,f.name)\n';
    const zip=path.join(delivery,'FactorLab-2.0-html-to-design.zip');execFileSync('python',['-c',python,screens,zip]);assert.ok(fs.statSync(zip).size<32000000);manifest.zip={file:'../delivery/FactorLab-2.0-html-to-design.zip',bytes:fs.statSync(zip).size,sha256:sha(fs.readFileSync(zip)),screens:10};
    fs.writeFileSync(path.join(output,'manifest.json'),JSON.stringify(manifest,null,2));
    const check=await browser.newPage({viewport:{width:1440,height:1000}});
    const errors=[];check.on('pageerror',e=>errors.push(e.message));
    for(const lang of ['zh-CN','en']){await check.goto(origin+'/v2/import/'+lang+'.html');assert.equal(await check.locator('.design-sheet').count(),5);assert.equal(await check.locator('script').count(),0);assert.ok(await check.locator('svg text').count()>20);assert.equal(await check.locator('img').count(),0);}
    await check.screenshot({path:path.join(dir,'evidence','import-preview.png'),fullPage:false});
    await check.goto('file:///'+path.join(delivery,'FactorLab-2.0-playable.html').replace(/\\/g,'/'));await check.waitForFunction(()=>window.FactorLabApp);assert.equal(await check.evaluate(()=>FactorLabApp.getState().day),0);
    for(const lang of ['zh-CN','en']){
      await check.locator('#settings').click();await check.locator('#language').selectOption(lang);await check.locator('#close-settings').click();
      const pending=check.waitForEvent('download');await check.locator('#design-link').click();const download=await pending;
      const exported=fs.readFileSync(await download.path(),'utf8');assert.ok(exported.includes(`<html lang="${lang}">`));assert.equal((exported.match(/class="design-sheet"/g)||[]).length,5);assert.ok(!exported.includes('<script'));
    }
    assert.ok(playable.includes('Copyright (c) 2011-present i18next'));assert.equal(await check.locator('script[src],link[rel=stylesheet]').count(),0);
    await check.locator('#reason').selectOption('risk');await check.locator('#confirm').click();assert.ok(['simulating','event'].includes(await check.evaluate(()=>FactorLabApp.getState().phase)));assert.deepEqual(errors,[]);
    fs.writeFileSync(path.join(dir,'evidence','export-results.json'),JSON.stringify({screens:10,languages:2,standaloneHtml:true,noImageFlattening:true,offlinePlayable:true,offlineDesignDownloads:true,thirdPartyLicenseIncluded:true,cloudImportVerified:false,zipBytes:manifest.zip.bytes,errors},null,2));
    console.log(JSON.stringify({screens:10,zip:manifest.zip,playable:manifest.playable,validated:true},null,2));
  }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
