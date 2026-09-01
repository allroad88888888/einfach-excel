---
id: "105"
title: 建立 canonical async editing controller
kind: leaf
parent: S01
depends_on: ["102", "104"]
discovered_from: null
model: gpt-5.6-sol
status: pending
created: 2026-09-01
done: null
base: null
priority: P0
stage: S01
coverage: ["C06c"]
files:
  - excel/react-excel/src/use-spreadsheet-editing-commit.ts
  - excel/react-excel/test/use-spreadsheet-editing-commit.test.tsx
  - .tasks/react-excel-univer-parity/reports/105-report.md
---

# 建立 canonical async editing controller

## 目标与粒度

逐字实现 index `useSpreadsheetEditingCommit(options): SpreadsheetEditingCommitController`，唯一调用 UI-core `runEditingCommitAtom`/`retryEditingRefreshAtom`。预计 15–20 分钟。

## 精确调用

`useSpreadsheetEditingCommit(options)` 从 provider 取 store/backend并订阅 editing lifecycle。
`commit(move='none')` 调：`store.setter(runEditingCommitAtom,{source:backend,move,commitSource:'cell',refreshProjection:options.refreshProjection,historyEntryRecorder:()=> 'unavailable'})`；
本阶段 backend 无 undo/redo，`unavailable` 是唯一 recorder owner，不 append 假 history。completed 后 `focusGrid()`。
`retryRefresh()` 调 retry atom，同样 completed 后 focus。不得调用 legacy `commitEditingAtom` 或拼 `intent.request`。

## 验收

- `pnpm exec jest excel/react-excel/test/use-spreadsheet-editing-commit.test.tsx --runInBand --no-coverage` 覆盖 Core生成requestId、strict ACK、unavailable history、refresh-failed/retry、reject/outcome-unknown/focus。
- 文件 ≤300 行；测试明确 spy `runEditingCommitAtom` 路径。

写 `reports/105-report.md`；不提交。
