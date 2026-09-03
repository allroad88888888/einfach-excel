// Framework-neutral public surface for the Rust Worker backend.

export type {
  WorkerWorkbookBackendSheet,
  WorkerWorkbookBackendSheetInput,
  WorkerWorkbookSpreadsheetBackend,
  WorkerWorkbookSpreadsheetBackendOptions,
} from './adapter/worker/types'
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
} from './adapter/worker/limits'
export { applyConditionalFormatOverlay } from './adapter/worker/conditional-format-overlay'
export { createWorkerWorkbookSpreadsheetBackend } from './adapter/worker/backend'
export * from './adapter/worker-protocol'
