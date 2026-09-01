---
id: "104"
title: 建立 selection grid wrapper
kind: leaf
parent: S01
depends_on: ["103"]
discovered_from: null
model: gpt-5.6-terra
status: pending
created: 2026-09-01
done: null
base: null
priority: P0
stage: S01
coverage: ["C06b"]
files:
  - excel/react-excel/src/selection/SpreadsheetSelectableGrid.tsx
  - excel/react-excel/src/selection/selection-overlay.css
  - excel/react-excel/test/selection-grid-wrapper.test.tsx
  - .tasks/react-excel-univer-parity/reports/104-report.md
---

# 建立 selection grid wrapper

## 目标与粒度

在 viewport wrapper 上组合现有 pointer/keyboard/selection hooks，逐字实现 index `SpreadsheetSelectableGrid` forwardRef export并透传同一个 grid handle。预计 15–20 分钟。

## 行为

forwardRef 暴露 index handle；pointer getCellCoord 从 `td[data-cell]` 读 zero-based coordinate，keyboard远距 intent 调 handle.scrollToCell。
本叶是 selection 初始化唯一 owner：在 `useLayoutEffect` 逐字调用 `setSelectionBoundsAtom({rowCount,colCount})`；读取 `selectionSnapshotAtom`，仅当当前 `sheetId !== props.sheetId` 时调用 `setSelectionAtom` 安装该 sheet 的 A1。same-sheet remount 不覆盖既有 selection，bounds 更新由 Core clamp；不得用 React state 镜像。
逐名消费 task103 `getCellId/ariaActiveDescendant` extension：只给当前 active cell 返回固定 id `excel-cell-{row}-{col}`，grid aria-activedescendant 指向该真实 `<td>`；range overlay 只读 UI-core selection，placement 基于现有 cell rectangles。
不得复制 UI-core atom/pointer/keyboard状态机。

## 验收

- `pnpm exec jest excel/react-excel/test/selection-grid-wrapper.test.tsx --runInBand --no-coverage` 覆盖初始空sheet→A1、same-sheet保留、sheet切换、右下边界clamp、click/drag/arrows/Shift/远距scroll/focus/unmount。
- DOM 中 aria 引用的元素恰是对应 `td[data-cell]`，且不存在隐藏伪 descendant；outline 可见；tsx/css ≤300 行。

写 `reports/104-report.md`；不提交。
