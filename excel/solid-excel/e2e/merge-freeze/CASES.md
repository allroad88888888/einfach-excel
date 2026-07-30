# merge-freeze — 合并单元格 + 冻结窗格 e2e cases

> 功能源码：excel/spreadsheet-ui-core/src/viewport/freeze.ts（冻结 UI-core canonical 状态）+
> excel/spreadsheet-ui-core/src/keyboard/（方向键 intent）+
> excel/solid-excel/src-vnext/grid/SpreadsheetGrid.tsx（merge 点击/编辑/渲染、freeze sticky 象限）+
> src-vnext/toolbar/（merge dropdown）+ src-vnext/context-menu/、src-vnext/menu-bar/（freeze 命令入口）
> 存量 spec 行数超限登记：无（最长 toolbar-merge.spec.ts 195 行）

## 合并（merge）

| ID | 场景 | 步骤概要 | 关键断言 | 状态 | spec |
|---|---|---|---|---|---|
| MF-01 | merge 按钮态与本地化 | 单格选中查看按钮 | tooltip/aria 非 raw key、按钮保持 enabled | ✅ 存量 | toolbar-merge #"toolbar-btn-merge is visible, labels are localized…" |
| MF-02 | 多选启用 merge 并打开 dropdown | B2+Shift C3 → 点按钮 | dropdown 可见 | ✅ 存量 | toolbar-merge #"multi-cell selection enables merge…" |
| MF-03 | merge-center 锚点跨行列 | A1:B2 → merge-center | 锚点 rowspan/colspan=2、覆盖格移出 DOM | ✅ 存量 | toolbar-merge #"merge-center: A1:B2 anchors at A1…" |
| MF-04 | unmerge 还原 | 合并后走 dropdown unmerge | 锚点 span 归 1、覆盖格回 DOM | ✅ 存量 | toolbar-merge #"unmerge restores a merged 2x2 range…" |
| MF-05 | across-rows 每行一锚 | A1:C2 → across-rows | A1/A2 各 colspan=3 | ✅ 存量 | toolbar-merge #"across-rows creates one merged anchor per row…" |
| MF-06 | across-cols 每列一锚 | A1:B3 → across-cols | A1/B1 各 rowspan=3 | ✅ 存量 | toolbar-merge #"across-cols creates one merged anchor per column…" |
| MF-07 | Escape/外点关 dropdown 不动合并态 | 合并后开 dropdown 再关 | 合并属性不变 | ✅ 存量 | toolbar-merge #"Escape and outside click close dropdown…" |
| MF-08 | worker 后端 merge + undo/redo 往返 | B2:C3 merge → Ctrl+Z → Ctrl+Y | 锚点 span、history 单条、公式格复原 | ✅ 存量 | vnext-merge-real-backend #"B2:C3 merges to a spanning anchor…" |
| MF-09 | 点击合并锚点的选区形状 | 合并 B2:C3 → 点锚点；Shift+click D4 | 选区吸附整个合并区（区外不选）；Shift 从左上锚点扩成 B2:D4 矩形 | 🆕 本轮 | merge-selection-editing.spec.ts #"clicking the merged anchor…" |
| MF-10 | 合并后编辑落在锚点 | 双击锚点 → 改值 → Enter | 编辑器挂在锚点 td、提交后锚点显示新值、合并存活 | 🆕 本轮 | merge-selection-editing.spec.ts #"double-clicking the merged anchor edits…" |
| MF-11 | 合并区 active cell 视作锚点 | 点合并区看地址栏；D2 按 ← 进入、锚点按 →/↓ 离开 | 地址/公式栏跟随锚点；方向键一步跳过覆盖格 | ⚠️ 疑似 bug | merge-selection-editing.spec.ts #fixme "the merged region acts as ONE cell…" |
| MF-12 | Ctrl+Click 将合并区追加为独立选区 | 合并后 Ctrl+点锚点 | 追加 region 吸附合并区 | ⏳ P2 延后 | —（源码 `appendCellRangeSelection` 已实现，本轮控规模） |
| MF-13 | 合并区横跨冻结线时的渲染 | 合并 A1:B4 后 freeze 2 行 | 待定 | ⏳ P2 延后 | —（产品口径未定义，先补规格再写用例） |

### ⚠️ MF-11 说明（源码判定 + 实测确认）

两条同根因，均为"被合并覆盖的坐标可以成为 active cell"：

1. 方向键移动 merge 无感知：`spreadsheet-ui-core/src/keyboard/index.ts`
   `createMoveIntent`/`moveSelection` 的输入里没有 merge 事实，±1 步进会把
   active cell 落在覆盖坐标（如 D2 按 ← 落 C2 而非锚点 B2）。
2. 点击合并区后 `createSelectionForRange` 的 focus 是右下角，而
   `getActiveCell(range)` 返回 focus → 地址栏显示覆盖格坐标（C3）、公式栏
   内容为空（覆盖格无 source text），Excel 应显示锚点 B2 及其内容。

已实测复现（临时去掉 fixme 在 wasm project 跑过一次）：点击合并区 B2:C3 后
`formula-bar-addr` 显示 `C3` 而非锚点 `B2`。用例按 Excel 语义书写并
`test.fixme` 挂起；修复后去掉 fixme 即可转 ✅。

## 冻结（freeze panes）

| ID | 场景 | 步骤概要 | 关键断言 | 状态 | spec |
|---|---|---|---|---|---|
| FZ-01 | 行头右键 Freeze N rows | 右键行 3 头 → freezeRowsHere | 行 1-2 data-frozen-row、行 3 无 | ✅ 存量 | freeze-panes #"right-click a row header…" |
| FZ-02 | 列头右键 Freeze N cols | 右键列 B 头 → freezeColsHere | 列 A frozen、列 B 无 | ✅ 存量 | freeze-panes #"right-click a column header…" |
| FZ-03 | cell 右键 Freeze panes 双轴 | 右键 B3 → freezePanes | 行 1-2 + 列 A frozen | ✅ 存量 | freeze-panes #"right-click a cell…" |
| FZ-04 | 四个 freeze 菜单项同现 | 右键 B3 看菜单 | 三个 freeze 可见、未冻结时无 unfreeze | ✅ 存量 | freeze-panes #"cell right-click shows all four…" |
| FZ-05 | freeze row 不影响已有 col freeze | 先冻列再冻行 | 两轴标记共存 | ✅ 存量 | freeze-panes #"Freeze row only — does not touch col freeze" |
| FZ-06 | boundary marker 落在最后冻结行列 | C3 freezePanes | data-freeze-boundary-bottom/right、角格双属性 | ✅ 存量 | freeze-panes #"freezing draws the boundary marker…" |
| FZ-07 | SVG boundary overlay 挂载/卸载 | freeze → unfreeze | freeze-boundary 及两条线出现/消失 | ✅ 存量 | freeze-panes #"freezing mounts an SVG…" + #"unfreezing removes the SVG…" |
| FZ-08 | unfreeze 清两轴 | 冻行后行头右键 unfreeze | 无任何 frozen 标记 | ✅ 存量 | freeze-panes #"Unfreeze clears both axes" |
| FZ-09 | view 菜单 freeze + local history undo | worker demo View→Freeze→undo | 分割线/标记出现、`viewport.freeze` local 条目、undo 复原 | ✅ 存量 | vnext-freeze-real-backend #"view menu freeze draws the split lines…" |
| FZ-10 | view 菜单 unfreeze | freeze 后 View→Unfreeze | boundary 消失、两条 local 条目 | ✅ 存量 | vnext-freeze-real-backend #"view menu unfreeze clears…" |
| FZ-11 | 冻结后垂直滚动象限静止 | C3 freezePanes → scrollTop+96 | 冻结行/交叉象限 boundingBox 不动，非冻结象限精确位移，冻结带内容不变 | 🆕 本轮 | freeze-scroll.spec.ts #"vertical scroll…" |
| FZ-12 | 冻结后水平滚动冻结列静止 | C3 freezePanes → scrollLeft+192 | 冻结列/交叉象限 x 不动，冻结行内非冻结列位移 | 🆕 本轮 | freeze-scroll.spec.ts #"horizontal scroll…" |
| FZ-13 | 滚动态 unfreeze 恢复 | freeze → 滚动 → unfreeze → 回顶 | 标记/boundary 清除、A1 几何复位到 boot 位置 | 🆕 本轮 | freeze-scroll.spec.ts #"unfreezing while scrolled…" |
| FZ-14 | 拖拽冻结线调整冻结数 | — | — | ⏳ 无 UI 入口 | —（freeze-boundary SVG `pointer-events: none`，无拖拽 handle） |
| FZ-15 | freeze 配置持久化 hydration | — | — | ⏳ 无 UI 入口 | —（readFreezeConfig 持久化 hook 无 UI 触发面，单测覆盖） |
