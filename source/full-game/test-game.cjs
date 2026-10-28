const assert=require('node:assert/strict');
const fs=require('node:fs');
assert(fs.existsSync(__dirname+'/game.js'),'six-round game state module required');
const G=require('./game.js');
const D=require('./data.json');
const initial=G.initial();
assert.equal(G.reduce(initial,{type:'execute'},D),initial);
let s=G.reduce(initial,{type:'strategy',key:'navigator'},D);
assert.equal(G.ledger(D,s.node).length,0);
for(let i=1;i<=6;i++){
 const prior=s;
 s=G.reduce(s,{type:'decision',key:'hold'},D);
 assert.equal(s.node,prior.node);
 s=G.reduce(s,{type:'execute'},D);
 assert.equal(s.phase,'result');
 assert.equal(G.ledger(D,s.node).length,i);
 assert.equal(G.reduce(s,{type:'execute'},D),s);
 assert.deepEqual(G.restore(G.serialize(s,D),D),s);
 s=G.reduce(s,{type:'next'},D);
 assert.equal(s.phase,i===6?'final':'plan');
}
assert.equal(G.reduce(s,{type:'next'},D),s);
assert.equal(D.nodes[s.node].round,7);
const debrief=G.debrief(D,s.node);
assert.equal(debrief.rounds,6);
assert.equal(debrief.consistency,6);
assert.equal(debrief.adaptations,0);
let meta=G.complete({paths:[],history:[]},s,'run-a',D);
assert.equal(meta.paths.length,1);assert.equal(meta.history.length,1);
assert.deepEqual(G.complete(meta,s,'run-a',D),meta);
meta=G.complete(meta,s,'run-b',D);
assert.equal(meta.paths.length,1);assert.equal(meta.history.length,2);
assert.deepEqual(G.reduce(s,{type:'replay'},D),initial);
assert.equal(G.restore('{bad',D),null);
const save=JSON.parse(G.serialize(s,D));
assert.equal(G.restore(JSON.stringify({...save,version:'old'}),D),null);
assert.equal(G.restore(JSON.stringify({...save,node:'navigator:',phase:'final'}),D),null);
assert.equal(G.restore(JSON.stringify({...save,node:'navigator:',phase:'result'}),D),null);
assert.equal(G.restore(JSON.stringify({...save,phase:'plan'}),D),null);
assert.deepEqual(G.sanitizeMeta({paths:['not-a-path'],history:[{id:'bad'}]},D),{paths:[],history:[]});
assert.deepEqual(G.sanitizeMeta(null,D),{paths:[],history:[]});
let traversed=0;
for(const strategy of Object.keys(D.strategies)){
 function walk(state){
  if(state.phase==='final'){traversed++;return;}
  for(const key of Object.keys(D.decisions)){
   const choice=G.reduce(state,{type:'decision',key},D);
   const settled=G.reduce(choice,{type:'execute'},D);
   assert.equal(G.ledger(D,settled.node).length,D.nodes[state.node].round);
   walk(G.reduce(settled,{type:'next'},D));
  }
 }
 walk(G.reduce(initial,{type:'strategy',key:strategy},D));
}
assert.equal(traversed,2187);
const gainBreach=D.nodes['guardian:boost'];
assert(gainBreach.record.return_value>0);
assert.equal(G.mission(D,gainBreach).passed,false);
assert.equal(gainBreach.record.reward.quality,'reflect');
assert.equal(G.mission(D,D.nodes['guardian:hold.buffer']).passed,true);
fs.mkdirSync(__dirname+'/evidence',{recursive:true});
fs.writeFileSync(__dirname+'/evidence/state.json',JSON.stringify({status:'PASS',complete_paths:traversed,save_load:'PASS',duplicate_execute:'PASS',missions:'PASS',meta_dedup:'PASS',invalid_save:'PASS',verified_at:new Date().toISOString()},null,2)+'\n');
console.log('PASS: 2187 paths, six-round transitions, save validation, replay, mission, completion dedup');
