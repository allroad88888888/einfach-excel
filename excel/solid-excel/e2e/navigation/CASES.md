# 键盘导航 + Go To — e2e cases

> 功能源码：excel/spreadsheet-ui-core/src/keyboard/ + go-to/ + selection/（moveSelection 钳制）
> + excel/solid-excel/src-vnext/go-to/ + grid/SpreadsheetGrid.tsx（handleGridKeyDown 派发）
> 存量 spec 行数超限登记：无（go-to.spec.ts 289 行）

## 场景表

| ID | 场景 | 步骤概要 | 关键断言 | 状态 | spec |
|---|---|---|---|---|---|
| GT-01 | Ctrl+G 输入 A1 地址跳转 | Wave5：Ctrl+G → "C5" → Enter | 对话框关闭，C5 data-active | ✅ 存量 | go-to #"Ctrl+G + \"C5\" + Enter navigates to C5" |
| GT-02 | Special → Constants 多区域选中 | Special tab → Constants → Go | 对话框关闭，常量格 data-selected | ✅ 存量 | go-to #"Special tab → Constants → Go selects a multi-region selection covering populated cells" |
| GT-03 | 跳转后 name box 同步 | Ctrl+G → "F8" | F8 active + name box 值 F8 | ✅ 存量 | go-to #"B4 #1 — Ctrl+G basic navigation" |
| GT-04 | R1C1 绝对引用 | "R5C3" | C5 active | ✅ 存量 | go-to #"B4 #2 — R1C1 absolute" |
| GT-05 | R1C1 相对引用 | 从 B2 输入 "R[2]C[1]" | C4 active | ✅ 存量 | go-to #"B4 #3 — R1C1 relative (MED #5 fix)" |
| GT-06 | 命名区域跳转 | 注册 MyRange=A1:C5 → Ctrl+G 输入名字 | 矩形角格+内部选中，界外未选 | ✅ 存量 | go-to #"B4 #4 — named range navigation" |
| GT-07 | Special → last cell | 定位最右下有值格 | F9 active | ✅ 存量 | go-to #"B4 #6 — last cell finds the bottom-right populated coord (F9)" |
| GT-08 | Special → current region | 连续块内触发 | A1:F9 全选中 | ✅ 存量 | go-to #"B4 #7 — current region" |
| GT-09 | precedents/dependents 禁用态 | 打开 Special tab | 两个 radio disabled + title 提示 | ✅ 存量 | go-to #"B4 #8 — dependency-graph locators…are disabled" |
| GT-10 | 非法 R1C1 报错 | "RC[abc]" → Enter | 对话框保持打开 + 错误文案 | ✅ 存量 | go-to #"B4 #9 — R1C1 invalid format" |
| GT-11 | row differences 只扫选区 | 选 B2:D5 → row differences | 选区内差异格选中，界外未选 | ✅ 存量 | go-to #"B4 #11 — row differences scoped to selection rect" |
| GT-12 | region-cap 截断 banner | 构造超限扫描 | banner 提示 | ⏳ P2 延后 | —（对话框在 confirm 时先卸载，banner 当前不可观测；见 go-to.spec.ts 内 TODO(B4-#10)，单测已钉 truncated 标志） |
| GT-13 | 稀疏 3x3 blanks 定位 | 有界 blanks 扫描 | 仅界内空格选中 | ⏳ P2 延后 | —（Wave5 视口固定 50×16，无法从 e2e 收紧扫描界；见 go-to.spec.ts 内 TODO(B4-#5)，单测覆盖） |
| NAV-01 | Enter 下移（导航模式） | Wave5：点 B2 → Enter | B3 active，B2 取消选中 | 🆕 本轮 | keyboard-move.spec.ts |
| NAV-02 | Shift+Enter 向上扩展选区 | 点 B3 → Shift+Enter | B2 active 且 B2:B3 选中（实现语义 = Shift+ArrowUp，见备注） | 🆕 本轮 | keyboard-move.spec.ts |
| NAV-03 | Tab 右移 / Shift+Tab 左移 | 点 B2 → Tab → Shift+Tab | C2 active 后回 B2，单格不扩展 | 🆕 本轮 | keyboard-move.spec.ts |
| NAV-04 | A1 处边界钳制 | 点 A1 → Shift+Tab / Shift+Enter | 始终停在 A1，无越界选区 | 🆕 本轮 | keyboard-move.spec.ts |
| NAV-05 | 最后一列 Tab 钳制 | End 到 P1 → Tab | 停在 P1 | 🆕 本轮 | keyboard-move.spec.ts |
| NAV-06 | Home 回当前行 A 列 | 点 C5 → Home | A5 active | 🆕 本轮 | home-end-page.spec.ts |
| NAV-07 | Ctrl+Home 回 A1 | 点 C5 → Ctrl/Cmd+Home | A1 active | 🆕 本轮 | home-end-page.spec.ts |
| NAV-08 | End 到当前行末列 | 点 C5 → End | P5 active（触发横向滚动） | 🆕 本轮 | home-end-page.spec.ts |
| NAV-09 | Ctrl+End 到 bounds 右下角 | 点 C5 → Ctrl/Cmd+End | P50 active（50×16 bounds 角） | 🆕 本轮 | home-end-page.spec.ts |
| NAV-10 | PageDown 按可视窗口下移并在末行钳制 | A1 连按 PageDown | A11 → … → A50，再按停在 A50 | 🆕 本轮 | home-end-page.spec.ts |
| NAV-11 | PageUp 上移并在首行钳制 | A21 → PageUp ×3 | A11 → A1 → 停在 A1 | 🆕 本轮 | home-end-page.spec.ts |

## 交叉引用（已被其他文件夹覆盖，不重复写）

- **Name Box 输入地址跳转**：toolbar-shell/vnext-wave5.spec.ts（填 "C4" + Enter →
  active 移动）与 toolbar-shell/vnext-status-bar-real-backend.spec.ts（填 "A1:J20"
  range 选区）已覆盖；real-backend 侧另有 smoke/vnext-real-backend-smoke.spec.ts
  #"name-box selection updates the canonical worker-backed address"。本文件夹只引用。
- 箭头 / Tab / Shift+Tab 基础移动（legacy 壳）：smoke/smoke.spec.ts
  #"keyboard navigation moves selection (Arrow + Tab + Shift+Tab)"。
- Ctrl+箭头可见数据边缘跳跃：smoke/vnext-smoke.spec.ts
  #"data-aware ctrl arrow movement stops at the visible data edge"。
- Alt+PageUp/PageDown 横向翻页：smoke/vnext-smoke.spec.ts
  #"alt page keys move horizontally by the visible column window"。
- Ctrl+PageUp/PageDown 切换相邻 sheet：smoke/vnext-smoke.spec.ts
  #"ctrl page keys switch adjacent sheet tabs from the grid"。
- Go To 在真实 worker 后端的往返：smoke/vnext-real-backend-smoke.spec.ts
  #"Go To and Text to Columns round-trip through the visible real-worker UI"。

## 备注

- **Shift+Enter 的实现语义**：`keyboard/index.ts::createMoveIntent` 对除 Tab 外的
  移动键统一取 `extend = shiftKey`，因此 Shift+Enter 是"向上扩展选区"（等价
  Shift+ArrowUp），**不是** Excel 的"活动格上移一格"。这是刻意的统一（Tab 被显式
  豁免），单测口径一致；NAV-02 按实现语义断言，非 bug。编辑模式内的
  Shift+Enter（commit + move up）归 editing/ 文件夹。
- Ctrl+End 的落点是 **selection bounds 角**（Wave5 = P50），不是"最后有值格"；
  后者是 Go To Special 的 last cell locator（GT-07）。keyboard 层无后端事实，
  README 明确 data-edge 扫描不在此层。
- 新 spec 的 PageUp/PageDown 步长依赖 Wave5 demo 视口常量
  （240px/24px → 10 行），来自 `props.viewport`（deterministic，见
  SpreadsheetGrid.tsx pageRows 注释），与浏览器实测尺寸无关。
