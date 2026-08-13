# 选区框架可移植性边界

状态：当前源码分类（AD-313）

## 目的与判定规则

本文只标注当前选区机制的可移植性边界。它不移动代码，不改变包，不指定共享层归属，不定义无头挂载，也不实现其他框架。

“框架中立候选”指当前机制的规则或状态契约不读取 Solid、JSX、浏览器 DOM、原生事件对象或挂载清理；候选不代表当前文件已迁移或已被指定给某个层。“框架拥有”指职责必须接住鼠标、键盘或指针事件，维护 pointer capture 或监听器，驱动 DOM 焦点和 ARIA，或者使用 Solid 渲染生命周期。没有 `solid-js` 导入本身不足以判为中立。

本分类承接已验收的 AD-311 Solid 耦合审计与 AD-312 网格可移植性边界；两者的当前适配器保留结论不因本文改变。

## 框架中立候选

| 选区机制                         | 当前源码证据                                                                                                                                        | 分类理由                                                                                                    | 当前边界                                                  |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| 选区形状、边界归一化和活动格计算 | `excel/spreadsheet-ui-core/src/selection/index.ts:24–233`；`selection/types.ts`                                                                     | 单元格、范围、行、列、全表、多区域的归一化、夹取、范围与活动格计算只使用坐标和数据类型。                    | 元素如何发起选区变更不在此列。                            |
| 选区写入权限和区域状态           | `excel/spreadsheet-ui-core/src/selection/index.ts:234–末尾`                                                                                         | 主选区、区域追加/清除、选择快照与写入收据由 `@einfach/core` Atom 持有，没有 DOM 或 Solid 读取。             | 本文不重新分配任何 Atom 的所属层。                        |
| 指针会话的状态模型和填充范围计算 | `excel/spreadsheet-ui-core/src/pointer/index.ts:1–末尾`；`pointer/types.ts`                                                                         | 拖拽选区、填充柄、调整大小和自动滚动的 session 数据及 `createFillHandlePreview` 等范围计算只有坐标和 Atom。 | 浏览器 pointer stream 的建立、取消和清理由表面处理。      |
| 键盘选区意图和移动计算           | `excel/spreadsheet-ui-core/src/keyboard/index.ts:40–104`；`excel/spreadsheet-ui-core/src/keyboard/keyboard-movement.ts:24–124`；`keyboard/types.ts` | 接受普通键盘字段，得到 `selection.move`、`selection.selectAll` 等意图，不依赖 `KeyboardEvent`。             | 网格表面判断事件目标和阻止浏览器默认行为不在此列。        |
| 公式引用中的选取模型             | `excel/spreadsheet-ui-core/src/formula-reference/index.ts:34–204`；`formula-reference/parser.ts:1–103`；`formula-reference/types.ts`                | 将单元格/范围选取编入草稿，维护锚点、焦点、token 和插入位置，只使用字符串、坐标和 Atom。                    | 指针命中测试与输入焦点恢复属于框架职责。                  |
| 选区覆盖层几何                   | `excel/solid-excel/src-vnext/grid/overlayGeometry.ts`；`grid/grid-constants.ts`                                                                     | 已由 AD-312 列为纯几何/常量候选；范围到覆盖层矩形的计算不读取 DOM、Canvas、SVG 或 Solid。                   | Canvas/SVG 节点创建、尺寸观测和绘制不在此列。             |
| 已解析的公式引用箭头选取         | `excel/solid-excel/src-vnext/grid/grid-formula-reference-keyboard.ts:9–28`                                                                          | 已得到的行列增量只转换为 Core `pickFormulaReferenceAtom` 写入。                                             | AD-312 仍将该当前组合器保留在适配器；本条不定义模块归属。 |

## 框架拥有的 DOM、Solid 与生命周期职责

| 选区机制                             | 当前源码证据                                                                                                                     | 必须留在框架拥有一侧的原因                                                                                                                                |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 网格选区安装器                       | `excel/solid-excel/src-vnext/grid/grid-selection.ts:32–249`                                                                      | 合并当前 GridRuntime、投影窗口、隐藏行列、合并单元格查找、`MouseEvent` 修饰键和网格焦点；其中的坐标组合不能脱离这些运行时输入单独视为当前模块的中立边界。 |
| 拖拽选区入口                         | `excel/solid-excel/src-vnext/grid/grid-pointer-selection.ts:22–94`                                                               | 接住 `PointerEvent`，调用 `preventDefault()`，读取 `document.activeElement`，取消既有 DOM 会话并恢复网格焦点。                                            |
| 拖拽选区的浏览器会话                 | `excel/solid-excel/src-vnext/grid/grid-drag-selection-pointer-session.ts:25–106`                                                 | 维护 pointer capture、`window`/`document` 监听器、blur/visibility 取消和清理。                                                                            |
| 公式引用拖拽和焦点恢复               | `excel/solid-excel/src-vnext/grid/grid-formula-reference-pointer-session.ts:27–129`；`grid/grid-formula-reference-focus.ts:4–22` | 维护浏览器指针流，调用 `HTMLInputElement.focus()` 与 `setSelectionRange()`。                                                                              |
| 网格键盘入口                         | `excel/solid-excel/src-vnext/grid/grid-keyboard-controller.ts:44–211`；`grid/grid-edit-navigation.ts`                            | 从 `KeyboardEvent` 过滤编辑目标，使用 `preventDefault()`，接入当前视口、后端、滚动和 GridRuntime；Core 只解析意图。                                       |
| 网格 ARIA 与 Tab 边界                | `excel/solid-excel/src-vnext/grid/focus-grid-active-descendant.ts:21–53`；`grid/focus-grid-tab-boundary.ts:22–50`                | 查询或修改 HTMLElement 属性，按浏览器原生 Tab 焦点行为和事件目标判断。                                                                                    |
| 单元格和视图事件表面                 | `excel/solid-excel/src-vnext/grid/SpreadsheetGridCell.tsx`；`grid/SpreadsheetGridView.tsx`                                       | Solid `Show`/effect 组织格子树和原生单元格、表面事件绑定。                                                                                                |
| Canvas/SVG 选区呈现                  | `excel/solid-excel/src-vnext/grid/SpreadsheetGridOverlay.tsx`；`grid/SpreadsheetGridOverlaySvg.tsx`                              | 分别拥有 Canvas 浏览器资源、Solid 信号/memo、`ResizeObserver`、挂载清理和图形节点渲染。                                                                   |
| 公式栏或单元格编辑器中的引用选取入口 | `excel/solid-excel/src-vnext/formula-bar/SpreadsheetFormulaBar.tsx`；`grid/SpreadsheetGridCellEditor.tsx`                        | 这些 UI 读取输入元素的 selection/caret，并把 DOM 事件交给中立公式引用命令。                                                                               |

## 证据覆盖核对

| 证据账本           | 已核对范围                                                                                                                                                                                                       |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AD-311 非 TSX 审计 | `docs/interaction-execution/AD-311-solid-coupling-audit.md` 中的 Grid DOM、生命周期和投影控制器结论与本表的表面职责一致。                                                                                        |
| AD-311 TSX 账本    | `docs/interaction-execution/AD-311-solid-coupling-audit-tsx.md:57–58` 记录网格单元格和编辑器；`:63–64` 记录 Canvas/SVG 覆盖层；`:66` 记录网格视图；`:51` 记录公式栏。                                            |
| AD-312 网格边界    | `docs/FRAMEWORK_GRID_PORTABILITY_BOUNDARIES.md` 的 `overlayGeometry.ts`、`grid-constants.ts` 纯候选结论，以及 `grid-selection.ts`、`grid-pointer-selection.ts`、`grid-edit-navigation.ts` 等当前组合器保留结论。 |
| 当前源码           | 上表逐项覆盖 Core selection/pointer/keyboard/formula-reference、GridRuntime 选区入口、两类指针会话、焦点/ARIA、键盘入口和两种覆盖层。                                                                            |

因此，本范围内未发现未分类的选区状态规则或选区表面职责。只消费选区快照、但不改变选区或处理用户输入的组件不在本文机制范围。

## 留待后续议题的边界

- AD-315 决定任何候选的共享层归属；本文不作决定。
- AD-320 才处理无头挂载相关契约；本文不定义它。
- 其他框架的实现不在 AD-313 范围内。
