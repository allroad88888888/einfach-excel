---
'@einfach/spreadsheet-ui-styles': minor
'@einfach/solid-excel': minor
---

vnext chrome 对齐 Excel for web:单一皮肤 + 全套暗色 + 拖页签本体重排。

**样式(ui-styles)**

- `chrome-tokens.css` 重做:品牌绿 #217346→#107c41,新增尺寸/字体/弹层影
  token 与 `[data-spreadsheet-theme='dark']` 暗色作用域;chrome 文件全部
  token 化(无裸色值),文本色组合过 AA 并记录在 token 文件头。
- 网格:单元格底对齐 + Calibri 栈;表头两级选中高亮(触及=浅绿+绿边线,
  整行/列=实心绿);底部条不透明整条。

**组件(solid-excel,breaking for class-hook 消费者)**

- vnext 组件不再输出旧共享皮 class(`formula-bar`/`format-toolbar`/
  `sheet-tabs`/`sheet-tab*`/`fmt-btn*`);样式钩子一律用 `spreadsheet-*`,
  活跃态是 `is-active`。react/vue 适配层的共享皮不受影响。
- sheet 页签重排把手删除:拖页签本体(4px 阈值),Escape 取消挂会话期
  window 监听;`sheet-tab-reorder-*` testid 不复存在。
- 新增表头谓词 `isRowInSelection`/`isColumnInSelection`(grid runtime)。
- demo 壳支持 `?theme=dark`。
