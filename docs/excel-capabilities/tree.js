
'use strict';
const roots=JSON.parse(document.getElementById('tree-data').textContent);
const nodes=new Map(),parents=new Map(),views=new Map();
const tree=document.getElementById('tree'),search=document.getElementById('search'),status=document.getElementById('status');
const projectFilter=document.getElementById('project-filter');
const deliveryFilter=document.getElementById('delivery-filter');

document.getElementById('show-estimates').addEventListener('change',event=>document.body.classList.toggle('show-estimates',event.target.checked));
let selected=null,depth=2,expanded=new Set(),beforeFilter=null;
function index(items,parent=null,level=0){for(const n of items){n.level=level;nodes.set(n.id,n);parents.set(n.id,parent);if(level<depth&&n.children.length)expanded.add(n.id);index(n.children,n,level+1);}}
UniverCoverage.apply(roots);
ProjectCoverage.apply(roots);
index(roots);
function el(tag,className,text){const e=document.createElement(tag);if(className)e.className=className;if(text!==undefined)e.textContent=text;return e;}
function effortText(n){if(n.estimatePending)return '待估';if(n.status==='本期排除')return '不纳入';if(n.status==='原模块细化')return '计入原模块';return `${n.estimate.total} 人天`+(n.pendingLeaves?` + ${n.pendingLeaves}项待估`:'');}
function build(items){const ul=el('ul');for(const n of items){
 const li=el('li',n.level===0?'root':''),row=el('div','row');li.dataset.id=n.id;
 const toggle=el('button','toggle',n.children.length?'▸':'·');toggle.type='button';toggle.disabled=!n.children.length;toggle.setAttribute('aria-label',`展开 ${n.title}`);
 const label=el('button','node-label',n.title);label.type='button';label.addEventListener('click',()=>select(n));
 if(n.status==='暂时不做'){row.classList.add('deferred');row.append(el('span','deferred-tag','暂时不做'));}if(false){row.classList.add('completed');const done=el('span','completed-tag','✓ 已完成');done.setAttribute('aria-label','对应 issue 已完成');row.append(toggle,label,done);}else{row.append(toggle,label);}const effort=el('span','effort',effortText(n));effort.title=n.estimatePending?'本项及各类投入待估，不计入已估合计':n.children.length?`子项汇总；基础 ${n.estimate.base}，待确认 ${n.estimate.option}`:`开发 ${n.estimate.dev} / Review ${n.estimate.review} / E2E ${n.estimate.e2e} / 真机 ${n.estimate.device} · ${n.estimateScope}`;row.append(effort);if(n.children.length)row.append(el('span','leaf-count',`${n.leaves} 项`));else{const dot=el('span','dot');dot.dataset.status=n.status;dot.title=n.status;row.append(dot);}
 row.append(ProjectCoverage.badge(n));
 const deliveryBadge=UniverCoverage.badge(n);if(deliveryBadge)row.append(deliveryBadge);
 li.append(row);let children=null;if(n.children.length){children=build(n.children);children.id=`children-${n.id}`;toggle.setAttribute('aria-controls',children.id);li.append(children);}
 toggle.addEventListener('click',()=>{expanded.has(n.id)?expanded.delete(n.id):expanded.add(n.id);sync();});
 views.set(n.id,{li,row,toggle,children,label});ul.append(li);
 }return ul;}
const rootList=build(roots);rootList.classList.add('root-list');tree.append(rootList);
function openPath(n){for(let p=parents.get(n.id);p;p=parents.get(p.id))expanded.add(p.id);}
let returnFocus=null;
function select(n,scroll=false,show=true){if(show){if(document.getElementById('detail').hidden)returnFocus=document.activeElement;document.getElementById('detail').hidden=false;document.getElementById('detail-backdrop').hidden=false;document.getElementById('detail-close').focus();}selected=n;for(const [id,v]of views)v.row.classList.toggle('selected',id===n.id);
 const body=document.getElementById('detail-body');body.replaceChildren();document.getElementById('detail-code').textContent=n.code||'';
 body.append(el('p','breadcrumb',n.path.slice(0,-1).join(' / ')||'Office Excel'),el('h3','',n.title));
 const badge=el('span','badge',n.children.length?`${n.leaves} 个末级条目`:n.status);badge.dataset.status=n.status;body.append(badge);
 body.append(ProjectCoverage.detail(n),UniverCoverage.detail(n));
 
 if(show)history.replaceState(null,'','#'+encodeURIComponent(n.id));
 if(n.code)body.append(el('span','badge',n.code));
 if(n.rules.length){body.append(el('h4','','功能说明'));const list=el('ul','rules');for(const rule of n.rules)list.append(el('li','',rule));body.append(list);}
 if(n.children.length){body.append(el('h4','','下一级功能'));const links=el('div','child-links');for(const child of n.children){const btn=el('button','child-link',child.title+(child.children.length?` · ${child.leaves}项`:''));btn.append(el('span','effort',' · '+effortText(child)));btn.type='button';btn.addEventListener('click',()=>{expanded.add(n.id);openPath(child);if(child.children.length)expanded.add(child.id);sync();select(child);views.get(child.id).row.scrollIntoView({block:'nearest'});});links.append(btn);}body.append(links);}
 if(n.meta.length)body.append(el('div','meta',n.meta.join('\n')));
 if(n.evidence?.length){body.append(el('h4','','核查依据'));for(const source of n.evidence){body.append(el('p','evidence',source.path+' : '+source.line));}}
 if(!n.rules.length&&!n.children.length)body.append(el('p','','当前为产品能力清单，平台与版本差异需按目标环境核对。'));
 if(scroll&&innerWidth<=960)document.getElementById('detail').scrollIntoView({block:'start'});
}
function matches(n,q,filter){return (!q||[n.title,n.code||'',UniverCoverage.searchText(n),ProjectCoverage.searchText(n),...n.rules,...n.meta,...(n.evidence||[]).map(s=>s.path),...n.path].join(' ').toLowerCase().includes(q))&&(!filter||n.status===filter)&&UniverCoverage.matches(n,deliveryFilter.value)&&ProjectCoverage.matches(n,projectFilter.value);}
function sync(){ProjectCoverage.syncSummary(projectFilter);UniverCoverage.syncSummary(deliveryFilter);const q=search.value.trim().toLowerCase(),filter=status.value,active=!!(q||filter||deliveryFilter.value||projectFilter.value),visible=new Set(),hits=[];
 for(const n of nodes.values())if(matches(n,q,filter)){visible.add(n.id);hits.push(n);for(let p=parents.get(n.id);p;p=parents.get(p.id))visible.add(p.id);}
 if(active&&!beforeFilter)beforeFilter=new Set(expanded);if(!active&&beforeFilter){expanded=beforeFilter;beforeFilter=null;}
 for(const [id,v]of views){const n=nodes.get(id),show=!active||visible.has(id);v.li.hidden=!show;const open=n.children.length&&(active?n.children.some(c=>visible.has(c.id)):expanded.has(id));if(v.children)v.children.hidden=!open;
 v.toggle.textContent=n.children.length?(open?'▾':'▸'):'·';if(n.children.length){v.toggle.setAttribute('aria-expanded',String(!!open));v.toggle.setAttribute('aria-label',`${open?'收起':'展开'} ${n.title}`);}}
 document.getElementById('empty').hidden=!active||hits.length>0;tree.hidden=active&&hits.length===0;
 document.getElementById('result-count').textContent=active?`${hits.filter(n=>!n.children.length).length} 个匹配功能 · ${hits.length} 个节点`:`${roots.length} 个主干 · ${[...nodes.values()].filter(n=>!n.children.length).length} 个末级条目`;
}
UniverCoverage.mountSummary(deliveryFilter,sync);
ProjectCoverage.mountSummary(projectFilter,sync);
for(const input of[search,status,deliveryFilter,projectFilter])input.addEventListener('input',sync);
document.getElementById('clear').addEventListener('click',()=>{search.value='';sync();search.focus();});
for(const btn of document.querySelectorAll('[data-depth]'))btn.addEventListener('click',()=>{
 depth=Number(btn.dataset.depth);search.value='';status.value='';deliveryFilter.value='';projectFilter.value='';beforeFilter=null;expanded=new Set([...nodes.values()].filter(n=>n.level<depth&&n.children.length).map(n=>n.id));
 for(const b of document.querySelectorAll('[data-depth]'))b.setAttribute('aria-pressed',String(b===btn));sync();
});
function closeDetail(){document.getElementById('detail').hidden=true;document.getElementById('detail-backdrop').hidden=true;returnFocus?.focus();}
document.getElementById('detail-close').addEventListener('click',closeDetail);document.getElementById('detail-backdrop').addEventListener('click',closeDetail);
document.addEventListener('keydown',event=>{if(event.key==='Tab'&&!document.getElementById('detail').hidden){const buttons=[...document.getElementById('detail').querySelectorAll('button,a[href],input,select,[tabindex="0"]')];const first=buttons[0],last=buttons.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}}if(event.key==='Escape'&&!document.getElementById('detail').hidden){closeDetail();return;}if(event.key==='Escape'&&search.value){search.value='';sync();search.focus();}});
window.addEventListener('hashchange',()=>{const n=nodes.get(decodeURIComponent(location.hash.slice(1)));if(n){openPath(n);select(n);sync();}});
const linkedNode=nodes.get(decodeURIComponent(location.hash.slice(1)));
if(linkedNode){openPath(linkedNode);select(linkedNode);}else select(roots.find(n=>n.title==='电子表格')||roots[0],false,false);sync();
