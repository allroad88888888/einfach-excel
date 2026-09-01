---
id: "103"
title: 建立 viewport grid wrapper
kind: leaf
parent: S01
depends_on: ["102"]
discovered_from: null
model: gpt-5.6-terra
status: pending
created: 2026-09-01
done: null
base: null
priority: P0
stage: S01
coverage: ["C06a"]
files:
  - excel/react-excel/src/grid/SpreadsheetViewportGrid.tsx
  - excel/react-excel/src/grid/viewport-grid.css
  - excel/react-excel/src/SpreadsheetGridView.tsx
  - excel/react-excel/test/viewport-grid-wrapper.test.tsx
  - excel/react-excel/test/spreadsheet-grid-view.test.tsx
  - .tasks/react-excel-univer-parity/reports/103-report.md
---

# 建立 viewport grid wrapper

## 目标与粒度

组合现有 geometry/viewport/GridView，并逐字实现 index `SpreadsheetViewportGrid` forwardRef export 与 handle。预计 15–20 分钟。

## 行为

逐字实现 index `SpreadsheetViewportGridProps`。滚动测量是允许的 React local state；workbook cells/status 只来自 useSpreadsheetViewport。
为现有 `SpreadsheetGridView` 增加唯一 renderer extension `getCellId(row,col)`，只把返回值传给真实 `<td id>`；viewport 透传该 callback 与容器 `ariaActiveDescendant`，禁止 imperative DOM mutation/隐藏伪 descendant。
handle 的 scrollToCell→viewport.scrollTo，refreshProjection→viewport.refresh，focusGrid→容器 focus。继续复用现有 root 三模块，不复制 clamp/geometry/render。

## 验收

- `pnpm exec jest excel/react-excel/test/viewport-grid-wrapper.test.tsx excel/react-excel/test/spreadsheet-grid-view.test.tsx --runInBand --no-coverage` 覆盖初始/远距滚动、handle三方法、id callback落到对应真实td、aria透传、error/unmount。
- 1000×8 常驻 cell DOM ≤可见窗口+两屏 overscan；tsx/css ≤300 行。

写 `reports/103-report.md`；不提交。
