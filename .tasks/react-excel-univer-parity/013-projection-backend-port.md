---
id: "013"
title: 实现 projection backend port
kind: leaf
parent: M0
depends_on: ["012"]
discovered_from: null
model: gpt-5.6-terra
status: pending
created: 2026-09-01
done: null
base: null
priority: P0
stage: M0
coverage: ["C01d2", "C01g"]
files:
  - excel/excel-worker/src/backend/projection/range-wire.ts
  - excel/excel-worker/src/backend/projection/display-cell.ts
  - excel/excel-worker/src/backend/projection/port.ts
  - excel/excel-worker/test/projection-backend-port.test.ts
  - .tasks/react-excel-univer-parity/reports/013-report.md
---

# 实现 projection backend port

## 目标与粒度

实现 `Pick<SpreadsheetBackend,'readVisibleProjection'|'readRangeProjection'>`。预计 15–20 分钟；只跑 targeted test。

## 行为

两个方法 await session.ready、resolveSheet、转换 UI rectangle→index `RustSparseRangeWire`，调用 client.readSparseRange 一次。
`display-cell.ts` 解析 A1 为 row/col，映射 type/display/formula/error；不叠未迁格式/merge/rules。结果回显 kind/sheetId/requestId/window或range/revision。
cancelToken 已 cancelled 时零 RPC；不缓存整表。

## 验收

- `pnpm exec jest excel/excel-worker/test/projection-backend-port.test.ts --runInBand --no-coverage` 覆盖 visible/range、empty/formula/error、cancel、bad sheet/correlation、row999 单窗口。
- 三实现文件均 ≤300 行。

写 `reports/013-report.md`；不提交。
