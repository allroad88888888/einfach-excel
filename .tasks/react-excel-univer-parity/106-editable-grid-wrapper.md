---
id: "106"
title: 建立 editable grid wrapper
kind: leaf
parent: S01
depends_on: ["104", "105"]
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
  - excel/react-excel/src/editing/SpreadsheetEditableGrid.tsx
  - excel/react-excel/src/editing/cell-editor.css
  - excel/react-excel/test/editable-grid-wrapper.test.tsx
  - .tasks/react-excel-univer-parity/reports/106-report.md
---

# 建立 editable grid wrapper

## 目标与粒度

组合 selection grid、现有 draft/IME hooks 与 task105 async controller，逐字实现 index `SpreadsheetEditableGrid` forwardRef export。预计 15–20 分钟；不直接调用 backend。

## 行为

double click/F2/typing 用现有 useSpreadsheetEditing.start/setDraft；Escape 用 cancel，零 transport；Enter/Tab 仅在 compositionend 后调用 controller.commit(move)。
props 精确等于 index `SpreadsheetEditableGridProps`；controller 的 refresh callback 校验 sheetId 后调用同一 grid handle.refreshProjection；reject 保留 draft/active cell并渲染 lifecycle alert，refresh-failed显示 retry。
React 不写 committed value，成功显示只来自 refreshed projection。

## 验收

- `pnpm exec jest excel/react-excel/test/editable-grid-wrapper.test.tsx --runInBand --no-coverage` 覆盖未点击直接F2、pointer/type/IME/commit/cancel/reject/retry/focus。
- ACK 前零 committed display，refresh 后才更新；tsx/css ≤300 行。

写 `reports/106-report.md`；不提交。
