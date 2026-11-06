/* Luckysheet 差距页：沿用原树的 ProjectCoverage / UniverCoverage 接口，Univer 一侧换成 Luckysheet。 */
(() => {
  const gap = window.LUCKYSHEET_GAP;
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
          if (!item) throw new Error(`Unmapped gap item: ${node.path.join(' / ')}`);
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
        element.textContent = field === 'project' ? `本${node[countsField].done}/${node.leaves}` : `LS ${node[countsField].has}`;
        element.title = `${name}子项汇总：${countsText(node[countsField])}`;
      } else {
        element.dataset[stateAttr] = states[leafState(node)].css;
        element.textContent = `${field === 'project' ? '本' : 'LS'} ${states[leafState(node)].short}`;
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

  window.ProjectCoverage = side('本项目', 'project', {
    done: { label: '已实现', short: '✓', css: 'done' },
    partial: { label: '部分实现', short: '部', css: 'partial' },
    core: { label: '仅底层', short: '仅底层', css: 'core' },
    deferred: { label: '暂停/延后', short: '缓', css: 'deferred' },
    notfound: { label: '未见实现', short: '—', css: 'notfound' }
  }, 'project-tag', 'projectState', 'project-stat', '本项目实现情况');
  window.UniverCoverage = side('Luckysheet', 'luckysheet', {
    has: { label: '已有', short: '有', css: 'oss' },
    partial: { label: '部分', short: '部', css: 'partial' }
  }, 'univer-tag', 'state', 'univer-stat', 'LUCKYSHEET 对应实现');
})();
