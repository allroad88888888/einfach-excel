---
id: "009"
title: 实现 fallible cell write handler
kind: leaf
parent: M0
depends_on: ["006"]
discovered_from: null
model: gpt-5.6-sol
status: pending
created: 2026-09-01
done: null
base: null
priority: P0
stage: M0
coverage: ["C01e1"]
files:
  - excel/excel-worker/src/runtime/handlers/cell-input.ts
  - excel/excel-worker/test/cell-write-handler.test.ts
  - .tasks/react-excel-univer-parity/reports/009-report.md
---

# 实现 fallible cell write handler

## 目标与粒度

实现 setCell/setFormulaDetailed/clearCell，逐名消费 task003 的 exact wire types。预计 15–20 分钟。

## 合同与行为

typed 单格 command 只调用对应 fallible binding；engine refusal→`CELL_WRITE_REJECTED`，missing→`WASM_METHOD_UNAVAILABLE`。
formula `installed:true` 原样返回 exact `{ok:true,installed:true}`，不追读；`installed:false` 才用 `snapshotCell` 区分并返回 index 的 applied diagnostic：`#VALUE!→INVALID_FORMULA`、`#CYCLE!→FORMULA_CYCLE`。两者都已经改变 Rust canonical cell，不得 reply failure。其它 command fallthrough。

## 验收

- `pnpm exec jest excel/excel-worker/test/cell-write-handler.test.ts --runInBand --no-coverage` 覆盖五类 typed value、两种 applied formula outcome、refusal/missing/bad coord/fallthrough。
- 测试证明零 infallible setter；实现文件 ≤300 行。

写 `reports/009-report.md`；不提交。
