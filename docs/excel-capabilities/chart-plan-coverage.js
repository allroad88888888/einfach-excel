/* 图表计划页：沿用原树的 ProjectCoverage / UniverCoverage 接口，左侧为实现归属，右侧为 Office Excel 行为。 */
(() => {
  const gap = window.CHART_PLAN;
  // 父项徽标统计哪一种归属；图表页默认 ECharts，其他计划页可在数据里指定。
  const parentBadge = gap.badge ?? { state: 'echarts', label: 'ECharts' };
  const key = path => JSON.stringify(path);
  const records = new Map(gap.items.map(item => [key(item.path), item]));
  const make = (tag, cls, text) => {
    const element = document.createElement(tag);
    element.className = cls;
    if (text !== undefined) element.textContent = text;
    return element;
  };
  const link = (label, href) => {
    const a = make('a', '', label);
    a.href = href; a.target = '_blank'; a.rel = 'noopener';
    return a;
  };

  function side(name, field, states, tagClass, stateAttr, statClass, title) {
    const zero = () => Object.fromEntries(Object.keys(states).map(state => [state, 0]));
    let totals = zero();
    const countsField = field + 'Counts';
    const leafState = node => node[field].state;
    function apply(roots) {
      function visit(node) {
        node[countsField] = zero();
        if (!node.children.length) {
          const item = records.get(key(node.path.slice(1)))
          if (!item) throw new Error(`Unmapped chart item: ${node.path.join(' / ')}`);
          node[field] = { state: item[field], note: field === 'project' ? item.ours : item.ls, sources: field === 'project' ? item.oursSrc : item.lsSrc };
          node[countsField][leafState(node)] = 1;
        } else for (const child of node.children) {
          visit(child);
          for (const state of Object.keys(states)) node[countsField][state] += child[countsField][state];
        }
      }
      roots.forEach(visit);
      totals = zero();
      for (const root of roots) for (const state of Object.keys(states)) totals[state] += root[countsField][state];
    }
    const countsText = counts => Object.entries(states).filter(([state]) => counts[state]).map(([state, meta]) => `${meta.label} ${counts[state]}`).join(' · ');
    function badge(node) {
      const element = make('span', tagClass);
      if (node.children.length) {
        element.dataset[stateAttr] = 'mixed';
        element.textContent = field === 'project' ? `${parentBadge.label} ${node[countsField][parentBadge.state]}/${node.leaves}` : `✓ ${node[countsField].done}/${node.leaves}`;
        element.title = `${name}子项汇总：${countsText(node[countsField])}`;
      } else {
        element.dataset[stateAttr] = states[leafState(node)].css;
        element.textContent = `${field === 'project' ? '归属' : '进度'} ${states[leafState(node)].short}`;
        element.title = `${name}：${states[leafState(node)].label}\n${node[field].note}`;
      }
      return element;
    }
    const matches = (node, filter) => !filter || (!node.children.length && leafState(node) === filter);
    const searchText = node => node[field] ? `${name} ${states[node[field].state].label} ${node[field].note} ${node[field].sources.join(' ')}` : '';
    function detail(node) {
      const section = make('section', field === 'project' ? 'project-detail' : 'univer-detail');
      section.append(make('h4', '', title), badge(node));
      if (node.children.length) section.append(make('p', field === 'project' ? '' : 'univer-boundary', countsText(node[countsField])));
      else {
        section.append(make('strong', field === 'project' ? 'project-status' : 'univer-boundary', states[leafState(node)].label));
        section.append(make('p', field === 'project' ? '' : 'univer-note', node[field].note));
        if (node[field].sources.length) section.append(make('h4', '', '源码依据'));
        for (const source of node[field].sources) {
          const row = make('p', field === 'project' ? 'project-source' : 'univer-source');
          row.append(link(source, (field === 'project' ? gap.oursRoot : gap.lsRoot) + source.replace(/[:#].*$/, '')));
          section.append(row);
        }
      }
      section.append(make('p', field === 'project' ? 'project-method' : 'univer-method', `核对 ${gap.checkedAt} · ${gap.method}`));
      return section;
    }
    function mountSummary(filter, sync) {
      const holder = document.getElementById('univer-summary');
      const group = make('span', field === 'project' ? 'project-summary' : 'univer-summary-group');
      group.append(make('strong', '', name));
      for (const [state, meta] of Object.entries(states)) {
        if (!totals[state]) continue;
        const button = make('button', statClass, `${meta.label} ${totals[state]}`);
        button.dataset[stateAttr] = meta.css;
        button.dataset.filter = state;
        button.setAttribute('aria-pressed', 'false');
        button.addEventListener('click', () => { filter.value = filter.value === state ? '' : state; sync(); });
        group.append(button);
      }
      field === 'project' ? holder.prepend(group) : holder.append(group);
    }
    const syncSummary = filter => document.querySelectorAll('.' + statClass).forEach(button => button.setAttribute('aria-pressed', String(button.dataset.filter === filter.value)));
    return { apply, badge, detail, matches, searchText, mountSummary, syncSummary };
  }

  window.ProjectCoverage = side('实现归属', 'project', {
    echarts: { label: 'ECharts 自带', short: 'ECharts', css: 'done' },
    plugin: { label: '插件实现', short: '插件', css: 'partial' },
    core: { label: '核心对象层', short: '核心', css: 'core' },
    rust: { label: 'Rust 引擎', short: 'Rust', css: 'notfound' },
    none: { label: '不做', short: '缓', css: 'deferred' }
  }, 'project-tag', 'projectState', 'project-stat', '实现归属');
  window.UniverCoverage = side('进度', 'luckysheet', {
    done: { label: '已完成', short: '✓', css: 'oss' },
    partial: { label: '部分完成', short: '部', css: 'partial' },
    todo: { label: '未开始', short: '—', css: 'pro' },
    none: { label: '不做', short: '缓', css: 'deferred' }
  }, 'univer-tag', 'state', 'univer-stat', '实现进度');
})();
