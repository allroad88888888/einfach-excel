---
id: "109"
title: 绑定 demo grid 与 canonical data
kind: leaf
parent: S01
depends_on: ["108"]
discovered_from: null
model: gpt-5.6-sol
status: pending
created: 2026-09-01
done: null
base: null
priority: P0
stage: S01
coverage: ["C05", "C06a", "C06b", "C06c", "C07"]
files:
  - excel/react-excel/demo/DemoGrid.tsx
  - excel/react-excel/demo/FormulaBar.tsx
  - excel/react-excel/demo/WorkbookFooter.tsx
  - excel/react-excel/demo/demo-data.ts
  - excel/react-excel/test/demo-grid-binding.test.tsx
  - .tasks/react-excel-univer-parity/reports/109-report.md
---

# 绑定 demo grid 与 canonical data

## 目标与粒度

用 public editable grid 替换静态 demo cell truth。预计 15–20 分钟；保持 App-compatible props，最终 App 在111更新。

DemoGrid 从 public root import `SpreadsheetEditableGrid`，调用 props 固定为
`sheetId=ready.sheetId,rowCount=1000,colCount=8,rowHeight=24,columnWidth=96,ariaLabel='Worksheet grid'`；FormulaBar显示 UI-core selection address与projection/draft；Footer record count=1000且selection count来自UI-core。
`demo-data.ts` 若不再有唯一职责则本叶删除；不得留下第二份 workbook values。保留 baseline DOM landmarks/文案风格。

## 验收

- `pnpm exec jest excel/react-excel/test/demo-grid-binding.test.tsx --runInBand --no-coverage` 覆盖 projection/selection/draft/footer。
- `rg 'demoBackend|unsupportedBackendOperation|getDemoFormulaBarValue' excel/react-excel/demo/DemoGrid.tsx excel/react-excel/demo/FormulaBar.tsx excel/react-excel/demo/WorkbookFooter.tsx excel/react-excel/demo/demo-data.ts` 零匹配；`App.tsx` 的剩余组合点由111独占。
- 改后组件 ≤300 行。

写 `reports/109-report.md`；不提交。
