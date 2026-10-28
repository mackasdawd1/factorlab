(() => {
  const system=matchMedia('(prefers-reduced-motion: reduce)');
  let manual=false,timer,active=new Set();
  const header=document.createElement('header');header.className='demoshell';
  header.innerHTML=`<a class="demo-brand" href="index.html"><span class="seal" data-seal="research" aria-hidden="true"></span>FactorLab</a><nav class="demo-switch" aria-label="交互方案"><a href="01-evidence.html" data-demo="01">01 证据聚焦</a><a href="02-allocation.html" data-demo="02">02 配置雕刻</a><a href="flow-script.html">信息输出剧本 ↗</a></nav><div class="demo-utilities"><button id="demo-reset" type="button">重置演示</button><label><input id="demo-reduce" type="checkbox">减少动效</label></div>`;
  document.body.prepend(header);
  if(window.parent!==window)header.querySelector('.demo-brand').target='_top';
  header.querySelector(`[data-demo="${document.body.dataset.demo}"]`)?.setAttribute('aria-current','page');
  const toast=document.createElement('div');toast.className='demo-toast';toast.setAttribute('role','status');toast.hidden=true;document.body.append(toast);
  const reduced=()=>system.matches||manual;
  function sync(){
    document.documentElement.dataset.reduced=String(reduced());
    const checkbox=header.querySelector('#demo-reduce');checkbox.checked=reduced();checkbox.disabled=system.matches;checkbox.title=system.matches?'已遵循系统减少动态效果设置':'';
    if(reduced()){active.forEach(a=>a.complete?.());active.clear();document.getAnimations().forEach(a=>{try{a.finish();}catch{}});}
    document.dispatchEvent(new CustomEvent('demo:motion',{detail:{reduced:reduced()}}));
  }
  window.Demo={
    reduced,
    animate(target,frames,options={}){
      const animation=Motion.animate(target,frames,{...options,...(reduced()?{duration:0,delay:0,type:'tween'}:{})});
      active.add(animation);Promise.resolve(animation).then(()=>active.delete(animation),()=>active.delete(animation));return animation;
    },
    toast(message){clearTimeout(timer);toast.textContent=message;toast.hidden=false;timer=setTimeout(()=>toast.hidden=true,2500);}
  };
  header.querySelector('#demo-reduce').addEventListener('change',e=>{manual=e.target.checked;sync();});system.addEventListener('change',sync);
  header.querySelector('#demo-reset').addEventListener('click',()=>{document.dispatchEvent(new Event('demo:reset'));Demo.toast('演示已重置');});sync();
})();
