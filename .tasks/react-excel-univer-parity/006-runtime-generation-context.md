---
id: "006"
title: 建立 runtime generation context
kind: leaf
parent: M0
depends_on: ["005"]
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
  - excel/excel-worker/src/runtime/workbook-context.ts
  - excel/excel-worker/test/runtime-generation-context.test.ts
  - .tasks/react-excel-univer-parity/reports/006-report.md
---

# 建立 runtime generation context

## 目标与粒度

实现 index `RuntimeWorkbookContext`，作为 init/projection/seed 的唯一共享状态。预计 10–15 分钟。

## 行为

`createRuntimeWorkbookContext(wasm: RustWasmModule): Promise<RuntimeWorkbookContext>` single-flight await `wasm.default()` 后 resolve；之后同步 `initialize` 每次新建 workbook、generation id +1、重置四 flags。
`beginProjection` 要求 initialized 且未 invalidated，并设置 projectionStarted。`claimSeed` 只在 initialized、未 seeded、未 projectionStarted 时成功并同步设置 seeded；失败抛稳定 code。
`invalidate(id)` 只失效匹配 generation；旧 generation 不能伤新 workbook。

## 验收

- `pnpm exec jest excel/excel-worker/test/runtime-generation-context.test.ts --runInBand --no-coverage` 覆盖 single-flight、replace、seed-before-read、double seed、projection-before-seed、invalidate ABA。
- 文件 ≤300 行，无 module-global workbook truth。

写 `reports/006-report.md`；不提交。
