---
id: "014"
title: 实现 strict cell-input backend port
kind: leaf
parent: M0
depends_on: ["012"]
discovered_from: null
model: gpt-5.6-sol
status: pending
created: 2026-09-01
done: null
base: null
priority: P0
stage: M0
coverage: ["C01e2", "C01g"]
files:
  - excel/excel-worker/src/backend/cell-input/port.ts
  - excel/excel-worker/src/backend/cell-input/revision.ts
  - excel/excel-worker/test/cell-input-backend-port.test.ts
  - .tasks/react-excel-univer-parity/reports/014-report.md
---

# 实现 strict cell-input backend port

## 目标与粒度

实现 `Pick<SpreadsheetBackend,'setCellInput'>`，满足 UI-core editing strict ACK 与 mutation serialization。预计 15–20 分钟；只跑 targeted test。

## 行为

port 实例拥有唯一 Promise mutation lane，所有 caller（含无 requestId）按调用顺序串行；每项无论 fulfill/reject 都推进 tail，单次失败不得 poison 后续。每项先 await session.ready/resolveSheet，再在任何 Rust client call 前执行 `session.assertRevisionCapacity()`；逐名 import task003 `toImportCellWire`，按其 empty/formula/finite-number/boolean/text 分类选择 clear/setFormulaDetailed/setCell，禁止复制 parser。
requestId 若缺失允许非 editing caller，但收到时必须原样回显；成功 bump revision 并返回 sheetId/requestId/revision/单格 affectedRange。
formula 的 `installed:true` 与 `installed:false` 都是已应用 mutation：两者在 RPC 后 bump revision、返回 strict ACK，再由 UI-core refresh；diagnostic 只留在 RPC result/测试证据。只有 structured RPC/engine refusal 才 promise reject、零 revision bump、零乐观 display。MAX 时前置拒绝且零 client call；MAX-1 两个并发请求最多一个进入 Rust。editing 路径保证 positive integer requestId 与 positive revision。

## 验收

- `pnpm exec jest excel/excel-worker/test/cell-input-backend-port.test.ts --runInBand --no-coverage` 复用 task003 五类分类向量，覆盖 positive-integer strict ACK、两种 applied formula diagnostic 均 bump、engine refusal不 bump且后续可继续、MAX零RPC/零canonical mutation、MAX-1并发最多一项进入Rust、bad sheet/revision。
- 两实现文件均 ≤300 行。

写 `reports/014-report.md`；不提交。
