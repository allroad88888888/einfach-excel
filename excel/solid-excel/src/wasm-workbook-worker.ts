/// <reference lib="WebWorker" />

import * as wasm from '../wasm-pkg/einfach_wasm.js'
import { installWorkerRuntime } from '../src-vnext/adapter/worker-runtime'

// 旧壳的 worker 入口：与 vnext 的 lite 入口共用同一个 dispatcher，也共用同一份
// `wasm-pkg/`。`installWorkerRuntime` 幂等 —— import `worker-runtime` 时它已经
// 装好了，这里的显式调用只是别让打包器把纯副作用的 import 摇掉。
installWorkerRuntime(wasm)

export * from '../src-vnext/adapter/worker-runtime'
