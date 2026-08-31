// 一句话：静态内存参考后端的模块入口，只把 `static/` 下的公开面重新导出。
//
// 实现按契约（`excel/spreadsheet-ui-core/src/backend/types.ts`）的可选端口分族
// 落在 `static/` 目录里：`static/ports/*` 是一族端口的请求/ACK 适配，其余模块是
// 它们共用的状态操作。此文件保持原有 import 路径不变，不再承载实现。

export type { StaticSpreadsheetBackend } from './static/backend-contract'
export { createStaticSpreadsheetBackend } from './static/backend'
export {
  matrixToDisplayCells,
  matrixToRangeProjectionResult,
  matrixToVisibleProjectionResult,
  sparseCellsToDisplayCells,
  sparseCellsToRangeProjectionResult,
  sparseCellsToVisibleProjectionResult,
} from './static/seed-projection'
