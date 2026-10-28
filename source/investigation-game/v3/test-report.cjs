const test = require('node:test');
const assert = require('node:assert/strict');
const {buildReport} = require('./report.js');
const E = require('../v2/simulation.js');
const R = require('../research.js');

function report(state, extra = {}) {
  return buildReport({state: E.publicView(state), translate: key => E.TEXTS['zh-CN'][key] || key, ...extra});
}
function complete() {
  let state = E.initial();
  for (let step = 0; step < 100 && state.phase !== 'complete'; step++) {
    if (state.phase === 'decision') state = E.reduce(state, {type:'lock', weights:[...E.INITIAL_WEIGHTS], factorWeights:[.25,.25,.25,.25], reason:'evidence · 检验订单兑现', forecast:'flat'});
    else if (state.phase === 'simulating') state = E.reduce(state, {type:'advance', days:720});
    else if (state.phase === 'event') state = E.reduce(state, {type:'resume'});
    else if (state.phase === 'review') state = E.reduce(state, {type:'next'});
  }
  assert.equal(state.phase, 'complete');
  return state;
}

test('Opening report labels incomplete practice, no events or explicit backtest', () => {
  const output = report(E.initial(), {research:R.analyze()});
  assert.match(output.progress, /0 \/ 6/);
  assert.equal(output.hasRunBacktest, false);
  assert.match(output.text, /尚未运行回测/);
  assert.match(output.text, /尚无已结算轮次/);
  assert.match(output.text, /尚无已披露事件/);
  assert.match(output.text, /年化 Sharpe：—/);
  assert.doesNotMatch(output.text, /第 25 日|第 46 日/);
});

test('Six settled rounds use exact engine values and never expose hidden seed, schedule or commands', () => {
  const state = complete(), before = JSON.stringify(state), metrics = E.metrics(state);
  const output = report(state, {envelope:{game:E.serialize(state),reflection:'利润是否兑现？',note:'我的证据',reason:'evidence'}});
  assert.equal(JSON.stringify(state), before);
  assert.match(output.progress, /6 \/ 6.*120/);
  assert.equal(output.sections[4].lines.filter(line => /^第 \d 轮 \|/.test(line)).length, 6);
  const expected = (metrics.returnValue * 100).toLocaleString('zh-CN', {minimumFractionDigits:2,maximumFractionDigits:2});
  assert.ok(output.text.includes('累计组合收益：' + expected + '%'));
  assert.match(output.text, /利润是否兑现/);
  assert.doesNotMatch(output.text, /"commands"|"seed"|"rng"|"eventState"/);
  assert.match(output.text, /不代表课程交付已完成/);
});

test('Backtest metrics require an explicit fresh run and use actual research preferences and IC', () => {
  const research = R.analyze({Momentum:100});
  const output = report(E.initial(), {research,researchStatus:{hasRun:true,dirty:false}});
  assert.equal(output.hasRunBacktest, true);
  assert.match(output.text, /本次会话已运行回测：36/);
  assert.match(output.text, /动量 100.00%/);
  assert.match(output.text, /价值 0.00%/);
  assert.equal(output.sections[2].lines.filter(line => /Rank IC .*有效月份/.test(line)).length, 4);
  const dirty = report(E.initial(), {research,researchStatus:{hasRun:true,dirty:true}});
  assert.equal(dirty.hasRunBacktest, false);
  assert.match(dirty.text, /尚未重新运行/);
  assert.doesNotMatch(dirty.text, /合成策略收益：/);
});

test('Independent calls read only the active profile reflection and do not retain prior research runs', () => {
  const a = report(E.initial(), {envelope:{reflection:'ACCOUNT_A_PRIVATE'},research:R.analyze(),researchStatus:{hasRun:true}});
  const b = report(E.initial(), {envelope:{reflection:'ACCOUNT_B_ONLY'},research:R.analyze(),researchStatus:{hasRun:false}});
  assert.match(a.text, /ACCOUNT_A_PRIVATE/);
  assert.doesNotMatch(b.text, /ACCOUNT_A_PRIVATE/);
  assert.match(b.text, /ACCOUNT_B_ONLY/);
  assert.equal(b.hasRunBacktest, false);
});

test('Only opened evidence and already disclosed events enter the summary', () => {
  const state = E.publicView(E.initial());
  state.seen = ['E2'];
  state.events = [{startDay:1,titleKey:'FUTURE_TITLE',bodyKey:'FUTURE_BODY'}];
  const output = buildReport({state,translate:key=>key});
  assert.match(output.text, /E2 evidence.E2.title/);
  assert.doesNotMatch(output.text, /E1 evidence.E1.title|FUTURE_TITLE|FUTURE_BODY/);
});

test('English summary preserves course limits, deliverables and unresolved partner identity', () => {
  const output = report(E.initial(), {lang:'en'});
  assert.match(output.title, /Research summary/);
  assert.match(output.text, /Subproject B/);
  assert.match(output.text, /Week 11/);
  assert.match(output.text, /CITIC Securities/);
  assert.match(output.text, /conflicting Chinese name/);
  assert.match(output.text, /does not submit coursework/);
  assert.match(output.text, /No explicit backtest run/);
});
