/// <reference lib="WebWorker" />

import * as wasm from '../../wasm-pkg-full/einfach_wasm.js'
import { installWorkerRuntime } from './worker-runtime-core'

/**
 * WASM worker 的 **full 入口** —— 与 `./worker-runtime.ts` 同一个 dispatcher，
 * 只是静态 import `wasm-pkg-full/`（`--features regex-formulas` 出的那份，
 * REGEX* 三个内建可用，代价是 raw +915 KB / gzip +304 KB）。
 *
 * `wasm-pkg-full/` 是 gitignore 的、默认不构建的目录，所以这个文件必须是一片
 * **叶子**：库里没有任何 barrel、factory 或 index 引用它，只有显式选了 full 的
 * 宿主才会把它拉进构建图，也才需要先跑
 * `npm run build:wasm:full -w @einfach/solid-excel`。
 * 类型检查侧的兜底见 `./wasm-pkg-full-fallback.d.ts`。
 *
 * 语义差异（不只是"多三个函数"：同名的 LAMBDA / 宿主自定义公式在 full 下会被
 * 内建遮蔽）见 `excel/rust/wasm/README.md` §「语义差异」。
 */

installWorkerRuntime(wasm)
