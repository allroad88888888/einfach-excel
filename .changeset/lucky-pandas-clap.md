---
'@einfach/spreadsheet-ui-core': minor
'@einfach/solid-excel': minor
---

状态栏收窄为「选区地址 + 选区聚合 + 输入模式」三段，删除两条无消费者的假控件。

**移除（breaking）**

- `@einfach/spreadsheet-ui-core`：`zoomLevelAtom`、`setZoomLevelAtom`、`resetZoomLevelAtom`、
  `snapZoomToPreset`、`ZOOM_LEVEL_PRESETS/MIN/MAX/DEFAULT`、`viewModeAtom`、`setViewModeAtom`、
  `StatusBarViewMode`。网格与打印从不读它们 —— 点击只会改一个没人看的数字。菜单栏的
  `view.zoomIn/zoomOut/zoomReset` 三条命令（其 dispatch 分支本来就是空实现）一并删除。
- `@einfach/solid-excel`：状态栏的 `zoom` 与 `view-modes` 段；`SpreadsheetStatusBarSection`
  收窄为 `'selection' | 'aggregates' | 'mode-badge'`；`status-active-cell` 段移除 —— 单格选区下
  它与 `status-selection` 逐字相同，范围选区的活动单元格由名称框负责。

**迁移**

- 投影状态、可见格数、已加载值数、最后一条命令四个调试读数移到新组件
  `SpreadsheetDiagnosticsReadout`（`testid` 不变）。它刻意不带 `aria-live`：这些数字每滚一次
  就变，放进 live region 会让读屏把每次滚动都念一遍，也不并入 `SpreadsheetDiagnostics`
  那条 `role="log"` 通知流。

**新增**

- 聚合项改为右键状态栏聚合区弹出勾选菜单（Excel 口径）；未勾选的聚合项不再渲染只有标签的
  占位按钮。
