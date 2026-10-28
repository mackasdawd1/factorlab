const fs = require('node:fs');
const path = require('node:path');
const manifest = require('./import/manifest.json');
const folder = path.join(__dirname, 'delivery', 'figma-prototype-plugin');
const ids = { en: ['2:3','2:1007','2:1678','2:2422','2:2992','2:3893','2:4448','2:5052','2:5909','2:6691'], 'zh-CN': ['2:621','2:1358','2:2072','2:2715','2:3470','2:4176','2:4750','2:5492','2:6300','2:7099'] };
const names = { en: ['Research desk','Backtest and factors','Allocation decision','Market event','Risk and attribution','Decision journal','Completion example','AI explanation example','Settings','Research scope and sources'], 'zh-CN': ['研究台','因子与回测','配置决策','事件推进','风险与归因','决策复盘','六轮完成示例','AI 解释示例','设置','研究边界与来源'] };
const labelChanges = [
  ['2:4662','Inspect attribution','Round-1 attribution example'],
  ['2:4954','查看收益归因','查看首轮归因示例'],
  ['2:4712','Risk','R1 risk'],['2:4721','Journal','R1 journal'],
  ['2:5014','风险与归因','首轮归因'],['2:5023','决策复盘','首轮复盘']
].map(([id,before,value])=>({id,before,value}));
const plan = { fileKey:'YVka4Ex8Rg62H1z4Td3icF', screens: [], textEdits: labelChanges, flows: [{nodeId:ids['zh-CN'][0],name:'中文 · 从研究台开始'},{nodeId:ids.en[0],name:'English · Start at research'}] };
for (const s of manifest.states) {
  const i = Number(s.id.slice(0,2))-1;
  const hotspots = s.hotspots.filter(h=>!h.disabled && !h.coveredByDialog && ['NAVIGATE','BACK','URL'].includes(h.kind) && h.target !== s.id).map(h=>({selector:h.selector,label:h.label,kind:h.kind,target:h.target,url:h.url,destinationId:h.target?ids[s.lang][Number(h.target.slice(0,2))-1]:undefined}));
  if (s.id==='07-complete') for (const h of hotspots) {
    if (h.selector==='[data-open-view="risk"]') h.relabelNodeId=s.lang==='en'?'2:4662':'2:4954';
    if (h.selector==='[data-view="risk"]') h.relabelNodeId=s.lang==='en'?'2:4712':'2:5014';
    if (h.selector==='[data-view="journal"]') h.relabelNodeId=s.lang==='en'?'2:4721':'2:5023';
  }
  plan.screens.push({state:s.id+'-'+s.lang,lang:s.lang,frameId:ids[s.lang][i],name:(s.lang==='en'?'English':'中文')+' · '+s.id.slice(0,2)+' '+names[s.lang][i],x:i%5*1800,y:(s.lang==='en'?2600:0)+Math.floor(i/5)*1200,hotspots});
}
fs.mkdirSync(folder,{recursive:true});
fs.writeFileSync(path.join(folder,'manifest.json'),JSON.stringify({name:'FactorLab 原型连线',id:'factorlab-v3-prototype-local',api:'1.0.0',main:'code.js',editorType:['figma'],documentAccess:'dynamic-page',networkAccess:{allowedDomains:['none']}},null,2));
const runtime=fs.readFileSync(path.join(__dirname,'figma-prototype-runtime.cjs'),'utf8');
const main='const FACTORLAB_PLAN = '+JSON.stringify(plan)+';\n'+runtime+'\nif (typeof figma !== "undefined") runFactorLabPrototype(figma, FACTORLAB_PLAN).then(result => { console.log(JSON.stringify(result)); figma.closePlugin("已连接 " + result.interactions + " 处交互 中文研究台已设为起点 请播放验证后重新导出 .fig"); }).catch(error => { console.error(error); figma.closePlugin(error.message); });\n';
fs.writeFileSync(path.join(folder,'code.js'),main);
fs.writeFileSync(path.join(__dirname,'evidence','figma-prototype-plan-20261013.json'),JSON.stringify(plan,null,2));
console.log(JSON.stringify({folder,screens:plan.screens.length,interactions:plan.screens.reduce((n,s)=>n+s.hotspots.length,0),nativeExecution:'NOT_RUN'}));
