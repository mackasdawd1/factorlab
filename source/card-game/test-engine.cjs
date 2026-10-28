const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const here = __dirname;
assert.ok(fs.existsSync(path.join(here, 'engine.js')), 'Card engine must exist');
const E = require('./engine.js');
const old = JSON.parse(fs.readFileSync(path.join(here, '../full-game/data.json'), 'utf8'));
const fixture = JSON.parse(fs.readFileSync(path.join(here, '../docs/week2/wireframes/prototype-fixture.json'), 'utf8'));
const D = {rounds: fixture.rounds, strategies: old.strategies, events: old.events, pregame: [96,99,97,101,100,103,102]};
let assertions = 0;
const near = (a,b,t=1e-10) => {assert.ok(Math.abs(a-b)<t, `${a} != ${b}`); assertions++;};
for (const n of Object.values(old.nodes)) {
  if (!n.record) continue;
  const r = n.record, ledger=[];
  for (let p=old.nodes[n.parent]; p?.record; p=old.nodes[p.parent]) ledger.unshift(p.record);
  const got=E.settle(r.weights,r.before,ledger,fixture.rounds[r.round-1]);
  for (const k of ['after','return_value','benchmark_nav','maximum_drawdown','volatility','sharpe']) {
    if(r[k]===null) assert.equal(got[k],null); else near(got[k],r[k],k==='after'||k==='benchmark_nav'?1e-7:1e-10);
  }
  for (const k of ['drift','contributions','cumulative_contributions']) got[k].forEach((v,i)=>near(v,r[k][i]));
}
const start = (seed=1) => E.reduce(E.initial(seed),{type:'start',key:'navigator'},D);
let s=start();
assert.equal(E.hand(s).length,5); assert.equal(s.energy,3);
s=E.reduce(s,{type:'play',card:'buy',target:4},D); near(s.draft[4],.18); near(s.draft[5],.12); assert.equal(s.energy,2);
assert.strictEqual(E.reduce(s,{type:'play',card:'buy',target:0},D),s);
assert.strictEqual(E.reduce(s,{type:'play',card:'sell',target:5},D),s);
assert.strictEqual(E.reduce(s,{type:'play',card:'rotate',from:0,target:0},D),s);
s=E.reduce(s,{type:'play',card:'scout'},D); assert.equal(s.researchLeft,2); assert.equal(s.energy,1);
assert.ok(E.combos(s).includes('informed'));
s=E.reduce(s,{type:'reset'},D); near(s.draft[4],.15); assert.equal(s.energy,2); assert.equal(s.researchLeft,2); assert.ok(s.played.some(x=>x.card==='scout'));
assert.strictEqual(E.reduce(s,{type:'play',card:'scout'},D),s);
assert.strictEqual(E.reduce(s,{type:'play',card:'focus',target:4},D),s);
s=E.reduce(s,{type:'play',card:'rotate',from:0,target:3},D); near(s.draft[0],.16); near(s.draft[3],.19); assert.equal(s.energy,0);
assert.strictEqual(E.reduce(s,{type:'play',card:'sell',target:4},D),s);
const original=JSON.stringify(s); const result=E.reduce(s,{type:'lock'},D);
assert.equal(JSON.stringify(s),original); assert.equal(result.phase,'result');
assert.strictEqual(E.reduce(result,{type:'lock'},D),result);
assert.strictEqual(E.reduce(result,{type:'play',card:'sell',target:4},D),result);
const changed=structuredClone(D); for(const r of changed.rounds){r.sector_returns=r.sector_returns.map(()=>.99);r.event='HIDDEN';r.factor_returns=[4,4,4,4];}
assert.deepEqual(E.view(start(),D),E.view(start(),changed));
const basic=E.view(start(),D); assert.equal(basic.history.filter(v=>v!==null).length,3);
assert.equal(E.view(s,D).history.filter(v=>v!==null).length,7);
assert.equal(E.restore('{bad',D),null);
assert.equal(E.restore(JSON.stringify({version:'card-loop-v1',seed:1,commands:[{type:'lock'}]}),D),null);
assert.equal(E.restore(JSON.stringify({version:'card-loop-v1',seed:-1,commands:[]}),D),null);
assert.deepEqual(E.restore(E.serialize(result),D),result);
let runs=0; const upgrades=['energy','lens','precision'];
for(let seed=1;seed<=40;seed++) for(const strategy of Object.keys(D.strategies)){
  let state=E.reduce(E.initial(seed),{type:'start',key:strategy},D);
  for(let round=1;round<=6;round++){
    const mutated=structuredClone(D); for(let i=round-1;i<6;i++){mutated.rounds[i].sector_returns.fill(.6); mutated.rounds[i].event='future';}
    assert.deepEqual(E.view(state,D),E.view(state,mutated));
    const hand=E.hand(state);
    for(const card of [...hand.slice(seed%5),...hand.slice(0,seed%5)]){
      const target=(seed+round)%5, from=(target+1)%5;
      state=E.reduce(state,{type:'play',card,target,from},D);
    }
    assert.ok(state.energy>=0); assert.ok(state.researchLeft>=0);
    near(state.draft.reduce((a,b)=>a+b,0),1); assert.ok(state.draft.every(w=>w>=-1e-12&&w<=1));
    state=E.reduce(state,{type:'lock'},D);
    near(state.ledger.at(-1).contributions.reduce((a,b)=>a+b,0),state.ledger.at(-1).return_value);
    near(state.ledger.at(-1).cumulative_contributions.reduce((a,b)=>a+b,0),state.nav/100000-1);
    assert.deepEqual(E.restore(E.serialize(state),D),state);
    state=E.reduce(state,{type:'next'},D);
    if(round===2||round===4){
      assert.equal(state.phase,'upgrade'); assert.strictEqual(E.reduce(state,{type:'lock'},D),state);
      const u=upgrades.find((x,i)=>i>=(seed%3)&&!state.upgrades.includes(x))||upgrades.find(x=>!state.upgrades.includes(x));
      state=E.reduce(state,{type:'upgrade',key:u},D);
      assert.equal(state.phase,'plan'); assert.ok(state.upgrades.includes(u));
    }
    assert.deepEqual(E.restore(E.serialize(state),D),state);
  }
  assert.equal(state.phase,'final'); assert.equal(state.ledger.length,6); runs++;
}
const cash=E.settle([0,0,0,0,0,1],100000,[],D.rounds[0]); near(cash.after,100100,1e-7); assert.equal(cash.sharpe,null);
let allCash=[];for(const r of D.rounds)allCash.push(E.settle([0,0,0,0,0,1],allCash.at(-1)?.after||100000,allCash,r));
assert.equal(allCash.at(-1).sharpe,null);near(allCash.at(-1).maximum_drawdown,0);
const loss=E.settle([0,0,1,0,0,0],100000,[],D.rounds[0]);near(loss.maximum_drawdown,.02);
const lowCash={...start(0),draft:[.999,0,0,0,0,.001]};
const capped=E.reduce(lowCash,{type:'play',card:'focus',target:4},D);near(capped.draft[4],.001);near(capped.draft[5],0);
assert.strictEqual(E.reduce({...start(),draft:[0,0,0,0,0,1]},{type:'play',card:'sell',target:4},D).draft[4],0);
let precision={...start(),upgrades:['precision']};precision=E.reduce(precision,{type:'play',card:'buy',target:4},D);near(precision.draft[4],.19);
let lens={...start(),upgrades:['lens'],energy:0};lens=E.reduce(lens,{type:'play',card:'scout'},D);assert.equal(lens.energy,0);assert.equal(lens.researchLeft,2);
assert.strictEqual(E.reduce({...start(),researchLeft:0},{type:'play',card:'scout'},D).researchLeft,0);
assert.throws(()=>E.settle([1,1,0,0,0,0],100000,[],D.rounds[0]));
assert.throws(()=>E.settle([NaN,0,0,0,0,1],100000,[],D.rounds[0]));
// D16 R2: anchor (no-trade) path — known answers
assert.equal(start().mode,'teaching');
const w0=D.strategies.navigator.weights, r0=D.rounds[0].sector_returns;
const ar0=w0.reduce((n,w,i)=>n+w*r0[i],0);
let anchorState=E.reduce(start(),{type:'lock'},D);
const recA=anchorState.ledger[0];
near(recA.anchor_return,ar0); near(recA.anchor_nav,100000*(1+ar0)); near(recA.tactical_pp,recA.return_value-ar0);
anchorState.anchorWeights.forEach((w,i)=>near(w,w0[i]*(1+r0[i])/(1+ar0)));
anchorState=E.reduce(anchorState,{type:'next'},D);
const aw1=anchorState.anchorWeights, r1v=D.rounds[1].sector_returns;
const ar1=aw1.reduce((n,w,i)=>n+w*r1v[i],0);
anchorState=E.reduce(anchorState,{type:'lock'},D);
near(anchorState.ledger[1].anchor_return,ar1);
near(anchorState.ledger[1].anchor_nav,100000*(1+ar0)*(1+ar1));
// D16 R2: momentum-cycle phases — known answers from fixture
const cv=E.view(start(),D);
near(cv.cycles[4].cum3,102/101-1); assert.equal(cv.cycles[4].phase,'复苏'); assert.equal(cv.cycles[4].observations,6);
assert.equal(cv.cycles[0].phase,null); assert.equal(cv.cycles[0].observations,0);
let cycState=start();
for(let round=1;round<=3;round++){
  cycState=E.reduce(cycState,{type:'lock'},D);cycState=E.reduce(cycState,{type:'next'},D);
  if(round===2){assert.equal(cycState.phase,'upgrade');cycState=E.reduce(cycState,{type:'upgrade',key:'energy'},D);}
}
const cv3=E.view(cycState,D);
near(cv3.cycles[0].cum3,1.04*0.95*0.98-1); assert.equal(cv3.cycles[0].phase,'放缓'); assert.equal(cv3.cycles[0].observations,3);
// D16 R3: realistic mode — costs, cap, replay
assert.equal(E.VERSION,'card-loop-v2');
assert.equal(E.restore(JSON.stringify({version:'card-loop-v3',seed:1,commands:[]}),D),null);
const realisticStart=E.reduce(E.initial(1),{type:'start',key:'navigator',mode:'realistic'},D);
assert.equal(realisticStart.mode,'realistic');
let rs=E.reduce(realisticStart,{type:'play',card:'buy',target:4},D);
rs=E.reduce(rs,{type:'play',card:'rotate',from:0,target:3},D);
rs=E.reduce(rs,{type:'lock'},D);
const rc=rs.ledger[0];
near(rc.costs_paid,16.3,1e-6);
near(rc.after,100000*(1+rc.return_value)-16.3,1e-7);
near(rs.nav,100000*(1+rc.return_value)-16.3,1e-7);
near(rc.contributions.reduce((a,b)=>a+b,0),rc.return_value);
assert.deepEqual(E.restore(E.serialize(rs),D),rs);
const capState={...E.reduce(E.initial(1),{type:'start',key:'navigator',mode:'realistic'},D),draft:[.42,0,0,0,0,.58]};
assert.strictEqual(E.reduce(capState,{type:'play',card:'buy',target:0},D),capState);
assert.notStrictEqual(E.reduce(capState,{type:'play',card:'sell',target:0},D),capState);
assert.equal(E.capBlocked(capState,{card:'buy',target:0}),true);
assert.equal(E.capBlocked({...capState,mode:'teaching'},{card:'buy',target:0}),false);
const teachCap={...start(),draft:[.42,0,0,0,0,.58]};
const afterTeach=E.reduce(teachCap,{type:'play',card:'buy',target:0},D);
assert.notStrictEqual(afterTeach,teachCap); near(afterTeach.draft[0],.45);
let rr=E.reduce(E.initial(0),{type:'start',key:'challenger',mode:'realistic'},D);
let totalCosts=0;
for(let round=1;round<=6;round++){
  rr=E.reduce(rr,{type:'play',card:'buy',target:round%5},D);
  rr=E.reduce(rr,{type:'lock'},D);
  const rec=rr.ledger.at(-1);
  totalCosts+=rec.costs_paid;
  rr=E.reduce(rr,{type:'next'},D);
  if(round===2||round===4)rr=E.reduce(rr,{type:'upgrade',key:round===2?'energy':'lens'},D);
}
assert.equal(rr.phase,'final');
assert.ok(totalCosts>0);
near(rr.ledger.reduce((n,x)=>n+x.costs_paid,0),totalCosts,1e-6);
const report={passed:true,legacy_settlements:3276,numeric_assertions:assertions,campaigns:runs,realistic_coverage:true};
fs.mkdirSync(path.join(here,'evidence'),{recursive:true});fs.writeFileSync(path.join(here,'evidence/engine.json'),JSON.stringify(report,null,2));
console.log(report);
