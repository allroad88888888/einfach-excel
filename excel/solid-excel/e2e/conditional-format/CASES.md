# 条件格式 — e2e cases

> 功能源码：excel/spreadsheet-ui-core/src/conditional-formatting/（rules cache ≤200）+
> excel/solid-excel/src-vnext/conditional-formatting/SpreadsheetConditionalFormatDialog.tsx +
> 求值：static-backend.ts / worker-workbook-backend.ts 的 conditionalRuleAppliesToCell
> （投影时逐格求值，priority 升序首个命中生效）
> 存量 spec 行数超限登记：无（toolbar-conditional-format.spec.ts 123 行）

## 语义要点（按实现核实）

- 对话框只有 kind 选择器，规则体取 `defaultRuleForKind`：cell-value = `gt 0` →
  bgColor #fef3c7；color-scale → bgColor = maxColor #00ff00（**单色**，非渐变）；
  data-bar → #bfdbfe（单色，非长度条）。operator/value/format 无编辑 UI。
- 求值发生在投影读取时 → 编辑单元格值即触发重求值，样式实时切换。
- 多规则按 priority 升序**首个命中生效**（fall-through：前面的不命中才轮到后面）；
  新保存的规则追加在队尾（priority = 当前条数）。
- 两个入口（工具栏/菜单）都 `openConditionalFormatEditorAtom(null)` → editor.draft
  恒为 null → cf-remove-button 恒 disabled，删除规则**无可达 UI 路径**。

## 场景表

| ID | 场景 | 步骤概要 | 关键断言 | 状态 | spec |
|---|---|---|---|---|---|
| CF-01 | 工具栏按钮可见/本地化并打开对话框 | Wave5 → 查属性 → 点击 | 非 raw key；对话框可见 | ✅ 存量 | toolbar-conditional-format #"toolbar-btn-conditional-format is visible, enabled, and not raw keys" |
| CF-02 | 对话框控件齐备 + save 落规则 | 打开 → save | kind/list/save/cancel/remove/close-x 可见；目标格 data-has-conditional-format=true | ✅ 存量 | toolbar-conditional-format #"conditional-format dialog opens and basic controls exist" |
| CF-03 | Escape 与标题栏 X 关闭 | Escape；再开点 X | 两种路径均隐藏 | ✅ 存量 | toolbar-conditional-format #"conditional-format dialog closes with Escape and header close X" |
| CF-04 | 默认规则命中着色 | B2(=120) save 默认规则 | 计算样式 rgb(254,243,199) | ✅ 存量 | toolbar-conditional-format #"saving the default rule paints the matching cell with bgColor #fef3c7" |
| CF-05 | 编辑值跨越阈值样式实时切换 | B2 建默认规则 → 输 -8 → 再输 55 | 命中→不命中→命中：data-has-conditional-format 与 bg 同步翻转 | 🆕 本轮 | cf-threshold-priority.spec.ts |
| CF-06 | 多规则叠加优先级（首个命中生效 + fall-through） | B2 依次存 cell-value、color-scale 两规则 → 输 -8 | 双命中时首规则色 #fef3c7；首规则失配后落到 #00ff00 | 🆕 本轮 | cf-threshold-priority.spec.ts |
| CF-07 | 规则列表随保存增长并展示 priority | 存两规则后重开对话框 | cf-rule-list 两条 li，data-rule-kind 正确、文本含 priority | 🆕 本轮 | cf-threshold-priority.spec.ts |
| CF-08 | 工具栏入口 remove 恒禁用（现状钉住） | 打开对话框查 remove | cf-remove-button disabled | 🆕 本轮 | cf-threshold-priority.spec.ts |
| CF-09 | 删除规则后样式移除 | — | — | ⏳ P2 延后 | —（无 UI 入口：两个入口都以 null 打开 editor，remove 按钮永不启用；后端 removeConditionalFormatRule port 存在但 UI 未接既有规则的编辑/选中路径，CF-08 钉住现状） |
| CF-10 | 色阶/数据条真实渐变渲染 | — | — | ⏳ P2 延后 | —（实现为单色 bgColor 占位，无渐变/条长渲染面可断言） |
| CF-11 | 规则管理器编辑既有规则 | — | — | ⏳ P2 延后 | —（列表 li 无交互，无法选中既有规则回填 draft） |

## 备注

- 全部跑 Wave5 静态 demo；worker 后端的 overlay 求值逻辑同构
  （worker-workbook-backend.ts::applyConditionalFormatOverlay），双端行为一致。
- CF-06 的 fall-through 构造：cell-value `gt 0` 对 -8 失配，而 color-scale 只要求
  数值（numericValue !== null）→ 次序生效可被唯一区分。
