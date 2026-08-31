// 一句话：worker RPC 参考后端的模块入口，只把 `worker/` 下的公开面重新导出。
//
// 实现按契约（`excel/spreadsheet-ui-core/src/backend/types.ts`）的可选端口分族
// 落在 `worker/` 目录里：`worker/ports/*` 是一族端口的请求/ACK 适配（含能力门控
// 的 getter），其余模块是它们共用的会话状态操作。此文件保持原有 import 路径不变，
// 不再承载实现。

export type {
  WorkerWorkbookBackendSheet,
  WorkerWorkbookBackendSheetInput,
  WorkerWorkbookSpreadsheetBackend,
  WorkerWorkbookSpreadsheetBackendOptions,
} from './worker/types'
export {
  FILTER_SORT_SOURCE_TOO_LARGE,
  MAX_AUTO_FILL_CELLS,
  MAX_FILTER_SORT_PREDICATE_CELLS,
  MAX_SORT_SOURCE_CELLS,
  PASTE_RANGE_FORMATS_UNSUPPORTED,
  WORKER_FILTER_SNAPSHOT_MAX,
  WORKER_STRUCTURAL_SNAPSHOT_MAX,
  WORKER_TABLE_FORMULA_SNAPSHOT_MAX,
  WORKER_TABLE_TOTALS_SNAPSHOT_MAX,
  WORKER_UNDO_STACK_CAP,
} from './worker/limits'
export { applyConditionalFormatOverlay } from './worker/conditional-format-overlay'
export { createWorkerWorkbookSpreadsheetBackend } from './worker/backend'
