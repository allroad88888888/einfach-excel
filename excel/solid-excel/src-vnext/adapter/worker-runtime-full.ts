/// <reference lib="WebWorker" />

import * as wasm from '@einfach/excel-wasm/full'
import { installWorkerRuntime } from './worker-runtime-core'

/**
 * WASM worker 的 **full 入口** —— 与 `./worker-runtime.ts` 同一个 dispatcher，
 * 只是静态 import `@einfach/excel-wasm/full`（`--features regex-formulas` 出的那份，
 * REGEX* 三个内建可用，代价是 raw +915 KB / gzip +304 KB）。
 *
 * full 产物（`excel/excel-wasm/full/`）是 gitignore 的、默认不构建的目录，所以这个
 * 文件必须是一片**叶子**：库里没有任何 barrel、factory 或 index 引用它，只有显式选了
 * full 的宿主才会把它拉进构建图，也才需要先跑
 * `npm run build:wasm:full -w @einfach/excel-wasm`。
 * 类型检查侧的兜底见 `./excel-wasm-full-fallback.d.ts`。
 *
 * 语义差异（不只是"多三个函数"：同名的 LAMBDA / 宿主自定义公式在 full 下会被
 * 内建遮蔽）见 `excel/rust/wasm/README.md` §「语义差异」。
 */

installWorkerRuntime(wasm)
