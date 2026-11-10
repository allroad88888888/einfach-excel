# @einfach-excel/excel-wasm

## 0.3.0

### Minor Changes

- 88501e1: Add `createWorkbookApi(store)` for explicit worksheet/range operations, navigation, editing,
  native history, before-change cancellation, and interaction subscriptions. Preserve native
  commit outcomes, worksheet identities, navigation, and unrelated geometry during API updates.

  Add stable ribbon item visibility controls, configurable row/column header dimensions,
  and clipped Canvas cell painting hooks to the React spreadsheet.

  Add host highlights, pixel visibility queries, formula dialog controls, and nested draw/calculation
  suspension. Add native rich text runs with history and content movement, a segment editor,
  DOM/Canvas rendering, and native-file/XLSX round trips.

  Keep plain cell text on the direct rendering path and reserve a bounded six-screen
  vertical projection buffer so coalesced wheel input does not outrun painted cells.

## 0.2.0

### Minor Changes

- dcc7ebc: 提供浏览器 React 18 ESM 工作簿包，包含隔离样式、实例语言、模块 Worker 与预编译 WASM。
  同一 Einfach Store 上公开 typed 原始值读取、原子批量写入、真实成功修改通知和宿主交互控制。
  React 的 UI Core peer 最低为提供这些接口的 0.2.0；旧 0.1.0 不包含本轮契约。
