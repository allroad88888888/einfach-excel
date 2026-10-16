# @einfach/spreadsheet-ui-core

## 0.2.0

### Minor Changes

- 9622ccd: 删除 UI Core 中没有消费者的缩放和视图模式状态。

  **移除（breaking）**

  - `@einfach/spreadsheet-ui-core`：`zoomLevelAtom`、`setZoomLevelAtom`、`resetZoomLevelAtom`、
    `snapZoomToPreset`、`ZOOM_LEVEL_PRESETS/MIN/MAX/DEFAULT`、`viewModeAtom`、`setViewModeAtom`、
    `StatusBarViewMode`。网格与打印从不读它们 —— 点击只会改一个没人看的数字。菜单栏的
    `view.zoomIn/zoomOut/zoomReset` 三条命令（其 dispatch 分支本来就是空实现）一并删除。

### Patch Changes

- @einfach/excel-wasm@0.2.0
