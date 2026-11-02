/* 将逐项证据映射接入现有模板，布局仍由原树负责。 */
window.UniverCoverage = (() => {
  const evidence = window.UNIVER_EVIDENCE;
  const states = {
    oss: { label: '开源', short: '开', description: 'GitHub 开源实现：源码或官方开源文档有对应能力；未运行兼容性验收。' },
    pro: { label: 'Pro', short: '商', description: '官方商业能力：依赖 Pro 插件，部分能力还需后端与许可证；不属于 GitHub 开源实现。' },
    partial: { label: '部分', short: '部', description: '存在相关能力，但只覆盖清单的一部分，或依赖宿主集成；具体边界见说明。' },
    unsupported: { label: '明确受限', short: '限', description: '官方文档或开源注册表有明确边界；并不表示全部商业产品均不支持。' },
    notfound: { label: '已查未见', short: '未', description: '已检索锁定版本的公开源码、测试和官方文档，未找到该项的直接实现证据；不否定未公开的 Pro 能力。' },
    unknown: { label: '待核实', short: '待', description: '本轮没有找到足以确认该项的直接证据；不等于已经证明不支持。' }
  };
  const annotations = new Map();
  const audits = new Map(window.UNIVER_AUDIT.items.map(item => [JSON.stringify(item.path), item]));
  function key(path) { return JSON.stringify(path); }
  for (const [category, group, items, state, sources, note] of window.UNIVER_RULES) {
    if (!states[state]) throw new Error(`Invalid Univer state: ${state}`);
    for (const source of sources) if (!evidence.sources[source]) throw new Error(`Missing Univer source: ${source}`);
    for (const title of items.split('|')) {
      const path = key([category, group, title]);
      if (annotations.has(path)) throw new Error(`Duplicate Univer mapping: ${path}`);
      annotations.set(path, { state, sources, note });
    }
  }
  for (const item of window.UNIVER_AUDIT.items) {
    const path = key(item.path);
    if (annotations.has(path)) throw new Error(`Duplicate audited mapping: ${path}`);
    if (!states[item.state]) throw new Error(`Invalid audited state: ${item.state}`);
    for (const source of item.sources) if (!evidence.sources[source]) throw new Error(`Missing audited source: ${source}`);
    annotations.set(path, item);
  }
  const zero = () => Object.fromEntries(Object.keys(states).map(state => [state, 0]));
  let totals = zero();
  function apply(roots) {
    const used = new Set();
    function visit(node) {
      if (!node.children.length) {
        const path = key(node.path.slice(1));
        if (annotations.has(path)) used.add(path);
        node.univer = annotations.get(path) || { state: 'unknown', sources: [], note: '已查阅当前官方仓库及功能文档，但本轮未取得这项 Excel 能力的直接实现证据。未将插件扩展点或相邻能力当作该功能已实现。' };
        node.univerCounts = zero();
        node.univerCounts[node.univer.state] = 1;
      } else {
        node.univerCounts = zero();
        for (const child of node.children) {
          visit(child);
          for (const state of Object.keys(states)) node.univerCounts[state] += child.univerCounts[state];
        }
      }
    }
    roots.forEach(visit);
    const missing = [...annotations.keys()].filter(path => !used.has(path));
    if (missing.length) throw new Error(`Unmatched Univer mappings: ${missing.join('; ')}`);
    totals = zero();
    for (const root of roots) for (const state of Object.keys(states)) totals[state] += root.univerCounts[state];
  }
  function make(tag, className, text) {
    const node = document.createElement(tag);
    node.className = className;
    if (text) node.textContent = text;
    return node;
  }
  function countsText(counts) {
    return Object.entries(states).filter(([state]) => counts[state]).map(([state, meta]) => `${meta.short}${counts[state]}`).join(' · ');
  }
  function badge(node) {
    const element = make('span', 'univer-tag');
    if (node.children.length) {
      const counts = node.univerCounts;
      const confirmed = counts.oss + counts.pro;
      const state = Object.keys(states).find(state => counts[state] === node.leaves);
      element.dataset.state = state || 'mixed';
      element.textContent = confirmed ? `开${counts.oss} 商${counts.pro}` : counts.partial ? `部分${counts.partial}` : counts.unknown ? '待核实' : `限${counts.unsupported} 未${counts.notfound}`;
      if (state === 'unsupported') element.textContent = '明确受限';
      if (state === 'notfound') element.textContent = '已查未见';
      element.title = `Univer 子项汇总（${node.leaves} 项）：${countsText(counts)}。父项不是独立验收结论。`;
    } else {
      element.dataset.state = node.univer.state;
      element.textContent = states[node.univer.state].label;
      element.title = `Univer ${states[node.univer.state].description}\n${node.univer.note}`;
    }
    return element;
  }
  function matches(node, filter) {
    if (!filter) return true;
    if (node.children.length) return false;
    if (filter === 'confirmed') return ['oss', 'pro'].includes(node.univer.state);
    return node.univer.state === filter;
  }
  function searchText(node) {
    return node.univer ? `Univer ${states[node.univer.state].label} ${node.univer.note}` : '';
  }
  function detail(node) {
    const section = make('section', 'univer-detail');
    section.append(make('h4', '', 'UNIVER 支持情况'), badge(node));
    if (node.children.length) {
      section.append(make('p', 'univer-boundary', countsText(node.univerCounts)));
      section.append(make('p', 'univer-boundary', '按末级功能逐项汇总；开源与 Pro 分开计数。展开下一级可查看各项的状态及证据。'));
    } else {
      const item = node.univer;
      section.append(make('p', 'univer-boundary', states[item.state].description), make('p', 'univer-note', item.note));
      if (item.sources.length) section.append(make('h4', '', '核对依据'));
      for (const sourceId of item.sources) {
        const source = evidence.sources[sourceId];
        const row = make('p', 'univer-source');
        const link = make('a', '', source.label);
        link.href = source.url; link.target = '_blank'; link.rel = 'noopener noreferrer';
        row.append(link);
        if (source.docs) {
          const docs = make('a', 'univer-doc-link', '官方文档 ↗');
          docs.href = source.docs; docs.target = '_blank'; docs.rel = 'noopener noreferrer';
          row.append(docs);
        }
        section.append(row);
      }
      const audit = audits.get(key(node.path.slice(1)));
      if (audit) {
        const record = make('details', 'univer-audit');
        record.append(make('summary', '', '查看本轮检索记录'));
        record.append(make('p', '', window.UNIVER_AUDIT.scope));
        record.append(make('p', '', `检索标识：${audit.query}`));
        record.append(make('p', '', `命中 ${audit.matchedFiles} 个候选文件。命中可能来自同名字段、其他产品或相邻能力，不代表该项已实现。结论以以上说明与依据为准。`));
        section.append(record);
      }
    }
    section.append(make('p', 'univer-method', `核对日期 ${evidence.checkedAt} · 源码 ${evidence.revision.slice(0, 12)}\n${evidence.method}`));
    return section;
  }
  function mountSummary(filter, sync) {
    const summary = document.querySelector('#univer-summary');
    summary.append(make('strong', '', 'Univer'));
    for (const [state, meta] of Object.entries(states)) {
      if (!totals[state]) continue;
      const button = make('button', 'univer-stat', `${meta.label} ${totals[state]}`);
      button.dataset.state = state;
      button.title = meta.description;
      button.setAttribute('aria-pressed', 'false');
      button.addEventListener('click', () => { filter.value = filter.value === state ? '' : state; sync(); });
      summary.append(button);
    }
    const note = make('span', 'univer-summary-note', '');
    summary.append(note);
  }
  function syncSummary(filter) {
    document.querySelectorAll('.univer-stat').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.state === filter.value)));
  }
  return { apply, badge, detail, matches, searchText, mountSummary, syncSummary };
})();
