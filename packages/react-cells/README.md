# @einfach/react-cells

从 React Excel 提取的单元格显示包。普通格、合并格、格式与共边、数据条、筛选入口和选区轮廓在本包中；读取现有 UI Core atoms，复用宿主的 `@einfach/react` Provider。

依赖方向：`react-excel → react-cells → spreadsheet-ui-core`。本包不依赖 React Excel 的源码，不创建工作簿 store，不拥有滚动容器、冻结布局、编辑器、Worker 或选择命令。冻结窗格分别调用同一个渲染组件。现有 `data-cell` 坐标与 DOM 事件委托约定保持不变。

```tsx
import { SpreadsheetGrid, MergedCells } from '@einfach/react-cells'
import '@einfach/react-cells/style.css'

// 置于已有 Atom Provider 内；window/cells 来自同一份可见投影。
<div className="grid-surface">
  <SpreadsheetGrid window={window} cells={cells} mergedRanges={mergedRanges}
    rowHeights={rowHeights} columnWidths={columnWidths} />
  <MergedCells window={window} anchors={mergeAnchors} />
</div>
```

`SpreadsheetGrid` 接口保留 `window`、`cells`、`mergedRanges`、`selected`、`rowHeights`、`columnWidths`。筛选、公式显示、引用拾取及多选区仍由共享 atoms 提供；因此它是工作簿 cell 渲染包，并非任意数据的无状态 table 组件。

样式入口包含普通格、合并格、筛选按钮、数据条和选区。宿主提供 `.grid-surface` 的定位与 `--grid-window-width`，以及 `--surface`、`--text`、`--gridline`、`--primary`、`--muted`、`--border` 主题变量。发布构建需要显式引入 `style.css`；仓库 Vite 源码别名通过包入口自动加载样式。

默认行高 28、列宽 120 从本包导出，宿主视口配置引用同一份默认值。显示层不保存新的状态副本，保留原来的 React 更新方式。宿主的 `CellRenderer` 可通过 `?renderer=canvas` 切到 `@einfach/canvas-cells`；两个渲染包均不依赖对方。

宿主通过 UI Core 的 `getBufferedProjectionWindow` 为两种渲染器共用按屏分块的缓冲窗口，在屏边界提前请求相邻数据，避免每滚动一行就重新请求 Worker。保留投影始终位于真实单元格坐标；跨越整个缓冲范围的跳转仍需等待新投影。缓冲会增加当前挂载的 DOM 数量，不代表 React 绘制成本消失。

```sh
pnpm --filter @einfach/react-cells test
pnpm --filter @einfach/react-cells typecheck
pnpm --filter @einfach/react-cells build
```

包内测试覆盖格式转换、共享边框、数据条、选区几何。合并格、筛选交互与冻结窗口的集成测试仍在 `react-excel`，通过公开包入口运行。构建使用 UI Core 的声明产物；若尚未生成，先运行 `tsc -b excel/spreadsheet-ui-core`。
