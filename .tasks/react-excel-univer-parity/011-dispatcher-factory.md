---
id: "011"
title: 组装 Rust dispatcher 与 Worker factory
kind: leaf
parent: M0
depends_on: ["004", "007", "008", "009", "010"]
discovered_from: null
model: gpt-5.6-sol
status: pending
created: 2026-09-01
done: null
base: null
priority: P0
stage: M0
coverage: ["C01b", "C01c", "C01d1", "C01e1", "C01f"]
files:
  - excel/excel-worker/src/runtime/dispatcher.ts
  - excel/excel-worker/src/runtime/rpc-reply.ts
  - excel/excel-worker/src/worker-runtime.ts
  - excel/excel-worker/src/wasm-worker-factory.ts
  - excel/excel-worker/test/dispatcher-factory.test.ts
  - .tasks/react-excel-univer-parity/reports/011-report.md
---

# 组装 Rust dispatcher 与 Worker factory

## 目标与粒度

组装唯一 async message loop、lite WASM entry 与 module Worker factory。预计 15–20 分钟；本叶是 runtime integration gate。

## 行为

dispatcher 依 index `RustCommandHandler` 顺序调用 task 007–010；一个 handled→dispatcher 发 success，0→UNKNOWN_COMMAND，handler throw→structured failure。
handler 永不自行 reply。`worker-runtime.ts` 静态 import `@einfach/excel-wasm`，逐字执行
`const context = await createRuntimeWorkbookContext(wasm)` 后才 install 一次。factory 导出
`createDefaultRustWorkerFactory(): WorkerFactory`，URL 精确 `./worker-runtime.ts`、type module，无 fallback。

## 验收

- `pnpm exec jest excel/excel-worker/test/dispatcher-factory.test.ts --runInBand --no-coverage` 覆盖八 command↔handler exact set、unknown、throw、single install、URL。
- 所有 runtime producer 已完成后运行 `pnpm exec tsc -p excel/excel-worker/tsconfig.json --noEmit --pretty false`。
- Rust-only scan 通过；四实现文件均 ≤300 行。

写 `reports/011-report.md`；不提交。
