---
id: "005"
title: 冻结最小 Rust WASM surface
kind: leaf
parent: M0
depends_on: ["003"]
discovered_from: null
model: gpt-5.6-sol
status: pending
created: 2026-09-01
done: null
base: null
priority: P0
stage: M0
coverage: ["C01c"]
files:
  - excel/excel-worker/src/runtime/wasm-surface.ts
  - excel/excel-worker/src/runtime/wasm-guards.ts
  - excel/excel-worker/test/wasm-surface.test.ts
  - .tasks/react-excel-univer-parity/reports/005-report.md
---

# 冻结最小 Rust WASM surface

## 目标与粒度

声明新 runtime 唯一可调用的 lite WASM binding 与 fail-closed guards。预计 10–15 分钟；无活 workbook 状态。

## 精确 surface

实现 index `RustWasmModule`/`RustWasmWorkbook`；module 只有 async default init 与 `WasmWorkbook` constructor。`RustWasmWorkbook` 只有
`sheet_count/sheet_name/add_sheet/rename_sheet/read_sparse_range/snapshotCell/bulk_import_cells` 与
`trySetCellNumber/Text/Boolean/Error/tryClearCellAt/trySetFormulaAt`。guards 导出 `assertMethod`、sheet/range/A1 validator；禁止 infallible setters。

## 验收

- `pnpm exec jest excel/excel-worker/test/wasm-surface.test.ts --runInBand --no-coverage` 覆盖 missing fallible method、bad range/sheet/A1 与 allowlist。
- source 与实际 `excel-wasm/lite/einfach_wasm.d.ts` 方法逐项一致；文件 ≤300 行。

写 `reports/005-report.md`；不提交。
