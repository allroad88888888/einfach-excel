# Grid 框架可移植性边界

状态：当前源码分类（AD-312）

本文按当前 `excel/solid-excel/src-vnext/grid` 源码划分 Grid 的可移植边界。
它只说明哪些既有逻辑可作为框架中立计算被复用，哪些逻辑仍须由框架适配层
持有；不移动任何代码，也不选择未来共享代码的归属位置。

## 依据与判定规则

本分类以 AD-311 的两份完整 Solid 耦合清单为事实基线：
`docs/interaction-execution/AD-311-solid-coupling-audit.md` 登记了 Grid 的
TypeScript 耦合，`AD-311-solid-coupling-audit-tsx.md` 登记了所有 Grid TSX
声明。前者明确列出 `grid-dom-adapter.ts`、`grid-lifecycle.ts` 与
`grid-projection-controller.ts` 的 Signal、生命周期和 effect 耦合；后者将
Grid 的 TSX 渲染面归为当前 Solid 专属。

以下“可下沉”只表示该逻辑的输入、输出与执行不需要 Solid、组件生命周期或
浏览器元素引用。它不是本次迁移授权，也不表示这些文件应进入某个既定包。

- 纯几何、滚动锚定、范围布局和数据到样式的确定性映射可作为框架中立候选。
- `HTMLElement`/`document`/`window` 访问、DOM ref、原生事件监听和焦点恢复
  留在框架侧。
- `createSignal`、`createEffect`、`onMount`、`onCleanup`、Solid JSX 和
  `@einfach/solid` atom hook 留在 Solid 侧；其他框架各自提供等价桥接。
- 仅仅没有 `solid-js` import 不足以判定为共享代码。若模块仍依赖当前组合
  runtime、atom reader 或浏览器事件生命周期，则本轮不下沉。

## 可作为框架中立候选的纯计算

| 当前模块                | 当前可复用的职责                         | 边界                                              |
| ----------------------- | ---------------------------------------- | ------------------------------------------------- |
| `axis-geometry.ts`      | 行列偏移、跨度与像素位置到索引的换算     | 全部为数值、覆盖尺寸和隐藏集合计算。              |
| `scroll-anchor.ts`      | 逻辑滚动位置与有限物理滚动表面的锚定计划 | 不读取 DOM；调用者自行写入滚动元素。              |
| `scroll-placement.ts`   | 将锚定计划吸附到行列边界                 | 只组合锚定几何与注入的吸附函数。                  |
| `grid-freeze-layout.ts` | 冻结行列的 sticky 偏移与边界样式         | 只消费几何 reader；返回 CSS 值对象。              |
| `grid-merge-layout.ts`  | 合并单元格的范围、跨度与盒尺寸           | 只消费投影数据与尺寸 reader。                     |
| `overlayGeometry.ts`    | 范围到覆盖层矩形的裁剪与计算             | 不负责 Canvas、SVG 或渲染更新。                   |
| `cell-format.ts`        | 单元格格式到样式/属性的确定性映射        | 仅依赖 UI-core 数据类型，不依赖任一框架渲染类型。 |
| `grid-constants.ts`     | 列标签、地址、窗口索引和范围判断         | `CellRange` 是数据类型依赖，不是框架依赖。        |

`grid-layout.ts` 调用上述计算，但该安装器本身读取 atom-backed reader、投影
状态和 `dom.rowAnchorPx`/`dom.colAnchorPx`；因此它不能整体下沉。未来若要抽取
其中更多算式，应保持输入为值或显式 reader，不能把当前 runtime 一起带走。

`grid-outline-scroll-anchor.ts` 的“行列首项 + 像素偏移”算法可继续复用
`axis-geometry.ts`，但其恢复步骤会写 atom、同步滚动元素并请求投影，当前整体
留在适配层。`grid-auto-fit.ts` 中的 `clampDimension` 是纯数值函数；文件其余
测量流程读取 `window`、`document`、`HTMLElement` 和计算样式，当前不作为可
下沉模块。

## 必须保留在框架适配层的 DOM 与生命周期面

| 当前模块                                    | 必须由适配层持有的原因                                                                  |
| ------------------------------------------- | --------------------------------------------------------------------------------------- |
| `grid-dom-adapter.ts`                       | 保存 grid/scroll DOM ref 与锚点，并以 Solid signal 让它们参与当前渲染图。               |
| `grid-lifecycle.ts`                         | `onMount`/`onCleanup` 负责 ResizeObserver、订阅和交互取消的所有权。                     |
| `grid-projection-controller.ts`             | `createEffect`/`untrack` 订阅几何事实，且直接读写 scroll 元素。纯锚定计算已由上表分离。 |
| `focus-grid-active-descendant.ts`           | 查询并写入渲染出的单元格元素与 ARIA 属性。                                              |
| `focus-grid-tab-boundary.ts`                | 根据原生键盘事件目标和浏览器焦点行为决定是否放行 Tab。                                  |
| `grid-auto-fit.ts`                          | 除 `clampDimension` 外，创建测量节点并读取浏览器布局。                                  |
| `grid-drag-selection-pointer-session.ts`    | 管理原生 pointer capture、window/document 监听器及终止清理。                            |
| `grid-fill-pointer-session.ts`              | 管理填充拖拽的原生 pointer capture、监听器及终止清理。                                  |
| `grid-formula-reference-pointer-session.ts` | 同时管理原生 pointer 生命周期、atom 命令与编辑器焦点恢复。                              |
| `grid-formula-reference-focus.ts`           | 读取活动 DOM 元素，并在微任务中恢复 input 焦点与选区。                                  |
| `grid-resize-controller.ts`                 | 以原生 pointer 流、元素测量与取消器协调行列缩放。                                       |
| `grid-fill-handle.ts`                       | 从 Grid runtime 接入填充交互并启动原生 pointer 会话。                                   |
| `grid-pointer-selection.ts`                 | 从 Grid runtime 接入选区交互与原生 pointer 会话。                                       |
| `grid-outline-scroll-anchor.ts`             | 恢复锚点时写 atom、同步滚动元素并刷新投影。                                             |

这些模块可以在 React/Vue 中有行为等价物，但必须由各自框架拥有 ref 赋值、
挂载卸载、浏览器资源清理和事件形态的适配职责。

## 必须保留在 Solid 侧的订阅与渲染面

`grid-atom-accessors.ts` 使用 `@einfach/solid` 的 `useAtomValue`，为当前
Grid 提供 Solid reader；不得把该 hook 或其返回值当作跨框架共享契约。
`SpreadsheetGrid.tsx` 以 Solid `createEffect` 建立 hydration，并组装全部当前
runtime 安装器；其组合根也留在 Solid 侧。

以下 13 个组件文件属于 Solid JSX 渲染面，按 AD-311 的 TSX 清单保持在适配层：

- `SpreadsheetCellBorders.tsx`、`SpreadsheetCellDisplayValue.tsx`、
  `SpreadsheetGridCell.tsx`、`SpreadsheetGridCellEditor.tsx`；
- `SpreadsheetGridDataBar.tsx`、`SpreadsheetGridDataRow.tsx`、
  `SpreadsheetGridFormatPainterCursor.tsx`、`SpreadsheetGridOutline.tsx`；
- `SpreadsheetGridOverlay.tsx`、`SpreadsheetGridOverlaySvg.tsx`、
  `SpreadsheetGridTable.tsx`、`SpreadsheetGridView.tsx`；
- `SpreadsheetLockedEditFeedback.tsx`。

它们包含 Solid 的 `For`/`Show`、memo/effect、清理、渲染节点或
`@einfach/solid` hook。即使某个组件调用了上表的纯计算，它仍需由 React/Vue
各自渲染并订阅自身状态模型。

## 当前不下沉的组合与命令安装器

下列非 TSX 模块没有因“未 import Solid”而自动成为共享层。它们以当前
`GridRuntime` 组合 store、backend、atom reader、命令、投影或浏览器事件；是否
提取其可重用命令部分，要先有独立的共享归属与生命周期契约。

- `grid-auto-fit-controller.ts`、`grid-clipboard.ts`、`grid-context-menu.ts`、
  `grid-edit-navigation.ts`、`grid-editing-controller.ts`、`grid-fill-controller.ts`；
- `grid-format-controller.ts`、`grid-formula-reference-keyboard.ts`、
  `grid-keyboard-controller.ts`、`grid-outline-state.ts`、`grid-overlay-controller.ts`、
  `grid-selection.ts`、`grid-view-state.ts`；
- `grid-layout.ts`、`grid-runtime-ports.ts`、`grid-runtime.ts`、`index.ts`。

其中 `grid-runtime-ports.ts` 仍含 `HTMLElement` 形式的 merge anchor，
`grid-runtime.ts` 直接引用 Solid Grid props、atom accessors 和 DOM adapter。
这两项特别不能作为当前跨框架 contract。`index.ts` 没有独立行为，不构成迁移
目标。

## 后续叶子的边界

AD-315 决定上表纯计算与未来命令抽取的共享归属，并保持 UI-core 不 import DOM；
本文不做该裁决。AD-316 才能在获批归属下移动代码并回归 Solid 消费者。AD-320
另行定义 headless 的订阅、投影、命令与 DOM 测量生命周期，不能从本分类推导。

本文不实现或承诺 React（AD-330）或 Vue（AD-360）适配，也不表示任何适配包
已可安装、兼容、排期或受支持。
