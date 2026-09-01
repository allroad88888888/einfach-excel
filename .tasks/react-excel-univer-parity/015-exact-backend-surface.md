---
id: "015"
title: 组装 exact backend public surface
kind: leaf
parent: M0
depends_on: ["013", "014"]
discovered_from: null
model: gpt-5.6-sol
status: pending
created: 2026-09-01
done: null
base: null
priority: P0
stage: M0
coverage: ["C01a", "C01b", "C01c", "C01d2", "C01e2", "C01f", "C01g"]
files:
  - excel/excel-worker/src/backend.ts
  - excel/excel-worker/src/index.ts
  - excel/excel-worker/package.json
  - excel/excel-worker/test/exact-backend-surface.test.ts
  - .tasks/react-excel-univer-parity/reports/015-report.md
---

# 组装 exact backend public surface

## 目标与粒度

产出 index `RustWorkerSpreadsheetBackend` 与 private source exports。预计 10–15 分钟；本叶是 backend integration gate。

## surface

`createRustWorkerSpreadsheetBackend(options)` 只创建一个 session 与一个 cell-input port 实例（因此全 backend 共用其 mutation lane），Reflect.ownKeys 恰为六项 index allowlist。
另导出 `seedRustDemoWorkbook(client,cells): Promise<RustSeedStatsWire>`，只供 `afterInit`，不挂 backend。
root 导出 backend/client/types/WorkerLike 与 task003 `toImportCellWire`；`./wasm-worker-factory` 单独 source subpath，root import 不创建 Worker。package 仍 private，无 Solid dependency。

## 验收

- `pnpm exec jest excel/excel-worker/test/exact-backend-surface.test.ts --runInBand --no-coverage` 断言 exact own keys、seed 非 backend key、root zero Worker side effect。
- backend producers 全完成后 `pnpm exec tsc -p excel/excel-worker/tsconfig.json --noEmit --pretty false` 与 Rust-only scan 通过。
- 文件均 ≤300 行。

写 `reports/015-report.md`；不提交。
