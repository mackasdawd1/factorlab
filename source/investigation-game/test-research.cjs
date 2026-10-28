'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const test = require('node:test');
const file = path.join(__dirname, 'research.js');
const R = fs.existsSync(file) ? require(file) : {};
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-12, `${a} != ${b}`);

test('average ranks and pairwise omission preserve negative IC and undefined boundaries', () => {
  assert.equal(typeof R.rankIC, 'function');
  near(R.rankIC([1, 2, 3, 4, 5], [5, 4, 3, 2, 1]), -1);
  near(R.rankIC([1, 1, 2, 3], [1, 2, 2, 3]), 5 / 6);
  near(R.rankIC([1, 2, null, 3], [3, 2, 100, 1]), -1);
  assert.equal(R.rankIC([1, 1, 1], [1, 2, 3]), null);
  assert.equal(R.rankIC([1, null, 3], [1, 2, 3]), null);
  assert.throws(() => R.rankIC([1, 2, 3], [1, 2]));
});

test('performance compounds, includes initial NAV in drawdown and handles sample boundaries', () => {
  assert.equal(typeof R.performance, 'function');
  const p = R.performance([0.1, -0.1]);
  near(p.totalReturn, -0.01); near(p.maxDrawdown, 0.1);
  near(R.performance([-0.2]).maxDrawdown, 0.2);
  assert.equal(R.performance([]).totalReturn, null);
  assert.throws(() => R.performance([-1]));
  assert.throws(() => R.performance([NaN]));
});

test('42 fixed synthetic months yield 36 forward observations with independent benchmark', () => {
  assert.equal(typeof R.analyze, 'function');
  const data = R.createHistory();
  assert.deepEqual(data, R.createHistory());
  assert.equal(data.length, 42);
  const a = R.analyze();
  assert.equal(a.sampleCount, 36); assert.equal(a.lookback, 6);
  assert.equal(a.months.length, 36); assert.equal(a.strategy.nav.length, 37);
  assert.match(a.label, /合成/);
  assert.deepEqual(a.preferences, { Momentum: 0.25, Value: 0.25, Quality: 0.25, LowVol: 0.25 });
  for (let n = 0; n < 36; n++) {
    const month = a.months[n];
    const returns = data[n + 6].returns;
    const mean = R.SECTORS.reduce((sum, sector) => sum + returns[sector.id], 0) / 5;
    near(month.benchmarkReturn, mean);
    assert.equal(month.top.length, 2); assert.equal(month.bottom.length, 2);
    near(month.strategyReturn, (returns[month.top[0]] + returns[month.top[1]]) / 2);
    near(month.spread, month.strategyReturn - (returns[month.bottom[0]] + returns[month.bottom[1]]) / 2);
    assert.ok(month.rankings.every(row => row.availableAt <= month.decisionTime));
  }
  assert.equal(a.factors.length, 4);
  assert.ok(a.factors.every(f => f.validMonths + f.missingMonths === 36));
  const momentum = R.analyze({ Momentum: 1 });
  assert.deepEqual(momentum.benchmark, a.benchmark);
  assert.notDeepEqual(momentum.months[0].rankings, a.months[0].rankings);
  assert.deepEqual(data, R.createHistory());
});

test('six-month signals use only returns and fundamentals available at decision time', () => {
  assert.equal(typeof R.signals, 'function');
  const data = R.createHistory();
  const before = R.signals(data, 30);
  const changed = structuredClone(data);
  for (let i = 30; i < 42; i++) {
    changed[i].returns.semiconductors = 8;
    changed[i].fundamentals.semiconductors.ep = 8;
    changed[i].fundamentals.semiconductors.roe = 8;
  }
  assert.deepEqual(R.signals(changed, 30), before);
  const delayed = structuredClone(data);
  delayed[29].fundamentals.semiconductors.availableAt = 31;
  const baseline = R.signals(delayed, 30);
  delayed[29].fundamentals.semiconductors.ep = 500;
  assert.deepEqual(R.signals(delayed, 30), baseline);
  const last = structuredClone(data);
  last[41].returns.semiconductors = -0.7;
  assert.deepEqual(R.analyze(undefined, last).months[35].rankings, R.analyze().months[35].rankings);
  const ancient = structuredClone(data);
  ancient[0].returns.semiconductors = 9;
  assert.deepEqual(R.signals(ancient, 30), before);
});

test('known fixed scores select top two, use ID ties, and IC marks constant inputs missing', () => {
  assert.equal(typeof R.createHistory, 'function');
  const data = R.createHistory();
  for (const month of data) {
    R.SECTORS.forEach((sector, i) => {
      month.returns[sector.id] = -0.01 * (i + 1);
      month.fundamentals[sector.id].ep = i + 1;
      month.fundamentals[sector.id].roe = 0.1;
    });
  }
  const a = R.analyze({ Value: 1 }, data);
  near(a.months[0].strategyReturn, -0.045);
  near(a.months[0].benchmarkReturn, -0.03);
  near(a.meanSpread, -0.03);
  near(a.factors.find(f => f.id === 'Value').meanIC, -1);
  assert.equal(a.factors.find(f => f.id === 'Quality').validMonths, 0);
  assert.equal(a.factors.find(f => f.id === 'Quality').meanIC, null);
  const ties = R.analyze({ Quality: 1 }, data);
  assert.deepEqual(ties.months[0].top, ['AI', 'cleanenergy']);
  assert.equal(ties.months[0].tied, true);
});

test('invalid preferences and incomplete, future-extended or invalid return histories fail visibly', () => {
  assert.equal(typeof R.analyze, 'function');
  for (const bad of [{ Momentum: -1 }, { Momentum: Infinity }, { Momentum: 0 }, { Typo: 1 }]) {
    assert.throws(() => R.analyze(bad));
  }
  assert.throws(() => R.analyze(undefined, R.createHistory().slice(1)));
  assert.throws(() => R.analyze(undefined, [...R.createHistory(), R.createHistory()[0]]));
  const invalid = R.createHistory();
  invalid[12].returns.AI = NaN;
  assert.throws(() => R.analyze(undefined, invalid));
});

test('standalone browser export computes same report without importing game or real-case inputs', () => {
  assert.equal(typeof R.analyze, 'function');
  const context = vm.createContext({});
  vm.runInContext(fs.readFileSync(file, 'utf8'), context);
  near(context.InvestigationResearch.analyze().strategy.totalReturn, R.analyze().strategy.totalReturn);
  assert.ok(R.REAL_CASE.facts.length > 0 && R.REAL_CASE.facts.length <= 3);
  for (const fact of R.REAL_CASE.facts) assert.ok(new URL(fact.url).protocol === 'https:');
});

test('all 36 forward months are isolated and multiplying preferences leaves decisions unchanged', () => {
  const data = R.createHistory();
  for (let t = 6; t < 42; t++) {
    const changed = structuredClone(data);
    for (let j = t; j < 42; j++) {
      for (const sector of R.SECTORS) {
        changed[j].returns[sector.id] = -0.9;
        changed[j].fundamentals[sector.id].ep = 100;
        changed[j].fundamentals[sector.id].roe = 100;
      }
    }
    assert.deepEqual(R.signals(changed, t), R.signals(data, t));
  }
  assert.deepEqual(R.analyze({ Value: 2, Quality: 1 }), R.analyze({ Value: 20, Quality: 10 }));
});

test('factor directions match six-month compounding and sample volatility known answers', () => {
  const data = R.createHistory();
  const six = [0.1, -0.1, 0.1, -0.1, 0.1, -0.1];
  for (let i = 0; i < 6; i++) data[i].returns.semiconductors = six[i];
  const semiconductor = R.signals(data, 6).find(s => s.id === 'semiconductors');
  near(semiconductor.raw.Momentum, -0.029701);
  near(semiconductor.raw.LowVol, -Math.sqrt(0.012));
  near(semiconductor.raw.Value, data[5].fundamentals.semiconductors.ep);
  near(semiconductor.raw.Quality, data[5].fundamentals.semiconductors.roe);
  for (const factor of R.FACTORS) {
    const rows = R.signals(data, 6, { [factor.id]: 1 });
    for (let i = 1; i < rows.length; i++) assert.ok(rows[i - 1].raw[factor.id] >= rows[i].raw[factor.id]);
  }
});
