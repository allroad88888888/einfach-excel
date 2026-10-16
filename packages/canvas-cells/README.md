# @einfach/canvas-cells

工作簿的 Canvas cell 渲染包。依赖 `@einfach/canvas` 生命周期及 `@einfach/spreadsheet-ui-core` 的状态与显示协议，不依赖 React，也不创建 DOM cell。

真实工作簿入口：`http://127.0.0.1:5183/?renderer=canvas`。默认入口继续使用 React cells。React 宿主只挂载 Canvas、传入可见投影并负责卸载；普通区与冻结区均通过同一个 `CellRenderer` 选择后端。

```ts
import { createCanvasCells, canvasCellAt } from '@einfach/canvas-cells'

const view = createCanvasCells(canvas, {
  window: projection.window,
  cells: projection.cells,
  mergedRanges: projection.mergedRanges,
  mergeAnchors: projection.mergeAnchors,
  rowHeights,
  columnWidths,
}, { store, onFrame: ({ cells, elapsed }) => console.log(cells, elapsed) })

view.update(nextVisibleInput)
view.flush() // 可选：同步提交待绘制帧
const coord = canvasCellAt(canvas, event.clientX, event.clientY)
view.dispose()
```

`window/cells/mergedRanges/selected/rowHeights/columnWidths` 与 React cell 包的投影参数对应；新增 `mergeAnchors`，让一张画布同时绘制普通格及合并格。`interactive: false` 用于保留旧投影的加载阶段。宿主继续通过 UI Core commands 处理选择、键盘、双击编辑、剪贴板与拖动自动滚动；Canvas 的筛选按钮调用现有筛选 command。

- 宿主使用 `getCanvasProjectionWindow` 按屏分块预读前后区域，每个轴约四屏，块内滚动复用同一请求。画布投影通过 layout effect 同步绘制，避免位置更新后等待下一帧才补像素。
- 仅为传入的缓冲窗口保留 cell 和 atom 订阅。移出窗口或区域销毁时解绑，不缓存访问过的整张表。
- 同位置、同尺寸 cell 复用生命周期；显示值或外观变化通知自己的 atom，多次写入按帧合并。尺寸变化重新创建对应 cell。
- 行列前缀数组二分命中，跳过隐藏轴；少量合并范围用于还原锚点坐标。hover 只更新前后两格。
- 选区、引用拾取、公式显示、筛选和编辑状态在区域级直接订阅已有 atoms，再更新外观变化的 cell。选区变化仍需遍历当前可见 cell 比较外观，不代表零计算成本。
- 普通格与合并格均支持背景、字体、对齐、换行、旋转、下划线、删除线、数据条和边框。共边归属与 React 通过 UI Core 的 `createCellBorderResolver` 共用。
- 每个投影区域一张 Canvas，冻结区可能由多个可见区域组成。画布使用逻辑像素尺寸和 DPR；不会创建整张工作表大小的位图。

第一版边界：文字始终裁剪在 cell 内，未实现跨空白格溢出；`fill/justify/distributed` 暂按左对齐显示。逐格屏幕阅读器语义、逐个筛选按钮 Tab 导航未实现，筛选仍可从现有工具栏键盘进入。编辑器、行列标题及工作簿外壳继续使用宿主现有实现。尚未做真实老机器性能验证。

```sh
pnpm --filter @einfach/canvas build
pnpm exec tsc -b excel/spreadsheet-ui-core
pnpm exec rollup -c rollup.config.mjs
pnpm --filter @einfach/canvas-cells build
pnpm --filter @einfach/canvas-cells test
pnpm --filter @einfach/canvas-cells typecheck
pnpm --filter @einfach/react-excel dev
```

测试覆盖局部更新、订阅回收、隐藏尺寸、跨窗口合并与命中。真实工作簿浏览器测试覆盖绘制、hover、拖选、远距离导航、编辑撤销、冻结区和筛选入口。`onFrame.elapsed` 只统计同步 Canvas 绘制命令耗时，不包含浏览器合成。

快速滚动回归按帧检查画布覆盖及透明像素，包含正常 CPU 与 4 倍 CPU 降速。缓冲有界；跨越整块缓存的远距离跳转仍需要等待新的 Worker 投影，不会把旧行内容移到新坐标冒充结果。

显示画布通过 `viewport` / `setViewport(rect)` 与预取窗口分离：矩形使用投影窗口内的像素坐标，只有相交 cell 执行绘制，命中测试自动加回视口偏移。宿主直接响应原生滚动并同步提交画布位置与像素，冻结窗格使用自己的可见矩形。DPR 为 2 时，像素缓冲仍限制在视口宽高的两倍，不随预取屏数或合并格跨度扩大。

cell 使用稳定的工作表像素坐标；跨预取窗口保留重叠 cell 的 owner 和 atom 订阅，行列尺寸改变通过 `CanvasCell.setBounds` 更新命中与脏区域。宿主重复传入相同数据窗口和尺寸时复用布局，普通像素滚动不重建布局、边框或 cell 模型。
