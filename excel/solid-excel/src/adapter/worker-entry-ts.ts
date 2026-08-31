/// <reference lib="WebWorker" />

/**
 * Wave D — worker entry script for the TypeScript-backed engine.
 *
 * This file is the bundle target referenced by
 * `defaultExcelCoreTsWorkerFactory` (see `./worker-factory.ts`). It must
 * remain a thin shim: any logic lives in `worker-runtime-ts.ts`, which is
 * what jest tests import directly. The separate canonical WASM-lite worker is
 * the leaf entry `worker-runtime.ts`, bundled directly by the default WASM
 * factory in `./worker-factory.ts`.
 */

import { installWorkerRuntimeTs } from './worker-runtime-ts'

installWorkerRuntimeTs()

export {}
