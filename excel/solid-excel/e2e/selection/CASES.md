# 选区 + 右键菜单 — e2e cases

> 功能源码：excel/spreadsheet-ui-core/src/selection/ + pointer/ +
> excel/solid-excel/src-vnext/grid/SpreadsheetGrid.tsx（选区/表头/全选交互）+
> src-vnext/context-menu/
> 存量 spec 行数超限登记：无（三个存量 spec 均 <150 行）

## 结论：多 range 选区 UI 已接线

spreadsheet-ui-core 的 multi-range-selection（Wave 1）**已被 UI 接上**：
`SpreadsheetGrid.tsx::selectCellFromEvent` 把 Ctrl/Cmd+Click 路由到
`addSelectionRegionAtom`（追加 cell region），Ctrl+Shift+Click 追加 range region，
行/列头 Ctrl/Cmd+Click 走 `selectRow/selectColumn(append)`，角落格走 `selectAllAtom`，
键盘 Ctrl+A 走 `dispatchKeyboardInputAtom` 的 `selection.selectAll`。
存量 vnext-selection-real-backend.spec.ts 已覆盖 cell 级 Ctrl+Click；本轮补齐
Shift 扩展、表头整行/整列、全选与 Escape 收敛。

## 场景表

| ID | 场景 | 步骤概要 | 关键断言 | 状态 | spec |
|---|---|---|---|---|---|
| SEL-01 | Ctrl/Cmd+Click 追加非连续 region，普通点击收敛为单格 | vNext Worker demo：点 B4 → 修饰键点 C2 → 普通点 B4 | data-selected/data-active、name-box、status 聚合 sum/avg/count | ✅ 存量 | vnext-selection-real-backend #"modifier-click appends a non-contiguous region and plain click clears to one" |
| SEL-02 | Shift+Click 从活动格扩展为矩形 range | Wave5：点 B2 → Shift+点 D5 | 角格/内部格 data-selected，焦点 D5 data-active，界外未选 | 🆕 本轮 | shift-extend-selection.spec.ts |
| SEL-03 | 再次 Shift+Click 以原锚点收缩/改向 | 续上：Shift+点 C3 | range 变 B2:C3，D5 不再选中 | 🆕 本轮 | shift-extend-selection.spec.ts |
| SEL-04 | Ctrl+Shift+Click 从活动格追加 range region | 点 B2 → Ctrl/Cmd+Shift+点 D4 | B2:D4 全选中且为追加（B2 原 region 仍在） | 🆕 本轮 | multi-range-append.spec.ts |
| SEL-05 | Ctrl/Cmd+Click 追加多个 cell region 后 Escape 收敛为 primary | 点 B4 → 修饰键点 D2 → Escape | 仅 primary（D2）保留选中，B4 取消 | 🆕 本轮 | multi-range-append.spec.ts |
| SEL-06 | 行头点击选择整行 | Wave5：点行头 3 | 行头 data-selected，行内任意格选中，A3 为 active | 🆕 本轮 | header-select.spec.ts |
| SEL-07 | 行头 Shift+Click 扩展连续行带 | 点行头 2 → Shift+点行头 4 | 行 2..4 行头与格子选中，行 5 未选 | 🆕 本轮 | header-select.spec.ts |
| SEL-08 | 行头 Ctrl/Cmd+Click 追加不连续行 | 点行头 1 → 修饰键点行头 5 | 行 1 与行 5 都选中，行 3 未选 | 🆕 本轮 | header-select.spec.ts |
| SEL-09 | 列头点击选择整列 | 点列头 B | 列头 data-selected，列内格子选中 | 🆕 本轮 | header-select.spec.ts |
| SEL-10 | 列头 Shift+Click 扩展连续列带 | 点列头 B → Shift+点列头 D | 列 B..D 选中，列 E 未选 | 🆕 本轮 | header-select.spec.ts |
| SEL-11 | 行 region 与列 region 混合追加 | 点行头 2 → 修饰键点列头 D | 行 2 与列 D 同时保持选中 | 🆕 本轮 | header-select.spec.ts |
| SEL-12 | 角落格点击全选 | 点 corner | corner/行头/列头/格子 data-selected 全真 | 🆕 本轮 | header-select.spec.ts |
| SEL-13 | Ctrl/Cmd+A 键盘全选，普通点击收敛 | 点 B3 → Ctrl+A → 点 D4 | 全选生效后单击回到单格，corner 复位 | 🆕 本轮 | header-select.spec.ts |
| RG-01 | Delete 清空 2x2 选区 | Blank demo：种 4 格 → Shift+箭头选 A1:B2 → Delete | 4 格全空 | ✅ 存量 | range-ops #"Delete clears every cell in a 2x2 selection" |
| RG-02 | 范围清空是单条 undo 事务 | 同上 → Delete → 一次 Ctrl/Cmd+Z | 4 格全部恢复 | ✅ 存量 | range-ops #"a single Ctrl/Cmd+Z restores the whole 2x2 block" |
| RG-03 | Backspace 与 Delete 等价清空 | 同上用 Backspace | 4 格全空 | ✅ 存量 | range-ops #"Backspace clears the same range as Delete" |
| RG-04 | Backspace + 单次 undo 恢复 | 同上 | 4 格恢复 | ✅ 存量 | range-ops #"Backspace + single undo also restores the block" |
| CM-01 | 列头右键 → Insert column before | Blank demo：B1 填值 → 右键列头 B | B1 值移到 C1 | ✅ 存量 | context-menu #"column header → Insert column before shifts B1 to C1" |
| CM-02 | 行头右键 → Delete row | A3/A4 填值 → 右键行头 3 | A4 值上移到 A3 | ✅ 存量 | context-menu #"row header → Delete row pulls A4 into A3" |
| CM-03 | 单元格右键 → Insert row above | A1 填值 → 右键 A1 | A1 值下移到 A2 | ✅ 存量 | context-menu #"cell → Insert row above pushes A1 content into A2" |
| CM-04 | range 内右键保持选区并 Clear | 选 A1:B2 → 右键 B1 → Clear | 4 格清空且选区未塌缩 | ✅ 存量 | context-menu #"right-clicking inside A1:B2 keeps the range active for Clear" |
| CM-05 | Escape 关闭菜单 | 右键 A1 → Escape | `.context-menu` 从 DOM 移除 | ✅ 存量 | context-menu #"Escape closes the menu — no .context-menu in DOM" |
| SEL-14 | 鼠标拖拽划选 range（pointer drag session） | mouse.down + 分步 move + up | 拖过的矩形选中、autoscroll | ⏳ P2 延后 | —（Playwright 分步拖拽在 workers:1 双 project 下 flake 风险高，且 pointer session 的 commit 语义已有 vnext-grid 单测钉住） |
| SEL-15 | 合并格点击展开选中整个 merge range | 点 merge anchor | 选区覆盖合并区 | ⏳ 交叉引用 | merge-freeze/ 名下（`createSelectionForRange` 的 merge 分支），本文件夹不重复 |

## 交叉引用（存量、他文件夹）

- vNext 右键菜单（cell/range/row/column target 与 menu atoms）：
  smoke/vnext-smoke.spec.ts #"toolbar and context menu use vNext interaction atoms"、
  #"range context menu clear preserves selection and clears the selected range"、
  #"row and column context menu commands mutate the visible projection"。
- 单格点击切换 active 态：smoke/vnext-smoke.spec.ts #"click selection toggles the active state"。
- 选区聚合（status bar sum/avg/count）：toolbar-shell/vnext-status-bar-real-backend.spec.ts。

## 备注

- range-ops / context-menu 两个存量 spec 跑在 **legacy** `src/` 壳（Blank demo，
  `.cell-selected` class 契约）；新增三个 spec 全部跑在 vNext Wave5 demo
  （`data-selected`/`data-active` 契约），两代壳的选择器口径勿混用。
- 新 spec 用 `ControlOrMeta` 修饰键（darwin 上 Ctrl+Click 会触发右键菜单，
  与存量 vnext-selection-real-backend 的 platform 三元写法等价）。
