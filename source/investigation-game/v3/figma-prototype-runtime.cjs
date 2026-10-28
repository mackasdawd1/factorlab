async function runFactorLabPrototype(figma, plan) {
  const copy = value => JSON.parse(JSON.stringify(value));
  const normal = value => value.replace(/\s+/g, ' ').trim();
  const matches = (actual, expected) => expected && typeof expected === 'object'
    ? actual && typeof actual === 'object' && Object.keys(expected).every(key => matches(actual[key], expected[key]))
    : actual === expected;
  const page = await figma.getNodeByIdAsync('0:1');
  if (!page || page.type !== 'PAGE') throw new Error('没有找到目标页面 请在提供的 Untitled 文件中运行');
  if (figma.fileKey && figma.fileKey !== plan.fileKey) throw new Error('文件不匹配 请打开指定的 FactorLab Figma 源文件');
  await figma.setCurrentPageAsync(page);
  const texts = node => node.type === 'TEXT' ? [node] : node.findAllWithCriteria({ types: ['TEXT'] });
  const label = node => normal(texts(node).map(t => t.characters).join(' '));
  const screens = [];
  const operations = [];
  const textEdits = [];
  const fonts = new Map();
  const originalFlows = copy(page.flowStartingPoints);
  const initialSelection = page.selection;
  for (const spec of plan.screens) {
    const frame = await figma.getNodeByIdAsync(spec.frameId);
    if (!frame || frame.type !== 'FRAME' || frame.width !== 1440 || frame.height !== 900 || !frame.parent || frame.parent.type !== 'SECTION') {
      throw new Error('画板结构不匹配 ' + spec.state);
    }
    const section = frame.parent;
    if (!section.name.startsWith(spec.state + '.html') && section.name !== spec.name) throw new Error('画板名称不匹配 ' + spec.state);
    const candidates = frame.findAll(n => (n.type === 'FRAME' || n.type === 'TEXT' || n.type === 'GROUP') && typeof n.setReactionsAsync === 'function');
    const frameTexts = texts(frame);
    for (const t of frameTexts) for (const segment of t.getStyledTextSegments(['fontName'])) {
      const font = { family: segment.fontName.family, style: segment.fontName.style };
      fonts.set(JSON.stringify(font), font);
    }
    for (const hotspot of spec.hotspots) {
      const expectedName = hotspot.selector.startsWith('#') ? 'button' + hotspot.selector : null;
      let found = expectedName ? candidates.filter(n => n.name === expectedName) : [];
      if (hotspot.selector === '#settings') found = candidates.filter(n => n.name === '设置 Settings');
      if (hotspot.kind === 'BACK') found = candidates.filter(n => n.name === '关闭 Close');
      if (!found.length) found = candidates.filter(n => n.type !== 'TEXT' && (/^button|^a$/.test(n.name)) && label(n) === normal(hotspot.label));
      if (!found.length && hotspot.kind === 'URL') found = candidates.filter(n => n.type === 'TEXT' && normal(n.characters) === normal(hotspot.label));
      if (!found.length && hotspot.relabelNodeId) {
        const t = await figma.getNodeByIdAsync(hotspot.relabelNodeId);
        let p = t && t.parent;
        while (p && p !== frame && !/^button/.test(p.name)) p = p.parent;
        if (p && p !== frame && candidates.includes(p)) found = [p];
      }
      if (found.length !== 1) throw new Error('按钮无法唯一匹配 ' + spec.state + ' / ' + hotspot.label);
      const node = found[0];
      const action = hotspot.kind === 'BACK' ? { type: 'BACK' } : hotspot.kind === 'URL' ? { type: 'URL', url: hotspot.url, openInNewTab: true } : {
        type: 'NODE', destinationId: hotspot.destinationId, navigation: 'NAVIGATE',
        transition: { type: hotspot.target.startsWith('08-') || hotspot.target.startsWith('09-') || hotspot.target.startsWith('10-') ? 'DISSOLVE' : 'SMART_ANIMATE', easing: { type: 'EASE_OUT' }, duration: 0.25 },
        resetScrollPosition: true
      };
      const before = copy(node.reactions || []);
      const onClick = before.filter(r => r.trigger && r.trigger.type === 'ON_CLICK');
      if (onClick.length > 1 || onClick.some(r => (r.actions || []).length !== 1 || !matches(r.actions[0], action))) {
        throw new Error('已有不同的点击交互 未覆盖 ' + node.id);
      }
      operations.push({ node, action, before, screen: spec.state });
    }
    const notice = frameTexts.filter(t => /^合成教学数据 ·|^Synthetic educational data ·|^合成数据 · 固定流程示例|^Synthetic data · Fixed-state/.test(t.characters));
    if (notice.length !== 1) throw new Error('无法定位原型说明 ' + spec.state);
    textEdits.push({ node: notice[0], value: spec.lang === 'zh-CN' ? '合成数据 · 固定流程示例 · 计算与输入请使用网页版' : 'Synthetic data · Fixed-state walkthrough · Use the web app for inputs and calculations' });
    screens.push({ spec, frame, section, before: { name: frame.name, sectionName: section.name, x: section.x, y: section.y }, nodeCount: frame.findAll(() => true).length + 1, textCount: frameTexts.length });
  }
  if (new Set(operations.map(o => o.node.id)).size !== operations.length) throw new Error('重复的交互目标');
  for (const edit of plan.textEdits) {
    const node = await figma.getNodeByIdAsync(edit.id);
    if (!node || node.type !== 'TEXT' || (node.characters !== edit.before && node.characters !== edit.value)) throw new Error('待修改标签不匹配 ' + edit.id);
    textEdits.push({ node, value: edit.value });
  }
  for (const edit of textEdits) edit.before = edit.node.characters;
  await Promise.all([...fonts.values()].map(font => figma.loadFontAsync(font)));
  const applied = [];
  let started = false;
  try {
    started = true;
    for (const row of screens) {
      row.frame.name = row.spec.name;
      row.section.name = row.spec.name;
      row.section.x = row.spec.x;
      row.section.y = row.spec.y;
    }
    for (const edit of textEdits) edit.node.characters = edit.value;
    for (const op of operations) {
      applied.push(op);
      await op.node.setReactionsAsync([...op.before.filter(r => !r.trigger || r.trigger.type !== 'ON_CLICK'), { trigger: { type: 'ON_CLICK' }, actions: [op.action] }]);
    }
    page.flowStartingPoints = [...plan.flows, ...originalFlows.filter(f => !plan.screens.some(s => s.frameId === f.nodeId))];
    for (const op of operations) {
      const clicks = op.node.reactions.filter(r => r.trigger && r.trigger.type === 'ON_CLICK');
      if (clicks.length !== 1 || (clicks[0].actions || []).length !== 1 || !matches(clicks[0].actions[0], op.action)) throw new Error('交互读回不一致 ' + op.node.id);
    }
    if (page.flowStartingPoints[0].nodeId !== plan.flows[0].nodeId) throw new Error('播放起点未写入');
    for (const row of screens) {
      if (row.frame.width !== 1440 || row.frame.height !== 900 || row.frame.findAll(() => true).length + 1 !== row.nodeCount || texts(row.frame).length !== row.textCount) throw new Error('画板内容或尺寸发生意外变化');
    }
    page.selection = [screens.find(r => r.spec.frameId === plan.flows[0].nodeId).frame];
    figma.viewport.scrollAndZoomIntoView(page.selection);
    return { screens: screens.length, interactions: operations.length, flows: copy(page.flowStartingPoints), humanPlayback: 'NOT_RUN', pixsoReimport: 'NOT_RUN', mutatedNodeIds: [...new Set([...screens.flatMap(s => [s.frame.id, s.section.id]), ...operations.map(o => o.node.id), ...textEdits.map(e => e.node.id), page.id])] };
  } catch (error) {
    const failures = [];
    if (started) {
      for (const op of [...applied].reverse()) try { await op.node.setReactionsAsync(op.before); } catch (e) { failures.push(op.node.id); }
      for (const edit of textEdits) try { edit.node.characters = edit.before; } catch (e) { failures.push(edit.node.id); }
      for (const row of screens) try { row.frame.name = row.before.name; row.section.name = row.before.sectionName; row.section.x = row.before.x; row.section.y = row.before.y; } catch (e) { failures.push(row.frame.id); }
      try { page.flowStartingPoints = originalFlows; page.selection = initialSelection; } catch (e) { failures.push(page.id); }
    }
    throw new Error(error.message + (failures.length ? ' 回滚未完整完成 请立即撤销本次插件操作 ' + failures.join(', ') : ' 已恢复本次修改'));
  }
}

if (typeof module !== 'undefined') module.exports = { runFactorLabPrototype };
