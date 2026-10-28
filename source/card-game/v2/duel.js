(function(root){
 'use strict';
 const Base=typeof module!=='undefined'?require('../engine.js'):root.FACTORLAB_CARDS;
 const C=typeof module!=='undefined'?require('./catalog.js'):root.FACTORLAB_DUEL_CATALOG;
 const {cards,classes,upgrades,markets}=C,VERSION='factorlab-duel-v1',sum=a=>a.reduce((n,v)=>n+v,0);
 function initial(seed=1){return {seed:seed>>>0,rng:(seed>>>0)||17341,phase:'choose',round:1,key:null,mode:'teaching',hp:100,chips:0,wins:0,nav:100000,anchorNav:100000,anchorWeights:[],ledger:[],weights:[],draft:[],collection:[],draw:[],discard:[],hand:[],played:[],upgrades:[],energy:3,researchLeft:3,reportsLeft:2,researched:false,reported:false,exchanged:false,shields:0,repairs:[],removals:0,nextId:0,shop:[],offers:[],refreshed:false,removed:false,commands:[]};}
 function random(s){let x=s.rng;x^=x<<13;x^=x>>>17;x^=x<<5;s.rng=x>>>0;return s.rng/4294967296;}
 function shuffle(s,a){const b=[...a];for(let i=b.length-1;i>0;i--){const j=Math.floor(random(s)*(i+1));[b[i],b[j]]=[b[j],b[i]];}return b;}
 function addCard(s,id,destination='discard'){const uid='c'+s.nextId++;s.collection.push({uid,id});s[destination].push(uid);return uid;}
 const identity=(s,uid)=>s.collection.find(c=>c.uid===uid)?.id;
 const cost=(s,id)=>id==='scout'&&s.upgrades.includes('lens')?0:cards[id].cost;
 const maxEnergy=s=>s.upgrades.includes('energy')?4:3;
 const participation=w=>sum(w.slice(0,5));
 function legal(s,w){const c=classes[s.key];return w.every(v=>Number.isFinite(v)&&v>=-1e-12)&&Math.abs(sum(w)-1)<1e-9&&participation(w)>=c.min-1e-9&&participation(w)<=c.max+1e-9&&(s.mode!=='realistic'||Math.max(...w.slice(0,5))<=.4+1e-9);}
 function conform(s){
  const before=[...s.weights],w=[...before],c=classes[s.key];
  if(s.mode==='realistic')for(let i=0;i<5;i++)if(w[i]>.4){w[5]+=w[i]-.4;w[i]=.4;}
  let risk=participation(w);
  if(risk>c.max){const f=c.max/risk;for(let i=0;i<5;i++)w[i]*=f;w[5]=1-c.max;}
  risk=participation(w);
  if(risk<c.min){let remaining=c.min-risk;for(let i=0;i<5&&remaining>1e-12;i++){const n=Math.min(remaining/(5-i),(s.mode==='realistic'?.4:1)-w[i]);w[i]+=n;w[5]-=n;remaining-=n;}}
  s.draft=w;s.repairs=[];
  for(let i=0;i<5;i++){const d=w[i]-before[i];if(Math.abs(d)>1e-12)s.repairs.push({from:d>0?5:i,to:d>0?i:5,amount:Math.abs(d)});}
 }
 function drawOne(s){if(!s.draw.length){s.draw=shuffle(s,s.discard);s.discard=[];}if(s.draw.length)s.hand.push(s.draw.pop());}
 function begin(s){s.played=[];s.hand=[];s.energy=maxEnergy(s);s.researched=false;s.reported=false;s.exchanged=false;s.shields=s.key==='guardian'?1:0;conform(s);for(let i=0;i<(s.upgrades.includes('search')?4:5);i++)drawOne(s);s.phase=s.upgrades.includes('search')?'search':'plan';}
 function comboIds(s){
  const ids=s.played.map(p=>p.id),out=[],suites=new Set(ids.map(id=>cards[id].suite));
  if(s.played.some(p=>p.researchBoost))out.push('informed');
  if(ids.includes('rotate')&&ids.some(id=>['sell','reserve'].includes(id)))out.push('rotation');
  const touched=new Set(s.played.flatMap(p=>p.moved.flatMap(m=>[m.from,m.to].filter(i=>i<5))));
  if(ids.includes('spread')||touched.size>=3)out.push('diverse');
  if(ids.filter(id=>cards[id].suite==='defense').length>=3)out.push('fortress');
  if(suites.size===3)out.push('all');
  if(s.played.some(p=>p.id==='focus'&&s.played.some(q=>q.id==='leverage'&&q.target===p.target)))out.push('conviction');
  return out;
 }
 function play(s,a,D){
  if(!s.hand.includes(a.uid)||s.played.some(p=>p.uid===a.uid))return false;
  const id=identity(s,a.uid),card=cards[id],price=cost(s,id),mode=card.mode,w=[...s.draft],moved=[];
  if(s.energy<price||mode==='passive')return false;
  const sector=i=>Number.isInteger(i)&&i>=0&&i<5;
  const transfer=(from,to,n)=>{n=Math.min(n,w[from]);if(n>1e-12){w[from]-=n;w[to]+=n;moved.push({from,to,amount:n});}};
  const researchBoost=s.researched&&['buy','focus','spread'].includes(id);
  let amount=(card.amount||0)+(s.upgrades.includes('precision')&&['buy','sell'].includes(id)?.01:0)+(researchBoost&&id!=='spread'?.02:0);
  let target=a.target;
  if(mode==='scout'){if(s.researched||s.researchLeft===0)return false;s.researchLeft--;s.researched=true;}
  else if(mode==='report'){if(s.round===1||s.reported||s.reportsLeft===0)return false;s.reportsLeft--;s.reported=true;}
  else if(mode==='bet'){if(!['up','down'].includes(a.direction))return false;}
  else if(mode==='insurance'){if(s.played.some(p=>p.id==='insurance'))return false;}
  else {
   if(mode==='chase'){if(!s.ledger.length)return false;const prev=s.ledger.at(-1).sector_returns_snapshot.slice(0,5);target=prev.indexOf(Math.max(...prev));transfer(5,target,amount);}
   else if(mode==='buy'||mode==='sell'){if(!sector(target))return false;transfer(mode==='buy'?5:target,mode==='buy'?target:5,amount);}
   else if(mode==='rotate'){if(!sector(a.from)||!sector(target)||a.from===target)return false;transfer(a.from,target,amount);}
   else if(mode==='reserve'){target=w.slice(0,5).indexOf(Math.max(...w.slice(0,5)));transfer(target,5,amount);}
   else if(mode==='spread'){const each=Math.min(.01+(researchBoost?.004:0),w[5]/5);for(let i=0;i<5;i++)transfer(5,i,each);}
   else if(mode==='haven'){const risk=participation(w),total=Math.min(amount,risk);for(let i=0;i<5;i++)transfer(i,5,total*s.draft[i]/risk);}
   if(!moved.length||!legal(s,w))return false;
  }
  s.draft=w;s.energy-=price;
  if(['sell','reserve','stop','haven'].includes(id))s.shields++;
  s.played.push({uid:a.uid,id,target:target??null,from:a.from??null,direction:a.direction??null,cost:price,moved,researchBoost});return true;
 }
 function finance(s,D){
  const r=D.rounds[s.round-1],moves=[...s.repairs,...s.played.flatMap(p=>p.moved)];
  const feeRate=s.mode==='realistic'?sum(moves.map(m=>m.amount*((m.from===5?.0013:m.to===5?.0018:.0031)))):0;
  const costPaid=s.nav*feeRate;
  const out=Base.settle(s.draft,s.nav-costPaid,s.ledger,r),gross=out.return_value;
  out.before=s.nav;out.return_value=out.after/s.nav-1;out.gross_return=gross;out.costs_paid=costPaid;
  out.contributions=out.contributions.map(v=>v*(1-feeRate));out.contributions.push(-feeRate);
  out.cumulative_contributions.push((s.ledger.at(-1)?.cumulative_contributions[8]||0)-costPaid/100000);
  out.sector_contributions=out.sector_contributions.map(v=>v*(1-feeRate));
  const rs=[...s.ledger.map(x=>x.return_value),out.return_value],mean=sum(rs)/rs.length;
  out.volatility=rs.length>1?Math.sqrt(sum(rs.map(v=>(v-mean)**2))/(rs.length-1)):null;
  out.sharpe=out.volatility>1e-12?(mean-.001)/out.volatility:null;
  let peak=100000,dd=0;for(const n of [100000,...s.ledger.map(x=>x.after),out.after]){peak=Math.max(peak,n);dd=Math.max(dd,1-n/peak);}out.maximum_drawdown=dd;
  const ar=sum(s.anchorWeights.map((w,i)=>w*r.sector_returns[i]));out.anchor_return=ar;out.anchor_nav=s.anchorNav*(1+ar);out.tactical_pp=out.return_value-ar;
  out.anchor_drift=s.anchorWeights.map((w,i)=>w*(1+r.sector_returns[i])/(1+ar));out.sector_returns_snapshot=[...r.sector_returns];out.fee_rate=feeRate;
  return out;
 }
 function duelResult(s,record,D){
  const r=D.rounds[s.round-1],parts=[],combos=comboIds(s),add=(label,value)=>parts.push({label,value});
  let shields=s.shields;
  if(s.hand.some(uid=>identity(s,uid)==='ballast'))add('压舱石',Math.min(.6,Math.floor((s.draft[5]+1e-10)*10)*.15));
  for(const p of s.played){
   if(p.id==='focus'&&[0,4].includes(p.target))add('集中布局',sum(p.moved.map(m=>m.amount*r.sector_returns[m.to]*100*.2)));
   if(p.id==='chase')add('追热',sum(p.moved.map(m=>m.amount*r.sector_returns[m.to]*100*.5)));
   if(p.id==='stop'&&r.sector_returns[p.target]<0)shields++;
   if(p.id==='insurance')add('对决保险',-.2);
   if(p.id==='bet')add('事件对赌',(r.benchmark_return>=0?'up':'down')===p.direction?1.5:-1);
   if(p.id==='trap'){const risk=r.sector_returns.slice(0,5),best=Math.max(...risk),worst=Math.min(...risk);add('反身陷阱',best===worst?0:risk[p.target]===best?1:risk[p.target]===worst?-1:0);}
  }
  if(combos.includes('all'))add('全都要',.5);
  if(combos.includes('conviction')){
   const sectors=[...new Set(s.played.filter(p=>p.id==='focus'&&s.played.some(q=>q.id==='leverage'&&q.target===p.target)).map(p=>p.target))];
   for(const i of sectors)add('孤注一掷',s.draft[i]*r.sector_returns[i]*100);
  }
  if(combos.includes('rotation'))shields++;
  if(combos.includes('fortress'))shields++;
  const score=record.return_value*100+sum(parts.map(p=>p.value)),target=markets[s.round-1].target,passed=score>=target-1e-9;
  const gap=Math.max(0,target-score),extra=!passed&&s.played.some(p=>p.id==='leverage')?10:0;
  const raw=Math.min(60,(gap*(markets[s.round-1].boss?20:10)+extra)*(s.key==='challenger'?1.25:1));
  const blocked=Math.min(raw,shields*10),damage=Math.ceil(Math.max(0,raw-blocked)*(s.played.some(p=>p.id==='insurance')?.5:1)-1e-10);
  const bonus=passed?Math.floor(((s.round===6?4000:1500)+Math.max(0,score-target)*1000*(s.key==='challenger'?1.3:1))*(combos.includes('diverse')?1.5:1)):0;
  return {base:record.return_value*100,parts,score,target,passed,combos,shields,raw,blocked,damage:Math.max(0,damage),bonus};
 }
 function stock(s){
  const pool=Object.keys(cards).map(id=>({type:'card',id,price:cards[id].rare?3500:2000})).concat(Object.entries(upgrades).filter(([id])=>id==='research'||!s.upgrades.includes(id)).map(([id,u])=>({type:'upgrade',id,price:u.price})));
  s.shop=shuffle(s,pool).slice(0,3).map(p=>({...p,sold:false}));
 }
 function step(s,a,D){
  if(a.type==='start'&&s.phase==='choose'&&Object.hasOwn(classes,a.key)){
   s.key=a.key;s.mode=a.mode==='realistic'?'realistic':'teaching';s.weights=[...D.strategies[a.key].weights];s.anchorWeights=[...s.weights];
   for(const id of classes[a.key].deck)addCard(s,id,'draw');s.draw=shuffle(s,s.draw);begin(s);return true;
  }
  if(a.type==='play'&&s.phase==='plan')return play(s,a,D);
  if(a.type==='exchange'&&s.phase==='plan'&&s.key==='navigator'&&!s.exchanged&&s.hand.includes(a.uid)&&!s.played.some(p=>p.uid===a.uid)&&cards[identity(s,a.uid)].mode!=='passive'){
   s.hand=s.hand.filter(uid=>uid!==a.uid);s.discard.push(a.uid);s.energy++;s.exchanged=true;return true;
  }
  if(a.type==='lock'&&s.phase==='plan'&&legal(s,s.draft)){
   const r=finance(s,D),duel=duelResult(s,r,D);r.duel=duel;r.cards=structuredClone(s.played);r.repairs=structuredClone(s.repairs);r.hpBefore=s.hp;r.hpAfter=Math.max(0,s.hp-duel.damage);r.researched=s.researched;r.reported=s.reported;
   s.hp=r.hpAfter;s.chips+=duel.bonus;s.wins+=duel.passed?1:0;s.ledger.push(r);s.nav=r.after;s.weights=[...r.drift];s.anchorWeights=r.anchor_drift;s.anchorNav=r.anchor_nav;s.phase='result';return true;
  }
  if(a.type==='next'&&s.phase==='result'){
   if(s.round===6||s.hp<=0){s.phase='final';return true;}
   s.discard.push(...s.hand);s.hand=[];s.refreshed=false;s.removed=false;stock(s);s.phase='shop';return true;
  }
  if(a.type==='buy'&&s.phase==='shop'&&Number.isInteger(a.index)&&s.shop[a.index]&&!s.shop[a.index].sold&&s.chips>=s.shop[a.index].price){
   const p=s.shop[a.index];if(p.type==='upgrade'&&p.id!=='research'&&s.upgrades.includes(p.id))return false;
   s.chips-=p.price;p.sold=true;if(p.type==='card')addCard(s,p.id);else if(p.id==='research')s.researchLeft+=2;else s.upgrades.push(p.id);return true;
  }
  if(a.type==='refresh'&&s.phase==='shop'&&!s.refreshed&&s.chips>=500){s.chips-=500;s.refreshed=true;stock(s);return true;}
  if(a.type==='remove'&&s.phase==='shop'&&!s.removed&&s.collection.length>5&&s.chips>=(s.removals?2500:1500)&&s.collection.some(c=>c.uid===a.uid)){
   s.chips-=s.removals?2500:1500;s.removals++;s.removed=true;s.collection=s.collection.filter(c=>c.uid!==a.uid);s.draw=s.draw.filter(uid=>uid!==a.uid);s.discard=s.discard.filter(uid=>uid!==a.uid);return true;
  }
  if(a.type==='leave'&&s.phase==='shop'){s.offers=shuffle(s,Object.keys(cards)).slice(0,3);s.phase='draft';return true;}
  if(a.type==='pick'&&s.phase==='draft'&&Number.isInteger(a.index)&&a.index>=0&&a.index<3){addCard(s,s.offers[a.index]);s.round++;begin(s);return true;}
  if(a.type==='search'&&s.phase==='search'){
   if(a.uid===null)drawOne(s);else{if(!s.draw.includes(a.uid)&&!s.discard.includes(a.uid))return false;s.draw=s.draw.filter(u=>u!==a.uid);s.discard=s.discard.filter(u=>u!==a.uid);s.hand.push(a.uid);}s.phase='plan';return true;
  }
  return false;
 }
 function reduce(s,a,D){if(!a||typeof a!=='object'||s.commands.length>=500)return s;const n=structuredClone(s);if(!step(n,a,D))return s;n.commands.push(structuredClone(a));return n;}
 function view(s,D){
  const base=Base.view({...s,played:s.played.map(p=>({card:p.id}))},D);
  const ranking=s.reported&&s.ledger.length?s.ledger.at(-1).sector_returns_snapshot.slice(0,5).map((v,i)=>({sector:i,value:v})).sort((a,b)=>b.value-a.value||a.sector-b.sector):null;
  return {market:markets[s.round-1],history:base.history,cycles:base.cycles,cutoff:s.round-1,ranking};
 }
 const grade=s=>s.hp<=0?(s.ledger.length>=4?'C':'D'):s.wins>=5&&s.hp>=60?'S':s.wins>=4?'A':'B';
 const serialize=s=>JSON.stringify({version:VERSION,seed:s.seed,commands:s.commands});
 function restore(raw,D){try{const x=JSON.parse(raw);if(x?.version!==VERSION||!Number.isInteger(x.seed)||x.seed<0||x.seed>0xffffffff||!Array.isArray(x.commands)||x.commands.length>500)return null;let s=initial(x.seed);for(const a of x.commands){const n=reduce(s,a,D);if(n===s)return null;s=n;}return s;}catch{return null;}}
 const V={...C,VERSION,initial,identity,cost,maxEnergy,participation,legal,comboIds,finance,duelResult,reduce,view,grade,serialize,restore};
 if(typeof module!=='undefined')module.exports=V;else root.FACTORLAB_DUEL=V;
})(typeof window==='undefined'?globalThis:window);
