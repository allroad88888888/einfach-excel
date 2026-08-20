# visual-chrome — chrome 对齐守卫用例清单

皮肤/对齐类回归的门禁(浏览器 CSSOM 事实,jsdom 单测覆盖不到)。
背景:2026-08-20 的 Excel-web 对齐整改(单一皮肤 acfa5cb、浅色 f5892d7、
暗色 token、拖页签本体)修掉的每类缺陷,都在这里钉一条守卫。

驱动 wave5 demo:chrome 组合最全,不吃 `?backend=`,不进双后端矩阵
(皮肤与引擎无关)。

| ID | 用例 | 断言 | 状态 | spec |
| --- | --- | --- | --- | --- |
| VC-01 | chrome 条贴合且不透明 | 公式栏/网格/底部条缝隙 ≤1px;工具栏/公式栏/页签/底部条底色非透明 | 🆕 | chrome-alignment.spec.ts #"chrome strips are flush and opaque…" |
| VC-02 | 工具栏控件统一高度 | 全部 .spreadsheet-toolbar-button 高度恒为 28px | 🆕 | 同上 #"every toolbar control shares…" |
| VC-03 | 表头两级高亮 | 选区触及 = is-in-selection;整列选中 = is-selected | 🆕 | 同上 #"headers show the two-tier…" |
| VC-04 | 暗色文字可读 | ?theme=dark 下单元格文字/底色对比 ≥4.5(历史 bug:白底白字 ≈1) | 🆕 | 同上 #"dark skin keeps cell text readable…" |
| VC-05 | 暗色下条带不漏光 | 底部条在暗色下仍是不透明底 | 🆕 | 同上(并入 VC-04 用例断言) |
