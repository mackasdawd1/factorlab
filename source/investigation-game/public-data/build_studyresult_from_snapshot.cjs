#!/usr/bin/env node
'use strict';
/**
 * Rebuild fixtures/public-real-studyresult-sample.json from public-data snapshots.
 * - If prices/ present: analyzePublic → toPublicStudyResult (true measurement).
 * - If no prices: honest empty-measurement pack (meanIC null, validMonths 0),
 *   factors-public-price-v1 (Momentum+LowVol only), Value/Quality untested in note.
 * Never hand-fills fake IC labeled as real market data.
 */
const fs = require('node:fs');
const path = require('node:path');

const ROOT = __dirname;
const GAME = path.join(ROOT, '..');
const PRICES = path.join(ROOT, 'prices');
const OUT = path.join(GAME, 'fixtures', 'public-real-studyresult-sample.json');
const AS_OF = new Date().toISOString().slice(0, 10);

const ResearchPublic = require('../researchPublic.js');
const StudyResult = require('../studyResult.js');

function countPriceFiles() {
  if (!fs.existsSync(PRICES)) return 0;
  return fs.readdirSync(PRICES).filter(f => f.endsWith('.json')).length;
}

function defaultSourceRefs(blocked) {
  const refs = [
    {
      title: 'Yahoo Finance (via yfinance) — primary public price/fundamental source',
      url: 'https://finance.yahoo.com/',
      asOf: AS_OF
    },
    {
      title: 'FactorLab frozen universe factors-public-v1',
      url: 'https://github.com/zhugeliang7512-eng/factorlab',
      asOf: '2019-07-31'
    }
  ];
  if (blocked) {
    refs.push({
      title:
        'Download blocked/rate-limited in build environment (Yahoo 403/rate-limit; Stooq TLS fail). ' +
        'Honest empty measurement — no invented prices or IC.',
      url: 'https://finance.yahoo.com/',
      asOf: AS_OF
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
  console.log('[build_studyresult] price files:', nPrices);

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
      publicSourceRefs: defaultSourceRefs(true),
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
    sampleWindow: { start: '2019-07-31', end: '2024-12-31', frequency: 'month' }
  });

  const pack = StudyResult.toPublicStudyResult({
    dataProvenance: 'public_real',
    factorUniverseVersion: analyzed.factorUniverseVersion,
    sampleWindow: analyzed.sampleWindow,
    sampleCount: analyzed.sampleCount,
    factors: analyzed.factors.map(f => ({
      id: f.id,
      meanIC: f.meanIC,
      validMonths: f.validMonths
    })),
    publicSourceRefs: defaultSourceRefs(false),
    industryTrack: analyzed.industryTrack || 'both',
    lookback: analyzed.lookback || 6,
    interim: !!analyzed.interim,
    note: analyzed.note
  });
  writePack(pack);
  return 0;
}

process.exit(main());
