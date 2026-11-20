# @einfach-excel/react-excel

## 0.2.0

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

- 46dae03: Support React 19 alongside React 18.3, guard initial SSR rendering (`renderToString` without
  `window` or `Worker`), fix Rspack/LightningCSS root reset specificity and `box-sizing` parity, and
  widen `@einfach-excel/spreadsheet-ui-core` peer ranges for `0.x` evolution alongside the newly
  public `@einfach-excel/xlsx` and 11 `@einfach-excel/plugin-*` packages (`0.1.0`). Also add
  sub-second time and host `dateInputOrder` (`YMD`/`MDY`/`DMY`) parsing, internal workbook hyperlink
  navigation and sheet-rename retargeting, local `.csv`/`.tsv`/`.txt` file import in Text to Columns,
  remaining Go To Special locators (objects, same rules, all-level precedents/dependents), Copy As
  merge/filter fidelity, chart refresh hit-filtering / dark surface / element double-click targeting,
  and full XLSX round-trip fidelity for icon sets, threaded comments, internal links, sheet
  protection, outlines, sheet visibility/tab colors, and text rotation.

## 0.1.0

### Minor Changes

- dcc7ebc: 提供浏览器 React 18 ESM 工作簿包，包含隔离样式、实例语言、模块 Worker 与预编译 WASM。
  同一 Einfach Store 上公开 typed 原始值读取、原子批量写入、真实成功修改通知和宿主交互控制。
  React 的 UI Core peer 最低为提供这些接口的 0.2.0；旧 0.1.0 不包含本轮契约。

### Patch Changes

- Updated dependencies [9622ccd]
- Updated dependencies [dcc7ebc]
  - @einfach-excel/spreadsheet-ui-core@0.2.0
