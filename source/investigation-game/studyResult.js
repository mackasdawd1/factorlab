(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./research.js'));
  else root.InvestigationStudyResult = factory(root.InvestigationResearch);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Research) {
  'use strict';

  const SCHEMA_VERSION = 'studyresult/1';
  const FACTOR_UNIVERSE_VERSION = 'factors-teaching-v1';
  const DATA_PROVENANCE = 'synthetic';
  const PUBLIC_FACTOR_UNIVERSE_VERSION = 'factors-public-v1';
  const PUBLIC_DATA_PROVENANCE = 'public_real';
  const FORBIDDEN_KEY = /efficac|alpha/i;
  const DEFAULT_PUBLIC_NOTE =
    '公开样本上的 Rank IC 测量（非投资建议）；披露幸存者/选样偏差与交易成本=0；不证明投资功效，亦不构成已验证 Alpha。';

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

  function stablePublicStudyId(input) {
    const window = input && input.sampleWindow ? input.sampleWindow : {};
    const factorIds = Array.isArray(input && input.factors)
      ? input.factors.map(f => f && f.id).filter(Boolean).join(',')
      : '';
    const universe = (input && typeof input.factorUniverseVersion === 'string' && input.factorUniverseVersion)
      ? input.factorUniverseVersion
      : PUBLIC_FACTOR_UNIVERSE_VERSION;
    const raw = [
      PUBLIC_DATA_PROVENANCE,
      universe,
      window.start || '',
      window.end || '',
      input && input.sampleCount != null ? String(input.sampleCount) : '',
      factorIds,
      input && input.industryTrack ? String(input.industryTrack) : ''
    ].join('|');
    let hash = 2166136261;
    for (let i = 0; i < raw.length; i++) {
      hash ^= raw.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return `public-real-${(hash >>> 0).toString(16)}`;
  }

  function assertAnalyzeShape(analyzeResult) {
    if (!analyzeResult || typeof analyzeResult !== 'object') throw new Error('analyzeResult 必须为对象');
    if (!Array.isArray(analyzeResult.factors)) throw new Error('analyzeResult.factors 必须为数组');
    if (!Number.isInteger(analyzeResult.sampleCount) && analyzeResult.sampleCount !== null) {
      throw new Error('analyzeResult.sampleCount 无效');
    }
  }

  function assertNoForbiddenKeys(value, path) {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) {
      value.forEach((item, i) => assertNoForbiddenKeys(item, path + '[' + i + ']'));
      return;
    }
    Object.keys(value).forEach(function (key) {
      if (FORBIDDEN_KEY.test(key)) {
        throw new Error('禁止键名: ' + path + '.' + key);
      }
      assertNoForbiddenKeys(value[key], path ? path + '.' + key : key);
    });
  }

  function normalizePublicSourceRefs(refs) {
    if (!Array.isArray(refs) || refs.length === 0) {
      throw new Error('public_real 要求非空 publicSourceRefs[{title,url,asOf}]');
    }
    return refs.map(function (ref, i) {
      if (!ref || typeof ref !== 'object') {
        throw new Error('publicSourceRefs[' + i + '] 必须为对象');
      }
      const title = typeof ref.title === 'string' ? ref.title.trim() : '';
      const url = typeof ref.url === 'string' ? ref.url.trim() : '';
      const asOf = typeof ref.asOf === 'string' ? ref.asOf.trim() : '';
      if (!title || !url || !asOf) {
        throw new Error('publicSourceRefs[' + i + '] 须含非空 title/url/asOf');
      }
      return { title: title, url: url, asOf: asOf };
    });
  }

  function normalizePublicFactors(factors) {
    if (!Array.isArray(factors) || factors.length === 0) {
      throw new Error('public_real factors 必须为非空数组');
    }
    return factors.map(function (f, i) {
      if (!f || typeof f !== 'object' || typeof f.id !== 'string' || !f.id) {
        throw new Error('factors[' + i + '].id 无效');
      }
      const meanIC = f.meanIC == null || Number.isNaN(Number(f.meanIC)) ? null : Number(f.meanIC);
      const validMonths = f.validMonths == null ? null : Number(f.validMonths);
      return { id: f.id, meanIC: meanIC, validMonths: validMonths };
    });
  }

  function normalizeSampleWindow(window, sampleCount) {
    if (!window || typeof window !== 'object') {
      throw new Error('public_real sampleWindow 必须为对象');
    }
    const out = {
      start: window.start == null ? null : window.start,
      end: window.end == null ? null : window.end,
      frequency: window.frequency || 'month'
    };
    if (window.monthIndex != null) out.monthIndex = !!window.monthIndex;
    if (sampleCount != null && out.end == null && out.monthIndex) out.end = sampleCount;
    return out;
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
    const pack = {
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
    assertNoForbiddenKeys(pack, 'StudyResult');
    return pack;
  }

  /**
   * Build StudyResult with dataProvenance=public_real.
   * Requires non-empty publicSourceRefs; never invents efficacy/alpha keys.
   */
  function toPublicStudyResult(input) {
    if (!input || typeof input !== 'object') throw new Error('toPublicStudyResult 输入必须为对象');
    if (input.dataProvenance != null && input.dataProvenance !== PUBLIC_DATA_PROVENANCE) {
      throw new Error('toPublicStudyResult 仅接受 dataProvenance=public_real（或缺省）');
    }
    const publicSourceRefs = normalizePublicSourceRefs(input.publicSourceRefs);
    const factors = normalizePublicFactors(input.factors);
    const sampleCount = input.sampleCount == null ? null : Number(input.sampleCount);
    if (sampleCount != null && (!Number.isFinite(sampleCount) || sampleCount < 0)) {
      throw new Error('sampleCount 无效');
    }
    const sampleWindow = normalizeSampleWindow(input.sampleWindow, sampleCount);
    const note = typeof input.note === 'string' && input.note.trim()
      ? input.note.trim()
      : DEFAULT_PUBLIC_NOTE;
    const allowedPublicUniverse = {
      'factors-public-v1': true,
      'factors-public-price-v1': true
    };
    const universeVersion = (typeof input.factorUniverseVersion === 'string'
      && allowedPublicUniverse[input.factorUniverseVersion])
      ? input.factorUniverseVersion
      : PUBLIC_FACTOR_UNIVERSE_VERSION;
    const pack = {
      schemaVersion: SCHEMA_VERSION,
      studyId: typeof input.studyId === 'string' && input.studyId.trim()
        ? input.studyId.trim()
        : stablePublicStudyId(Object.assign({}, input, { factorUniverseVersion: universeVersion })),
      dataProvenance: PUBLIC_DATA_PROVENANCE,
      factorUniverseVersion: universeVersion,
      sampleWindow,
      sampleCount,
      factors,
      publicSourceRefs,
      note
    };
    if (input.interim != null) pack.interim = !!input.interim;
    if (input.industryTrack != null) pack.industryTrack = String(input.industryTrack);
    if (input.lookback != null) pack.lookback = Number(input.lookback);
    if (input.methods != null) pack.methods = input.methods;
    assertNoForbiddenKeys(pack, 'PublicStudyResult');
    return pack;
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
    PUBLIC_FACTOR_UNIVERSE_VERSION,
    PUBLIC_DATA_PROVENANCE,
    toStudyResult,
    toPublicStudyResult,
    exportStudyResult,
    buildDemoNavSeries
  };
});
