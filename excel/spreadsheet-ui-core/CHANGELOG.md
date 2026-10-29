# @einfach-excel/spreadsheet-ui-core

## 0.2.0

### Minor Changes

- 9622ccd: 删除 UI Core 中没有消费者的缩放和视图模式状态。

  **移除（breaking）**

  - `@einfach-excel/spreadsheet-ui-core`：`zoomLevelAtom`、`setZoomLevelAtom`、`resetZoomLevelAtom`、
    `snapZoomToPreset`、`ZOOM_LEVEL_PRESETS/MIN/MAX/DEFAULT`、`viewModeAtom`、`setViewModeAtom`、
    `StatusBarViewMode`。网格与打印从不读它们 —— 点击只会改一个没人看的数字。菜单栏的
    `view.zoomIn/zoomOut/zoomReset` 三条命令（其 dispatch 分支本来就是空实现）一并删除。

- dcc7ebc: 提供浏览器 React 18 ESM 工作簿包，包含隔离样式、实例语言、模块 Worker 与预编译 WASM。
  同一 Einfach Store 上公开 typed 原始值读取、原子批量写入、真实成功修改通知和宿主交互控制。
  React 的 UI Core peer 最低为提供这些接口的 0.2.0；旧 0.1.0 不包含本轮契约。

### Patch Changes

- Updated dependencies [dcc7ebc]
  - @einfach-excel/excel-wasm@0.2.0
