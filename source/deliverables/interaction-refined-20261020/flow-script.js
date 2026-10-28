(() => {
  const data=window.FACTORLAB_FLOW_SCRIPT;
  const $=s=>document.querySelector(s);
  if(!data){$('#script-scenes').textContent='剧本数据未加载，请从本地预览入口重新打开。';return;}
  const scenes=data.scenes,groups=[...new Set(scenes.map(s=>s.group||'流程'))];
  const sceneTitle=scene=>scene.title.replace(/^场景\s*\d*\s*[｜|]\s*/,'');
  let mode='all',index=0,filtered=scenes,printMode=null;
  const el=(tag,className,text)=>{const n=document.createElement(tag);if(className)n.className=className;if(text!==undefined)n.textContent=text;return n;};
  $('#scene-count').textContent=scenes.length;$('#output-count').textContent=scenes.reduce((n,s)=>n+s.outputs.length,0);
  if(data.scope)$('#scope-text').textContent=typeof data.scope==='string'?data.scope:JSON.stringify(data.scope);
  $('#source-version').textContent=typeof data.sourceVersion==='string'?data.sourceVersion:JSON.stringify(data.sourceVersion);
  groups.forEach(g=>{const o=el('option','',g);o.value=g;$('#group-filter').append(o);});
  function sceneView(scene){
    const n=scenes.indexOf(scene)+1,article=el('article','scene');article.id='scene-'+scene.id;
    const head=el('header','scene-heading');head.append(el('span','scene-index',String(n).padStart(2,'0')));
    const title=el('div');title.append(el('h2','',sceneTitle(scene)),el('p','',scene.context||''));head.append(title,el('small','',`${scene.outputs.length} 条输出`));article.append(head);
    const outputs=el('div','outputs');
    if(!scene.outputs.length)outputs.append(el('p','no-output','当前没有独立信息输出。'));
    scene.outputs.forEach(output=>{
      const row=el('div','output');row.dataset.kind=output.kind||'body';row.append(el('div','speaker',output.speaker||'界面'));
      const content=el('div');if(output.condition)content.append(el('p','condition','出现条件：'+output.condition));content.append(el('p','output-text',output.text));row.append(content);outputs.append(row);
    });article.append(outputs);
    if(scene.sources?.length){
      const detail=el('details','scene-source');detail.append(el('summary','','核对来源'));const list=el('ul');
      scene.sources.forEach(source=>{const li=el('li');li.append(el('code','',typeof source==='string'?source:`${source.path}${source.line?':'+source.line:''}`));list.append(li);});detail.append(list);article.append(detail);
    }return article;
  }
  function outline(){
    $('#scene-outline').replaceChildren();
    groups.forEach(group=>{
      const matches=filtered.filter(s=>(s.group||'流程')===group);if(!matches.length)return;
      $('#scene-outline').append(el('p','outline-group',group));
      matches.forEach(scene=>{
        const b=el('button','',String(scenes.indexOf(scene)+1).padStart(2,'0')+' '+sceneTitle(scene));
        if(mode==='one'&&filtered[index]===scene)b.setAttribute('aria-current','true');
        b.addEventListener('click',()=>{if(mode==='one'){index=filtered.indexOf(scene);render();}document.getElementById('scene-'+scene.id)?.scrollIntoView({behavior:'auto',block:'start'});});$('#scene-outline').append(b);
      });
    });
  }
  function render(){
    const q=$('#script-search').value.trim().toLowerCase(),group=$('#group-filter').value;
    filtered=scenes.filter(s=>(!group||s.group===group)&&(!q||[s.title,s.context,...s.outputs.map(o=>o.text)].join('\n').toLowerCase().includes(q)));
    index=Math.min(Math.max(0,index),Math.max(filtered.length-1,0));$('#script-scenes').replaceChildren();
    const shown=mode==='one'?filtered.slice(index,index+1):filtered;
    shown.forEach(s=>$('#script-scenes').append(sceneView(s)));outline();
    $('#result-count').textContent=`${filtered.length} / ${scenes.length} 幕`;$('#empty-message').hidden=!!filtered.length;
    $('#mode-one').setAttribute('aria-pressed',mode==='one');$('#mode-all').setAttribute('aria-pressed',mode==='all');
    $('#scene-pager').hidden=mode!=='one'||!filtered.length;$('#scene-prev').disabled=index===0;$('#scene-next').disabled=index>=filtered.length-1;$('#page-number').textContent=`${index+1} / ${filtered.length}`;
  }
  $('#script-search').addEventListener('input',()=>{index=0;render();});$('#group-filter').addEventListener('change',()=>{index=0;render();});
  $('#mode-one').addEventListener('click',()=>{mode='one';render();});$('#mode-all').addEventListener('click',()=>{mode='all';render();});
  $('#scene-prev').addEventListener('click',()=>{index--;render();$('#script-scenes').scrollIntoView({behavior:'auto'});});
  $('#scene-next').addEventListener('click',()=>{index++;render();$('#script-scenes').scrollIntoView({behavior:'auto'});});
  (data.coverage||[]).forEach(item=>{const row=el('div','coverage-row');row.append(el('b','',item.name),el('span','',item.status),el('p','',item.note));$('#coverage-items').append(row);});
  $('#print-script').addEventListener('click',()=>window.print());
  window.addEventListener('beforeprint',()=>{printMode=mode;mode='all';render();});window.addEventListener('afterprint',()=>{mode=printMode||'all';render();});
  render();
})();
