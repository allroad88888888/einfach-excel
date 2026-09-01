---
id: "102"
title: 扩展 projection refresh controller
kind: leaf
parent: S01
depends_on: ["020"]
discovered_from: null
model: gpt-5.6-sol
status: pending
created: 2026-09-01
done: null
base: null
priority: P0
stage: S01
coverage: ["C06a"]
files:
  - excel/react-excel/src/use-spreadsheet-viewport.ts
  - excel/react-excel/src/viewport/run-visible-projection.ts
  - excel/react-excel/test/use-spreadsheet-viewport.test.tsx
  - .tasks/react-excel-univer-parity/reports/102-report.md
---

# 扩展 projection refresh controller

## 目标与粒度

让现有 `useSpreadsheetViewport` 产出 index 完整 `UseSpreadsheetViewportResult`，特别是 awaitable `refresh()`。预计 15–20 分钟。

## 行为

把现有私有 latest-only transport 按职责移到 `run-visible-projection.ts`，effect 与 refresh 共同调用它；禁止复制两份 loop。
refresh 对当前 sheet/window/maxCells 调 beginProjection 并在 resolve/reject 后完成；stale request 仍由 UI-core requestId/窗口 witness 丢弃。
保留现有 scrollTo/clamp API 与全部旧测试。若 root 文件因改动超过300行，必须继续按 transport 职责抽离而非压行。

## 验收

- `pnpm exec jest excel/react-excel/test/use-spreadsheet-viewport.test.tsx --runInBand --no-coverage` 覆盖旧行为、manual refresh、并发 latest-only、reject/unmount。
- root 与新 helper 均 ≤300 行；只有 helper 拥有 transport loop。

写 `reports/102-report.md`；不提交。
