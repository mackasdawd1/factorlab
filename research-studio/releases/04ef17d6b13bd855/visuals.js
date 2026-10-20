(function () {
  'use strict';
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const gray = ['#202020', '#4b4b4b', '#777777', '#9e9e9e', '#bfbfbf', '#d8d8d8'];
  function curve(points) {
    if (!points.length) return '';
    let d = `M ${points[0][0]} ${points[0][1]}`;
    const slopes = points.slice(1).map((p, i) => (p[1] - points[i][1]) / (p[0] - points[i][0] || 1));
    const tangent = points.map((_, i) => i === 0 ? slopes[0] || 0 : i === points.length - 1 ? slopes[i - 1] || 0 : slopes[i - 1] * slopes[i] <= 0 ? 0 : 2 / (1 / slopes[i - 1] + 1 / slopes[i]));
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1], b = points[i], step = (b[0] - a[0]) / 3;
      d += ` C ${a[0] + step} ${a[1] + tangent[i - 1] * step},${b[0] - step} ${b[1] - tangent[i] * step},${b[0]} ${b[1]}`;
    }
    return d;
  }
  let serial = 0;
  function chart(host, {rows, series, label, format, xLabel, empty = ''}) {
    if (!host || !host.clientWidth || !host.clientHeight || !host.getClientRects().length) return;
    const id = 'chart-' + (++serial), width = Math.max(160, host.clientWidth), height = host.clientHeight;
    const left = width < 430 ? 57 : 74, right = 16, top = 24, bottom = 32;
    const vals = rows.flatMap(row => series.map(s => row[s.key])).filter(Number.isFinite);
    let min = Math.min(...vals), max = Math.max(...vals);
    const pad = Math.max((max - min) * .13, Math.abs(max || 1) * .001);
    min -= pad; max += pad;
    const x = i => left + i / Math.max(1, rows.length - 1) * (width - left - right);
    const y = v => top + (max - v) / (max - min || 1) * (height - top - bottom);
    const points = series.map(s => rows.map((row, i) => [x(i), y(row[s.key])]));
    const grid = Array.from({length:4}, (_, i) => {
      const v = min + (max - min) * i / 3;
      return `<line class="plot-grid" x1="${left}" x2="${width-right}" y1="${y(v)}" y2="${y(v)}"/><text x="${left-9}" y="${y(v)+4}" text-anchor="end">${escape(format(v))}</text>`;
    }).join('');
    const primary = series.findIndex(s => s.key === 'nav'), main = Math.max(0, primary);
    const area = rows.length > 1 ? `<path d="${curve(points[main])} L ${x(rows.length-1)} ${height-bottom} L ${x(0)} ${height-bottom} Z" fill="url(#${id})"/>` : '';
    host.innerHTML = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escape(label)}"><defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#814d68" stop-opacity=".16"/><stop offset="1" stop-color="#814d68" stop-opacity="0"/></linearGradient></defs>${grid}${area}${series.map((s,i)=>`<path class="data-curve" data-series="${s.key}" d="${curve(points[i])}" stroke="${s.color}" stroke-width="${i===main?1.6:1.1}" ${s.dash?'stroke-dasharray="4 5"':''} fill="none" stroke-linecap="round" stroke-linejoin="round"/>`).join('')}<text x="${left}" y="${height-5}">${escape(xLabel(rows[0],0))}</text><text x="${width-right}" y="${height-5}" text-anchor="end">${escape(xLabel(rows.at(-1),rows.length-1))}</text><g class="plot-cursor" visibility="hidden"><line y1="${top}" y2="${height-bottom}" stroke="#814d68" stroke-dasharray="3 5"/>${series.map(s=>`<circle r="3.5" fill="${s.color}" stroke="#eeede8" stroke-width="2"/>`).join('')}</g></svg><div class="plot-tooltip" hidden></div>${empty?`<div class="empty-chart">${escape(empty)}</div>`:''}`;
    host.tabIndex = 0;
    host.setAttribute('role', 'group');
    host.setAttribute('aria-label', label);
    const cursor = host.querySelector('.plot-cursor'), tip = host.querySelector('.plot-tooltip');
    let selected = rows.length - 1;
    const show = index => {
      selected = Math.max(0, Math.min(rows.length - 1, index));
      const row = rows[selected], xx = x(selected);
      cursor.setAttribute('visibility','visible');
      const line = cursor.querySelector('line');
      line.setAttribute('x1',xx); line.setAttribute('x2',xx);
      cursor.querySelectorAll('circle').forEach((dot, i) => { dot.setAttribute('cx',xx); dot.setAttribute('cy',y(row[series[i].key])); });
      tip.innerHTML = `<small>${escape(xLabel(row,selected))}</small>${series.map(s=>`<div><span>${escape(s.name)}</span><strong>${escape(format(row[s.key]))}</strong></div>`).join('')}`;
      tip.hidden = false;
      tip.style.left = Math.max(4, Math.min(width-tip.offsetWidth-4, xx+14))+'px';
      tip.style.top = Math.max(6, Math.min(height-tip.offsetHeight-bottom, y(row[series[main].key])-tip.offsetHeight-12))+'px';
    };
    const hide = () => { cursor.setAttribute('visibility','hidden');tip.hidden = true; };
    const fromPointer = event => show(Math.round((event.clientX-host.getBoundingClientRect().left-left)/(width-left-right)*Math.max(1,rows.length-1)));
    host.onpointermove = fromPointer;
    host.onpointerdown = event => { if(event.pointerType!=='mouse')host.setPointerCapture(event.pointerId);fromPointer(event); };
    host.onpointerleave = event => {if(event.pointerType==='mouse'&&document.activeElement!==host)hide();};
    host.onfocus = () => show(selected);
    host.onblur = hide;
    host.onkeydown = event => {
      if(!['ArrowLeft','ArrowRight','Home','End','Escape'].includes(event.key))return;
      event.preventDefault();
      if(event.key==='Escape'){hide();return;}
      show(event.key==='Home'?0:event.key==='End'?rows.length-1:selected+(event.key==='ArrowLeft'?-1:1));
    };
    host.dataset.points = String(rows.length);
  }
  function dial(host, weights, names) {
    if (!host) return;
    const center = [300,215], point = (v,r) => [center[0]+r*Math.cos(v*Math.PI*2-Math.PI/2),center[1]+r*Math.sin(v*Math.PI*2-Math.PI/2)];
    const pos = p => p.map(v=>v.toFixed(3)).join(' ');
    let start = 0;
    const sides = [[],[]];
    const paths = weights.map((value,i) => {
      const a=point(start,158),b=point(start+value,158),c=point(start+value,72),d=point(start,72);
      let path='';
      if(value>=1-1e-8)path=`M ${pos(a)} A 158 158 0 1 1 ${pos(point(start+.5,158))} A 158 158 0 1 1 ${pos(a)} L ${pos(d)} A 72 72 0 1 0 ${pos(point(start+.5,72))} A 72 72 0 1 0 ${pos(d)} Z`;
      else if(value>0)path=`M ${pos(a)} A 158 158 0 ${value>.5?1:0} 1 ${pos(b)} L ${pos(c)} A 72 72 0 ${value>.5?1:0} 0 ${pos(d)} Z`;
      const anchor=point(start+value/2,164),outer=point(start+value/2,181);
      if(value>0)sides[outer[0]<300?0:1].push({i,anchor,outer,y:outer[1]});
      start+=value;
      return `<path data-weight="${value}" d="${path}" fill="${gray[i]}" stroke="#eeede8" stroke-width="${value>=1-1e-8?0:Math.min(4,value*120)}" stroke-linejoin="round"><title>${escape(names[i])} ${(value*100).toFixed(1)}%</title></path>`;
    }).join('');
    const labels=sides.map((items,side)=>{
      items.sort((a,b)=>a.y-b.y);
      items.forEach((it,i)=>{it.y=Math.max(38,Math.min(390,it.y));if(i)it.y=Math.max(it.y,items[i-1].y+40);});
      if(items.length&&items.at(-1).y>390){items.at(-1).y=390;for(let i=items.length-2;i>=0;i--)items[i].y=Math.min(items[i].y,items[i+1].y-40);}
      return items.map(it=>`<path d="M ${pos(it.anchor)} L ${it.outer[0]} ${it.y} L ${side?530:70} ${it.y}" fill="none" stroke="#b8b7b2" stroke-width=".8"/><text x="${side?580:20}" y="${it.y-7}" text-anchor="${side?'end':'start'}">${escape(names[it.i])}</text><text class="dial-value" x="${side?580:20}" y="${it.y+12}" text-anchor="${side?'end':'start'}">${(weights[it.i]*100).toFixed(1).replace('.0','')}%</text>`).join('');
    }).join('');
    host.innerHTML=`<svg viewBox="0 0 600 430" role="img" aria-label="${escape(names.map((n,i)=>n+' '+(weights[i]*100).toFixed(1)+'%').join('，'))}">${paths}${labels}</svg>`;
  }
  document.addEventListener('toggle', event => {
    if (!(event.target instanceof HTMLDialogElement) || !event.target.open || reduced()) return;
    event.target.animate([{opacity:0,transform:'translateY(16px) scale(.98)'},{opacity:1,transform:'translateY(0) scale(1)'}],{duration:280,easing:'cubic-bezier(.22,1,.36,1)'});
  },true);
  window.FactorVisuals={curve,chart,dial};
})();
