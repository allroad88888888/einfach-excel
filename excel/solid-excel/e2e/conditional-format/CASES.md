# 条件格式 — e2e cases

> 功能源码：excel/spreadsheet-ui-core/src/conditional-formatting/（rules cache ≤200）+
> excel/solid-excel/src/conditional-formatting/SpreadsheetConditionalFormatDialog.tsx +
> 求值：static-backend.ts / worker-workbook-backend.ts 的 conditionalRuleAppliesToCell
> （投影时逐格求值，priority 升序首个命中生效）
> 存量 spec 行数超限登记：无（toolbar-conditional-format.spec.ts 123 行）

## 语义要点（按实现核实）

- 对话框通过 editor draft Atom 承载 `kind`、范围、优先级与各规则字段。cell value 可编辑
  condition/value/background；formula、颜色类和 top/bottom 也有对应字段。新增默认规则仍由
  `defaultRuleForKind()` 生成，cell value 默认 `operator=greaterThan`、`value=0`、
  `bgColor=#22C55E`；color-scale 按完整规则范围输出单元格背景色渐变；data-bar 按完整规则
  范围输出不可聚焦的装饰性长度条。
- 求值发生在投影读取时 → 编辑单元格值即触发重求值，样式实时切换。
- 多规则按 priority 升序**首个命中生效**（fall-through：前面的不命中才轮到后面）；
  新保存的规则追加在队尾（priority = 当前条数）。
- 两个入口（工具栏/菜单）均先以新规则草稿打开。对话框从当前 Sheet 水合持久化
  规则；选择列表项后，草稿与规则目标 Sheet 绑定，`cf-remove-button` 才可用。

## 场景表

| ID     | 场景                                            | 步骤概要                                                           | 关键断言                                                                           | 状态                                   | spec                                                                                                  |
| ------ | ----------------------------------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------- | -------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| CF-01  | 工具栏按钮可见/本地化并打开对话框               | Wave5 → 查属性 → 点击                                              | 非 raw key；对话框可见                                                             | ✅ 存量                                | toolbar-conditional-format #"toolbar-btn-conditional-format is visible, enabled, and not raw keys"    |
| CF-02  | 对话框控件齐备 + save 落规则                    | 打开 → save                                                        | kind/list/save/cancel/remove/close-x 可见；目标格 data-has-conditional-format=true | ✅ 存量                                | toolbar-conditional-format #"conditional-format dialog opens and basic controls exist"                |
| CF-03  | Escape 与标题栏 X 关闭                          | Escape；再开点 X                                                   | 两种路径均隐藏                                                                     | ✅ 存量                                | toolbar-conditional-format #"conditional-format dialog closes with Escape and header close X"         |
| CF-04  | 默认规则命中着色                                | B2(=120) save 默认规则                                             | 计算样式 rgb(254,243,199)                                                          | ✅ 存量                                | toolbar-conditional-format #"saving the default rule paints the matching cell with bgColor #fef3c7"   |
| CF-05  | 编辑值跨越阈值样式实时切换                      | B2 建默认规则 → 输 -8 → 再输 55                                    | 命中→不命中→命中：data-has-conditional-format 与 bg 同步翻转                       | 🆕 本轮                                | cf-threshold-priority.spec.ts                                                                         |
| CF-06  | 多规则叠加优先级（首个命中生效 + fall-through） | B2 依次存 cell-value、color-scale 两规则 → 输 -8                   | 双命中时首规则色 #fef3c7；首规则失配后落到 #00ff00                                 | 🆕 本轮                                | cf-threshold-priority.spec.ts                                                                         |
| CF-07  | 规则列表随保存增长并展示 priority               | 存两规则后重开对话框                                               | cf-rule-list 两条 li，data-rule-kind 正确、文本含 priority                         | 🆕 本轮                                | cf-threshold-priority.spec.ts                                                                         |
| CF-08  | 工具栏新规则入口 remove 禁用                    | 打开对话框查 remove                                                | cf-remove-button disabled，直到选中持久化规则                                      | 🆕 本轮                                | cf-threshold-priority.spec.ts                                                                         |
| CF-09  | 重开水合后删除规则                              | B2 保存规则 → 重开 → 选列表项 → 删除                               | 已持久化规则出现、删除可用、样式移除                                               | 🆕 本轮                                | cf-threshold-priority.spec.ts                                                                         |
| CF-10A | Color Scale 完整范围色阶                        | 窗口内读完整规则范围的一段                                         | 中间值按 min/mid/max 插值为 `bgColor`                                              | ✅ UI-558                              | `ae2ea68`；vnext-conditional-format-wasm #"projects a Color Scale from the full canonical rule range" |
| CF-10B | Data Bar 完整范围长度条                         | Worker 选区保存 data-bar → 滚动/冻结/编辑                          | TS/WASM 比例一致；bar `aria-hidden`、`pointer-events:none`、文本和编辑仍可用       | ✅ UI-557                              | data-bar-projection.spec.ts                                                                           |
| CF-11  | 规则参数编辑                                    | 选择已持久化规则 → 修改 condition/operator/value/background → 保存 | 草稿从持久化规则水合；保存为原地更新非追加；投影实时翻转并落新背景色               | ✅ UI-556B                             | rule-param-edit.spec.ts（TS/WASM）；组件验证 `cb18c4e` vnext-conditional-format-editor.test.tsx       |
| CF-12  | Top/Bottom 完整范围排名                         | Worker 选区保存 Top count 与 Bottom percent → 编辑/滚动/冻结       | 有限数值按完整范围排名；同值 row/col 稳定裁决；priority 首命中；TS/WASM 同步       | ✅ 本轮                                | top-bottom-projection.spec.ts                                                                         |

## 备注

- CF-01 至 CF-09 跑 Wave5 静态 demo；CF-10B 额外跑真实 TS/WASM Worker，
  两端都验证 Data Bar 的只读 Grid 投影。
- CF-06 的 fall-through 构造：cell-value `gt 0` 对 -8 失配，而 color-scale 只要求
  数值（numericValue !== null）→ 次序生效可被唯一区分。
- Data Bar 为避免 adapter sidecar，每次相关 read 都从完整 canonical rule range 读取有限
  numericValue 求域；超大/整表范围会带来全范围读取与扫描成本，后续若要优化应由引擎提供
  canonical 聚合投影，不能改为 UI 本地缓存。
- Top/Bottom 同样在每次相关 read 扫描完整 canonical rule range 的有限 `numericValue`；percent
  取 `ceil(数量 × 百分比 / 100)`，同值按 source row、再 source column 截断。全范围读取/排序是
  明确的性能残余，后续应由引擎提供 canonical 排名投影，不能改为 UI 本地缓存。
- CF-11 的已完成状态仅指 Atom/editor 与组件测试；它不等同于浏览器 E2E 验收，后者应作为
  独立叶子排期。
