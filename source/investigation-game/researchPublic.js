(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(
      typeof require === 'function' ? require('./research.js') : null,
      typeof require === 'function' ? require('node:fs') : null,
      typeof require === 'function' ? require('node:path') : null
    );
  } else root.InvestigationResearchPublic = factory(root.InvestigationResearch, null, null);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Research, fs, path) {
  'use strict';

  const FACTORS = [
    { id: 'Momentum', name: '动量', description: '过去六个月累计简单收益。' },
    { id: 'Value', name: '价值', description: 'E/P（盈利收益率）；需基本面 availableAt ≤ decisionTime。' },
    { id: 'Quality', name: '质量', description: 'ROE；需基本面 availableAt ≤ decisionTime。' },
    { id: 'LowVol', name: '低波动', description: '过去六个月收益样本标准差的负值（ddof=1）。' }
  ];
  const PRICE_FACTOR_IDS = ['Momentum', 'LowVol'];
  const FACTOR_UNIVERSE_VERSION = 'factors-public-v1';
  const PRICE_FACTOR_UNIVERSE_VERSION = 'factors-public-price-v1';
  const DATA_PROVENANCE = 'public_real';
  const LOOKBACK = 6;
  const METHODS = [
    { name: 'Spearman Rank IC：Reference', url: 'https://docs.scipy.org/doc/scipy/reference/generated/scipy.stats.spearmanr.html' },
    { name: '平均秩处理并列：Reference', url: 'https://docs.scipy.org/doc/scipy/reference/generated/scipy.stats.rankdata.html' }
  ];

  const mean = values => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : null);
  function stdev(values) {
    if (values.length < 2) return null;
    const m = mean(values);
    return Math.sqrt(values.reduce((sum, v) => sum + (v - m) ** 2, 0) / (values.length - 1));
  }
  function ranks(values) {
    const ordered = values.map((value, index) => ({ value, index })).sort((a, b) => a.value - b.value);
    const result = [];
    for (let i = 0; i < ordered.length;) {
      let end = i + 1;
      while (end < ordered.length && ordered[end].value === ordered[i].value) end++;
      for (let j = i; j < end; j++) result[ordered[j].index] = (i + 1 + end) / 2;
      i = end;
    }
    return result;
  }
  function rankIC(scores, returns) {
    if (!Array.isArray(scores) || !Array.isArray(returns) || scores.length !== returns.length) {
      throw new Error('IC 配对长度不一致');
    }
    const pairs = scores.map((s, i) => [s, returns[i]]).filter(p => p.every(Number.isFinite));
    if (pairs.length < 3) return null;
    const x = ranks(pairs.map(p => p[0]));
    const y = ranks(pairs.map(p => p[1]));
    const mx = mean(x);
    const my = mean(y);
    let numerator = 0;
    let dx = 0;
    let dy = 0;
    x.forEach((v, i) => {
      numerator += (v - mx) * (y[i] - my);
      dx += (v - mx) ** 2;
      dy += (y[i] - my) ** 2;
    });
    return dx === 0 || dy === 0 ? null : numerator / Math.sqrt(dx * dy);
  }

  function normalizePreferences(input, factorIds) {
    const ids = factorIds || FACTORS.map(f => f.id);
    const defaults = Object.fromEntries(ids.map(id => [id, 1 / ids.length]));
    if (input === undefined) return defaults;
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('未知因子偏好');
    const values = ids.map(id => (Object.hasOwn(input, id) ? input[id] : 0));
    const total = values.reduce((a, b) => a + b, 0);
    if (values.some(v => !Number.isFinite(v) || v < 0) || !Number.isFinite(total) || total <= 0) {
      throw new Error('因子偏好须非负，且至少一个大于零');
    }
    return Object.fromEntries(ids.map((id, i) => [id, values[i] / total]));
  }

  function rowMonthKey(row, fallbackIndex) {
    if (row && row.monthDate != null) return String(row.monthDate);
    if (row && row.monthIndex != null) return Number(row.monthIndex);
    if (row && row.month != null) return Number(row.month);
    return fallbackIndex;
  }

  function decisionTimeOf(row, fallbackIndex) {
    // Prices are known at month-end; decisionTime is that month-end (or monthIndex).
    if (row && row.monthDate != null) return String(row.monthDate);
    if (row && row.decisionTime != null) return row.decisionTime;
    if (row && row.monthIndex != null) return Number(row.monthIndex);
    if (row && row.month != null) return Number(row.month);
    return fallbackIndex;
  }

  function availableAtOk(availableAt, decisionTime) {
    if (availableAt == null || decisionTime == null) return false;
    // Numeric month indices
    if (typeof availableAt === 'number' && typeof decisionTime === 'number') {
      return availableAt <= decisionTime;
    }
    // ISO date strings YYYY-MM-DD lexicographic compare is chronological
    return String(availableAt) <= String(decisionTime);
  }

  function pickLatestFundamental(history, ticker, uptoIndex, decisionTime) {
    let latest = null;
    for (let t = 0; t < uptoIndex; t++) {
      const f = history[t] && history[t].fundamentals && history[t].fundamentals[ticker];
      if (!f) continue;
      const observedAt = f.observedAt;
      const availableAt = f.availableAt;
      if (observedAt == null || availableAt == null) continue;
      if (!availableAtOk(availableAt, decisionTime)) continue; // STRICT look-ahead rejection
      if (observedAt != null && availableAt != null && String(observedAt) > String(availableAt)) continue;
      if (!latest) {
        latest = f;
        continue;
      }
      if (String(observedAt) > String(latest.observedAt)) latest = f;
    }
    return latest;
  }

  function listTickers(history) {
    const set = new Set();
    history.forEach(row => {
      if (!row || !row.returns) return;
      Object.keys(row.returns).forEach(t => {
        if (t !== 'Cash') set.add(t);
      });
    });
    return [...set].sort();
  }

  function detectPriceOnly(history, options) {
    if (options && options.priceOnly === true) return true;
    if (options && Array.isArray(options.factorIds)) {
      return options.factorIds.every(id => PRICE_FACTOR_IDS.includes(id));
    }
    // Auto: no usable fundamentals anywhere → price-only interim
    for (let i = 0; i < history.length; i++) {
      const f = history[i] && history[i].fundamentals;
      if (!f) continue;
      for (const k of Object.keys(f)) {
        const row = f[k];
        if (row && (Number.isFinite(row.ep) || Number.isFinite(row.roe))) return false;
      }
    }
    return true;
  }

  function activeFactors(priceOnly) {
    if (priceOnly) return FACTORS.filter(f => PRICE_FACTOR_IDS.includes(f.id));
    return FACTORS.slice();
  }

  /**
   * Cross-sectional signals at decision index `monthIndex` (0-based into history).
   * Uses history[monthIndex - lookback .. monthIndex) returns; fundamentals with availableAt ≤ decisionTime.
   */
  function signalsPublic(history, monthIndex, input, options) {
    if (!Array.isArray(history) || !Number.isInteger(monthIndex) || monthIndex < LOOKBACK || monthIndex > history.length) {
      throw new Error('需要六个月事前历史');
    }
    const priceOnly = !!(options && options.priceOnly);
    const factors = activeFactors(priceOnly);
    const factorIds = factors.map(f => f.id);
    const preferences = normalizePreferences(input, factorIds);
    // Decision at end of month t-1 (history[monthIndex-1]); forward returns are history[monthIndex].
    // STRICT: fundamentals with availableAt > this decisionTime are rejected (look-ahead).
    const priorRow = history[monthIndex - 1];
    const dt = priorRow && priorRow.decisionTime != null
      ? priorRow.decisionTime
      : decisionTimeOf(priorRow, monthIndex - 1);
    const tickers = (options && Array.isArray(options.tickers) && options.tickers.length)
      ? options.tickers
      : listTickers(history.slice(0, monthIndex + 1));

    const rows = tickers.map(ticker => {
      const prior = [];
      for (let t = monthIndex - LOOKBACK; t < monthIndex; t++) {
        const r = history[t] && history[t].returns ? history[t].returns[ticker] : null;
        prior.push(r);
      }
      const priorOk = prior.every(r => Number.isFinite(r) && r > -1);
      let momentum = null;
      let lowVol = null;
      if (priorOk) {
        momentum = prior.reduce((wealth, r) => wealth * (1 + r), 1) - 1;
        lowVol = -stdev(prior);
      }
      let value = null;
      let quality = null;
      if (!priceOnly) {
        const latest = pickLatestFundamental(history, ticker, monthIndex, dt);
        // If fundamental only available after decisionTime, pickLatest returns null (look-ahead rejection)
        if (latest && Number.isFinite(latest.ep)) value = latest.ep;
        if (latest && Number.isFinite(latest.roe)) quality = latest.roe;
      }
      return {
        id: ticker,
        name: ticker,
        availableAt: dt,
        raw: {
          Momentum: momentum,
          Value: value,
          Quality: quality,
          LowVol: lowVol
        },
        scores: {}
      };
    });

    factors.forEach(f => {
      const valid = rows.filter(row => Number.isFinite(row.raw[f.id]));
      const ranked = ranks(valid.map(row => row.raw[f.id]));
      rows.forEach(row => { row.scores[f.id] = null; });
      valid.forEach((row, i) => {
        row.scores[f.id] = valid.length > 1 ? 100 * (ranked[i] - 1) / (valid.length - 1) : null;
      });
    });

    rows.forEach(row => {
      row.score = factors.some(f => preferences[f.id] > 0 && row.scores[f.id] === null)
        ? null
        : factors.reduce((sum, f) => sum + preferences[f.id] * (row.scores[f.id] || 0), 0);
    });

    return rows.sort((a, b) => (b.score ?? -Infinity) - (a.score ?? -Infinity) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  }

  function emptyMeasurementResult(options, reason) {
    const priceOnly = !(options && options.priceOnly === false);
    const factors = activeFactors(priceOnly).map(f => ({
      id: f.id,
      name: f.name,
      meanIC: null,
      validMonths: 0,
      missingMonths: 0
    }));
    const note = [
      'interim: factors-public-price-v1 仅测量 Momentum 与 LowVol；Value/Quality 未测（无可用基本面或未启用）。',
      reason || '无价量快照：诚实空测量（meanIC=null, validMonths=0）；禁止手填假 IC。',
      '公开样本 Rank IC 测量（非投资建议）；幸存者/选样偏差与交易成本=0；不证明投资功效。'
    ].join(' ');
    return {
      label: 'public_real · empty measurement',
      dataVersion: 'public-real-empty-v1',
      dataProvenance: DATA_PROVENANCE,
      factorUniverseVersion: PRICE_FACTOR_UNIVERSE_VERSION,
      sampleCount: 0,
      lookback: LOOKBACK,
      preferences: normalizePreferences(options && options.preferences, PRICE_FACTOR_IDS),
      months: [],
      factors,
      industryTrack: (options && options.industryTrack) || 'both',
      sampleWindow: (options && options.sampleWindow) || {
        start: '2019-07-31',
        end: '2024-12-31',
        frequency: 'month'
      },
      note,
      methods: METHODS,
      interim: true
    };
  }

  function analyzePublic(options, history) {
    const opts = options && typeof options === 'object' && !Array.isArray(options) ? options : {};
    // Allow analyzePublic(history) shorthand
    if (Array.isArray(options) && history === undefined) {
      history = options;
      options = {};
    }
    if (history === undefined || history === null) {
      history = loadHistoryFromPublicData(opts);
    }
    if (!Array.isArray(history) || history.length === 0) {
      return emptyMeasurementResult(opts, 'history 为空或未能从 public-data/prices 加载。');
    }
    if (history.length <= LOOKBACK) {
      return emptyMeasurementResult(opts, '历史长度不足六个月预热。');
    }

    const priceOnly = detectPriceOnly(history, opts);
    const factors = activeFactors(priceOnly);
    const factorIds = factors.map(f => f.id);
    const preferences = normalizePreferences(opts.preferences, factorIds);
    const tickers = (opts.tickers && opts.tickers.length) ? opts.tickers : listTickers(history);
    const months = [];

    for (let t = LOOKBACK; t < history.length; t++) {
      const rankings = signalsPublic(history, t, preferences, {
        priceOnly,
        tickers,
        factorIds
      });
      const forward = history[t].returns || {};
      // Rank IC: scores known at decision (end of t-1 / start of t) vs returns over month t
      // Classic Spearman(s[t-1], r[t]) — here rankings are computed with info ≤ decisionTime of month t
      const ic = Object.fromEntries(
        factors.map(f => [
          f.id,
          rankIC(
            rankings.map(row => row.scores[f.id]),
            rankings.map(row => forward[row.id])
          )
        ])
      );
      const scored = rankings.filter(row => row.score != null);
      const top = scored.slice(0, Math.min(2, scored.length)).map(row => row.id);
      const bottom = scored.slice(-Math.min(2, scored.length)).map(row => row.id);
      const strategyReturn = top.length ? mean(top.map(id => forward[id]).filter(Number.isFinite)) : null;
      const benchmarkReturn = mean(tickers.map(id => forward[id]).filter(Number.isFinite));
      months.push({
        month: t - LOOKBACK + 1,
        monthKey: rowMonthKey(history[t], t),
        decisionTime: decisionTimeOf(history[t - 1], t),
        rankings,
        top,
        bottom,
        strategyReturn,
        benchmarkReturn,
        ic
      });
    }

    const factorStats = factors.map(f => {
      const valid = months.map(m => m.ic[f.id]).filter(Number.isFinite);
      return {
        id: f.id,
        name: f.name,
        meanIC: mean(valid),
        validMonths: valid.length,
        missingMonths: months.length - valid.length
      };
    });

    const universeVersion = priceOnly ? PRICE_FACTOR_UNIVERSE_VERSION : FACTOR_UNIVERSE_VERSION;
    const noteParts = [
      '公开样本上的 Rank IC 测量（非投资建议）；披露幸存者/选样偏差与交易成本=0；不证明投资功效。',
      'Momentum=6m 累计简单收益；LowVol=−stdev(6m, ddof=1)；Value=E/P；Quality=ROE。',
      '基本面 STRICT availableAt ≤ decisionTime；晚于决策时点的披露视为缺失（look-ahead rejection）。'
    ];
    if (priceOnly) {
      noteParts.unshift(
        'interim: factorUniverseVersion=factors-public-price-v1，仅 Momentum+LowVol；Value/Quality 未测。'
      );
    }

    return {
      label: priceOnly ? 'public_real · price-only interim' : 'public_real · full factors',
      dataVersion: priceOnly ? 'public-real-price-v1' : 'public-real-v1',
      dataProvenance: DATA_PROVENANCE,
      factorUniverseVersion: universeVersion,
      sampleCount: months.length,
      lookback: LOOKBACK,
      preferences,
      months,
      factors: factorStats,
      industryTrack: opts.industryTrack || 'both',
      sampleWindow: opts.sampleWindow || {
        start: '2019-07-31',
        end: '2024-12-31',
        frequency: 'month'
      },
      note: noteParts.join(' '),
      methods: METHODS,
      interim: priceOnly,
      tickers
    };
  }

  function loadUniverseTickers(publicDataDir) {
    if (!fs || !path) return [];
    const uPath = path.join(publicDataDir, 'universe-factors-public-v1.json');
    if (!fs.existsSync(uPath)) return [];
    const u = JSON.parse(fs.readFileSync(uPath, 'utf8'));
    return Array.isArray(u.tickers) ? u.tickers.map(t => t.ticker) : [];
  }

  function loadPriceRows(publicDataDir, ticker) {
    const p = path.join(publicDataDir, 'prices', ticker + '.json');
    if (!fs.existsSync(p)) return null;
    const doc = JSON.parse(fs.readFileSync(p, 'utf8'));
    return Array.isArray(doc.rows) ? doc.rows : null;
  }

  function loadFundRows(publicDataDir, ticker) {
    const p = path.join(publicDataDir, 'fundamentals', ticker + '.json');
    if (!fs.existsSync(p)) return [];
    const doc = JSON.parse(fs.readFileSync(p, 'utf8'));
    return Array.isArray(doc.rows) ? doc.rows : [];
  }

  /** Build monthly history from prices/*.json (+ optional fundamentals). Node only. */
  function loadHistoryFromPublicData(options) {
    if (!fs || !path) return [];
    const publicDataDir = (options && options.publicDataDir)
      || path.join(__dirname, 'public-data');
    const tickers = (options && options.tickers && options.tickers.length)
      ? options.tickers
      : loadUniverseTickers(publicDataDir);
    const priceMap = {};
    const allDates = new Set();
    tickers.forEach(ticker => {
      const rows = loadPriceRows(publicDataDir, ticker);
      if (!rows || !rows.length) return;
      priceMap[ticker] = {};
      rows.forEach(r => {
        if (!r || r.date == null || !Number.isFinite(Number(r.adjClose))) return;
        priceMap[ticker][r.date] = Number(r.adjClose);
        allDates.add(r.date);
      });
    });
    const dates = [...allDates].sort();
    if (dates.length < 2) return [];

    // Month-end dates already; compute simple returns ticker-by-ticker
    const history = [];
    for (let i = 1; i < dates.length; i++) {
      const d0 = dates[i - 1];
      const d1 = dates[i];
      const returns = {};
      tickers.forEach(ticker => {
        const a = priceMap[ticker] && priceMap[ticker][d0];
        const b = priceMap[ticker] && priceMap[ticker][d1];
        if (Number.isFinite(a) && Number.isFinite(b) && a > 0) {
          returns[ticker] = b / a - 1;
        }
      });
      const fundamentals = {};
      tickers.forEach(ticker => {
        const frows = loadFundRows(publicDataDir, ticker);
        // Attach the latest fund row whose periodEnd <= d1 (availability checked at signal time)
        let best = null;
        frows.forEach(fr => {
          if (!fr) return;
          const pe = fr.periodEnd || fr.observedAt;
          if (pe == null) return;
          if (String(pe) > String(d1)) return;
          if (!best || String(pe) > String(best.periodEnd || best.observedAt)) best = fr;
        });
        if (best) {
          let availableAt = best.availableAt;
          if (availableAt == null) {
            // periodEnd + 45d
            const pe = best.periodEnd || best.observedAt;
            const dt = new Date(String(pe) + 'T00:00:00Z');
            if (!Number.isNaN(dt.getTime())) {
              dt.setUTCDate(dt.getUTCDate() + 45);
              availableAt = dt.toISOString().slice(0, 10);
            } else {
              availableAt = pe;
            }
          }
          fundamentals[ticker] = {
            ep: best.ep == null ? null : Number(best.ep),
            roe: best.roe == null ? null : Number(best.roe),
            observedAt: best.observedAt || best.periodEnd,
            availableAt
          };
        }
      });
      history.push({
        monthIndex: i,
        monthDate: d1,
        decisionTime: d1,
        returns,
        fundamentals
      });
    }
    return history;
  }

  return {
    FACTORS,
    PRICE_FACTOR_IDS,
    FACTOR_UNIVERSE_VERSION,
    PRICE_FACTOR_UNIVERSE_VERSION,
    DATA_PROVENANCE,
    LOOKBACK,
    METHODS,
    mean,
    stdev,
    ranks,
    rankIC,
    normalizePreferences,
    signalsPublic,
    analyzePublic,
    loadHistoryFromPublicData,
    emptyMeasurementResult,
    // reuse Research helpers when present
    researchRankIC: Research && Research.rankIC ? Research.rankIC : rankIC
  };
});
