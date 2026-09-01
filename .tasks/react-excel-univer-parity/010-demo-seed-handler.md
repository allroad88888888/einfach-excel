---
id: "010"
title: 实现 transactional demo seed handler
kind: leaf
parent: M0
depends_on: ["007", "008", "009"]
discovered_from: null
model: gpt-5.6-sol
status: pending
created: 2026-09-01
done: null
base: null
priority: P0
stage: M0
coverage: ["C01f"]
files:
  - excel/excel-worker/src/runtime/handlers/demo-seed.ts
  - excel/excel-worker/test/demo-seed-handler.test.ts
  - .tasks/react-excel-univer-parity/reports/010-report.md
---

# 实现 transactional demo seed handler

## 目标与粒度

实现 seedCells handler；通过 shared context 保证 init 后、首次 projection 前、每 generation 一次。预计 10–15 分钟。

## 行为

payload 已是 `RustImportCellWire[]`；React seed 由 task017 通过 task003 唯一 `toImportCellWire` 产生，本 handler 不重做分类。最多 10,000；先 `context.claimSeed()`，调用当前 workbook `bulk_import_cells` 一次。
若 stats 的 errors/rejectedFormulas/issues 任一非零，立即 `context.invalidate(generation.id)` 并抛 `DEMO_SEED_REJECTED`；部分 Rust 写永不对外发布。
double seed/projection-first 使用 context 稳定 code。其它 command fallthrough。

## 验收

- `pnpm exec jest excel/excel-worker/test/demo-seed-handler.test.ts --runInBand --no-coverage` 覆盖 8,000 accepted、limit、partial issue invalidate、double/projection-first、新 generation retry。
- 测试断言一次 bulk call；文件 ≤300 行。

写 `reports/010-report.md`；不提交。
