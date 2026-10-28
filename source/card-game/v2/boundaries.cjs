const assert=require('node:assert/strict'),V=require('./duel.js'),D=require('../data.json');
const base=()=>V.reduce(V.initial(42),{type:'start',key:'navigator'},D);
function fixture(ids,extra={}){const s={...base(),weights:[.2,.15,.15,.1,.15,.25],draft:[.2,.15,.15,.1,.15,.25],...extra};s.collection=ids.map((id,i)=>({id,uid:'x'+i}));s.hand=s.collection.map(c=>c.uid);s.draw=[];s.discard=[];s.played=[];s.energy=12;s.shields=0;return s;}
const play=(s,index,extra={})=>V.reduce(s,{type:'play',uid:'x'+index,target:4,from:0,...extra},D);
let checks=0;
for(const id of Object.keys(V.cards)){
 let s=fixture([id]);
 if(['report','chase'].includes(id)){s.round=2;s.ledger=[{sector_returns_snapshot:[.04,.03,-.02,.01,.02,.001]}];}
 const n=play(s,0,{direction:'up'});
 assert.equal(n===s,id==='ballast',id);checks++;
 if(n!==s)assert.strictEqual(play(n,0,{direction:'up'}),n,'entity cannot play twice');
}
let s=fixture(['buy','buy']);s=play(s,0,{target:0});s=play(s,1,{target:1});assert.equal(s.played.length,2);assert.ok(Math.abs(s.draft[0]-.23)<1e-10);
s=fixture(['scout','buy']);s=play(s,0);s=play(s,1);assert.ok(Math.abs(s.draft[4]-.20)<1e-10);assert.ok(V.comboIds(s).includes('informed'));
s=fixture(['buy','scout']);s=play(s,0);s=play(s,1);assert.ok(Math.abs(s.draft[4]-.18)<1e-10);assert.ok(!V.comboIds(s).includes('informed'));
s=fixture(['rotate','sell']);s=play(s,0,{target:3});s=play(s,1);assert.ok(V.comboIds(s).includes('rotation'));
s=fixture(['spread']);s=play(s,0);assert.ok(V.comboIds(s).includes('diverse'));
s=fixture(['sell','stop','reserve']);for(let i=0;i<3;i++)s=play(s,i);assert.ok(V.comboIds(s).includes('fortress'));
s=fixture(['buy','sell','scout']);for(let i=0;i<3;i++)s=play(s,i);assert.ok(V.comboIds(s).includes('all'));
s=fixture(['focus','leverage'],{key:'challenger',weights:[.2,.2,.15,.15,.1,.2],draft:[.2,.2,.15,.15,.1,.2]});s=play(s,0);s=play(s,1);assert.ok(V.comboIds(s).includes('conviction'));
const pure=V.finance(s,D),scored=V.duelResult(s,pure,D);assert.notEqual(scored.parts.length,0);assert.deepEqual(V.finance(s,D),pure,'duel cannot alter NAV');
s=fixture(['insurance']);s=play(s,0);const damage=V.duelResult(s,{return_value:-.20},D);assert.equal(damage.damage,30);assert.equal(damage.raw,60);
s=fixture(['stop']);s=play(s,0);const before=s.shields;const lossD=structuredClone(D);lossD.rounds[0].sector_returns[4]=-.1;assert.equal(V.duelResult(s,{return_value:-.2},lossD).shields,before+1);
const cashState=fixture(['ballast'],{draft:[.1,.1,.1,.1,.1,.5]});assert.equal(V.duelResult(cashState,{return_value:0},D).parts[0].value,.6);
s=fixture(['report']);assert.strictEqual(play(s,0),s,'no future ranking in first month');
s=fixture(['buy'],{draft:[.2,.2,.15,.15,.15,.15]});assert.strictEqual(play(s,0),s,'Navigator upper bound');
s=fixture(['buy']);const e=V.reduce(s,{type:'exchange',uid:'x0'},D);assert.equal(e.energy,s.energy+1);assert.equal(e.hand.length,0);assert.strictEqual(V.reduce(e,{type:'exchange',uid:'x0'},D),e);
s=fixture(['ballast']);assert.strictEqual(V.reduce(s,{type:'exchange',uid:'x0'},D),s,'passive cannot be exchanged after benefit');
s={...base(),phase:'shop',chips:10000,shop:[{type:'upgrade',id:'search',price:3000,sold:false}]};
s=V.reduce(s,{type:'buy',index:0},D);assert.equal(s.chips,7000);assert.ok(s.upgrades.includes('search'));assert.strictEqual(V.reduce(s,{type:'buy',index:0},D),s);
s=V.reduce(s,{type:'refresh'},D);assert.equal(s.chips,6500);assert.strictEqual(V.reduce(s,{type:'refresh'},D),s);
const old=s.collection[0].uid;s=V.reduce(s,{type:'remove',uid:old},D);assert.equal(s.collection.length,9);assert.ok(!s.collection.some(c=>c.uid===old));assert.strictEqual(V.reduce(s,{type:'remove',uid:s.collection[0].uid},D),s);
s=V.reduce(s,{type:'leave'},D);assert.equal(new Set(s.offers).size,3);s=V.reduce(s,{type:'pick',index:0},D);assert.equal(s.phase,'search');assert.equal(s.hand.length,4);const chosen=s.draw[0]||s.discard[0];s=V.reduce(s,{type:'search',uid:chosen},D);assert.equal(s.hand.length,5);assert.equal(new Set(s.hand).size,5);assert.ok(s.hand.includes(chosen));
const early={...base(),hp:0,ledger:[{}],phase:'result'};assert.equal(V.reduce(early,{type:'next'},D).phase,'final');
console.log({passed:true,card_types:checks,combos:6,shop_limits:true,information_order:true,damage_cap:true,independent_ledgers:true});
