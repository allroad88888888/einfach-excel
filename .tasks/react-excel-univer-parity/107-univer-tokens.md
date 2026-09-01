---
id: "107"
title: 建立 Univer 风格视觉 token
kind: leaf
parent: S01
depends_on: ["020"]
discovered_from: null
model: gpt-5.6-terra
status: pending
created: 2026-09-01
done: null
base: null
priority: P0
stage: S01
coverage: ["C00"]
files:
  - excel/react-excel/src/design/tokens.css
  - excel/react-excel/src/design/theme.ts
  - excel/react-excel/src/design/SpreadsheetButton.tsx
  - excel/react-excel/test/univer-tokens.test.tsx
  - .tasks/react-excel-univer-parity/reports/107-report.md
---

# 建立 Univer 风格视觉 token

## 目标与粒度

冻结首批颜色、密度、字号、边框、层级、focus ring 与 button primitive。预计 10–15 分钟。

学习 Univer 信息密度，不复制商标/logo/icon/assets。CSS variables 用 `--excel-*`；默认亮色，暗色留 S13。
button 只接标准 attributes、density/active，不持有产品状态；不做 menu/popover/dialog。

## 验收

- `pnpm exec jest excel/react-excel/test/univer-tokens.test.tsx --runInBand --no-coverage` 覆盖 disabled/active/focus/aria。
- token 无业务 selector；三文件 ≤300 行。

写 `reports/107-report.md`；不提交。
