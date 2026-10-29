#!/usr/bin/env node
'use strict';
/**
 * Rebuild fixtures/public-real-studyresult-sample.json from public-data snapshots.
 * - If prices/*.json present: analyzePublic → toPublicStudyResult (true measurement).
 * - If no prices: honest empty-measurement pack (meanIC null, validMonths 0).
 * Never hand-fills fake IC labeled as real market data.
 */
const fs = require('node:fs');
const path = require('node:path');

const ROOT = __dirname;
const GAME = path.join(ROOT, '..');
const PRICES = path.join(ROOT, 'prices');
const OUT = path.join(GAME, 'fixtures', 'public-real-studyresult-sample.json');
const META_PATH = path.join(ROOT, 'cache', 'FETCH_META_YAHOO.json');

const ResearchPublic = require('../researchPublic.js');
const StudyResult = require('../studyResult.js');

function readAsOf() {
  try {
    const raw = fs.readFileSync(META_PATH, 'utf8').replace(/^\uFEFF/, '');
    const meta = JSON.parse(raw);
    if (meta && meta.asOf) return String(meta.asOf);
  } catch (_) {}
  return new Date().toISOString().slice(0, 10);
}

function countPriceFiles() {
  if (!fs.existsSync(PRICES)) return 0;
  return fs.readdirSync(PRICES).filter(f => f.endsWith('.json')).length;
}

function defaultSourceRefs(opts) {
  const asOf = opts.asOf;
  const refs = [
    {
      title: 'Yahoo Finance chart API v8 monthly — primary public price source',
      url: 'https://query1.finance.yahoo.com/v8/finance/chart/',
      asOf
    },
    {
      title: 'FactorLab frozen universe factors-public-price-v1 (interim Momentum+LowVol)',
      url: 'https://github.com/zhugeliang7512-eng/factorlab',
      asOf: '2019-07-31'
    }
  ];
  if (opts.fromLaptopCache) {
    refs.push({
      title:
        'Yahoo Finance chart v8 monthly OHLCV cache via laptop (' + asOf +
        '); 39 tickers under public-data/prices/ (box Yahoo 403)',
      url: 'https://finance.yahoo.com/',
      asOf
    });
    refs.push({
      title:
        'Survivorship: universe frozen intent 2019-07-31; cache tickers are 2026 still-listed names ' +
        'overlapping universe plus extras (approximate high-end manufacturing ∪ frontier tech); not a full investable universe',
      url: 'https://github.com/zhugeliang7512-eng/factorlab',
      asOf
    });
  }
  if (opts.blocked) {
    refs.push({
      title:
        'Download blocked/rate-limited in build environment (Yahoo 403/rate-limit; Stooq TLS fail). ' +
        'Honest empty measurement — no invented prices or IC.',
      url: 'https://finance.yahoo.com/',
      asOf
    });
  }
  return refs;
}

function writePack(pack) {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(pack, null, 2) + '\n', 'utf8');
  console.log('[build_studyresult] wrote', path.relative(GAME, OUT));
}

function main() {
  const nPrices = countPriceFiles();
  const asOf = readAsOf();
  console.log('[build_studyresult] price files:', nPrices, 'asOf:', asOf);

  if (nPrices === 0) {
    const empty = ResearchPublic.emptyMeasurementResult(
      {
        industryTrack: 'both',
        sampleWindow: { start: '2019-07-31', end: '2024-12-31', frequency: 'month' }
      },
      'Network Yahoo/yfinance rate-limited/403 and/or Stooq TLS failure in this environment; prices/ empty.'
    );
    const pack = StudyResult.toPublicStudyResult({
      studyId: 'public-real-interim-empty-v1',
      dataProvenance: 'public_real',
      factorUniverseVersion: 'factors-public-price-v1',
      sampleWindow: empty.sampleWindow,
      sampleCount: 0,
      factors: empty.factors.map(f => ({
        id: f.id,
        meanIC: null,
        validMonths: 0
      })),
      publicSourceRefs: defaultSourceRefs({ asOf, blocked: true }),
      industryTrack: 'both',
      lookback: 6,
      interim: true,
      note: empty.note
    });
    writePack(pack);
    return 0;
  }

  const analyzed = ResearchPublic.analyzePublic({
    publicDataDir: ROOT,
    industryTrack: 'both',
    sampleWindow: { start: '2019-07-31', end: '2024-12-31', frequency: 'month' },
    priceOnly: true
  });

  console.log(
    '[build_studyresult] analyzed sampleCount=',
    analyzed.sampleCount,
    'factors=',
    analyzed.factors.map(f => f.id + ':' + f.meanIC + '@' + f.validMonths).join(',')
  );

  const pack = StudyResult.toPublicStudyResult({
    studyId: 'public-real-interim-price-v1',
    dataProvenance: 'public_real',
    factorUniverseVersion: analyzed.factorUniverseVersion || 'factors-public-price-v1',
    sampleWindow: analyzed.sampleWindow,
    sampleCount: analyzed.sampleCount,
    factors: analyzed.factors.map(f => ({
      id: f.id,
      meanIC: f.meanIC,
      validMonths: f.validMonths
    })),
    publicSourceRefs: defaultSourceRefs({ asOf, fromLaptopCache: true }),
    industryTrack: analyzed.industryTrack || 'both',
    lookback: analyzed.lookback || 6,
    interim: true,
    note:
      (analyzed.note || '') +
      ' 价量来自 ' + asOf +
      ' 本机 Yahoo chart v8 monthly 缓存（box 403）；幸存者/选样偏差：缓存名单为高端制造∪前沿科技近似子集，非完整可投宇宙；交易成本=0；不证明投资功效。'
  });
  writePack(pack);
  return 0;
}

process.exit(main());
