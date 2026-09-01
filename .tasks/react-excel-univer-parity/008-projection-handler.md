---
id: "008"
title: 实现 sparse projection handler
kind: leaf
parent: M0
depends_on: ["006"]
discovered_from: null
model: gpt-5.6-terra
status: pending
created: 2026-09-01
done: null
base: null
priority: P0
stage: M0
coverage: ["C01d1"]
files:
  - excel/excel-worker/src/runtime/handlers/projection.ts
  - excel/excel-worker/src/runtime/cell-snapshot.ts
  - excel/excel-worker/test/projection-handler.test.ts
  - .tasks/react-excel-univer-parity/reports/008-report.md
---

# 实现 sparse projection handler

## 目标与粒度

实现 readSparseRange handler，并在调用 Rust 前标记当前 generation 已开始 projection。预计 10–15 分钟。

## 行为

从 index payload 取 inclusive zero-based range；先 `context.beginProjection()`，再校验 ≤10,000 cells 并调用一次 `read_sparse_range`。
`cell-snapshot.ts` 规范化 addr/display/type/formula/isError，不转 UI DisplayCell。空 range 返回空数组；invalid/oversize 结构化拒绝。其它 command fallthrough。

## 验收

- `pnpm exec jest excel/excel-worker/test/projection-handler.test.ts --runInBand --no-coverage` 覆盖 before-init、projection flag、empty/formula/error、invalid/oversize、远距单 rectangle。
- 两文件 ≤300 行；不扫描整表。

写 `reports/008-report.md`；不提交。
