# 编辑框架可移植性边界

状态：当前源码分类（AD-313）

## 目的与判定规则

本文只标注当前编辑机制的可移植性边界。它不移动代码，不改变包，不指定共享层归属，不定义无头挂载，也不实现其他框架。

“框架中立候选”指当前机制的规则或状态契约不读取 Solid、JSX、浏览器 DOM、原生事件对象或挂载清理；候选不代表当前文件已迁移或已被指定给某个层。“框架拥有”指职责必须接住原生事件、元素引用、焦点和光标、浏览器监听器生命周期或 Solid 渲染生命周期。没有 `solid-js` 导入本身不足以判为中立。

本分类承接已验收的 AD-311 Solid 耦合审计与 AD-312 网格可移植性边界；两者的当前适配器保留结论不因本文改变。

## 框架中立候选

| 编辑机制                   | 当前源码证据                                                                                                                                                       | 分类理由                                                                                   | 当前边界                                                                            |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| 编辑会话、草稿、提交状态机 | `excel/spreadsheet-ui-core/src/editing/session-domain.ts`；`session-atoms.ts`；`run-commit.ts`；`retry-refresh.ts`；`reconcile-commit.ts`                          | 用 `@einfach/core` Atom 表示开始、草稿、提交、超时、确认和取消，没有 DOM 或 Solid 读取。   | 状态机与命令参数是候选；输入框怎样触发命令不在此列。                                |
| 编辑突变授权与锁定反馈     | `excel/spreadsheet-ui-core/src/editing/mutation-gateway.ts:37–190`；`excel/spreadsheet-ui-core/src/editing/locked-edit-feedback.ts:12–171`                         | 解析内容突变目标、保护结果和可读反馈状态只依赖数据契约与 Atom。                            | 表面怎样呈现锁定反馈仍由其渲染框架拥有。                                            |
| 编辑数据契约               | `excel/spreadsheet-ui-core/src/editing/types.ts`                                                                                                                   | 编辑输入、提交端口、生命周期结果是数据类型，不绑定元素或生命周期。                         | 本文不规定任何跨包导出面。                                                          |
| 公式引用的文本规则与会话   | `excel/spreadsheet-ui-core/src/formula-reference/index.ts:34–204`；`excel/spreadsheet-ui-core/src/formula-reference/parser.ts:1–103`；`formula-reference/types.ts` | A1 引用序列化、草稿拼接、引用 token 解析、插入光标和选取状态都以字符串、坐标和 Atom 表达。 | 点击格子、恢复输入框焦点和选择范围不是这些规则的一部分。                            |
| 键盘意图归一化             | `excel/spreadsheet-ui-core/src/keyboard/index.ts:20–104`；`excel/spreadsheet-ui-core/src/keyboard/keyboard-movement.ts:24–124`；`keyboard/types.ts`                | 输入为普通 `KeyboardInput` 字段，输出为编辑或选区意图；移动计算没有浏览器对象。            | 原生 `KeyboardEvent` 的过滤和 `preventDefault()` 留在框架拥有一侧。                 |
| 投影中的可编辑源文本查询   | `excel/spreadsheet-ui-core/src/projection/editable-source-text.ts:4–22`                                                                                            | 只从投影、坐标和活动 sheet 得出文本，不读取 DOM 或 Solid。                                 | 已下沉到 UI-core；Solid 公式栏只消费该查询结果。                                    |
| 提交结果到反馈文案的映射   | `excel/spreadsheet-ui-core/src/editing/commit-feedback.ts:3–48`                                                                                                    | 仅把 Core 生命周期状态映射为普通反馈数据。                                                 | 已下沉到 UI-core；`SpreadsheetEditingCommitFeedback.tsx` 的订阅和渲染仍是框架职责。 |
| 公式引用箭头选取规则       | `excel/spreadsheet-ui-core/src/formula-reference/arrow-pick.ts:5–22`                                                                                               | 函数只读写 Core Store 中的公式引用会话，并把已解析的行列增量写回 Atom。                    | 已下沉到 UI-core；框架层只把原生键盘事件归一化为 intent。                           |

`excel/solid-excel/src/provider/edit-dispatch.ts` 也不读取 Solid 或 DOM：它只把 Core 编辑命令接到显式 `Store`、后端和投影刷新参数。后端 replay 能力检查与历史时间线投影已由 UI-core 命令负责；该文件当前仍使用 Solid provider 目录中的组合依赖，本文不据此改变 AD-312 的现有适配器边界。

## 框架拥有的 DOM、Solid 与生命周期职责

| 编辑机制                           | 当前源码证据                                                                                                                           | 必须留在框架拥有一侧的原因                                                                                        |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| 单元格编辑器 UI                    | `excel/solid-excel/src/grid/SpreadsheetGridCellEditor.tsx`                                                                             | `Show` 控制 JSX，输入元素 ref 负责 `focus()` 和 `setSelectionRange()`，并处理输入、组合、键盘和失焦事件。         |
| 公式栏 UI                          | `excel/solid-excel/src/formula-bar/SpreadsheetFormulaBar.tsx`；`formula-bar/formula-bar-keys.ts`                                       | Solid effect/memo/cleanup 同步显示；原生键盘事件决定阻止默认行为、焦点转移和光标写回。                            |
| 函数补全 UI                        | `excel/solid-excel/src/formula-autocomplete/SpreadsheetFormulaAutocomplete.tsx`；`formula-autocomplete/formula-autocomplete-anchor.ts` | 组件拥有 Solid 响应式状态、挂载清理、文档/窗口事件、元素 class、尺寸和定位。                                      |
| 公式引用的输入焦点恢复             | `excel/solid-excel/src/grid/grid-formula-reference-focus.ts`                                                                           | 直接检查 `HTMLInputElement`、排队微任务、调用 DOM 焦点和选择范围 API。                                            |
| 公式引用拖拽会话                   | `excel/solid-excel/src/grid/grid-formula-reference-pointer-session.ts`                                                                 | 负责 `PointerEvent`、pointer capture、`window`/`document` 监听器和可见性取消；Core 只持有引用选取状态。           |
| 进入编辑、提交后移动与网格键盘路由 | `excel/solid-excel/src/grid/grid-edit-navigation.ts`；`grid/grid-editing-controller.ts`；`grid/grid-keyboard-controller.ts`            | 这些安装器合并当前 GridRuntime、投影、后端、网格焦点和原生 `KeyboardEvent`；AD-312 已将其列为暂留适配器的组合器。 |
| 公式栏提交反馈订阅                 | `excel/solid-excel/src/formula-bar/formula-bar-commit-feedback.ts`；`feedback/SpreadsheetEditingCommitFeedback.tsx`                    | `useAtomValue` 与 JSX 是把中立生命周期反馈连接到 Solid 表面的职责。                                               |

## 证据覆盖核对

| 证据账本           | 已核对范围                                                                                                                                                                                   |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AD-311 非 TSX 审计 | `docs/interaction-execution/AD-311-solid-coupling-audit.md` 中的当前 Solid 适配器结论；编辑状态自身不在 Solid import 命中项中。                                                              |
| AD-311 TSX 账本    | `docs/interaction-execution/AD-311-solid-coupling-audit-tsx.md:50–51` 记录公式补全和公式栏；`:58` 记录 `SpreadsheetGridCellEditor.tsx`。                                                     |
| AD-312 网格边界    | `docs/FRAMEWORK_GRID_PORTABILITY_BOUNDARIES.md` 的纯规则候选、DOM/生命周期职责、当前不下沉的 `grid-edit-navigation.ts`、`grid-editing-controller.ts`、`grid-formula-reference-keyboard.ts`。 |
| 当前源码           | 上表逐项覆盖 Core 编辑、公式引用、键盘意图、公式栏文本/反馈、网格编辑器、网格命令安装器和公式引用输入会话。                                                                                  |

因此，本范围内未发现未分类的编辑状态规则或编辑表面职责。仅消费编辑派生状态、但不改变编辑会话或输入交互的组件不在本文机制范围。

## 留待后续议题的边界

- AD-315 决定任何候选的共享层归属；本文不作决定。
- AD-320 才处理无头挂载相关契约；本文不定义它。
- 其他框架的实现不在 AD-313 范围内。
