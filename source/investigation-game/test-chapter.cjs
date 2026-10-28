const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const exists = fs.existsSync(path.join(__dirname, 'chapter.js'));
test('chapter module is available', () => assert.ok(exists, 'Investigative chapter has not been implemented'));
if (exists) {
  const C = require('./chapter.js');
  const base = require('../card-game/engine.js');
  const fixture = require('../card-game/data.json').rounds[1];
  const ready = action => ['E1','E2','E3'].reduce((s,id)=>C.reduce(s,{type:'read',id}), C.initial());
  const lock = action => C.reduce(C.reduce(C.reduce(ready(),{type:'choose',choice:action}),{type:'reason',reason:'valuation',note:'估值已经反映了部分增长'}),{type:'lock'});
  test('three decisions transfer exactly five percentage points and conserve funds', () => {
    for(const [choice,delta] of [['hold',0],['increase',.05],['decrease',-.05]]) {
      const p=C.preview(C.initial(),choice);
      assert.equal(p.ok,true);
      assert.ok(Math.abs(p.weights[0]-.2-delta)<1e-12);
      assert.ok(Math.abs(p.weights[5]-.15+delta)<1e-12);
      assert.ok(Math.abs(p.weights.reduce((a,b)=>a+b,0)-1)<1e-12);
    }
    assert.equal(C.preview({...C.initial(),weights:[.2,.2,.2,.2,.18,.02]},'increase').ok,false);
    assert.equal(C.preview({...C.initial(),weights:[.4,.15,.1,.1,.1,.15]},'increase').ok,false);
    assert.equal(C.preview({...C.initial(),weights:[.02,.2,.2,.2,.2,.18]},'decrease').ok,false);
  });
  test('all decisions reuse the financial engine and reconcile against anchor', () => {
    for(const choice of ['hold','increase','decrease']) {
      const s=lock(choice), expected=base.settle(C.preview(C.initial(),choice).weights,100000,[],fixture);
      assert.equal(s.phase,'review');
      assert.equal(s.result.after,expected.after);
      assert.ok(Math.abs(s.result.contributions.reduce((a,b)=>a+b,0)-s.result.return_value)<1e-10);
      assert.equal(s.result.anchorAfter,base.settle(C.initial().weights,100000,[],fixture).after);
      assert.ok(Math.abs(s.result.tacticalAmount-(s.result.after-s.result.anchorAfter))<1e-10);
      assert.ok(s.result.maximum_drawdown>0);
      assert.equal(s.result.sharpe,null);
    }
  });
  test('lock needs evidence and a self-reported reason, then becomes idempotent', () => {
    assert.throws(()=>C.reduce(C.initial(),{type:'lock'}));
    assert.throws(()=>C.reduce(ready(),{type:'lock'}));
    const s=lock('hold');
    assert.deepEqual(C.reduce(s,{type:'lock'}),s);
    assert.throws(()=>C.reduce(s,{type:'choose',choice:'increase'}));
  });
  test('save replays decisions; forged results cannot overwrite the ledger', () => {
    const s=lock('increase'), save=C.serialize(s);
    assert.deepEqual(C.restore(save),s);
    assert.deepEqual(C.restore({...save,result:{after:99999999}}),s);
    assert.throws(()=>C.restore({version:'wrong',commands:[]}));
    assert.throws(()=>C.restore({version:C.VERSION,commands:[{type:'choose',choice:'all-in'}]}));
    assert.throws(()=>C.reduce(ready(),{type:'reason',reason:'invented',note:''}));
  });
  test('coach never receives hidden event or realized outcome before settlement', () => {
    const pre=C.coachContext(ready());
    assert.equal(pre.result,undefined);
    assert.ok(!JSON.stringify(pre).includes('利率上行'));
    assert.ok(!JSON.stringify(pre).includes('sector_returns'));
    assert.deepEqual(pre.evidence.map(e=>e.id),['E1','E2','E3']);
    assert.ok(C.coachContext(lock('decrease')).result);
    assert.equal(C.sampleReply(ready(),'什么支持加仓？').mode,'example');
    assert.ok(C.sampleReply(lock('decrease'),'为什么亏了？').references.includes('RESULT'));
  });
}
