const assert=require('node:assert/strict');
const fs=require('node:fs');
const G=require('./game.js'),D=require('./data.json');
let s=G.reduce(G.initial(),{type:'strategy',key:'navigator'},D);
const purchased=G.reduce(s,{type:'research'},D);
assert.notDeepEqual(purchased,s,'research must unlock current-round detail');
assert.deepEqual(purchased.research,[1]);
assert.equal(purchased.node,s.node,'research must not change holdings or NAV');
assert.equal(G.reduce(purchased,{type:'research'},D),purchased,'duplicate purchase is free and idempotent');
s=purchased;
for(let round=1;round<=6;round++){
 if(round<=3)s=G.reduce(s,{type:'research'},D);
 else assert.equal(G.reduce(s,{type:'research'},D),s,'exhausted budget must refuse research');
 s=G.reduce(s,{type:'reason',key:'uncertain'},D);
 s=G.reduce(s,{type:'decision',key:'hold'},D);
 const before=s;
 s=G.reduce(s,{type:'execute'},D);
 assert.deepEqual(s.research,before.research);
 assert.equal(s.reasons[round],'uncertain');
 assert.equal(G.reduce(s,{type:'research'},D),s,'no research after reveal');
 assert.equal(G.reduce(s,{type:'reason',key:'trend'},D),s,'locked reason cannot be rewritten');
 assert.deepEqual(G.restore(G.serialize(s,D),D),s);
 s=G.reduce(s,{type:'next'},D);
}
assert.equal(s.phase,'final');
assert.deepEqual(s.research,[1,2,3]);
assert.deepEqual(G.reduce(s,{type:'replay'},D).research,[]);
for(const research of [[1,1],[1,2,3,4],[7],[-1],[1.5],['1'],null]){
 assert.equal(G.restore(JSON.stringify({...JSON.parse(G.serialize(s,D)),research}),D),null,'reject invalid purchase ledger');
}
const fresh=G.reduce(G.initial(),{type:'strategy',key:'guardian'},D);
assert.equal(G.restore(JSON.stringify({...JSON.parse(G.serialize(fresh,D)),research:[2]}),D),null,'future research is invalid');
assert.equal(G.restore(JSON.stringify({...JSON.parse(G.serialize(fresh,D)),reasons:{2:'trend'}}),D),null,'future reasoning is invalid');
assert.equal(G.restore(JSON.stringify({...JSON.parse(G.serialize(fresh,D)),reasons:{1:'<img>'}}),D),null,'unknown reasoning is invalid');
assert.equal(G.restore(JSON.stringify({...fresh,version:D.version}),D),null,'legacy saves must not be misrepresented as new research records');
const I=require('./information.js'),info=require('./information-data.json');
for(let round=1;round<=6;round++){
 const basic=I.view(info,round,false),detail=I.view(info,round,true);
 assert.equal(basic.points.length,3);assert.equal(detail.points.length,7);
 assert.equal(basic.volatility,null,'hidden metric not returned to basic view');
 assert(basic.points.every(p=>detail.points.some(q=>q.time===p.time&&q.value===p.value)));
 assert(detail.points.every(p=>p.availableAt<=round-1&&p.time<=round-1));
 assert.deepEqual(basic.points.at(-1),detail.points.at(-1));
 const changed=structuredClone(info);
 for(let i=round;i<6;i++)changed.rounds[i].points.forEach(p=>p.value=999999);
 assert.deepEqual(I.view(changed,round,true),detail,'future data cannot affect present information');
}
assert.throws(()=>I.view(info,7,true));
const future=structuredClone(info);future.rounds[0].points[0].availableAt=1;
assert.throws(()=>I.view(future,1,true),'fail closed on unavailable observation');
const sameTrend={version:info.version,rounds:[{round:1,cutoff:0,points:[100,101,102,103,104,105,106].map((value,i)=>({time:i-6,availableAt:i-6,value}))}]};
assert.equal(I.view(sameTrend,1,false).change,I.view(sameTrend,1,true).change,'extra observations do not guarantee different trend');
const knownRisk=structuredClone(sameTrend);
knownRisk.rounds[0].points.forEach((p,i)=>p.value=[100,110,99,99,99,99,99][i]);
assert(Math.abs(I.view(knownRisk,1,true).volatility-0.06324555320336758)<1e-12,'six returns +10%, -10%, 0, 0, 0, 0 have sample volatility sqrt(0.02/5)');
assert.equal(I.view(knownRisk,1,false).volatility,null,'basic view cannot disclose detailed volatility');
for(const value of [null,[],['trend'],{},'unknown']){
 assert.equal(G.restore(JSON.stringify({...JSON.parse(G.serialize(fresh,D)),reasons:{1:value}}),D),null,'reason must be a supported string');
}
let schedules=0;
for(let mask=0;mask<64;mask++){
 if(mask.toString(2).replaceAll('0','').length>3)continue;
 for(const strategy of Object.keys(D.strategies)){
  let state=G.reduce(G.initial(),{type:'strategy',key:strategy},D),expected=strategy+':';
  for(let round=1;round<=6;round++){
   if(mask&(1<<(round-1)))state=G.reduce(state,{type:'research'},D);
   const key=['hold','boost','buffer'][round%3];
   expected=D.nodes[expected].options[key].next;
   state=G.reduce(G.reduce(state,{type:'decision',key},D),{type:'execute'},D);
   assert.equal(state.node,expected,'all research schedules share the same settlement for identical allocations');
   assert.deepEqual(G.restore(G.serialize(state,D),D),state);
   state=G.reduce(state,{type:'next'},D);
  }
  schedules++;
 }
}
assert.equal(schedules,126);
fs.writeFileSync(__dirname+'/evidence/information-state.json',JSON.stringify({status:'PASS',research_schedules:42,strategy_schedule_runs:schedules,budget:'three per run; no overspend or duplicate charge',timing:'plan only; locked reasons; no future observations',save:'strict version and purchase/reason validation',volatility:'independent known-answer six-return sample standard deviation',finance:'research does not change financial node',verified_at:new Date().toISOString()},null,2)+'\n');
console.log('PASS: research budget, locked reasoning, save validation, information projection and future isolation');
