# 查找替换 — e2e cases

> 功能源码：excel/spreadsheet-ui-core/src/find-replace/（MAX_FIND_PAGE = 500）+
> excel/solid-excel/src-vnext/find-replace/SpreadsheetFindReplaceDialog.tsx +
> 静态后端 searchRange/replaceMatches：src-vnext/adapter/static-backend.ts
> 存量 spec 行数超限登记：无（toolbar-find-replace.spec.ts 182 行）

## 语义要点（按实现核实）

- 字面查找每格只取**第一处**命中（`collectLiteralFindSpans` 单 span）；正则可一格多命中。
- `wholeMatch` 是**整格等值**语义（'Match entire cell'），非单词边界。
- 游标步进 `(index ± 1 + len) % len` —— 前后方向都回绕。
- `pageMatches` 上限 500（`MAX_FIND_PAGE`）；replace-all 超页按设计**分页多轮**，
  第一轮后显示 capped 提示（`replace-all-capped-text`）。
- Replace/Replace-All 走后端 port，**不写 UI-core history 栈**（`recordHistoryEntry`
  全仓无调用方，find-replace 模块零 history 集成）→ 工具栏 undo 不感知，见 FR-14 ⚠️。

## 场景表

| ID | 场景 | 步骤概要 | 关键断言 | 状态 | spec |
|---|---|---|---|---|---|
| FR-01 | 工具栏按钮可见/可用/本地化 | Wave5 → 查按钮属性 | tooltip/aria 非 raw key | ✅ 存量 | toolbar-find-replace #"toolbar button is visible, enabled, and labeled with localized text" |
| FR-02 | 按钮打开对话框 | 点击 toolbar-btn-find-replace | wave5-find-replace 可见 | ✅ 存量 | toolbar-find-replace #"clicking the toolbar button opens the Wave 5 find-replace dialog" |
| FR-03 | Find Next 跳到命中并保持对话框 | 填 North → find-next | A2 data-active，对话框仍在 | ✅ 存量 | toolbar-find-replace #"find-next jumps to the North match and keeps the dialog open" |
| FR-04 | 关闭按钮 | find-close-button | 对话框从 DOM 移除 | ✅ 存量 | toolbar-find-replace #"close button dismisses the dialog" |
| FR-05 | Replace tab 显示替换控件 | 切 replace-tab | replacement/replace/replace-all 可见 | ✅ 存量 | toolbar-find-replace #"replace-tab reveals the replacement input and replace buttons" |
| FR-06 | 单个替换当前命中 | North→Northern | A2 显示 Northern | ✅ 存量 | toolbar-find-replace #"replace-button rewrites the current match in place" |
| FR-07 | Replace All 全命中替换 | 500→999 | F4/F7 均 999 | ✅ 存量 | toolbar-find-replace #"replace-all-button rewrites every match across the seeded sheet" |
| FR-08 | 大小写开关矩阵 | "north" 默认命中；勾 case-sensitive 后不命中，"North" 命中 | 状态文本 1 of 1 / No matches | 🆕 本轮 | find-options-matrix.spec.ts |
| FR-09 | 整格匹配开关 | "50" 子串 6 命中；勾 whole-match 后仅 D4 | 1 of 6 → 1 of 1，D4 active | 🆕 本轮 | find-options-matrix.spec.ts |
| FR-10 | 正则开关 | `^8[04]0$` 命中 F2/F3 | 1 of 2，F2 active，步进到 F3 | 🆕 本轮 | find-options-matrix.spec.ts |
| FR-11 | 无匹配提示 | 查 "zebra" | 状态 "No matches" | 🆕 本轮 | find-options-matrix.spec.ts |
| FR-12 | 逐个 Find Next/Prev 循环回绕 | "240" 两命中，连点 next×3、prev×1 | D2→D3→D2 回绕，prev 反向回绕，状态计数同步 | 🆕 本轮 | find-next-wrap.spec.ts |
| FR-13 | 500 匹配上限：replace-all 截断提示 + 二轮清尾 | 外部 TSV 粘 640 格 "zz" → 全部替换 | 状态 1 of 640；capped 文本 "500 of 640"；再点一轮后 No matches | 🆕 本轮 | replace-all-limits.spec.ts |
| FR-14 | Replace All 是单个 undo 步 | 240→888 后一次 undo 应双格还原 | undo 一步全还原 | ⚠️ 疑似 bug | replace-all-limits.spec.ts（test.fixme：replace 走后端 port 但无任何 pushHistory 集成，工具栏 undo 始终 disabled，替换不可撤销——与 Excel 语义相悖） |
| FR-15 | 正则灾难回溯超时/错误码提示 | 恶意 pattern | 错误提示 | ⏳ P2 延后 | —（静态后端对非法 pattern 返回 0 命中而非错误；超时机制未实现） |
| FR-16 | scope=selection / workbook 范围收窄 | 换 scope 查找 | 命中范围随 scope | ⏳ P2 延后 | —（workbook 选项 UI 即 disabled；selection scope 留待与选区族联测） |
| FR-17 | searchFormulas 查公式文本 | 勾选后查 "=SUM" | 命中公式 | ⏳ P2 延后 | —（Wave5 种子无公式，需先造数据；开关渲染已被 FR-05/08 路过覆盖） |

## 备注

- 新增 spec 全跑 Wave5 静态 demo（`nav-tab-vnext-wave5`，`?locale=en`），断言口径：
  `find-status-text` 文本（'{current} of {total}' / 'No matches'）+ 单元格 `data-active`。
- FR-13 通过 `navigator.clipboard.writeText` 注入 40×16 TSV（外部粘贴路径已由
  clipboard/external-paste-matrix.spec.ts 钉住），一次 Ctrl+V 构造 640 命中，避免逐格输入。
