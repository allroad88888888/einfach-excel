# visual-chrome — chrome 对齐守卫用例清单

皮肤/对齐类回归的门禁(浏览器 CSSOM 事实,jsdom 单测覆盖不到)。
背景:2026-08-20 的 Excel-web 对齐整改(单一皮肤 acfa5cb、浅色 f5892d7、
暗色 token、拖页签本体)修掉的每类缺陷,都在这里钉一条守卫。

驱动 wave5 demo:chrome 组合最全,不吃 `?backend=`,不进双后端矩阵
(皮肤与引擎无关)。

| ID    | 用例                  | 断言                                                            | 状态 | spec                                                            |
| ----- | --------------------- | --------------------------------------------------------------- | ---- | --------------------------------------------------------------- |
| VC-01 | chrome 条贴合且不透明 | 公式栏/网格/底部条缝隙 ≤1px;工具栏/公式栏/页签/底部条底色非透明 | 🆕   | chrome-alignment.spec.ts #"chrome strips are flush and opaque…" |
| VC-02 | 工具栏控件统一高度    | 全部 .spreadsheet-toolbar-button 高度恒为 28px                  | 🆕   | 同上 #"every toolbar control shares…"                           |
| VC-03 | 表头两级高亮          | 选区触及 = is-in-selection;整列选中 = is-selected               | 🆕   | 同上 #"headers show the two-tier…"                              |
| VC-04 | 暗色文字可读          | ?theme=dark 下单元格文字/底色对比 ≥4.5(历史 bug:白底白字 ≈1)    | 🆕   | 同上 #"dark skin keeps cell text readable…"                     |
| VC-05 | 暗色下条带不漏光      | 底部条在暗色下仍是不透明底                                      | 🆕   | 同上(并入 VC-04 用例断言)                                       |
| VC-06 | Dialog skin 禁止裸色  | 共享皮肤不含 hex/rgb/hsl 字面量                                 | 🆕   | dialog-shell.spec.ts #"shared skin contains no literal colors"  |
| VC-07 | Modal 壳尺寸与布局    | 4px card、40px header、28px controls、footer 右对齐             | 🆕   | 同上 #"light and dark themes preserve…"                         |
| VC-08 | Modal 强调态          | focus 使用 Office 蓝，primary 使用 Excel 绿且文字对比 ≥4.5      | 🆕   | 同上 #"light and dark themes preserve…"                         |
| VC-09 | 暗色 Modal 可读       | surface/text token 随主题切换且正文对比 ≥4.5                    | 🆕   | 同上 #"light and dark themes preserve…"                         |
| VC-10 | 非模态排除            | FilterDropdown/FillColorPopover 不继承居中变换或 modal 阴影     | 🆕   | 同上 #"filter and color popovers stay outside…"                 |
| VC-11 | 17 个 Modal 视觉矩阵  | D01–D17 逐项浅/深色验证 4px/40px/28px/token 契约                | 🆕   | dialog-modal-matrix.spec.ts                                      |
| VC-12 | Feature 尺寸规则生效  | 逐项根 class 的 computed width 匹配专属 feature CSS              | 🆕   | 同上                                                            |
| VC-13 | 叶子 CSS 禁止裸色      | D01–D19 明确拥有的 21 个 CSS 文件无 hex/rgb/hsl                  | 🆕   | dialog-raw-colors.spec.ts                                        |
| VC-14 | 筛选下拉实际非模态     | 实际入口打开；无 aria-modal、无居中变换、320px、popover 阴影     | 🆕   | dialog-nonmodal-matrix.spec.ts #"D18 mounted Filter Dropdown…"  |
| VC-15 | 颜色选择器实际非模态   | 实际入口打开；aria-modal=false、锚点间距 ≤8px、226px、28px 色块 | 🆕   | 同上 #"D19 mounted color picker…"                               |
