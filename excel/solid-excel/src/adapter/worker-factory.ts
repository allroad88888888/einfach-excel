import type { WorkerLike } from './worker-protocol'

/**
 * WASM worker 的默认 factory —— 固定 spawn **lite** 入口
 * (`./worker-runtime.ts` → `wasm-pkg/`)。
 *
 * 这里**刻意**不提供 full 的孪生 factory：Vite 会静态分析
 * `new Worker(new URL('./x', import.meta.url))` 并在构建期解析 `x`，一旦本文件
 * 提到 `./worker-runtime-full.ts`，每个只想要 lite 的消费者都会被拽去解析
 * `wasm-pkg-full/` —— 那是个 gitignore 且默认不构建的目录，于是 full 变成构建期
 * 必需产物。所以两个薄入口都是叶子，**由宿主自己 import**：
 *
 * ```ts
 * // 宿主侧（Vite）：?worker 让打包器只在这里把 full 入口拉进图
 * import FullWorkbookWorker from '@einfach/solid-excel/vnext-worker-runtime-full?worker'
 * createWorkerWorkbookSpreadsheetBackend({ workerFactory: () => new FullWorkbookWorker() })
 * ```
 *
 * 用自建 wasm-pack 产物的宿主则自己写三行入口，import
 * `@einfach/solid-excel/vnext-worker-runtime-core` 的 `installWorkerRuntime(wasm)`。
 * 选型与语义差异见 `excel/rust/wasm/README.md` §「怎么选 full」。
 */
export const defaultVNextWorkbookWorkerFactory = (): WorkerLike =>
  new Worker(new URL('./worker-runtime.ts', import.meta.url), {
    type: 'module',
  }) as unknown as WorkerLike

/**
 * Wave D — factory for the TypeScript-backed worker engine. Spawns the
 * dedicated `worker-entry-ts.ts` bundle (which delegates to
 * `worker-runtime-ts.ts`). The wire protocol is identical to the WASM
 * factory above, so the same `createWorkerWorkbookSpreadsheetBackend`
 * shim can drive either backend — the demo just swaps which factory
 * gets passed in.
 */
export const defaultExcelCoreTsWorkerFactory = (): WorkerLike =>
  new Worker(new URL('./worker-entry-ts.ts', import.meta.url), {
    type: 'module',
  }) as unknown as WorkerLike
