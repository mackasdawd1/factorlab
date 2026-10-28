const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { runFactorLabPrototype } = require('./figma-prototype-runtime.cjs');

const read = name => JSON.parse(fs.readFileSync(path.join(__dirname, 'evidence', name), 'utf8').replace(/^\uFEFF/, ''));
const unwrap = name => JSON.parse(read(name).content.find(x => x.type === 'text').text);
const plan = read('figma-prototype-plan-20261013.json');
const observed = unwrap('figma-interactions-before-20261013.json');
const buttons = unwrap('pixso-buttons-before-20261013.json');
const structure = unwrap('figma-structure-before-20261013.json');
const completionLabels = unwrap('figma-completion-labels-before-20261013.json');
const clone = value => JSON.parse(JSON.stringify(value));
const tidy = value => value.replace(/\s+/g, ' ').trim();

function fixture() {
  const nodes = new Map();
  const metrics = { writes: [], reactionCalls: 0, failAt: 0, failureConsumed: false, zooms: [] };
  function node(spec, parent = null) {
    const n = { id: spec.id, type: spec.type, parent, children: [], state: spec.state };
    for (const property of ['name', 'x', 'y', 'width', 'height', 'characters', 'reactions', 'flowStartingPoints', 'selection']) {
      let value = spec[property];
      if (value === undefined) value = ['reactions', 'flowStartingPoints', 'selection'].includes(property) ? [] : '';
      Object.defineProperty(n, property, { enumerable: true, get: () => value, set: next => {
        metrics.writes.push({ id: n.id, property });
        value = next;
      } });
    }
    n.findAll = predicate => n.children.flatMap(child => [...(predicate(child) ? [child] : []), ...child.findAll(predicate)]);
    n.findAllWithCriteria = criteria => n.findAll(child => criteria.types.includes(child.type));
    n.getStyledTextSegments = () => [{ fontName: spec.font || { family: 'Inter', style: 'Regular' } }];
    n.setReactionsAsync = async reactions => {
      metrics.reactionCalls += 1;
      if (metrics.failAt === metrics.reactionCalls && !metrics.failureConsumed) {
        metrics.failureConsumed = true;
        n.reactions = clone(reactions);
        throw new Error('Injected mid-transaction failure');
      }
      n.reactions = clone(reactions);
    };
    if (nodes.has(n.id)) throw new Error('Duplicate fixture node ' + n.id);
    nodes.set(n.id, n);
    if (parent) parent.children.push(n);
    return n;
  }
  const page = node({ id: '0:1', type: 'PAGE', name: 'Page 1', flowStartingPoints: clone(observed.flows) });
  for (const spec of plan.screens) {
    const row = structure.children.find(s => s.children.some(f => f.id === spec.frameId));
    const section = node({ ...row, type: 'SECTION' }, page);
    const frame = node({ ...row.children[0], state: spec.state }, section);
    const source = new Map(buttons.find(b => b.state === spec.state).buttons.map(b => [b.id, b]));
    for (const b of observed.uniqueButtons.filter(b => b.state === spec.state)) source.set(b.id, { ...source.get(b.id), ...b });
    for (const b of source.values()) {
      const parent = node({ ...b, type: b.type || 'FRAME', state: spec.state }, frame);
      const details = completionLabels.find(x => x.id === b.id);
      if (details) for (const t of details.texts) node({ ...t, type: 'TEXT', name: t.characters, state: spec.state }, parent);
      else if (b.text) node({ id: b.id + '/fixture-label', type: 'TEXT', name: 'label', characters: b.text, state: spec.state }, parent);
    }
    // Detailed text and repeated unlabeled settings icons were omitted by the readback summaries.
    if (!frame.findAll(n => n.name === '设置 Settings').length) node({ id: spec.frameId + '/fixture-settings', type: 'FRAME', name: '设置 Settings', state: spec.state }, frame);
    for (const h of spec.hotspots.filter(h => h.kind === 'URL')) node({ id: spec.frameId + '/fixture-source-' + h.label, type: 'TEXT', name: 'source', characters: h.label, state: spec.state }, frame);
    node({ id: spec.frameId + '/fixture-notice', type: 'TEXT', name: 'notice', characters: spec.lang === 'zh-CN' ? '合成教学数据 · 不代表真实市场表现' : 'Synthetic educational data · Not real market performance', state: spec.state }, frame);
  }
  const figma = {
    fileKey: plan.fileKey,
    currentPage: page,
    getNodeByIdAsync: async id => nodes.get(id) || null,
    setCurrentPageAsync: async next => { figma.currentPage = next; },
    loadFontAsync: async () => {},
    viewport: { scrollAndZoomIntoView: selection => metrics.zooms.push(selection.map(n => n.id)) }
  };
  const snapshot = () => [...nodes.values()].map(n => ({ id: n.id, parent: n.parent?.id, type: n.type, name: n.name, x: n.x, y: n.y, width: n.width, height: n.height, characters: n.characters, reactions: clone(n.reactions), flowStartingPoints: clone(n.flowStartingPoints), selection: n.selection.map(s => s.id), children: n.children.map(c => c.id) }));
  const remove = id => {
    const n = nodes.get(id);
    n.parent.children = n.parent.children.filter(child => child !== n);
    for (const child of n.findAll(() => true)) nodes.delete(child.id);
    nodes.delete(id);
  };
  return { figma, page, nodes, metrics, snapshot, remove };
}

function clicks(n) {
  return n.reactions.filter(r => r.trigger?.type === 'ON_CLICK');
}

function actionForHotspot(f, spec, hotspot) {
  const expectedName = hotspot.selector.startsWith('#') ? 'button' + hotspot.selector : null;
  const frame = f.nodes.get(spec.frameId);
  const candidates = frame.findAll(n => n.type !== 'TEXT');
  if (hotspot.kind === 'BACK') return candidates.find(n => n.name === '关闭 Close');
  if (hotspot.selector === '#settings') return candidates.find(n => n.name === '设置 Settings');
  return candidates.find(n => n.name === expectedName) || candidates.find(n => tidy(n.findAllWithCriteria({ types: ['TEXT'] }).map(t => t.characters).join(' ')) === tidy(hotspot.label));
}

test('offline mock: 132 interactions stay within language; dialogs leave background controls unwired; two research starts', async () => {
  const f = fixture();
  assert.equal(plan.screens.length, 20);
  const countBefore = f.nodes.size;
  const result = await runFactorLabPrototype(f.figma, clone(plan));
  assert.equal(result.interactions, 132);
  assert.equal(result.screens, 20);
  assert.equal(f.nodes.size, countBefore);
  assert.equal(result.humanPlayback, 'NOT_RUN');
  assert.equal(result.pixsoReimport, 'NOT_RUN');
  const screenById = new Map(plan.screens.map(s => [s.frameId, s]));
  const wired = [...f.nodes.values()].filter(n => clicks(n).length);
  assert.equal(wired.length, 132);
  for (const n of wired) {
    assert.equal(clicks(n).length, 1);
    for (const action of clicks(n)[0].actions) if (action.type === 'NODE') {
      const source = plan.screens.find(s => s.state === n.state);
      const target = screenById.get(action.destinationId);
      assert.ok(target, n.id + ' points outside known frames');
      assert.equal(source.lang, target.lang, n.id + ' crosses language');
    }
  }
  for (const spec of plan.screens.filter(s => /^(08|09|10)-/.test(s.state))) {
    const frame = f.nodes.get(spec.frameId);
    const wiredHere = frame.findAll(n => clicks(n).length);
    assert.equal(wiredHere.length, spec.state.startsWith('10-') ? 3 : 1);
    assert.equal(wiredHere.filter(n => clicks(n)[0].actions[0].type === 'BACK').length, 1);
    assert.equal(frame.findAll(n => n.name === 'button#go-allocation')[0].reactions.length, 0);
  }
  assert.deepEqual(f.page.flowStartingPoints, [
    { nodeId: '2:621', name: '中文 · 从研究台开始' },
    { nodeId: '2:3', name: 'English · Start at research' }
  ]);
  assert.equal(f.page.selection[0].id, '2:621');
});

test('offline mock: rerunning preserves content and avoids duplicate clicks or flows', async () => {
  const f = fixture();
  await runFactorLabPrototype(f.figma, clone(plan));
  const first = f.snapshot();
  await runFactorLabPrototype(f.figma, clone(plan));
  assert.deepEqual(f.snapshot(), first);
});

test('offline mock: missing button is rejected before document edits', async () => {
  const f = fixture();
  f.remove('2:899');
  const before = f.snapshot();
  await assert.rejects(runFactorLabPrototype(f.figma, clone(plan)), /按钮无法唯一匹配/);
  assert.deepEqual(f.snapshot(), before);
  assert.equal(f.metrics.writes.length, 0);
});

test('offline mock: wrong file is rejected before document edits', async () => {
  const f = fixture();
  f.figma.fileKey = 'unrelated-file';
  const before = f.snapshot();
  await assert.rejects(runFactorLabPrototype(f.figma, clone(plan)), /文件不匹配/);
  assert.deepEqual(f.snapshot(), before);
  assert.equal(f.metrics.writes.length, 0);
});

test('offline mock: partially applied reaction failure restores all names, positions, text, reactions and flows', async () => {
  const f = fixture();
  f.metrics.failAt = 65;
  f.page.flowStartingPoints = [{ nodeId: '2:1358', name: 'Existing start' }];
  f.page.selection = [f.nodes.get('2:1007')];
  const hover = { trigger: { type: 'ON_HOVER' }, actions: [{ type: 'BACK' }] };
  f.nodes.get('2:899').reactions = [hover];
  const before = f.snapshot();
  await assert.rejects(runFactorLabPrototype(f.figma, clone(plan)), /Injected mid-transaction failure.*已恢复本次修改/);
  assert.equal(f.metrics.failureConsumed, true);
  assert.deepEqual(f.snapshot(), before);
});

test('offline mock: an existing different click is refused, preserving it unchanged', async () => {
  const f = fixture();
  f.nodes.get('2:899').reactions = [{ trigger: { type: 'ON_CLICK' }, actions: [{ type: 'NODE', destinationId: '2:1358', navigation: 'NAVIGATE', transition: null }] }];
  const before = f.snapshot();
  f.metrics.writes.length = 0;
  await assert.rejects(runFactorLabPrototype(f.figma, clone(plan)), /已有不同的点击交互/);
  assert.deepEqual(f.snapshot(), before);
  assert.equal(f.metrics.writes.length, 0);
});

test('offline mock: a click containing the same target plus another action is not overwritten', async () => {
  const f = fixture();
  const spec = plan.screens[0];
  const hotspot = spec.hotspots[0];
  const n = actionForHotspot(f, spec, hotspot);
  assert.ok(n);
  n.reactions = [{ trigger: { type: 'ON_CLICK' }, actions: [
    { type: 'NODE', destinationId: hotspot.destinationId, navigation: 'NAVIGATE', transition: { type: 'SMART_ANIMATE', easing: { type: 'EASE_OUT' }, duration: 0.25 }, resetScrollPosition: true },
    { type: 'URL', url: 'https://example.com/user-existing-link', openInNewTab: true }
  ] }];
  const before = f.snapshot();
  f.metrics.writes.length = 0;
  await assert.rejects(runFactorLabPrototype(f.figma, clone(plan)), /已有不同的点击交互/);
  assert.deepEqual(f.snapshot(), before);
  assert.equal(f.metrics.writes.length, 0);
});

test('offline mock: same destination with existing OVERLAY navigation is not overwritten', async () => {
  const f = fixture();
  const spec = plan.screens[0];
  const hotspot = spec.hotspots[0];
  const n = actionForHotspot(f, spec, hotspot);
  n.reactions = [{ trigger: { type: 'ON_CLICK' }, actions: [{
    type: 'NODE', destinationId: hotspot.destinationId, navigation: 'OVERLAY',
    transition: { type: 'SMART_ANIMATE', easing: { type: 'EASE_OUT' }, duration: 0.25 },
    resetScrollPosition: true
  }] }];
  const before = f.snapshot();
  f.metrics.writes.length = 0;
  await assert.rejects(runFactorLabPrototype(f.figma, clone(plan)), /已有不同的点击交互/);
  assert.deepEqual(f.snapshot(), before);
  assert.equal(f.metrics.writes.length, 0);
});

test('offline mock: silently ignored reaction write is detected and other edits roll back', async () => {
  const f = fixture();
  const n = f.nodes.get('2:899');
  n.setReactionsAsync = async () => {};
  const before = f.snapshot();
  await assert.rejects(runFactorLabPrototype(f.figma, clone(plan)), /交互读回不一致.*已恢复本次修改/);
  assert.deepEqual(f.snapshot(), before);
});

test('offline mock: non-click reactions and unrelated existing flow are preserved', async () => {
  const f = fixture();
  const hover = { trigger: { type: 'ON_HOVER' }, actions: [{ type: 'BACK' }] };
  f.nodes.get('2:899').reactions = [clone(hover)];
  f.page.flowStartingPoints = [{ nodeId: 'unrelated:frame', name: 'User flow' }];
  await runFactorLabPrototype(f.figma, clone(plan));
  assert.deepEqual(f.nodes.get('2:899').reactions[0], hover);
  assert.deepEqual(f.page.flowStartingPoints[2], { nodeId: 'unrelated:frame', name: 'User flow' });
});
