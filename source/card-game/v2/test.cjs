const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
assert.ok(fs.existsSync(path.join(__dirname,'duel.js')),'V2 duel engine must exist');
const V=require('./duel.js'),D=require('../data.json');
for(const c of Object.values(V.classes))assert.equal(c.deck.length,10);
assert.equal(Object.keys(V.cards).length,16);
let s=V.reduce(V.initial(4),{type:'start',key:'navigator',mode:'realistic'},D);
assert.equal(s.hand.length,5);assert.equal(new Set(s.hand).size,5);assert.equal(s.hp,100);
assert.deepEqual(V.restore(V.serialize(s),D),s);
let mutated=structuredClone(D);mutated.rounds.forEach(r=>{r.sector_returns.fill(.9);r.event='future';});
assert.deepEqual(V.view(s,D),V.view(s,mutated));
assert.strictEqual(V.reduce(s,{type:'buy',index:0},D),s);
assert.equal(V.restore('{bad',D),null);
assert.equal(V.restore(JSON.stringify({version:V.VERSION,seed:1,commands:[{type:'lock'}]}),D),null);
const reports=[];
for(const mode of ['teaching','realistic'])for(const key of Object.keys(V.classes))for(let seed=1;seed<=30;seed++){
 let n=V.reduce(V.initial(seed),{type:'start',key,mode},D),guard=0;
 while(n.phase!=='final'&&guard++<80){
  if(n.phase==='plan'){
   for(const uid of [...n.hand]){
    const card=n.collection.find(c=>c.uid===uid).id;
    if((seed+guard)%2===0)n=V.reduce(n,{type:'play',uid,target:(seed+guard)%5,from:(seed+guard+1)%5,direction:'up'},D);
   }
   const before=n;n=V.reduce(n,{type:'lock'},D);assert.notStrictEqual(n,before,'lock must never deadlock');
   assert.equal(n.phase,'result');const r=n.ledger.at(-1);
   assert.ok(Math.abs(r.contributions.reduce((a,b)=>a+b,0)-r.return_value)<1e-10);
   assert.ok(Math.abs(r.cumulative_contributions.reduce((a,b)=>a+b,0)-(r.after/100000-1))<1e-10);
   assert.ok(n.hp>=0&&n.hp<=100);assert.strictEqual(V.reduce(n,{type:'lock'},D),n);
  }else if(n.phase==='result')n=V.reduce(n,{type:'next'},D);
  else if(n.phase==='shop'){
   const product=n.shop.findIndex(p=>!p.sold&&p.price<=n.chips);
   if(product>=0)n=V.reduce(n,{type:'buy',index:product},D);
   n=V.reduce(n,{type:'leave'},D);
  }else if(n.phase==='draft')n=V.reduce(n,{type:'pick',index:seed%3},D);
  else if(n.phase==='search')n=V.reduce(n,{type:'search',uid:null},D);
  assert.deepEqual(V.restore(V.serialize(n),D),n);
 }
 assert.equal(n.phase,'final');reports.push({key,mode,seed,rounds:n.ledger.length,hp:n.hp,wins:n.wins,grade:V.grade(n),ledger:n.ledger});
}
fs.mkdirSync(path.join(__dirname,'evidence'),{recursive:true});
fs.writeFileSync(path.join(__dirname,'evidence/trajectories.json'),JSON.stringify(reports));
console.log({passed:true,runs:reports.length,survived:reports.filter(r=>r.rounds===6&&r.hp>0).length});
