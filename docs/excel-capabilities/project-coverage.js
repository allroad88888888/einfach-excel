/* 本项目逐项证据的展示、汇总与筛选。 */
window.ProjectCoverage = (() => {
  const evidence = window.PROJECT_EVIDENCE;
  const states = {
    done: {label:'已实现',short:'✓'},
    partial: {label:'部分实现',short:'部'},
    core: {label:'仅底层',short:'仅底层'},
    deferred: {label:'暂停/延后',short:'缓'},
    notfound: {label:'未见实现',short:'—'}
  };
  const records = new Map();
  for (const item of evidence.items) {
    const key = JSON.stringify(item.path);
    if (records.has(key) || !states[item.state]) throw new Error(`Invalid project mapping: ${key}`);
    for (const source of item.sources) if (!evidence.sources[source]) throw new Error(`Missing project source: ${source}`);
    for (const test of item.tests) if (!evidence.tests[test]) throw new Error(`Missing project test: ${test}`);
    records.set(key,item);
  }
  const zero = () => Object.fromEntries(Object.keys(states).map(key => [key,0]));
  let totals = zero();
  function apply(roots) {
    const used = new Set();
    function visit(node) {
      node.projectCounts = zero();
      if (!node.children.length) {
        const key = JSON.stringify(node.path.slice(1));
        node.project = records.get(key);
        if (!node.project) throw new Error(`Unmapped project capability: ${key}`);
        used.add(key);
        node.projectCounts[node.project.state] = 1;
      } else for (const child of node.children) {
        visit(child);
        for (const state of Object.keys(states)) node.projectCounts[state] += child.projectCounts[state];
      }
    }
    roots.forEach(visit);
    if (used.size !== records.size) throw new Error('Unused project mappings');
    totals = zero();
    for (const node of roots) for (const state of Object.keys(states)) totals[state] += node.projectCounts[state];
  }
  function make(tag,cls,text) {
    const element = document.createElement(tag);
    element.className = cls;
    if (text !== undefined) element.textContent = text;
    return element;
  }
  function countsText(counts) {
    return Object.entries(states).map(([key,meta]) => `${meta.label} ${counts[key]}`).join(' · ');
  }
  function badge(node) {
    const element = make('span','project-tag');
    if (node.children.length) {
      element.dataset.projectState = 'mixed';
      element.textContent = `本${node.projectCounts.done}`;
      element.title = `本项目子项汇总：${countsText(node.projectCounts)}。数字仅为已实现末级条目数，父项不是独立验收结论。`;
    } else {
      element.dataset.projectState = node.project.state;
      element.textContent = `本 ${states[node.project.state].short}`;
      element.title = `本项目：${states[node.project.state].label}\n${node.project.note}`;
    }
    return element;
  }
  function matches(node,filter) { return !filter || (!node.children.length && node.project.state === filter); }
  function searchText(node) {
    return node.project ? `本项目 ${states[node.project.state].label} ${node.project.note} ${node.project.tests.join(' ')} ${node.project.sources.join(' ')}` : '';
  }
  function detail(node) {
    const section = make('section','project-detail');
    section.append(make('h4','','本项目实现情况'),badge(node));
    if (node.children.length) {
      section.append(make('p','',countsText(node.projectCounts)),make('p','','父项按末级能力汇总；“本”后的数字只统计已实现条目，展开查看边界。'));
    } else {
      const item = node.project;
      section.append(make('strong','project-status',states[item.state].label),make('p','',item.note));
      section.append(make('h4','','源码与项目裁定'));
      for (const key of item.sources) {
        const source = evidence.sources[key];
        const row = make('p','project-source');
        const link = make('a','',source.label);
        link.href = source.url; link.target = '_blank'; link.rel = 'noopener';
        row.append(link); section.append(row);
      }
      if (item.tests.length) {
        const record = make('details','project-tests');
        record.append(make('summary','','入口关联测试登记（本次未运行）'));
        for (const id of item.tests) {
          const test = evidence.tests[id];
          const row = make('p','');
          const link = make('a','',`${id} · ${test.label}`);
          link.href = `../${test.path}`; link.target = '_blank'; link.rel = 'noopener';
          row.append(link,make('small','',test.title)); record.append(row);
        }
        section.append(record);
      }
    }
    section.append(make('p','project-method',`${evidence.scope}\n核对 ${evidence.checkedAt} · 提交 ${evidence.revision.slice(0,12)}\n${evidence.method}`));
    return section;
  }
  function mountSummary(filter,sync) {
    const holder = document.getElementById('univer-summary');
    const group = make('span','project-summary');
    group.append(make('strong','','本项目'));
    for (const [state,meta] of Object.entries(states)) {
      const button = make('button','project-stat',`${meta.label} ${totals[state]}`);
      button.dataset.projectState = state;
      button.setAttribute('aria-pressed','false');
      button.addEventListener('click',() => { filter.value = filter.value === state ? '' : state; sync(); });
      group.append(button);
    }
    holder.prepend(group);
  }
  function syncSummary(filter) {
    document.querySelectorAll('.project-stat').forEach(button => button.setAttribute('aria-pressed',String(button.dataset.projectState === filter.value)));
  }
  return {apply,badge,detail,matches,searchText,mountSummary,syncSummary};
})();
