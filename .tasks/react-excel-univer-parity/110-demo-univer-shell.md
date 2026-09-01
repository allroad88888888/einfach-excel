---
id: "110"
title: 收敛 demo Univer shell
kind: leaf
parent: S01
depends_on: ["109"]
discovered_from: null
model: gpt-5.6-terra
status: pending
created: 2026-09-01
done: null
base: null
priority: P0
stage: S01
coverage: ["C00", "C03", "C04", "C05", "C06a", "C06b", "C06c", "C07"]
files:
  - excel/react-excel/demo/WorkbookHeader.tsx
  - excel/react-excel/demo/WorkbookRibbon.tsx
  - excel/react-excel/demo/styles.css
  - excel/react-excel/demo/workbook-header.css
  - excel/react-excel/demo/workbook-ribbon.css
  - excel/react-excel/demo/formula-bar.css
  - excel/react-excel/demo/worksheet.css
  - .tasks/react-excel-univer-parity/reports/110-report.md
---

# 收敛 demo Univer shell

## 目标与粒度

消费 task107 tokens，收敛现有 Header/Ribbon/layout；不增加功能状态。预计 15–20 分钟，不运行全 demo build。

保留 baseline 视觉，统一紧凑 toolbar、层级、边框、hover/focus、formula/grid/footer。1440×900为主，390×844无页面级横向溢出。
静态/disabled command 不制造假成功；button 有label/title，focus-visible清晰，reduced-motion不依赖transition完成。

## 验收

- `rg -- '--excel-' excel/react-excel/demo/*.css` 证明消费 token；无 copied logo/assets。
- 每个 TS/CSS ≤300行；targeted DOM snapshot由109测试继续通过。全build留111。

写 `reports/110-report.md`；不提交。
