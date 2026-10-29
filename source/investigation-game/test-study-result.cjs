'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const path = require('node:path');
const fs = require('node:fs');
const R = require('./research.js');
const S = require('./studyResult.js');

const FORBIDDEN = /efficac|alpha/i;

function collectKeys(value, out = new Set(), prefix = '') {
  if (!value || typeof value !== 'object') return out;
  if (Array.isArray(value)) {
    value.forEach((item, i) => collectKeys(item, out, `${prefix}[${i}]`));
    return out;
  }
  for (const [k, v] of Object.entries(value)) {
    out.add(k);
    collectKeys(v, out, prefix ? `${prefix}.${k}` : k);
  }
  return out;
}

test('toStudyResult freezes synthetic StudyResult with 7 required fields', () => {
  const pack = S.exportStudyResult();
  assert.equal(pack.schemaVersion, 'studyresult/1');
  assert.equal(typeof pack.studyId, 'string');
  assert.ok(pack.studyId.length > 0);
  assert.equal(pack.dataProvenance, 'synthetic');
  assert.equal(pack.factorUniverseVersion, 'factors-teaching-v1');
  assert.equal(typeof pack.sampleWindow, 'object');
  assert.equal(pack.sampleWindow.frequency, 'month');
  assert.equal(pack.sampleCount, 36);
  assert.ok(Array.isArray(pack.factors));
  assert.equal(pack.factors.length, 4);
  for (const f of pack.factors) {
    assert.ok(['Momentum', 'Value', 'Quality', 'LowVol'].includes(f.id));
    assert.ok('meanIC' in f);
    assert.equal(typeof f.validMonths, 'number');
    assert.ok(!('efficacy' in f));
    assert.ok(!('alpha' in f));
  }
  assert.match(pack.note, /不证明现实有效/);
});

test('StudyResult JSON keys never use efficacy/alpha naming', () => {
  const pack = S.toStudyResult(R.analyze({ Momentum: 1 }));
  const keys = [...collectKeys(pack)];
  for (const key of keys) {
    assert.equal(FORBIDDEN.test(key), false, `forbidden key: ${key}`);
  }
  assert.ok(!('strategyTotalReturn' in pack) || pack.dataProvenance === 'synthetic');
  // Must not copy strategy.totalReturn into a frozen efficacy-shaped field
  assert.ok(!('efficacy' in pack));
  assert.ok(!('alpha' in pack));
  assert.ok(!('totalReturn' in pack));
});

test('analyze boundary note remains available via StudyResult', () => {
  const a = R.analyze();
  assert.match(a.note, /不证明现实有效/);
  const pack = S.toStudyResult(a);
  assert.match(pack.note, /不证明现实有效/);
});

test('optional DemoNavSeries fixture is synthetic-demo labeled', () => {
  const series = S.buildDemoNavSeries();
  assert.equal(series.tag, 'synthetic-demo');
  assert.equal(series.dataProvenance, 'synthetic');
  assert.match(series.disclaimer, /≠ 实盘或已验证因子功效/);
  assert.ok(series.points.length >= 2);
  const fixturePath = path.join(__dirname, 'fixtures', 'synthetic-demo-nav-series.json');
  const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
  assert.equal(fixture.tag, 'synthetic-demo');
  assert.equal(fixture.dataProvenance, 'synthetic');
  assert.ok(Array.isArray(fixture.points));
  assert.ok(fixture.points.length >= 2);
  assert.match(fixture.disclaimer, /合成/);
});
