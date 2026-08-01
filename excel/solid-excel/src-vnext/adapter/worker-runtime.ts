/// <reference lib="WebWorker" />

import * as wasm from '../../wasm-pkg/einfach_wasm.js'
import { installWorkerRuntime } from './worker-runtime-core'

/**
 * WASM worker 的 **lite 入口** —— 现役默认路径，静态 import `wasm-pkg/`
 * （`wasm-pack build` 不带 feature 出的那份，REGEX* 求值为 `#NAME?`）。
 *
 * 这个文件是一片**叶子**：`worker-factory.ts`、`./index.ts` 和任何 barrel 都不
 * 引用 `wasm-pkg-full/`，所以只想要 lite 的消费者不会被拽去构建 2.5 MB 的 full。
 * 想换 full 的宿主自己 import `./worker-runtime-full`（或照它写一个入口，喂进
 * 自建的 wasm-pack 产物），见 `excel/rust/wasm/README.md` §「怎么选 full」。
 *
 * dispatcher 本身住在 `./worker-runtime-core`；这里只做"选哪份 wasm"。下面的
 * 转出口保持历史导入路径不变 —— 测试一直从 `worker-runtime` 取这些符号。
 */

export { installWorkerRuntime } from './worker-runtime-core'
export {
  MAX_IMPORT_CHUNK_CELLS,
  MAX_IMPORT_SESSION_FINAL_TOUCHES,
  MAX_IMPORT_SESSION_ISSUES,
  MAX_IMPORT_SESSION_NORMALIZED_CELLS,
  __resetImportLimitsForTest,
  __setImportLimitsForTest,
  normalizeImportCells,
} from './worker-import-normalize'
export { mergeImportStats, mergeImportStatsIssues } from './worker-import-stats'

installWorkerRuntime(wasm)
