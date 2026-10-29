(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./research.js'));
  else root.InvestigationStudyResult = factory(root.InvestigationResearch);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Research) {
  'use strict';

  const SCHEMA_VERSION = 'studyresult/1';
  const FACTOR_UNIVERSE_VERSION = 'factors-teaching-v1';
  const DATA_PROVENANCE = 'synthetic';

  function stableStudyId(analyzeResult) {
    const prefs = analyzeResult && analyzeResult.preferences ? analyzeResult.preferences : {};
    const prefKey = ['Momentum', 'Value', 'Quality', 'LowVol']
      .map(id => `${id}:${Number(prefs[id] == null ? 0 : prefs[id]).toFixed(6)}`)
      .join('|');
    const raw = `${analyzeResult.dataVersion || 'unknown'}|${analyzeResult.sampleCount}|${prefKey}`;
    let hash = 2166136261;
    for (let i = 0; i < raw.length; i++) {
      hash ^= raw.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return `synthetic-${(hash >>> 0).toString(16)}`;
  }

  function assertAnalyzeShape(analyzeResult) {
    if (!analyzeResult || typeof analyzeResult !== 'object') throw new Error('analyzeResult 必须为对象');
    if (!Array.isArray(analyzeResult.factors)) throw new Error('analyzeResult.factors 必须为数组');
    if (!Number.isInteger(analyzeResult.sampleCount) && analyzeResult.sampleCount !== null) {
      throw new Error('analyzeResult.sampleCount 无效');
    }
  }

  /** Map analyze() → StudyResult (studyresult/1). Never maps returns to efficacy/alpha. */
  function toStudyResult(analyzeResult) {
    assertAnalyzeShape(analyzeResult);
    const sampleCount = analyzeResult.sampleCount;
    const sampleWindow = {
      start: 1,
      end: sampleCount == null ? null : sampleCount,
      frequency: 'month',
      monthIndex: true
    };
    const factors = analyzeResult.factors.map(f => ({
      id: f.id,
      meanIC: f.meanIC == null || Number.isNaN(f.meanIC) ? null : f.meanIC,
      validMonths: f.validMonths
    }));
    const note = typeof analyzeResult.note === 'string' && analyzeResult.note
      ? analyzeResult.note
      : '全部历史由固定公式合成，样本内反复调参有选择偏差，不报告显著性，也不证明现实有效。';
    return {
      schemaVersion: SCHEMA_VERSION,
      studyId: stableStudyId(analyzeResult),
      dataProvenance: DATA_PROVENANCE,
      factorUniverseVersion: FACTOR_UNIVERSE_VERSION,
      sampleWindow,
      sampleCount,
      factors,
      note,
      // Optional method-zone only (not frozen; names must not be efficacy/alpha)
      lookback: analyzeResult.lookback,
      preferences: analyzeResult.preferences,
      methods: analyzeResult.methods,
      sourceDataVersion: analyzeResult.dataVersion
    };
  }

  function exportStudyResult(input, history) {
    const analyzeResult = Research.analyze(input, history);
    return toStudyResult(analyzeResult);
  }

  function buildDemoNavSeries(analyzeResult) {
    const a = analyzeResult || Research.analyze();
    const nav = a.strategy && Array.isArray(a.strategy.nav) ? a.strategy.nav : [];
    const benchNav = a.benchmark && Array.isArray(a.benchmark.nav) ? a.benchmark.nav : [];
    const points = nav.map((value, i) => ({
      monthIndex: i,
      strategyNav: value,
      benchmarkNav: benchNav[i] == null ? null : benchNav[i]
    }));
    return {
      label: 'synthetic-demo',
      dataProvenance: 'synthetic',
      tag: 'synthetic-demo',
      title: '教学合成示意 · 资产与比较',
      disclaimer: '示意曲线，合成/教学数据，≠ 实盘或已验证因子功效。',
      studyId: stableStudyId(a),
      points
    };
  }

  return {
    SCHEMA_VERSION,
    FACTOR_UNIVERSE_VERSION,
    DATA_PROVENANCE,
    toStudyResult,
    exportStudyResult,
    buildDemoNavSeries
  };
});
